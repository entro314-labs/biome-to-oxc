# Changelog

All notable changes to this project will be documented in this file.

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

[0.2.0]: https://github.com/yourusername/biome-to-oxc/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/yourusername/biome-to-oxc/releases/tag/v0.1.0
