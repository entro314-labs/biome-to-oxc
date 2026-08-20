# Contributing to biome-to-oxc

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/entro314-labs/biome-to-oxc.git
   cd biome-to-oxc
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Build the project**
   ```bash
   pnpm build
   ```

## Project Structure

```
biome-to-oxc/
├── bin/
│   └── biome-to-oxc.ts       # CLI entry point
├── docs/                     # Rule/option inventory reference data (generated)
├── scripts/
│   └── sync-rule-inventories.ts # Regenerates docs/ from the installed tool schemas
├── src/
│   ├── advanced-detection.ts # Feature detection and migration suggestions
│   ├── biome-ignore-loader.ts # .biomeignore parsing and loading
│   ├── config-loader.ts      # Biome config loading, validation, and extends resolution
│   ├── formatter-mapper.ts   # Biome → Oxfmt formatter mapping
│   ├── index.ts              # Main migration orchestrator
│   ├── js-plugin-scaffolder.ts # JS plugin scaffolding + unsupported-rule guidance
│   ├── oxfmt-overrides.ts    # Oxfmt override generation
│   ├── oxlint-generator.ts   # Oxlint config generation
│   ├── overrides-transformer.ts # Oxlint override generation
│   ├── package-updater.ts    # package.json updates and script rewrites
│   ├── reporter.ts           # Logging and reporting utilities
│   ├── rule-mapper.ts        # Biome → Oxlint rule mapping
│   ├── turbo-updater.ts      # Turborepo metadata updates
│   └── *.test.ts             # Unit/integration tests
├── README.md
├── QUICKSTART.md
└── vitest.config.ts
```

## Adding New Rule Mappings

To add new Biome → Oxlint rule mappings:

1. Bump the toolchain (`oxlint`, `oxfmt`, `oxlint-tsgolint`, `@biomejs/biome`) if you are
   picking up newly released rules, then run `pnpm docs:sync` and review the diff under
   `docs/` — it is the list of rules that appeared, changed, or went away.
2. Edit `src/rule-mapper.ts`
3. Add entries to `BIOME_TO_OXLINT_RULE_MAP`:
   ```typescript
   const BIOME_TO_OXLINT_RULE_MAP: Record<string, OxlintRuleMapping> = {
     biomeRuleName: 'oxlint-rule-name',
     // Add your mapping here
   };
   ```
4. If the Oxlint rule only covers part of what the Biome rule checked, add a note to
   `PARTIAL_RULE_MAPPING_NOTES` so the migration report says so.
5. If the Biome rule carries options, translate them in
   `mapBiomeRuleOptionsToOxlintSeverity` and report anything Oxlint cannot express.

`src/rule-inventory.test.ts` checks every mapping against the generated inventories, so a
rule name that neither tool actually has fails the test suite.

## Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Test the CLI locally
pnpm build
node dist/bin/biome-to-oxc.mjs --help
```

## Code Style

- Use TypeScript strict mode
- Follow existing code patterns
- Use meaningful variable names
- Add comments for complex logic
- Format code with `pnpm format`
- Lint code with `pnpm lint`

## Commit Guidelines

- Use clear, descriptive commit messages
- Start with a verb (Add, Fix, Update, Remove, etc.)
- Reference issues when applicable

Examples:

```
Add support for CSS formatter options
Fix rule mapping for noUnusedVariables
Update README with new examples
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test your changes thoroughly
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Reporting Issues

When reporting issues, please include:

- Your operating system and Node.js version
- The command you ran
- The error message or unexpected behavior
- A minimal reproduction example if possible
- Your `biome.json` configuration (if relevant)

## Feature Requests

Feature requests are welcome! Please:

- Check if the feature has already been requested
- Clearly describe the feature and its use case
- Explain why it would be useful to most users

## Questions?

Feel free to open an issue for questions or join discussions.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
