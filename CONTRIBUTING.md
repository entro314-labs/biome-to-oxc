# Contributing to biome-to-oxc

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/biome-to-oxc.git
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
├── src/
│   ├── types.ts              # TypeScript type definitions
│   ├── reporter.ts           # Logging and reporting utilities
│   ├── config-loader.ts      # Biome config loading and parsing
│   ├── rule-mapper.ts        # Biome → Oxlint rule mapping
│   ├── formatter-mapper.ts   # Biome → Oxfmt formatter mapping
│   ├── oxlint-generator.ts   # Generate .oxlintrc.json
│   ├── overrides-transformer.ts # Handle config overrides
│   ├── package-updater.ts    # Update package.json scripts
│   └── index.ts              # Main migration orchestrator
├── bin/
│   └── biome-to-oxc.ts       # CLI entry point
├── examples/                  # Example configurations
└── tests/                     # Test files (to be added)
```

## Adding New Rule Mappings

To add new Biome → Oxlint rule mappings:

1. Edit `src/rule-mapper.ts`
2. Add entries to `BIOME_TO_OXLINT_RULE_MAP`:
   ```typescript
   const BIOME_TO_OXLINT_RULE_MAP: Record<string, string> = {
     biomeRuleName: 'oxlint-rule-name',
     // Add your mapping here
   };
   ```

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
