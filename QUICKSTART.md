# Quick Start Guide

Get started with biome-to-oxc in 5 minutes!

## Step 1: Install Dependencies

First, navigate to your project and install dependencies:

```bash
cd /path/to/your/project
pnpm install
```

## Step 2: Run the Migration

```bash
# Basic migration (auto-detects biome.json)
npx biome-to-oxc

# Or with options
npx biome-to-oxc --update-scripts --verbose

# Type-aware + type-check migration profile
npx biome-to-oxc --update-scripts --type-check --verbose
```

## Step 3: Review Generated Configs

Check the generated files:

```bash
# View Oxlint config
cat .oxlintrc.json

# View Oxfmt config
cat .oxfmtrc.jsonc
```

## Step 4: Install Oxc Tools

```bash
pnpm add -D oxlint oxfmt
```

## Step 5: Test the Tools

```bash
# Lint your code
pnpm exec oxlint .

# Format your code
pnpm exec oxfmt --write .

# Check formatting without writing
pnpm exec oxfmt --check .
```

## Step 6: Update Your Workflow

### Update package.json scripts:

```json
{
  "scripts": {
    "lint": "oxlint",
    "format": "oxfmt",
    "format:check": "oxfmt --check",
    "check": "oxlint && oxfmt --check"
  }
}
```

### Update CI/CD (GitHub Actions example):

```yaml
name: CI

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '22.22.0'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm exec oxlint .
      - run: pnpm exec oxfmt --check .
```

## Common Issues

### "No Biome configuration file found"

Make sure you have `biome.json` or `biome.jsonc` in your project root.

### TypeScript errors during development

Run `pnpm install` to install all dependencies.

### Some rules not converted

Check the warnings in the migration report. Some Biome rules may not have direct Oxlint equivalents yet.

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- See [CONTRIBUTING.md](./CONTRIBUTING.md) if you want to contribute

## Need Help?

- Open an issue on GitHub
- Check the [Oxc documentation](https://oxc.rs)
- Review the [Biome documentation](https://biomejs.dev)

Happy migrating! 🚀
