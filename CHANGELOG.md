# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [3.4.0] - 2026-09-03

### Added

- `useArrayFind`, `useIncludes` and `useStringStartsEndsWith` now migrate to `unicorn/prefer-array-find`, `unicorn/prefer-includes` and `unicorn/prefer-string-starts-ends-with` when the migration does not turn on type-aware linting. Their only Oxlint counterpart was a tsgolint rule that never runs without `--type-aware`, so the default migration dropped those diagnostics. The fallback replaces the type-aware rule instead of joining it, so enabling the type-aware profile later never double-reports a line. `unicorn/prefer-string-starts-ends-with` covers only the anchored-regex form of what Biome flags, so the remainder is reported as a semantic loss. Overrides use the same substitution as the top-level config. ([7e03794](https://github.com/entro314-labs/biome-to-oxc/commit/7e03794))
- Biome's `assist` section is migrated instead of being dropped as an unrecognised top-level field. Actions the config names explicitly map onto the Oxfmt options that implement them: `assist.actions.source.organizeImports` → `sortImports` (with `sortBareImports` → `sortImports.sortSideEffects`), and `useSortedPackageJson` → `sortPackageJson`, which also lifts the pin that otherwise stops Oxfmt sorting a `package.json`. Every other source action, `assist.includes`, `organizeImports`' `groups` and `identifierOrder`, actions enabled only through a preset, and per-override `assist` are reported as semantic losses. Migrating either action warns that Oxfmt's first run reorders once, since Biome and Oxfmt sort imports and `package.json` keys differently, and a config that never settles `organizeImports` warns that Biome sorted imports through its recommended assist set while Oxfmt's `sortImports` defaults to off. ([0095ee1](https://github.com/entro314-labs/biome-to-oxc/commit/0095ee1), [372d0e1](https://github.com/entro314-labs/biome-to-oxc/commit/372d0e1))
- Mappings for three Biome rules whose Oxlint counterparts already existed: `noJsxPropsBind` → `react-perf/jsx-no-new-function-as-prop`, `useControlLabel` → `jsx-a11y/control-has-associated-label`, and `useStaticResponseMethods` → `unicorn/prefer-response-static-json`. The first two report what the Biome rule reports; `useStaticResponseMethods` reports a semantic loss, because the Oxlint rule does not cover the `new Response(null, { status, headers })` form Biome rewrites to `Response.redirect()`. ([08ccf92](https://github.com/entro314-labs/biome-to-oxc/commit/08ccf92))
- `useReactCompiler`'s `compilationMode` is reported as a semantic loss when set to `annotation` or `all`. Oxlint exposes no React Compiler configuration and runs it with fixed options equivalent to Biome's default `infer`, so those modes change which functions are analysed. The rules still migrate; only the option is dropped. ([5305b17](https://github.com/entro314-labs/biome-to-oxc/commit/5305b17))

### Changed

- `useReactCompiler` now maps to all 22 React Compiler rules Oxlint implements, instead of the 12 that ESLint's recommended presets enable. Biome runs the whole compiler and reports every bailout, so the shorter list lost diagnostics the source config produced; `react/void-use-memo` is now emitted too. The mapping is no longer reported as a semantic loss. ([94d35b6](https://github.com/entro314-labs/biome-to-oxc/commit/94d35b6))

## [3.3.0] - 2026-09-03

### Added

- `useArrayFind`, `useIncludes` and `useStringStartsEndsWith` now migrate to `unicorn/prefer-array-find`, `unicorn/prefer-includes` and `unicorn/prefer-string-starts-ends-with` when the migration does not enable type-aware linting. Their only Oxlint counterpart was a tsgolint rule that never runs without `--type-aware`, so the default migration dropped those diagnostics. The fallback replaces the type-aware rule instead of joining it, so enabling the type-aware profile later never double-reports a line. `unicorn/prefer-string-starts-ends-with` covers only the anchored-regex form of what Biome flags, so the remainder is reported as a semantic loss. Overrides use the same substitution as the top-level config. ([7e03794](https://github.com/entro314-labs/biome-to-oxc/commit/7e03794))
- Biome's `assist` section is migrated instead of being dropped as an unrecognised top-level field. Actions the config names explicitly map onto the Oxfmt options that implement them: `assist.actions.source.organizeImports` → `sortImports` (with `sortBareImports` → `sortImports.sortSideEffects`), and `useSortedPackageJson` → `sortPackageJson`, which also lifts the pin that otherwise stops Oxfmt sorting a `package.json`. Every other source action, `assist.includes`, `organizeImports`' `groups` and `identifierOrder`, actions enabled only through a preset, and per-override `assist` are reported as semantic losses. Migrating either action now warns that Oxfmt's first run reorders once, since Biome and Oxfmt sort imports and `package.json` keys differently, and a config that never settles `organizeImports` warns that Biome sorted imports through its recommended assist set while Oxfmt's `sortImports` defaults to off. ([0095ee1](https://github.com/entro314-labs/biome-to-oxc/commit/0095ee1), [372d0e1](https://github.com/entro314-labs/biome-to-oxc/commit/372d0e1))
- Mappings for three Biome rules whose Oxlint counterparts already existed: `noJsxPropsBind` → `react-perf/jsx-no-new-function-as-prop`, `useControlLabel` → `jsx-a11y/control-has-associated-label`, and `useStaticResponseMethods` → `unicorn/prefer-response-static-json`. The first two report what the Biome rule reports; `useStaticResponseMethods` reports a semantic loss, because the Oxlint rule does not cover the `new Response(null, { status, headers })` form Biome rewrites to `Response.redirect()`. ([08ccf92](https://github.com/entro314-labs/biome-to-oxc/commit/08ccf92))
- `useReactCompiler`'s `compilationMode` is reported as a semantic loss when set to `annotation` or `all`. Oxlint exposes no React Compiler configuration and runs it with fixed options equivalent to Biome's default `infer`, so those modes change which functions are analysed. The rules still migrate; only the option is dropped. ([5305b17](https://github.com/entro314-labs/biome-to-oxc/commit/5305b17))

### Changed

- `useReactCompiler` now maps to all 22 React Compiler rules Oxlint implements, instead of the 12 that ESLint's recommended presets enable. Biome runs the whole compiler and reports every bailout, so the shorter list lost diagnostics the source config produced; `react/void-use-memo` is now emitted too. The mapping is no longer reported as a semantic loss. ([94d35b6](https://github.com/entro314-labs/biome-to-oxc/commit/94d35b6))

## [3.2.0] - 2026-09-03

### Added

- `useArrayFind`, `useIncludes` and `useStringStartsEndsWith` now migrate to a non-type-aware Oxlint rule when the migration is not enabling type-aware linting: `unicorn/prefer-array-find`, `unicorn/prefer-includes` and `unicorn/prefer-string-starts-ends-with`. Their only Oxlint counterpart was previously a tsgolint rule that never runs without `--type-aware`, so the default migration dropped those diagnostics entirely. The fallback replaces the type-aware rule rather than joining it, so turning the type-aware profile on later never reports the same line twice. `unicorn/prefer-string-starts-ends-with` covers only the anchored-regex form of what Biome flags and reports the rest as a semantic loss. Overrides pick the same substitution as the top-level config. ([7e03794](https://github.com/entro314-labs/biome-to-oxc/commit/7e03794))
- Biome's `assist` section is migrated instead of being dropped whole as an unrecognised top-level field. Actions the config names explicitly map onto the Oxfmt options that implement them: `assist.actions.source.organizeImports` → `sortImports` (with `sortBareImports` → `sortImports.sortSideEffects`) and `useSortedPackageJson` → `sortPackageJson`, which also lifts the pin that otherwise keeps Oxfmt from sorting a `package.json` Biome left alone. Every other source action, `assist.includes`, `organizeImports`' `groups` and `identifierOrder`, actions enabled only through a preset, and per-override `assist` are reported as semantic losses. Migrating either action warns that Oxfmt's first run reorders once, because Biome and Oxfmt sort imports and `package.json` keys into different orders; a config that never settles `organizeImports` warns that Biome sorted imports anyway through its recommended assist set while Oxfmt's `sortImports` defaults to off. ([0095ee1](https://github.com/entro314-labs/biome-to-oxc/commit/0095ee1), [372d0e1](https://github.com/entro314-labs/biome-to-oxc/commit/372d0e1))
- Mappings for three Biome rules whose Oxlint counterparts already existed: `noJsxPropsBind` → `react-perf/jsx-no-new-function-as-prop`, `useControlLabel` → `jsx-a11y/control-has-associated-label`, and `useStaticResponseMethods` → `unicorn/prefer-response-static-json`. The first two report what the Biome rule reports. `useStaticResponseMethods` reports a semantic loss: the Oxlint rule covers `new Response(JSON.stringify(...))` but not the `new Response(null, { status, headers })` form Biome rewrites to `Response.redirect()`. ([08ccf92](https://github.com/entro314-labs/biome-to-oxc/commit/08ccf92))
- `useReactCompiler`'s `compilationMode` is reported as a semantic loss when set to `annotation` or `all`. Oxlint exposes no React Compiler configuration and runs the compiler with fixed options equivalent to Biome's default `infer`, so those modes change which functions are analysed and cannot be carried over. The rules still migrate; only the option is dropped. ([5305b17](https://github.com/entro314-labs/biome-to-oxc/commit/5305b17))

### Changed

- `useReactCompiler` now maps to all 22 React Compiler rules Oxlint implements, instead of only the 12 that ESLint's recommended presets enable. Biome runs the whole compiler and reports every bailout, so the shorter list dropped diagnostics the source config did produce; `react/void-use-memo`, which Oxlint enables by default, is now emitted too. The mapping is no longer reported as a semantic loss. ([94d35b6](https://github.com/entro314-labs/biome-to-oxc/commit/94d35b6))

## [3.1.0] - 2026-09-03

### Added

- `useArrayFind`, `useIncludes` and `useStringStartsEndsWith` now fall back to a non-type-aware
  Oxlint rule when the migration is not enabling type-aware linting. All three need no type
  information in Biome, but their only Oxlint counterpart is a tsgolint rule that never runs
  without `--type-aware`, so the default migration was dropping their diagnostics entirely:
  `useArrayFind` → `unicorn/prefer-array-find`, `useIncludes` → `unicorn/prefer-includes`, and
  `useStringStartsEndsWith` → `unicorn/prefer-string-starts-ends-with`. The fallback replaces the
  type-aware rule rather than joining it, so switching the profile on later never reports a line
  twice. The first two were verified to report exactly what the Biome rule reports; the third
  covers only the anchored-regex form of the four Biome flags and reports that as a semantic loss.
  Overrides pick the same substitution as the top-level config.
- Biome's `assist` section is now migrated instead of being dropped whole. `assist.actions.source`
  entries the config turns on explicitly map onto the Oxfmt options that implement them:
  `organizeImports` → `sortImports` (with `options.sortBareImports` → `sortImports.sortSideEffects`)
  and `useSortedPackageJson` → `sortPackageJson`, which lifts the pin that otherwise keeps Oxfmt
  from sorting a `package.json` Biome left alone. Every other action, `assist.includes`,
  `organizeImports`' `groups` and `identifierOrder`, actions enabled through a preset rather than
  named, and per-override `assist` are reported as semantic losses. `assist` no longer produces the
  blanket "top-level field has no Oxc equivalent" loss.
- Migrating `organizeImports` or `useSortedPackageJson` now warns that Oxfmt's first run reorders
  once, because Biome and Oxfmt sort imports and `package.json` keys into different orders — both
  verified by running the two binaries over the same fixture.
- A migration whose Biome config never settles `organizeImports` now warns that Biome sorted
  imports anyway through its recommended assist set, while Oxfmt's `sortImports` defaults to off.
  It is a warning rather than a loss because it applies to nearly every migration, the same way
  the linter's category-preset approximation does.
- Rule mappings for three Biome rules whose Oxlint counterparts already existed:
  `noJsxPropsBind` → `react-perf/jsx-no-new-function-as-prop`, `useControlLabel` →
  `jsx-a11y/control-has-associated-label`, and `useStaticResponseMethods` →
  `unicorn/prefer-response-static-json`. Each pair was verified by running both binaries over the
  same fixture. The first two report exactly what the Biome rule reports — `noJsxPropsBind`'s
  `.bind()` calls, arrow functions and function expressions in JSX props included — so neither is a
  narrowing. `useStaticResponseMethods` is: the Oxlint rule reports
  `new Response(JSON.stringify(...))` but not the `new Response(null, { status, headers: { Location } })`
  form Biome rewrites to `Response.redirect()`, so the mapping reports that as a semantic loss.
- Biome `useReactCompiler`'s `compilationMode` option is now reported as a semantic loss when it is
  set to `annotation` or `all`. Oxlint exposes no React Compiler configuration and runs the
  compiler with fixed options equivalent to Biome's default `infer`, so the migrated rules analyse
  a different set of functions: `annotation` narrowed Biome to functions carrying a `"use memo"`
  directive, and `all` widened it past components and hooks. The rules still migrate; only the
  option is dropped, and now visibly.

### Changed

- Toolchain refreshed to Oxlint 1.81.0, Oxfmt 0.66.0 and Biome 2.5.11, and the inventories under
  `docs/` regenerated from their schemas. Oxlint 1.80/1.81 and Oxfmt 0.65/0.66 shipped no new rules
  or configuration options, so `docs/oxlint-rules.tsv`, `docs/oxfmt-rules.tsv`,
  `docs/tsgolint-rules.tsv` and `docs/oxlint-vs-tsgolint.tsv` are unchanged. Biome 2.5.11 added two
  nursery rules — `noAstroSetHtmlDirective` (Astro templates) and `noUndeclaredCustomProperties`
  (CSS) — neither of which Oxlint can lint, so both stay unmapped.
- `useReactCompiler` now maps to all 22 React Compiler rules Oxlint implements instead of only the
  12 that ESLint's recommended presets enable. Biome runs the whole compiler and reports every
  bailout, so the ten rules that are off by default upstream (`react/no-deriving-state-in-effects`
  in `perf`, `react/invariant`, `react/rule-suppression`, `react/syntax` and `react/todo` in
  `restriction`, and `react/capitalized-calls`, `react/exhaustive-effect-dependencies`,
  `react/hooks` and `react/memo-dependencies` in `suspicious`) cover diagnostics the Biome rule did
  produce; leaving them out lost coverage. `react/void-use-memo`, which Oxlint enables by default
  and the previous mapping missed, is now emitted too. The rule set is no longer reported as a
  semantic loss, because it is no longer a narrowing.

## [3.0.1] - 2026-08-20

### Fixed

- Migrate Biome `noConsole`'s `allow` option to Oxlint `no-console` instead of reporting a semantic
  loss and running the rule with defaults.
- Map Biome `noFlatMapIdentity` to `unicorn/prefer-array-flat` (verified to flag the same
  `flatMap(x => x)` pattern; the Oxlint rule additionally covers other flatten idioms).

## [3.0.0] - 2026-08-20

### Added

- `pnpm docs:sync` regenerates every inventory under `docs/` from the schemas shipped by the
  installed `oxlint`, `oxfmt`, `oxlint-tsgolint`, and `@biomejs/biome` packages. Two of them are
  new: `docs/biome-rules.tsv` and `docs/biome-formatter-options.tsv` record the source side of the
  migration, which was previously untracked. `pnpm docs:check` fails when an inventory is stale and
  runs as part of `pnpm check`.
- A conformance test asserting every Biome rule name the mapper keys off still exists in Biome, so
  a mapping cannot quietly stop matching after Biome renames or drops a rule.
- Rule mappings for the Oxlint rules added in 1.66-1.79 and for Biome rules whose Oxlint
  counterparts already existed: `useSingleVarDeclarator` → `one-var`, `useReactCompiler` → the
  React Compiler rules Oxlint enables for ESLint's recommended preset, `noComponentHookFactories`,
  `noReactPropAssignments`, `noBlankTarget`, `noExcessiveLinesPerFile`,
  `noExcessiveLinesPerFunction`, `noExportsInTest`, `noGlobalDirnameFilename`, `noGlobalIsFinite`,
  `noGlobalIsNan`, `noJsRestrictedProperties`, `noNegationInEqualityCheck`, `noUnsafeTypeAssertion`,
  `noUselessContinue`, `noUselessElse`, `noUselessUndefinedInitialization`,
  `useConsistentObjectDefinitions`, `useExplicitReturnType`, `useExplicitType`, and
  `useImportExtensions`.
- Formatter mappings for the Biome options that now have Oxfmt equivalents:
  `javascript.formatter.operatorLinebreak` → `experimentalOperatorPosition` (new in Oxfmt 0.64),
  `expand` → `objectWrap`, `trailingNewline` → `insertFinalNewline`, and `formatter.bracketSameLine`
  → `bracketSameLine`. Each previously reported as an unmigratable option.
- Reinstated the hidden `--dom` flag removed in 2.0.0. It applies the opinionated script preset
  (`check`, `check:fix`, `format`, `format:check`, `lint`, `lint:fix`, `lint:fix-unsafe`,
  `check:fix-suggestions`, `type-check`). The `type-check` script now runs `tsc --noEmit` instead of
  `tsgo --noEmit`: since TypeScript 7 the native compiler ships as the regular `typescript` package
  under the `tsc` binary, which resolves the missing-`tsgo` flaw that led to the flag's removal.

### Changed

- `noUselessContinue` replaces the `noUnnecessaryContinue` mapping as the current Biome name; the
  old name is still accepted.
- Mappings where the Oxlint rule covers only part of the Biome rule now report the narrowing as a
  semantic loss instead of applying it silently.
- `react/react-compiler` was removed from the Oxlint inventory: Oxlint 1.79 split it into 22
  per-diagnostic rules.

## [2.0.0] - 2026-08-11

### Added

- Semantic-loss diagnostics. Source behaviour the generated configs provably do not reproduce is
  recorded separately from ordinary warnings, exposed as `losses` in the report, and printed with a
  distinct `⊘` marker.
- A project-scoped migration lock (`.biome-to-oxc.lock`) with stale-lock reclamation, so concurrent
  migrations cannot interleave their writes or roll back one another's work.
- Structural validation of the generated configs before anything is deleted, rejecting glob patterns
  that Oxlint and Oxfmt refuse to load.
- Lockfile detection. When dependencies change, the report names the lockfile and the install
  command required before a frozen-lockfile install.
- `--dry-run` now prints the full generated Oxlint and Oxfmt configuration.
- Rule mappings for `noExtendNative`, `noUselessCatchBinding`, and `noTsIgnore` (the last narrowed to
  `ts-ignore` only, matching Biome's semantics).
- A conformance test asserting every mapped Oxlint rule exists in the tracked rule inventory.
- A source-versus-target conformance suite that runs the real Biome, Oxlint, and Oxfmt binaries over
  shared fixtures and compares what the tools actually do — formatter file-scope parity for default
  configs, negated includes, `.biomeignore`, and formatter exclusions; generated-config
  loadability; and overlapping-override resolution.
- `publint` and `arethetypeswrong` (`esm-only` profile) now run on every build via tsdown, so a
  broken `exports` map or type-resolution regression fails the build instead of shipping.

### Changed

- **Breaking:** `--delete` and removal of the `@biomejs/biome` dependency now require a migration
  with zero semantic losses. A lossy conversion keeps the Biome config and dependency in place and
  reports `success: false`, so it can no longer delete the project's only working configuration.
- **Breaking:** `success` means "the migration is a complete replacement for Biome", not merely
  "files were written".
- **Breaking:** `--output-dir` must point at the Biome project root or an ancestor. A directory below
  the project root is rejected when the migration would emit any glob, because both target tools
  resolve patterns inside the config file's directory and reject `..`.
- **Breaking:** removed the undocumented `--dom` flag. It was hidden from help and wrote a
  `tsgo --noEmit` script without providing `tsgo`.
- Report counters measure what their names say: `rulesConverted`/`rulesSkipped` count distinct Biome
  source rules, with the emitted Oxlint rule count exposed separately as `oxlintRulesEmitted`, and
  user-derived formatter overrides separated from synthesized language overrides.
- Type-aware linting is described as stable (tsgolint v7) rather than alpha.

### Fixed

- Rewriting package scripts no longer corrupts package-qualified Biome invocations. The whole
  executable token is matched, so `npx @biomejs/biome check .` becomes `oxlint . && oxfmt --check .`
  instead of the unresolvable `npx @biomejs/oxlint .`. Covers `npx`, `npm exec`, `pnpm exec`,
  `pnpm dlx`, `yarn`, `yarn dlx`, `bunx`, `bun x`, `bun run`, `exec`, and bin-directory paths.
- `package.json` and `turbo.json` keep their original key order. Validation no longer rebuilds the
  object, which had been moving `name`, `version`, and other keys below `scripts`.
- Negated `includes` exceptions (`!pattern`) are translated into `ignorePatterns` for both tools
  instead of being dropped, which had silently widened the linted and formatted file sets.
  `!!` force-ignore patterns are migrated as plain ignores and reported as a loss.
- `.biomeignore` patterns now reach the Oxfmt config as well as the Oxlint config.
- Oxfmt no longer inherits target defaults Biome never had: `sortPackageJson` is pinned off and
  YAML, TOML, and Markdown are excluded, so migrating does not reformat files Biome left alone.
- Valid Biome 2.x configs are no longer rejected: `formatter.lineEnding: "auto"` is accepted (and the
  missing Oxfmt equivalent reported), and explicitly `null` sections are treated as unset, matching
  Biome's nullable schema.
- Biome `vcs` settings are reconciled against the Oxc tools' `.gitignore` defaults instead of being
  parsed and ignored.

- Parse `biome.json`/`biome.jsonc` configs with trailing commas the same way Biome does instead of
  failing with `PropertyNameExpected`/`ValueExpected` JSONC errors.
- Align Oxlint/Oxfmt/tsgolint inventories and dependencies with Oxlint 1.77.0, Oxfmt 0.62.0,
  and oxlint-tsgolint 7.0.2001 (adds `oxc/bad-match-all-arg`, `node/exports-style`, and
  `eslint/id-denylist`; no Biome equivalents exist for these rules).
- Accept current Biome rule presets, group severities, and `on`/`info` rule levels.
- Fail on missing, unresolved, or circular `extends` entries instead of producing incomplete output.
- Resolve package-exported Biome configs from `node_modules`.
- Keep project/package/Turbo discovery anchored to the Biome config when `--output-dir` is used, and
  rebase generated config globs and schema paths.
- Emit schema-valid Oxlint overrides with `excludeFiles`; disabled linter/formatter overrides become
  tool-specific ignore patterns.
- Keep JavaScript, JSON, and CSS formatter settings scoped to Oxfmt language overrides instead of
  leaking language-specific values into the global formatter configuration.
- Keep `@biomejs/biome` installed whenever a package script still invokes Biome, including scripts
  skipped because their shell structure or CLI flags cannot be rewritten safely.
- Merge Turborepo defaults without replacing existing task dependencies or outputs.
- Roll back all migration mutations after required-step failure or cancellation.
- Reject report paths that would overwrite generated configs, package state, backups, or legacy
  files.
- Preserve escaped `.biomeignore` literals and reject invalid current-schema `objectWrap` values.
- Warn when valid Biome severities/options cannot be represented faithfully instead of dropping
  them silently.
- Print a concise success summary for normal non-JSON CLI runs.
- Emit stable root type-aware options and migrate Biome `useReactFunctionComponentDefinition`,
  including its `namedComponents` option.
- Stop mapping Biome `noVoidTypeReturn` to the unrelated `typescript/no-invalid-void-type` rule.

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

[Unreleased]: https://github.com/entro314-labs/biome-to-oxc/compare/v3.4.0...HEAD
[3.4.0]: https://github.com/entro314-labs/biome-to-oxc/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/entro314-labs/biome-to-oxc/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/entro314-labs/biome-to-oxc/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/entro314-labs/biome-to-oxc/compare/v3.0.1...v3.1.0
[3.0.1]: https://github.com/entro314-labs/biome-to-oxc/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/entro314-labs/biome-to-oxc/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/entro314-labs/biome-to-oxc/compare/v0.6.0...v2.0.0
[0.6.0]: https://github.com/entro314-labs/biome-to-oxc/compare/v0.3.0...v0.6.0
[0.3.0]: https://github.com/entro314-labs/biome-to-oxc/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/entro314-labs/biome-to-oxc/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/entro314-labs/biome-to-oxc/releases/tag/v0.1.0
