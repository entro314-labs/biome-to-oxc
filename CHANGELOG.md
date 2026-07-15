# Changelog

All notable changes to this project will be documented in this file.

## [0.6.0] - 2026-02-25

### Added - New Migration Controls

- **Type-aware profile selection** via `--type-aware-profile`:
  - `standard` → `oxlint --type-aware`
  - `strict` → `oxlint --type-aware --type-check`
- **Fix strategy levels** for script rewrites via `--fix-strategy`:
  - `safe`, `suggestions`, `dangerous`
- **Import graph recipe** via `--import-graph` with configurable `--import-cycle-max-depth`
- **JS plugin scaffolding** via `--js-plugins` and repeatable `--js-plugin <specifier>`
- New module: `src/js-plugin-scaffolder.ts` for alias-safe JS plugin generation and unsupported-rule extraction

### Added - Oxlint Configuration Coverage

- **Plugin settings scaffolds** generation for detected ecosystems:
  - `react`, `jsx-a11y`, `next`, `vitest`, `jsdoc`
- **Import cycle baseline** generation (`import/no-cycle`) with configurable max depth
- **Monorepo strategy guidance** for nested configs + `extends`
- **Ignore migration guidance** when `.eslintignore` is present (prefers `ignorePatterns`)

### Added - Rule Intelligence Assets

- `docs/oxlint-rules.tsv`: exported Oxlint rule catalog
- `docs/oxfmt-rules.tsv`: Oxfmt options catalog
- `docs/tsgolint-rules.tsv`: implemented `tsgolint` rule mapping table
- `docs/oxlint-vs-tsgolint.tsv`: comparison matrix for typed rule availability

### Changed

- **Plugin emission policy**: migration no longer emits `plugins: []` by default; preserves Oxlint defaults when explicit plugin arrays are unnecessary
- **Script rewrite engine** now supports strategy-aware rewrite output and typed profile command generation
- **Type system expanded** to include:
  - built-in plugin unions
  - `settings` and `jsPlugins` config shapes
  - migration option enums and advanced flags
- **README/CLI surface updated** with new flags, examples, and guidance
- **Formatter naming alignment** in docs and suggestions (`sortImports`, `sortPackageJson`, `sortTailwindcss`)

### Updated Dependencies & Toolchain

- `oxlint` → `^1.50.0`
- `oxfmt` → `^0.35.0`
- `oxlint-tsgolint` → `^0.15.0`
- `@types/node` → `^25.3.0`
- `typescript` → `beta`
- `pnpm` workspace + lockfile/tooling updates

### Current State

- 21 files changed since the previous changelog baseline
- ~2,500+ insertions / ~600+ deletions across migration engine, docs, and CLI
- Project version: `0.6.0`

## [0.3.0] - 2026-01-21

### Added - Exhaustive Experimental Features

- **All Oxfmt experimental options**: objectWrap, insertFinalNewline, embeddedLanguageFormatting
- **HTML/Prose options**: htmlWhitespaceSensitivity, proseWrap
- **Vue.js support**: vueIndentScriptAndStyle with auto-detection
- **Import sorting**: experimentalSortImports with auto-detection from linter rules
- **Package.json sorting**: experimentalSortPackageJson always enabled
- **Tailwind CSS integration**: experimentalTailwindcss with auto-detection
- **Advanced project detection**: Comprehensive feature detection system
- **Forward compatibility**: Unknown option pass-through for future Biome features
- **Feature-specific suggestions**: Context-aware recommendations based on detected frameworks

### Added - New Modules

- `src/advanced-detection.ts`: Detects Vue, React, Tailwind, TypeScript, GraphQL, CSS, HTML, monorepo
- `EXPERIMENTAL_FEATURES.md`: Complete documentation of all experimental features

### Changed

- Enhanced BiomeConfig types with index signatures for unknown options
- Oxfmt config now includes all cutting-edge formatting options
- Migration report includes detected project features
- Suggestions system enhanced with framework-specific guidance

### Improved

- Auto-detection for Vue files enables Vue-specific formatting
- Auto-detection for Tailwind enables class sorting
- Auto-detection for import sorting rules enables experimentalSortImports
- Pass-through of unknown formatter options for future compatibility

## [0.2.0] - 2026-01-21

### Added - Phase 1 (Critical Fixes)

- **Schema normalization**: Handles both `include` and `includes` fields consistently
- **Native TypeScript rules**: Maps to `typescript/*` instead of `@typescript-eslint/*`
- **Explicit printWidth**: Always sets printWidth explicitly to avoid silent formatting changes
- **Oxfmt overrides**: Supports per-file formatter configuration via overrides
- **attributePosition mapping**: Maps to `singleAttributePerLine` in Oxfmt

### Added - Phase 2 (Important Features)

- **Monorepo support**: Handles `"//"` extends syntax for monorepo roots
- **Type-aware flag**: `--type-aware` provides guidance for type-aware linting setup
- **JSON report**: `--report <path>` writes detailed migration report to file
- **Enhanced reporting**: Includes suggestions, detected integrations, and formatter overrides count

### Added - Phase 3 (Integrations)

- **Turborepo integration**: `--turborepo` detects and provides turbo.json update suggestions
- **ESLint bridge**: `--eslint-bridge` suggests eslint-plugin-oxlint integration
- **Prettier detection**: `--prettier` detects Prettier configs and suggests migration
- **Integration detection**: Automatically detects TypeScript, Turborepo, ESLint, and Prettier
- **Comprehensive suggestions**: Context-aware suggestions based on detected integrations

### Changed

- Updated plugin detection to recognize both `typescript/` and `@typescript-eslint/` prefixes
- Enhanced CLI output with integration detection and suggestion counts
- Improved error handling and reporting throughout the codebase

### Fixed

- Schema field normalization prevents silent config ignoring
- Proper monorepo root detection via `.git` or workspace markers
- Correct TypeScript rule mapping for better Oxlint compatibility

## [0.1.0] - 2026-01-20

### Added

- Initial release
- Basic Biome to Oxc migration
- Linter rule mapping
- Formatter option transformation
- Override support
- Package.json script updates
- Dry-run mode
- Verbose logging

[0.6.0]: https://github.com/entro314-labs/biome-to-oxc/compare/v0.3.0...v0.6.0
[0.3.0]: https://github.com/entro314-labs/biome-to-oxc/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/entro314-labs/biome-to-oxc/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/entro314-labs/biome-to-oxc/releases/tag/v0.1.0
