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
- Transactional file updates with rollback when a required migration step fails or is cancelled

## Features

### Core Migration

✅ **Automatic Configuration Migration**

- Converts `biome.json`/`biome.jsonc` to `.oxlintrc.json` and `.oxfmtrc.jsonc`
- Maps 80+ Biome linter rules to Oxlint equivalents (native `typescript/` rules)
- Transforms Biome formatter options to Oxfmt (Prettier-compatible)
- Normalizes `include`/`includes` field variations automatically

✅ **Preserves Representable Setup**

- Ignore patterns, override file globs, and override exclusions
- Negated `includes` exceptions (`!pattern`), translated into `ignorePatterns` for both tools
- `.biomeignore` patterns migrated into the Oxlint **and** Oxfmt `ignorePatterns`. Biome 2.x does
  not read `.biomeignore` itself, so this deliberately narrows scope; the migration says so
- Linter configuration overrides
- Formatter configuration overrides when they can be represented as Oxfmt file-glob overrides
- JavaScript globals
- Rule severities (`error`/`warn`/`off`; `info` and `on` are accepted with explicit lossy-mapping warnings)
- Explicit `printWidth` handling (no silent changes)
- The set of formatted files: Oxfmt-only formats (YAML, TOML, Markdown) are excluded, and
  `sortPackageJson` is pinned off unless the Biome config turns the matching assist action on, so
  migrating never reformats files Biome left alone
- Assist actions: `organizeImports` and `useSortedPackageJson` become the Oxfmt options that
  implement them, and every other `assist.actions.source` entry is reported as a loss

✅ **Refuses to Lose Behaviour Silently**

Anything the generated configs provably do not reproduce is recorded as a **semantic loss** and
listed under `losses` in the report. Losses make the migration report `success: false` and block
both `--delete` and removal of the `@biomejs/biome` dependency, so a lossy conversion can never
leave a project without a working linter or formatter. Resolve the listed losses and re-run.

Positive-only Biome `files`/`linter`/`formatter` include selection has no direct Oxc config
equivalent and is reported as a loss; pass equivalent paths to the Oxc CLI or review the generated
ignore configuration before removing Biome.

### Advanced Features

✅ **Monorepo Support**

- Handles `"//"` extends syntax for monorepo roots
- Automatically detects `.git` or workspace roots
- Recursive config resolution with proper merging

✅ **Type-Aware Linting** (`--type-aware`)

- Detects TypeScript usage
- Provides `oxlint-tsgolint` installation guidance
- Writes root `options.typeAware` / `options.typeCheck` settings into the generated Oxlint config
- Supports explicit typed lint flags:
  - `--type-aware`: `oxlint --type-aware`
  - `--type-check` (implies `--type-aware`): `oxlint --type-aware --type-check`
- Supports profile-based compatibility guidance:
  - `--type-aware-profile standard`: `oxlint --type-aware`
  - `--type-aware-profile strict`: `oxlint --type-aware --type-check`
- Surfaces the TypeScript 7 compatibility requirement and incomplete rule coverage

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
- `docs/biome-rules.tsv`: Biome rule inventory, so a mapping cannot key off a rule Biome dropped
- `docs/biome-formatter-options.tsv`: Biome formatter surface inventory

All six are generated from the schemas of the installed `oxlint`, `oxfmt`,
`oxlint-tsgolint`, and `@biomejs/biome` packages by `pnpm docs:sync`; `pnpm docs:check`
fails when they drift, and it runs as part of `pnpm check`.

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
  -o, --output-dir <path>  Output directory for generated configs (project mutations stay beside the Biome config)
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

# Migrate with a custom output directory.
# Oxlint and Oxfmt resolve config globs inside the config file's own directory and reject `..`,
# so the output directory must be the Biome project root or an ancestor of it. A directory below
# the project root is rejected whenever the migration would emit any glob.
npx biome-to-oxc --output-dir ../shared-config

# Rewritten scripts explicitly load configs placed outside the package root
npx biome-to-oxc --output-dir ../shared-config --update-scripts

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

Biome and Oxlint category membership is not identical. The tool uses the following category-level
approximation and reports it for review; explicitly configured rules are mapped individually.

| Biome Category | Oxlint Category |
| -------------- | --------------- |
| correctness    | correctness     |
| suspicious     | suspicious      |
| style          | style           |
| complexity     | pedantic        |
| performance    | perf            |
| a11y           | restriction     |
| security       | restriction     |

Accessibility and security presets need particular care because both are approximated through
Oxlint's broader `restriction` category.

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

### Assist Actions

Biome's assist actions are code actions rather than lint rules. Oxfmt implements two of them as
formatter options; the rest have no Oxc equivalent and are reported as semantic losses.

| Biome Assist Action    | Oxfmt Option      | Notes                                                            |
| ---------------------- | ----------------- | ---------------------------------------------------------------- |
| `organizeImports`      | `sortImports`     | `options.sortBareImports` → `sortImports.sortSideEffects`        |
| `useSortedPackageJson` | `sortPackageJson` | Lifts the default pin that keeps Oxfmt from sorting package.json |

Only actions the Biome config names explicitly are migrated. Biome enables `organizeImports`
through its recommended set even when the config never mentions it, but both Oxfmt options default
to off here, so deriving them from a preset would start rewriting imports in projects whose Biome
config never asked for it. When a preset is what turned the actions on, the migration reports it.

Biome's `organizeImports` `groups` are matcher predicates (`:NODE:`, source globs) while Oxfmt's
are a fixed set of group names, so custom group ordering is reported as a loss rather than guessed
at. Per-override `assist` is not migrated either, and is likewise reported.

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
   pnpm add -D oxlint oxlint-tsgolint@7

   # Run with type-aware rules
   npx oxlint --type-aware
   ```

# Strict profile (include TS compiler diagnostics)

npx oxlint --type-aware --type-check

```

## Known Limitations

- Not all Biome rules have direct Oxlint equivalents (reported as semantic losses)
- Some advanced Biome features may not be supported
- Biome recommended/all presets and group-level severities are approximated with Oxlint categories;
  preset membership is not identical between the tools. This approximation is reported as a warning
  rather than a loss, because it applies to essentially every migration
- Positive-only Biome include selection cannot be encoded directly in Oxlint/Oxfmt config files
- Generated config globs are resolved inside the config file's directory, so `--output-dir` must
  point at the Biome project root or an ancestor of it
- `formatter.lineEnding: "auto"` has no Oxfmt equivalent (Oxfmt always writes LF)
- Lockfiles are not regenerated. When dependencies change, the report names the lockfile and the
  install command needed before any frozen-lockfile install
- Oxlint overrides cannot carry category presets; explicit override rules are migrated and category
  presets are reported for manual review
- Oxfmt is in beta; review formatting changes before replacing the existing formatter
- Overlapping `overrides` are migrated as-is. Biome and Oxfmt both merge matching overrides field
  by field with later entries winning, so the two agree; a conformance test pins this
- Type-aware linting is stable as of `oxlint-tsgolint` v7 and requires TypeScript 7; 59 of the 61
  targeted typescript-eslint rules are currently implemented
- CSS and JSON formatter overrides are mapped but may need manual review
- Prettier plugin support is not available in Oxfmt
- Assist actions are migrated only when the Biome config names them explicitly; actions enabled
  through `recommended` or a preset are reported rather than derived
- `organizeImports` custom `groups` and `identifierOrder` have no Oxfmt counterpart and are reported
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
