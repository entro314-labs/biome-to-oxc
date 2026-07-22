import { readFile, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, posix, relative, resolve } from 'node:path'

import { z } from 'zod'

import { detectProjectFeatures, generateFeatureSpecificSuggestions } from './advanced-detection.js'
import { loadBiomeIgnorePatterns } from './biome-ignore-loader.js'
import { findBiomeConfig, loadBiomeConfig, resolveBiomeExtends } from './config-loader.js'
import {
  detectESLint,
  generateESLintBridgeSuggestions,
  generateESLintFormatterBridgeSuggestions,
} from './eslint-detector.js'
import { generateOxfmtConfig } from './formatter-mapper.js'
import {
  copyFileIfExists,
  findClosestPackageJson,
  pathExists,
  readJsonFile,
  writeTextFileAtomically,
} from './fs-utils.js'
import {
  buildJsPluginScaffold,
  buildUnsupportedRuleFallbackSuggestions,
  collectUnsupportedBiomeRules,
  recommendJsPluginSpecifiersForUnsupportedRules,
} from './js-plugin-scaffolder.js'
import {
  collectDisabledOxlintOverridePatterns,
  transformOverridesToOxlint,
} from './overrides-transformer.js'
import { collectDisabledOxfmtOverridePatterns, generateOxfmtOverrides } from './oxfmt-overrides.js'
import { generateOxlintConfig } from './oxlint-generator.js'
import { updatePackageJson } from './package-updater.js'
import { detectPrettier, generatePrettierMigrationSuggestions } from './prettier-detector.js'
import { writeReportToFile } from './report-writer.js'
import { CollectingReporter } from './reporter.js'
import {
  detectTurborepo,
  generateTurborepoSuggestions,
  updateTurboConfig,
} from './turbo-updater.js'
import type {
  BiomeConfig,
  MigrationOptions,
  MigrationReport,
  PackageUpdateSummary,
  Reporter,
} from './types.js'

const LEGACY_BIOME_CONFIG_NAMES = ['biome.json', 'biome.jsonc', '.biome.json', '.biome.jsonc']

class MigrationStepFailedError extends Error {}

const WorkspacePackageJsonSchema = z
  .object({
    workspaces: z.union([z.array(z.string()), z.record(z.string(), z.unknown())]).optional(),
  })
  .passthrough()

export async function migrate(
  options: MigrationOptions = {},
  reporter: Reporter = new CollectingReporter(),
): Promise<MigrationReport> {
  const cwd = process.cwd()
  const outputDir = resolve(cwd, options.outputDir ?? '.')
  const typeAwareProfile = options.typeAwareProfile ?? 'standard'
  const typeCheckEnabled = options.typeCheck ?? typeAwareProfile === 'strict'
  const typeAwareEnabled = options.typeAware ?? (typeCheckEnabled || typeAwareProfile === 'strict')

  throwIfAborted(options.signal)

  let biomeConfigPath: string | undefined

  if (options.configPath) {
    biomeConfigPath = resolve(cwd, options.configPath)
    if (!(await pathExists(biomeConfigPath))) {
      reporter.error(`Biome config not found at: ${biomeConfigPath}`)
      return createErrorReport(reporter, biomeConfigPath)
    }
  } else {
    biomeConfigPath = await findBiomeConfig(cwd)
    if (!biomeConfigPath) {
      reporter.error('No Biome configuration file found. Looking for biome.json or biome.jsonc')
      return createErrorReport(reporter)
    }
  }

  reporter.info(`Found Biome config: ${biomeConfigPath}`)
  const projectDir = dirname(biomeConfigPath)
  const packageJsonPath =
    (await findClosestPackageJson(projectDir)) ?? resolve(projectDir, 'package.json')
  const packageRoot = dirname(packageJsonPath)

  let biomeConfig: BiomeConfig
  try {
    biomeConfig = await loadBiomeConfig(biomeConfigPath, reporter)
    biomeConfig = await resolveBiomeExtends(biomeConfig, dirname(biomeConfigPath), reporter)
  } catch {
    return createErrorReport(reporter, biomeConfigPath)
  }

  throwIfAborted(options.signal)

  const projectFeatures = detectProjectFeatures(biomeConfig, reporter)
  const biomeIgnorePatterns = await loadBiomeIgnorePatterns(projectDir, reporter)
  const oxlintConfig = generateOxlintConfig(biomeConfig, reporter, {
    enableImportGraph: options.importGraph ?? false,
    importCycleMaxDepth: options.importCycleMaxDepth ?? 3,
    typeAware: typeAwareEnabled,
    typeCheck: typeCheckEnabled,
    typeAwareProfile: typeCheckEnabled ? 'strict' : typeAwareProfile,
    biomeIgnorePatterns,
  })
  const oxfmtConfig = generateOxfmtConfig(biomeConfig, reporter)

  let formatterOverridesCount = 0

  if (biomeConfig.overrides) {
    appendUniquePatterns(
      oxlintConfig,
      'ignorePatterns',
      collectDisabledOxlintOverridePatterns(biomeConfig.overrides),
    )
    appendUniquePatterns(
      oxfmtConfig,
      'ignorePatterns',
      collectDisabledOxfmtOverridePatterns(biomeConfig.overrides),
    )

    const oxlintOverrides = transformOverridesToOxlint(biomeConfig.overrides, reporter)
    if (oxlintOverrides.length > 0) {
      oxlintConfig.overrides = oxlintOverrides
    }

    const oxfmtOverrides = generateOxfmtOverrides(biomeConfig.overrides, reporter)
    if (oxfmtOverrides.length > 0) {
      oxfmtConfig.overrides = [...(oxfmtConfig.overrides ?? []), ...oxfmtOverrides]
    }
  }

  formatterOverridesCount = oxfmtConfig.overrides?.length ?? 0

  const prettierConfigPath = options.prettier ? await detectPrettier(projectDir) : undefined
  const detectedIntegrations = {
    turborepo: options.turborepo ? await detectTurborepo(projectDir) : false,
    eslint: options.eslintBridge ? await detectESLint(projectDir) : false,
    prettier: prettierConfigPath !== undefined,
    typescript:
      projectFeatures.hasTypeScript ||
      (await pathExists(resolve(projectDir, 'tsconfig.json'))) ||
      (oxlintConfig.plugins?.includes('typescript') ?? false),
  }

  const oxlintConfigPath = resolve(outputDir, '.oxlintrc.json')
  const oxfmtConfigPath = resolve(outputDir, '.oxfmtrc.jsonc')
  const suggestions = await buildSuggestions({
    biomeIgnorePatterns,
    detectedIntegrations,
    options,
    oxlintConfig,
    projectDir,
    prettierConfigPath,
    projectFeatures,
    reporter,
    typeAwareEnabled,
    typeCheckEnabled,
    typeAwareProfile,
    workspaceMonorepo: await detectWorkspaceMonorepo(projectDir),
  })
  rebaseGeneratedConfigPaths(oxlintConfig, oxfmtConfig, projectDir, packageRoot, outputDir)
  let packageJsonSummary: PackageUpdateSummary | undefined
  let deletedLegacyFiles: string[] = []
  let deleteWasAttempted = false
  let mutationSnapshot: Map<string, string | undefined> | undefined
  let mutationPaths = collectMutationPaths({
    biomeConfigPath,
    detectedTurborepo: detectedIntegrations.turborepo ?? false,
    noBackup: options.noBackup ?? false,
    options,
    outputDir,
    packageJsonPath,
    projectDir,
  })

  if (options.report && !options.dryRun) {
    const reportPath = resolve(outputDir, options.report)
    const reservedPaths = new Set([
      ...mutationPaths,
      `${oxlintConfigPath}.backup`,
      `${oxfmtConfigPath}.backup`,
    ])

    if (reservedPaths.has(reportPath)) {
      reporter.error(`Report path conflicts with a migration file: ${reportPath}`)
      return createErrorReport(reporter, biomeConfigPath, oxlintConfigPath, oxfmtConfigPath)
    }

    mutationPaths = [...mutationPaths, reportPath]
  }

  try {
    if (!options.dryRun) {
      mutationSnapshot = await snapshotFiles(mutationPaths)

      if (!options.noBackup) {
        await backupExistingConfigs(oxlintConfigPath, oxfmtConfigPath, reporter, options.signal)
      }

      throwIfAborted(options.signal)
      await writeTextFileAtomically(
        oxlintConfigPath,
        `${JSON.stringify(oxlintConfig, null, 2)}\n`,
        {
          ensureDirectory: true,
          signal: options.signal,
        },
      )
      reporter.info(`Created Oxlint config: ${oxlintConfigPath}`)

      throwIfAborted(options.signal)
      await writeTextFileAtomically(oxfmtConfigPath, `${JSON.stringify(oxfmtConfig, null, 2)}\n`, {
        ensureDirectory: true,
        signal: options.signal,
      })
      reporter.info(`Created Oxfmt config: ${oxfmtConfigPath}`)

      const packageJsonErrorCount = reporter.getErrors().length
      packageJsonSummary = await updatePackageJson(projectDir, reporter, false, {
        updateScripts: options.updateScripts,
        dom: options.dom,
        typeAware: typeAwareEnabled,
        typeCheck: typeCheckEnabled,
        typeAwareProfile,
        fixStrategy: options.fixStrategy,
        oxlintConfigPath: outputDir === packageRoot ? undefined : oxlintConfigPath,
        oxfmtConfigPath: outputDir === packageRoot ? undefined : oxfmtConfigPath,
        signal: options.signal,
      })
      throwIfMigrationErrorsIncreased(packageJsonErrorCount, reporter)

      if (options.turborepo && detectedIntegrations.turborepo) {
        const turboErrorCount = reporter.getErrors().length
        await updateTurboConfig(projectDir, reporter, false, options.signal)
        throwIfMigrationErrorsIncreased(turboErrorCount, reporter)
      }

      if (options.delete) {
        deleteWasAttempted = true
        deletedLegacyFiles = await cleanupLegacyBiomeFiles(
          projectDir,
          biomeConfigPath,
          false,
          reporter,
          options.signal,
        )
      }
    } else {
      reporter.info('Dry-run mode: No files will be written')
      reporter.info(`Would create: ${oxlintConfigPath}`)
      reporter.info(`Would create: ${oxfmtConfigPath}`)

      const packageJsonErrorCount = reporter.getErrors().length
      packageJsonSummary = await updatePackageJson(projectDir, reporter, true, {
        updateScripts: options.updateScripts,
        dom: options.dom,
        typeAware: typeAwareEnabled,
        typeCheck: typeCheckEnabled,
        typeAwareProfile,
        fixStrategy: options.fixStrategy,
        oxlintConfigPath: outputDir === packageRoot ? undefined : oxlintConfigPath,
        oxfmtConfigPath: outputDir === packageRoot ? undefined : oxfmtConfigPath,
        signal: options.signal,
      })
      throwIfMigrationErrorsIncreased(packageJsonErrorCount, reporter)

      if (options.turborepo && detectedIntegrations.turborepo) {
        const turboErrorCount = reporter.getErrors().length
        await updateTurboConfig(projectDir, reporter, true, options.signal)
        throwIfMigrationErrorsIncreased(turboErrorCount, reporter)
      }

      if (options.delete) {
        deleteWasAttempted = true
        deletedLegacyFiles = await cleanupLegacyBiomeFiles(
          projectDir,
          biomeConfigPath,
          true,
          reporter,
          options.signal,
        )
      }
    }
  } catch (err) {
    if (mutationSnapshot) {
      try {
        await restoreFiles(mutationSnapshot)
        reporter.info('Rolled back migration file changes after a failed step.')
      } catch (err) {
        reporter.error(`Failed to roll back migration files: ${formatErrorMessage(err)}`)
      }
    }

    if (isAbortError(err)) {
      throw err
    }

    deleteWasAttempted = false

    if (!(err instanceof MigrationStepFailedError)) {
      reporter.error(`Migration failed while writing files: ${formatErrorMessage(err)}`)
    }
  }

  if (options.delete) {
    if (!deleteWasAttempted) {
      suggestions.push('--delete skipped because migration did not complete successfully.')
    } else if (deletedLegacyFiles.length > 0) {
      const verb = options.dryRun ? 'would remove' : 'removed'
      suggestions.push(`--delete enabled: ${verb} legacy Biome files:`)
      suggestions.push(...deletedLegacyFiles.map((filePath) => `  - ${filePath}`))
    } else {
      suggestions.push('--delete enabled: no legacy Biome files were found to remove.')
    }
  }

  const buildReport = (): MigrationReport => ({
    success: reporter.getErrors().length === 0,
    warnings: reporter.getWarnings(),
    errors: reporter.getErrors(),
    suggestions,
    summary: {
      biomeConfigPath,
      oxlintConfigPath,
      oxfmtConfigPath,
      rulesConverted: Object.keys(oxlintConfig.rules ?? {}).length,
      rulesSkipped: reporter
        .getWarnings()
        .filter((warning) => warning.includes('No Oxlint equivalent')).length,
      overridesConverted: (oxlintConfig.overrides ?? []).length,
      formatterOverridesConverted: formatterOverridesCount,
    },
    packageJson: packageJsonSummary,
    detectedIntegrations,
  })

  if (options.report && !options.dryRun) {
    const reportPath = resolve(outputDir, options.report)
    const reportErrorCount = reporter.getErrors().length

    try {
      await writeReportToFile(buildReport(), reportPath, reporter, options.signal)
    } catch (err) {
      if (mutationSnapshot) {
        await rollbackFiles(mutationSnapshot, reporter)
      }
      throw err
    }

    if (reporter.getErrors().length > reportErrorCount && mutationSnapshot) {
      await rollbackFiles(mutationSnapshot, reporter)
    }
  }

  return buildReport()
}

async function buildSuggestions({
  biomeIgnorePatterns,
  detectedIntegrations,
  options,
  oxlintConfig,
  projectDir,
  prettierConfigPath,
  projectFeatures,
  reporter,
  typeAwareEnabled,
  typeCheckEnabled,
  typeAwareProfile,
  workspaceMonorepo,
}: {
  biomeIgnorePatterns: string[]
  detectedIntegrations: NonNullable<MigrationReport['detectedIntegrations']>
  options: MigrationOptions
  oxlintConfig: ReturnType<typeof generateOxlintConfig>
  projectDir: string
  prettierConfigPath: string | undefined
  projectFeatures: ReturnType<typeof detectProjectFeatures>
  reporter: Reporter
  typeAwareEnabled: boolean
  typeCheckEnabled: boolean
  typeAwareProfile: NonNullable<MigrationOptions['typeAwareProfile']>
  workspaceMonorepo: boolean
}): Promise<string[]> {
  const suggestions: string[] = []
  const unsupportedRules = collectUnsupportedBiomeRules(reporter.getWarnings())
  const unsupportedFallbackSuggestions = buildUnsupportedRuleFallbackSuggestions(unsupportedRules)

  if (unsupportedFallbackSuggestions.length > 0) {
    suggestions.push('Fallback guidance for currently unsupported Biome rules:')
    suggestions.push(...unsupportedFallbackSuggestions)
  }

  if (biomeIgnorePatterns.length > 0) {
    const patternWord = biomeIgnorePatterns.length === 1 ? 'pattern' : 'patterns'
    suggestions.push(
      `.biomeignore detected: migrated ${biomeIgnorePatterns.length} ${patternWord} into Oxlint ignorePatterns as a compatibility alias.`,
    )
  }

  if (options.jsPlugins && unsupportedRules.length > 0) {
    const jsPluginEntries = buildJsPluginScaffold(options.jsPlugin)

    if (jsPluginEntries.length > 0) {
      oxlintConfig.jsPlugins = jsPluginEntries
      suggestions.push('Configured jsPlugins scaffolds for unsupported rules:')
      suggestions.push(
        `  ${jsPluginEntries.map((entry) => (typeof entry === 'string' ? entry : `${entry.name} <= ${entry.specifier}`)).join(', ')}`,
      )
    } else {
      const recommendedSpecifiers = recommendJsPluginSpecifiersForUnsupportedRules(unsupportedRules)
      suggestions.push(
        'Unsupported rules detected. Add JS plugin specifiers to scaffold plugin aliases:',
      )

      if (recommendedSpecifiers.length > 0) {
        suggestions.push(`  Recommended: ${recommendedSpecifiers.join(', ')}`)
      } else {
        suggestions.push(
          '  --js-plugin eslint-plugin-<name> [--js-plugin @scope/eslint-plugin-<name>]',
        )
      }
    }

    suggestions.push(
      `Unsupported Biome rules for JS plugin fallback: ${unsupportedRules.join(', ')}`,
    )
  }

  if (typeAwareEnabled && detectedIntegrations.typescript) {
    const typeAwareCommand = typeCheckEnabled
      ? 'pnpm exec oxlint --type-aware --type-check .'
      : 'pnpm exec oxlint --type-aware .'

    suggestions.push('Type-aware linting profile detected. Install oxlint-tsgolint:')
    suggestions.push('  pnpm add -D oxlint-tsgolint@latest')
    suggestions.push(`  ${typeAwareCommand}`)
    suggestions.push('Type-aware mode uses the tsgolint backend.')
    suggestions.push('Note: type-aware linting is alpha and not semver-stable.')
    suggestions.push(
      'TypeScript compatibility caveat: migrate deprecated tsconfig options if needed (typescript-go / TS7+ behavior).',
    )
    suggestions.push(`Resolved type-aware profile: ${typeAwareProfile}`)
  }

  if (options.importGraph) {
    suggestions.push('Import graph recipe enabled:')
    suggestions.push(`  - Added import/no-cycle with maxDepth=${options.importCycleMaxDepth ?? 3}`)
    suggestions.push('  - Ensure TypeScript path aliases resolve via tsconfig where applicable')
  }

  if (projectFeatures.hasMonorepo || workspaceMonorepo) {
    suggestions.push('Monorepo strategy recommendation:')
    suggestions.push('  - Use nested .oxlintrc.json files per package for local tuning')
    suggestions.push('  - Child configs are not auto-merged with parent unless they use extends')
    suggestions.push(
      '  - Prefer package configs extending a shared root baseline (rules/plugins/overrides)',
    )
  }

  if (await pathExists(resolve(projectDir, '.eslintignore'))) {
    suggestions.push(
      '.eslintignore detected: Oxlint supports it, but prefer migrating to ignorePatterns for long-term consistency.',
    )
  }

  if (detectedIntegrations.turborepo) {
    suggestions.push(...generateTurborepoSuggestions())
  }

  if (detectedIntegrations.eslint) {
    suggestions.push(...generateESLintBridgeSuggestions(reporter))
    suggestions.push(...generateESLintFormatterBridgeSuggestions())
  }

  if (detectedIntegrations.prettier && prettierConfigPath) {
    suggestions.push(...generatePrettierMigrationSuggestions(prettierConfigPath, reporter))
  }

  suggestions.push(...generateFeatureSpecificSuggestions(projectFeatures))

  return suggestions
}

async function detectWorkspaceMonorepo(projectDir: string): Promise<boolean> {
  const packageJsonPath = resolve(projectDir, 'package.json')

  if (!(await pathExists(packageJsonPath))) {
    return false
  }

  try {
    const packageJson = await readJsonFile(
      packageJsonPath,
      WorkspacePackageJsonSchema,
      `package manifest at ${packageJsonPath}`,
    )
    return packageJson.workspaces !== undefined
  } catch {
    return false
  }
}

async function cleanupLegacyBiomeFiles(
  projectDir: string,
  primaryBiomeConfigPath: string,
  dryRun: boolean,
  reporter: Reporter,
  signal?: AbortSignal,
): Promise<string[]> {
  const candidates = getLegacyBiomeFileCandidates(projectDir, primaryBiomeConfigPath)

  const touchedPaths: string[] = []

  for (const candidatePath of candidates) {
    throwIfAborted(signal)

    if (!(await pathExists(candidatePath))) {
      continue
    }

    if (dryRun) {
      touchedPaths.push(candidatePath)
      continue
    }

    try {
      await unlink(candidatePath)
      touchedPaths.push(candidatePath)
    } catch (err) {
      const message = `Failed to delete legacy Biome file ${candidatePath}: ${formatErrorMessage(err)}`
      reporter.error(message)
      throw new MigrationStepFailedError(message)
    }
  }

  return touchedPaths.sort((left, right) => left.localeCompare(right))
}

function getLegacyBiomeFileCandidates(
  projectDir: string,
  primaryBiomeConfigPath: string,
): Set<string> {
  const candidates = new Set<string>([primaryBiomeConfigPath, resolve(projectDir, '.biomeignore')])

  for (const configName of LEGACY_BIOME_CONFIG_NAMES) {
    candidates.add(resolve(projectDir, configName))
  }

  return candidates
}

function appendUniquePatterns(
  config: { ignorePatterns?: string[] },
  key: 'ignorePatterns',
  patterns: string[],
): void {
  if (patterns.length === 0) {
    return
  }

  config[key] = [...new Set([...(config[key] ?? []), ...patterns])]
}

function rebaseGeneratedConfigPaths(
  oxlintConfig: ReturnType<typeof generateOxlintConfig>,
  oxfmtConfig: ReturnType<typeof generateOxfmtConfig>,
  projectDir: string,
  packageRoot: string,
  outputDir: string,
): void {
  oxlintConfig.$schema = relativeConfigPath(
    outputDir,
    resolve(packageRoot, 'node_modules/oxlint/configuration_schema.json'),
  )
  oxfmtConfig.$schema = relativeConfigPath(
    outputDir,
    resolve(packageRoot, 'node_modules/oxfmt/configuration_schema.json'),
  )

  if (projectDir === outputDir) {
    return
  }

  oxlintConfig.ignorePatterns = rebasePatterns(oxlintConfig.ignorePatterns, projectDir, outputDir)
  oxfmtConfig.ignorePatterns = rebasePatterns(oxfmtConfig.ignorePatterns, projectDir, outputDir)

  for (const override of oxlintConfig.overrides ?? []) {
    override.files = rebasePatterns(override.files, projectDir, outputDir) ?? []
    override.excludeFiles = rebasePatterns(override.excludeFiles, projectDir, outputDir)
  }

  for (const override of oxfmtConfig.overrides ?? []) {
    override.files = rebasePatterns(override.files, projectDir, outputDir) ?? []
    override.excludeFiles = rebasePatterns(override.excludeFiles, projectDir, outputDir)
  }

  oxlintConfig.jsPlugins = oxlintConfig.jsPlugins?.map((entry) => {
    if (typeof entry === 'string') {
      return rebaseRelativeSpecifier(entry, projectDir, outputDir)
    }

    return {
      ...entry,
      specifier: rebaseRelativeSpecifier(entry.specifier, projectDir, outputDir),
    }
  })
}

function rebasePatterns(
  patterns: string[] | undefined,
  projectDir: string,
  outputDir: string,
): string[] | undefined {
  if (!patterns) {
    return undefined
  }

  const projectFromOutput = toPosixPath(relative(outputDir, projectDir))
  if (!projectFromOutput) {
    return patterns
  }

  return patterns.map((pattern) => {
    const negated = pattern.startsWith('!')
    const prefix = negated ? '!' : ''
    const body = negated ? pattern.slice(1) : pattern

    if (isAbsolute(body)) {
      return pattern
    }

    return `${prefix}${posix.normalize(`${projectFromOutput}/${body.replace(/^\//u, '')}`)}`
  })
}

function rebaseRelativeSpecifier(specifier: string, projectDir: string, outputDir: string): string {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return specifier
  }

  return relativeConfigPath(outputDir, resolve(projectDir, specifier))
}

function relativeConfigPath(fromDir: string, targetPath: string): string {
  const relativePath = toPosixPath(relative(fromDir, targetPath))
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

function toPosixPath(path: string): string {
  return path.replaceAll('\\', '/')
}

function collectMutationPaths({
  biomeConfigPath,
  detectedTurborepo,
  noBackup,
  options,
  outputDir,
  packageJsonPath,
  projectDir,
}: {
  biomeConfigPath: string
  detectedTurborepo: boolean
  noBackup: boolean
  options: MigrationOptions
  outputDir: string
  packageJsonPath: string
  projectDir: string
}): string[] {
  const oxlintConfigPath = resolve(outputDir, '.oxlintrc.json')
  const oxfmtConfigPath = resolve(outputDir, '.oxfmtrc.jsonc')
  const paths = [oxlintConfigPath, oxfmtConfigPath, packageJsonPath]

  if (!noBackup) {
    paths.push(`${oxlintConfigPath}.backup`, `${oxfmtConfigPath}.backup`)
  }

  if (options.turborepo && detectedTurborepo) {
    paths.push(resolve(projectDir, 'turbo.json'))
  }

  if (options.delete) {
    paths.push(...getLegacyBiomeFileCandidates(projectDir, biomeConfigPath))
  }

  return [...new Set(paths)]
}

async function snapshotFiles(paths: string[]): Promise<Map<string, string | undefined>> {
  const snapshot = new Map<string, string | undefined>()

  for (const path of paths) {
    snapshot.set(path, (await pathExists(path)) ? await readFile(path, 'utf-8') : undefined)
  }

  return snapshot
}

async function restoreFiles(snapshot: Map<string, string | undefined>): Promise<void> {
  for (const [path, content] of snapshot) {
    if (content === undefined) {
      await unlink(path).catch((err: unknown) => {
        if (!isPathMissing(err)) {
          throw err
        }
      })
      continue
    }

    await writeTextFileAtomically(path, content, { ensureDirectory: true })
  }
}

async function rollbackFiles(
  snapshot: Map<string, string | undefined>,
  reporter: Reporter,
): Promise<void> {
  try {
    await restoreFiles(snapshot)
    reporter.info('Rolled back migration file changes after a failed step.')
  } catch (err) {
    reporter.error(`Failed to roll back migration files: ${formatErrorMessage(err)}`)
  }
}

function isPathMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}

async function backupExistingConfigs(
  oxlintConfigPath: string,
  oxfmtConfigPath: string,
  reporter: Reporter,
  signal?: AbortSignal,
): Promise<void> {
  if (await copyFileIfExists(oxlintConfigPath, `${oxlintConfigPath}.backup`, signal)) {
    reporter.info(`Backed up existing Oxlint config to: ${oxlintConfigPath}.backup`)
  }

  if (await copyFileIfExists(oxfmtConfigPath, `${oxfmtConfigPath}.backup`, signal)) {
    reporter.info(`Backed up existing Oxfmt config to: ${oxfmtConfigPath}.backup`)
  }
}

function createErrorReport(
  reporter: Reporter,
  biomeConfigPath?: string,
  oxlintConfigPath = '',
  oxfmtConfigPath = '',
): MigrationReport {
  return {
    success: false,
    warnings: reporter.getWarnings(),
    errors: reporter.getErrors(),
    suggestions: [],
    summary: {
      biomeConfigPath: biomeConfigPath ?? 'not found',
      oxlintConfigPath,
      oxfmtConfigPath,
      rulesConverted: 0,
      rulesSkipped: 0,
      overridesConverted: 0,
      formatterOverridesConverted: 0,
    },
  }
}

function throwIfMigrationErrorsIncreased(previousErrorCount: number, reporter: Reporter): void {
  if (reporter.getErrors().length > previousErrorCount) {
    throw new MigrationStepFailedError()
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted()
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export * from './types.js'
