# biome-to-oxc

Migrate a Biome setup to the Oxc toolchain (`oxlint`, `oxfmt`, and optional `oxlint-tsgolint` guidance).

The CLI reads a Biome config, resolves `extends`, generates `.oxlintrc.json` and `.oxfmtrc.jsonc`, updates package scripts if requested, and reports anything it could not map directly.

Current capabilities:

- Rule and category migration with unsupported-rule reporting
- Oxfmt generation with override support
- Strategy-aware script rewrites for safe, suggestions, and dangerous fix modes
- Conservative script rewrite safeguards with manual-review warnings for complex shell scripts
- Monorepo-aware guidance, ignore migration, and typed linting guidance
- Optional JSON report output to stdout or a report file

## Features

### Core Migration

✅ **Automatic Configuration Migration**

- Converts `biome.json`/`biome.jsonc` to `.oxlintrc.json` and `.oxfmtrc.jsonc`
- Maps 80+ Biome linter rules to Oxlint equivalents (native `typescript/` rules)
- Transforms Biome formatter options to Oxfmt (Prettier-compatible)
- Normalizes `include`/`includes` field variations automatically

✅ **Preserves Your Setup**

- File patterns and ignore patterns
- `.biomeignore` patterns migrated into Oxlint `ignorePatterns` (compatibility alias)
- Linter configuration overrides
- Formatter configuration overrides when they can be represented as Oxfmt file-glob overrides
- JavaScript globals
- Rule severities (error/warn/off)
- Explicit `printWidth` handling (no silent changes)

### Advanced Features

✅ **Monorepo Support**

- Handles `"//"` extends syntax for monorepo roots
- Automatically detects `.git` or workspace roots
- Recursive config resolution with proper merging

✅ **Type-Aware Linting** (`--type-aware`)

- Detects TypeScript usage
- Provides `oxlint-tsgolint` installation guidance
- Supports explicit typed lint flags:
  - `--type-aware`: `oxlint --type-aware`
  - `--type-check` (implies `--type-aware`): `oxlint --type-aware --type-check`
- Supports profile-based compatibility guidance:
  - `--type-aware-profile standard`: `oxlint --type-aware`
  - `--type-aware-profile strict`: `oxlint --type-aware --type-check`
- Surfaces alpha stability + TS compatibility caveats

✅ **Turborepo Integration** (`--turborepo`)

- Detects `turbo.json` configuration
- Updates existing `lint`, `check`, `format`, and `format:check` task metadata when present
- Maintains monorepo workflow compatibility

✅ **ESLint Bridge** (`--eslint-bridge`)

- Detects existing ESLint configurations
- Suggests `eslint-plugin-oxlint` integration
- Provides dual-tool workflow guidance
- Includes `eslint-plugin-oxfmt` suggestions

✅ **Prettier Migration** (`--prettier`)

- Detects Prettier configurations
- Suggests `pnpm exec oxfmt --migrate=prettier`
- Helps transition from Prettier to Oxfmt

✅ **Smart Updates**

- Optional package.json script updates
- Automatic config backups
- Detailed migration reports with JSON export
- Dry-run mode for safety
- Integration detection and suggestions

### Cutting-Edge & Experimental Features

✅ **Advanced Formatting Options**

- **Object Wrapping**: Controls object literal formatting
- **Insert Final Newline**: Ensures files end with newline
- **Embedded Language Formatting**: Auto-formats CSS-in-JS, GraphQL-in-JS
- **HTML/Prose Options**: Whitespace sensitivity and prose wrapping

✅ **Framework-Specific Support**

- **Vue.js**: Automatic detection and `vueIndentScriptAndStyle` configuration
- **React**: JSX-specific formatting options
- **Tailwind CSS**: Experimental class sorting and formatting
  - Supports `class`, `className`, `:class` attributes
  - Supports `clsx`, `cn`, `classNames`, `tw` functions

✅ **Experimental Features** (Alpha/Beta)

- **Import Sorting**: explicit `sortImports` passthrough when present in formatter config
- **Package.json Sorting**: explicit `sortPackageJson` passthrough when present in formatter config
- **Tailwind Integration**: explicit `sortTailwindcss` passthrough when present in formatter config
- **Forward Compatibility**: preserves supported explicit Oxfmt-compatible formatter options, including legacy experimental aliases

✅ **Oxlint Config Enhancements**

- Preserves Oxlint defaults by omitting `plugins` when explicit plugin config is not required
- Emits plugin `settings` scaffolds for detected ecosystems (`react`, `jsx-a11y`, `next`, `vitest`, `jsdoc`)
- Optional import graph baseline (`--import-graph`) with configurable `import/no-cycle` depth
- Optional JS plugin scaffolding (`--js-plugins` + repeatable `--js-plugin`)

✅ **Coverage & Analysis Artifacts**

- `docs/oxlint-rules.tsv`: Oxlint rule inventory used for mapping validation
- `docs/oxfmt-rules.tsv`: Oxfmt configuration surface inventory
- `docs/tsgolint-rules.tsv`: typed linting implementation matrix
- `docs/oxlint-vs-tsgolint.tsv`: typed rule availability cross-reference

✅ **Script Rewrite Strategy Controls**

- Explicit fix strategy levels for rewritten scripts:
  - `safe` → `--fix`
  - `suggestions` → `--fix --fix-suggestions`
  - `dangerous` → `--fix --fix-suggestions --fix-dangerously`
- Robust Biome fix conversion when rewriting scripts:
  - `biome ... --write` maps to at least `safe`
  - `biome ... --write --unsafe` maps to at least `dangerous`

## Installation

```bash
# Using npx (no installation required)
npx biome-to-oxc

# Or install globally
pnpm add -g biome-to-oxc
```

## Usage

### Basic Usage

```bash
# Auto-detect biome.json and migrate
npx biome-to-oxc

# Specify config path
npx biome-to-oxc --config path/to/biome.json

# Dry run to preview changes
npx biome-to-oxc --dry-run --verbose
```

### Options

```
Options:
  -c, --config <path>      Path to biome.json or biome.jsonc
  -o, --output-dir <path>  Output directory for generated configs
  --dry-run                Show what would be done without making changes
  --delete                 Delete legacy Biome files after migration (biome.json/biome.jsonc and .biomeignore)
  --no-backup              Skip backup of existing config files
  --update-scripts         Update package.json scripts to use oxlint/oxfmt
  --type-aware             Include type-aware linting guidance and dependencies
  --type-check             Enable strict typed linting mode (implies --type-aware)
  --type-aware-profile     Type-aware profile: standard | strict
  --fix-strategy           Fix mode for rewritten scripts: safe | suggestions | dangerous
  --js-plugins             Emit jsPlugins scaffold for unsupported mappings
  --js-plugin              JS plugin specifier to scaffold (repeatable)
  --import-graph           Add import plugin + import/no-cycle baseline recipe
  --import-cycle-max-depth Max depth for import/no-cycle (default: 3)
  --turborepo              Detect and update turbo.json task metadata for Turborepo integration
  --eslint-bridge          Provide ESLint bridge suggestions for running alongside ESLint
  --prettier               Detect Prettier config and provide migration suggestions
  --report <path>          Write the migration report to a JSON file
  --json                   Print the migration report as JSON to stdout
  -v, --verbose            Show detailed migration information
  -V, --version            Output the version number
  -h, --help               Display help for command
```

### Examples

```bash
# Preview migration without changes
npx biome-to-oxc --dry-run --verbose

# Migrate and update package.json scripts
npx biome-to-oxc --update-scripts

# Full migration with all integrations
npx biome-to-oxc --update-scripts --type-check --fix-strategy suggestions --import-graph --js-plugins --js-plugin eslint-plugin-playwright --turborepo --eslint-bridge --prettier

# Generate detailed JSON report
npx biome-to-oxc --report migration-report.json

# Print the migration report to stdout as JSON
npx biome-to-oxc --json

# Migrate with custom output directory
npx biome-to-oxc --output-dir ./config

# Migrate without creating backups
npx biome-to-oxc --no-backup

# Migrate and remove legacy Biome files
npx biome-to-oxc --delete

# Monorepo setup with Turborepo
npx biome-to-oxc --turborepo --update-scripts

# TypeScript project with type-aware linting
npx biome-to-oxc --type-aware --verbose

# TypeScript project with type-check diagnostics
npx biome-to-oxc --type-check --verbose

# Strict type-aware profile + dangerous script fix strategy
npx biome-to-oxc --type-aware --type-aware-profile strict --update-scripts --fix-strategy dangerous

# Import graph baseline with custom cycle depth
npx biome-to-oxc --import-graph --import-cycle-max-depth 5
```

## Migration Process

1. **Reads** your `biome.json` or `biome.jsonc`
2. **Resolves** extended configurations
3. **Generates** two separate configs:
   - `.oxlintrc.json` - Linter configuration
   - `.oxfmtrc.jsonc` - Formatter configuration
4. **Maps** Biome rules to Oxlint equivalents
5. **Transforms** formatter options to Prettier-compatible format
6. **Preserves** overrides and ignore patterns (including `.biomeignore` alias migration)
7. **Optionally updates** package.json scripts

## Configuration Mapping

### Linter Categories

| Biome Category | Oxlint Category |
| -------------- | --------------- |
| correctness    | correctness     |
| suspicious     | suspicious      |
| style          | style           |
| complexity     | pedantic        |
| performance    | perf            |
| security       | restriction     |

### Formatter Options

| Biome Option     | Oxfmt Option    | Notes                                                         |
| ---------------- | --------------- | ------------------------------------------------------------- |
| lineWidth        | printWidth      | Biome default: 80, Oxfmt default: 100 (always set explicitly) |
| indentStyle      | useTabs         | Inverted (tab → true)                                         |
| indentWidth      | tabWidth        | Direct mapping                                                |
| lineEnding       | endOfLine       | Direct mapping                                                |
| quoteStyle       | singleQuote     | Inverted (single → true)                                      |
| trailingCommas   | trailingComma   | Direct mapping                                                |
| semicolons       | semi            | Inverted (always → true)                                      |
| arrowParentheses | arrowParens     | Direct mapping                                                |
| bracketSpacing   | bracketSpacing  | Direct mapping                                                |
| bracketSameLine  | bracketSameLine | Direct mapping                                                |

## After Migration

1. **Review generated configs**

   ```bash
   cat .oxlintrc.json
   cat .oxfmtrc.jsonc
   ```

2. **Install Oxc tools**

   ```bash
   pnpm add -D oxlint oxfmt
   # or
   npm install -D oxlint oxfmt
   ```

3. **Run the tools**

   ```bash
   # Lint your code
   npx oxlint

   # Format your code
   npx oxfmt

   # Check formatting without writing
   npx oxfmt --check
   ```

4. **Update your CI/CD**

   ```yaml
   # Example GitHub Actions
   - name: Lint
     run: pnpm oxlint

   - name: Check formatting
     run: pnpm oxfmt --check
   ```

5. **Optional: Type-aware linting**

   ```bash
   # Install type-aware support (use @latest tag)
   pnpm add -D oxlint-tsgolint@latest

   # Run with type-aware rules
   npx oxlint --type-aware
   ```

# Strict profile (include TS compiler diagnostics)

npx oxlint --type-aware --type-check

```

## Known Limitations

- Not all Biome rules have direct Oxlint equivalents (warnings will be shown)
- Some advanced Biome features may not be supported
- Oxfmt is in alpha - test thoroughly before production use
- Type-aware linting requires `oxlint-tsgolint` package (alpha)
- CSS and JSON formatter overrides are mapped but may need manual review
- Prettier plugin support is not available in Oxfmt
- Some Biome rules still require JS plugin fallback until native rule parity is available

## Migration Report

After migration, you'll see a comprehensive summary:

```

✓ Migration completed successfully!

Summary:
Biome config: /path/to/biome.json
Oxlint config: /path/to/.oxlintrc.json
Oxfmt config: /path/to/.oxfmtrc.jsonc
Rules converted: 42
Rules skipped: 3
Linter overrides: 2
Formatter overrides: 1

🔍 Detected integrations: typescript, turborepo

⚠ Warnings (3):
Run with --verbose to see all warnings

💡 Suggestions:
5 suggestions available. Run with --verbose to see them.

📝 Next steps:

1. Review the generated .oxlintrc.json and .oxfmtrc.jsonc files
2. Install dependencies: pnpm add -D oxlint oxfmt
3. Run oxlint to lint your code
4. Run oxfmt to format your code
5. Update your CI/CD pipelines to use oxlint and oxfmt
6. Consider running with --update-scripts to update package.json

📊 Detailed report saved to: migration-report.json

````

### JSON Report Format

When using `--report`, a detailed JSON file is generated:

```json
{
  "success": true,
  "warnings": ["..."],
  "errors": [],
  "suggestions": ["..."],
  "summary": {
    "biomeConfigPath": "/path/to/biome.json",
    "oxlintConfigPath": "/path/to/.oxlintrc.json",
    "oxfmtConfigPath": "/path/to/.oxfmtrc.jsonc",
    "rulesConverted": 42,
    "rulesSkipped": 3,
    "overridesConverted": 2,
    "formatterOverridesConverted": 1
  },
  "detectedIntegrations": {
    "turborepo": true,
    "eslint": false,
    "prettier": false,
    "typescript": true
  }
}
````

## Troubleshooting

### "No Biome configuration file found"

Make sure you have a `biome.json` or `biome.jsonc` file in your project root, or specify the path with `--config`.

### "No Oxlint equivalent found for Biome rule"

Some Biome rules don't have direct Oxlint equivalents yet. These will be logged as warnings. You can:

- Check if the rule is available in a newer version of oxlint
- Manually add similar rules to `.oxlintrc.json`
- Open an issue on the Oxc project to request the rule

### TypeScript Errors

All TypeScript errors about missing modules are expected until you run `pnpm install`. The tool will work correctly once dependencies are installed.

## Development

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Format
pnpm format
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgements

This tool is inspired by:

- [@oxlint/migrate](https://github.com/oxc-project/oxlint-migrate) - ESLint to Oxlint migration
- [oxfmt --migrate=prettier](https://oxc.rs/docs/guide/usage/formatter/migrate-from-prettier) - Prettier to Oxfmt migration

Special thanks to the [Oxc project](https://github.com/oxc-project/oxc) and [Biome](https://github.com/biomejs/biome) teams for their amazing work!

## Resources

- [Oxc Documentation](https://oxc.rs)
- [Biome Documentation](https://biomejs.dev)
- [Oxlint Rules](https://oxc.rs/docs/guide/usage/linter)
- [Oxfmt Configuration](https://oxc.rs/docs/guide/usage/formatter)
