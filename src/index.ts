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
import { excludeOxfmtOnlyLanguages, generateOxfmtConfig } from './formatter-mapper.js'
import {
  copyFileIfExists,
  findClosestPackageJson,
  pathExists,
  readJsonFile,
  writeTextFileAtomically,
} from './fs-utils.js'
import { validateGeneratedConfigs } from './generated-config-validator.js'
import {
  buildJsPluginScaffold,
  buildUnsupportedRuleFallbackSuggestions,
  collectUnsupportedBiomeRules,
  recommendJsPluginSpecifiersForUnsupportedRules,
} from './js-plugin-scaffolder.js'
import { acquireMigrationLock, MigrationLockedError } from './migration-lock.js'
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
  CleanupOutcome,
  MigrationOptions,
  MigrationReport,
  OxfmtConfig,
  OxlintConfig,
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
  const biomeConfigPath = options.configPath
    ? resolve(cwd, options.configPath)
    : await findBiomeConfig(cwd)

  if (!biomeConfigPath) {
    reporter.error('No Biome configuration file found. Looking for biome.json or biome.jsonc')
    return createErrorReport(reporter)
  }

  if (!(await pathExists(biomeConfigPath))) {
    reporter.error(`Biome config not found at: ${biomeConfigPath}`)
    return createErrorReport(reporter, biomeConfigPath)
  }

  // Snapshot/write/restore is not atomic across processes, so concurrent migrations of the
  // same project must be serialized. The lock is scoped to the project the Biome config
  // belongs to, not to the working directory the CLI happened to run from.
  let lock: Awaited<ReturnType<typeof acquireMigrationLock>> | undefined

  if (!options.dryRun) {
    try {
      lock = await acquireMigrationLock(dirname(biomeConfigPath), reporter)
    } catch (err) {
      if (err instanceof MigrationLockedError) {
        reporter.error(err.message)
        return createErrorReport(reporter, biomeConfigPath)
      }

      throw err
    }
  }

  try {
    return await runMigration(options, reporter, biomeConfigPath)
  } finally {
    await lock?.release()
  }
}

async function runMigration(
  options: MigrationOptions,
  reporter: Reporter,
  biomeConfigPath: string,
): Promise<MigrationReport> {
  const cwd = process.cwd()
  const outputDir = resolve(cwd, options.outputDir ?? '.')
  const typeAwareProfile = options.typeAwareProfile ?? 'standard'
  const typeCheckEnabled = options.typeCheck ?? typeAwareProfile === 'strict'
  const typeAwareEnabled = options.typeAware ?? (typeCheckEnabled || typeAwareProfile === 'strict')

  throwIfAborted(options.signal)

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
  const oxlintGeneration = generateOxlintConfig(biomeConfig, reporter, {
    enableImportGraph: options.importGraph ?? false,
    importCycleMaxDepth: options.importCycleMaxDepth ?? 3,
    typeAware: typeAwareEnabled,
    typeCheck: typeCheckEnabled,
    typeAwareProfile: typeCheckEnabled ? 'strict' : typeAwareProfile,
    biomeIgnorePatterns,
  })
  const oxlintConfig = oxlintGeneration.config
  // `.biomeignore` is not read by Biome 2.x, but the migration honours it for projects
  // carrying one; it must reach both Oxc tools so they agree with each other.
  const oxfmtConfig = generateOxfmtConfig(biomeConfig, reporter, { biomeIgnorePatterns })
  const convertedSourceRules = new Set(oxlintGeneration.sourceRulesConverted)
  const skippedSourceRules = new Set(oxlintGeneration.sourceRulesSkipped)
  // Language overrides are synthesized by the formatter mapper, not derived from
  // Biome `overrides`, so they are counted separately from user overrides.
  const formatterLanguageOverrideCount = oxfmtConfig.overrides?.length ?? 0
  let formatterOverridesCount = 0

  reconcileVcsIgnoreSettings(biomeConfig, reporter)

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

    const oxlintOverrideResult = transformOverridesToOxlint(biomeConfig.overrides, reporter)
    if (oxlintOverrideResult.overrides.length > 0) {
      oxlintConfig.overrides = oxlintOverrideResult.overrides
    }

    for (const ruleName of oxlintOverrideResult.sourceRulesConverted) {
      convertedSourceRules.add(ruleName)
    }

    for (const ruleName of oxlintOverrideResult.sourceRulesSkipped) {
      skippedSourceRules.add(ruleName)
    }

    const oxfmtOverrides = generateOxfmtOverrides(biomeConfig.overrides, reporter)
    formatterOverridesCount = oxfmtOverrides.length

    if (oxfmtOverrides.length > 0) {
      oxfmtConfig.overrides = [...(oxfmtConfig.overrides ?? []), ...oxfmtOverrides]
    }
  }

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
  const rebaseOutcome = rebaseGeneratedConfigPaths(
    oxlintConfig,
    oxfmtConfig,
    projectDir,
    packageRoot,
    outputDir,
  )

  if (rebaseOutcome.status === 'unsupported') {
    reporter.error(rebaseOutcome.message)
    return createErrorReport(reporter, biomeConfigPath, oxlintConfigPath, oxfmtConfigPath)
  }

  if (rebaseOutcome.status === 'nested-without-patterns') {
    reporter.loss(
      `The generated configs live below the Biome project root, so their ignorePatterns resolve within ${outputDir} rather than ${projectDir}. The YAML/TOML/Markdown exclusions that keep Oxfmt from formatting files Biome never touched only cover that subtree.`,
    )
  }

  // Applied after rebasing: these patterns are relative to the config's own directory.
  excludeOxfmtOnlyLanguages(oxfmtConfig)

  const configProblems = validateGeneratedConfigs(oxlintConfig, oxfmtConfig)

  if (configProblems.length > 0) {
    for (const problem of configProblems) {
      reporter.error(`Generated configuration is invalid: ${problem}`)
    }

    return createErrorReport(reporter, biomeConfigPath, oxlintConfigPath, oxfmtConfigPath)
  }

  // Cleanup and dependency removal are only safe once the generated configs fully
  // replace the Biome setup. Any recorded loss means they do not.
  const semanticLosses = reporter.getLosses()
  const cleanupAllowed = (options.delete ?? false) && semanticLosses.length === 0

  if ((options.delete ?? false) && !cleanupAllowed) {
    reporter.warn(
      `--delete was requested but ${semanticLosses.length} semantic loss${semanticLosses.length === 1 ? '' : 'es'} would leave the project without behaviour Biome provided. Legacy Biome files and the Biome dependency were kept.`,
    )
  }

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
        removeBiome: cleanupAllowed,
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

      if (cleanupAllowed) {
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
      reporter.info(formatConfigPreview(oxlintConfig))
      reporter.info(`Would create: ${oxfmtConfigPath}`)
      reporter.info(formatConfigPreview(oxfmtConfig))

      const packageJsonErrorCount = reporter.getErrors().length
      packageJsonSummary = await updatePackageJson(projectDir, reporter, true, {
        updateScripts: options.updateScripts,
        removeBiome: cleanupAllowed,
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

      if (cleanupAllowed) {
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

  const cleanup = buildCleanupOutcome({
    requested: options.delete ?? false,
    cleanupAllowed,
    deleteWasAttempted,
    deletedLegacyFiles,
    dryRun: options.dryRun ?? false,
    semanticLosses: reporter.getLosses(),
    suggestions,
  })

  if (packageJsonSummary?.lockfile?.stale) {
    suggestions.push(
      `Dependencies changed: run \`${packageJsonSummary.lockfile.installCommand}\` to refresh ${packageJsonSummary.lockfile.path} before any frozen-lockfile install.`,
    )
  }

  const buildReport = (): MigrationReport => ({
    // A migration only succeeds when it wrote what was asked AND the result is a
    // complete replacement for the Biome setup.
    success: reporter.getErrors().length === 0 && reporter.getLosses().length === 0,
    warnings: reporter.getWarnings(),
    errors: reporter.getErrors(),
    losses: reporter.getLosses(),
    suggestions,
    summary: {
      biomeConfigPath,
      oxlintConfigPath,
      oxfmtConfigPath,
      rulesConverted: convertedSourceRules.size,
      rulesSkipped: skippedSourceRules.size,
      oxlintRulesEmitted: Object.keys(oxlintConfig.rules ?? {}).length,
      overridesConverted: (oxlintConfig.overrides ?? []).length,
      formatterOverridesConverted: formatterOverridesCount,
      formatterLanguageOverrides: formatterLanguageOverrideCount,
    },
    packageJson: packageJsonSummary,
    detectedIntegrations,
    cleanup,
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
  oxlintConfig: OxlintConfig
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
      `.biomeignore detected: migrated ${biomeIgnorePatterns.length} ${patternWord} into the Oxlint and Oxfmt ignorePatterns. Biome 2.x does not read .biomeignore itself, so this narrows scope relative to your current Biome run; delete the file if it is no longer wanted.`,
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
    suggestions.push(
      'Type-aware linting is stable as of tsgolint v7; it covers 59 of typescript-eslint’s 61 type-aware rules, so check the remaining two if you relied on them.',
    )
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

function formatConfigPreview(config: OxlintConfig | OxfmtConfig): string {
  return JSON.stringify(config, null, 2)
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}

/**
 * Reconciles Biome's VCS ignore policy with the Oxc tools' defaults.
 *
 * Oxfmt reads `.gitignore` and `.prettierignore` unless `--ignore-path` overrides it, and
 * Oxlint reads `.eslintignore`. Biome only consults `.gitignore` when
 * `vcs.enabled` and `vcs.useIgnoreFile` are both set, so the two can disagree about which
 * files are in scope.
 */
function reconcileVcsIgnoreSettings(biomeConfig: BiomeConfig, reporter: Reporter): void {
  const { vcs } = biomeConfig

  if (!vcs || vcs.enabled !== true) {
    return
  }

  if (vcs.useIgnoreFile === true) {
    reporter.info(
      'Biome vcs.useIgnoreFile is enabled; Oxfmt reads .gitignore by default, so this behaviour carries over.',
    )
    return
  }

  reporter.warn(
    'Biome vcs is enabled without useIgnoreFile, so Biome ignored .gitignore. Oxfmt reads .gitignore by default and will therefore skip files Biome formatted; pass --ignore-path to override.',
  )

  if (vcs.root !== undefined || vcs.defaultBranch !== undefined) {
    reporter.loss(
      'Biome vcs.root/vcs.defaultBranch scoping (used by Biome’s changed-files filtering) has no Oxlint or Oxfmt equivalent and was not migrated.',
    )
  }
}

function buildCleanupOutcome({
  requested,
  cleanupAllowed,
  deleteWasAttempted,
  deletedLegacyFiles,
  dryRun,
  semanticLosses,
  suggestions,
}: {
  requested: boolean
  cleanupAllowed: boolean
  deleteWasAttempted: boolean
  deletedLegacyFiles: string[]
  dryRun: boolean
  semanticLosses: string[]
  suggestions: string[]
}): CleanupOutcome {
  if (!requested) {
    return { requested: false, performed: false, files: [] }
  }

  if (!cleanupAllowed) {
    const blockedReason =
      semanticLosses.length === 1
        ? '1 semantic loss means the generated configs do not fully replace Biome'
        : `${semanticLosses.length} semantic losses mean the generated configs do not fully replace Biome`
    suggestions.push(
      '--delete was skipped: the migration is not yet a complete replacement for Biome.',
    )
    suggestions.push('Resolve these losses, then re-run with --delete:')
    suggestions.push(...semanticLosses.map((loss) => `  - ${loss}`))

    return { requested: true, performed: false, blockedReason, files: [] }
  }

  if (!deleteWasAttempted) {
    const blockedReason = 'the migration did not complete successfully'
    suggestions.push(`--delete skipped because ${blockedReason}.`)
    return { requested: true, performed: false, blockedReason, files: [] }
  }

  if (deletedLegacyFiles.length === 0) {
    suggestions.push('--delete enabled: no legacy Biome files were found to remove.')
    return { requested: true, performed: true, files: [] }
  }

  const verb = dryRun ? 'would remove' : 'removed'
  suggestions.push(`--delete enabled: ${verb} legacy Biome files:`)
  suggestions.push(...deletedLegacyFiles.map((filePath) => `  - ${filePath}`))

  return { requested: true, performed: true, files: deletedLegacyFiles }
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

type RebaseOutcome =
  | { status: 'ok' }
  /** Config directory sits below the project root, but nothing needed rebasing. */
  | { status: 'nested-without-patterns' }
  | { status: 'unsupported'; message: string }

/**
 * Rebases project-relative globs onto the generated configs' directory.
 *
 * Oxlint and Oxfmt resolve patterns within the config file's directory and reject `..`,
 * so a config written *below* the Biome project root cannot express a pattern that points
 * back up at the project. Rather than emit a config neither tool can load, this returns
 * an error message describing the unsupported topology.
 *
 */
function rebaseGeneratedConfigPaths(
  oxlintConfig: OxlintConfig,
  oxfmtConfig: OxfmtConfig,
  projectDir: string,
  packageRoot: string,
  outputDir: string,
): RebaseOutcome {
  // `$schema` is an editor hint rather than a glob, so `..` is fine there.
  oxlintConfig.$schema = relativeConfigPath(
    outputDir,
    resolve(packageRoot, 'node_modules/oxlint/configuration_schema.json'),
  )
  oxfmtConfig.$schema = relativeConfigPath(
    outputDir,
    resolve(packageRoot, 'node_modules/oxfmt/configuration_schema.json'),
  )

  if (projectDir === outputDir) {
    return { status: 'ok' }
  }

  const projectFromOutput = toPosixPath(relative(outputDir, projectDir))
  const requiresParentTraversal = projectFromOutput.split('/').includes('..')

  if (requiresParentTraversal) {
    const patternsNeedingRebase = countRebasablePatterns(oxlintConfig, oxfmtConfig)

    if (patternsNeedingRebase > 0) {
      return {
        status: 'unsupported',
        message: `--output-dir ${outputDir} sits below the Biome project root ${projectDir}, so ${patternsNeedingRebase} generated glob pattern(s) would have to escape the config directory with "..", which Oxlint and Oxfmt reject. Write the configs at the project root, or choose an output directory that is an ancestor of the Biome config.`,
      }
    }

    return { status: 'nested-without-patterns' }
  }

  oxlintConfig.ignorePatterns = rebasePatterns(oxlintConfig.ignorePatterns, projectFromOutput)
  oxfmtConfig.ignorePatterns = rebasePatterns(oxfmtConfig.ignorePatterns, projectFromOutput)

  for (const override of oxlintConfig.overrides ?? []) {
    override.files = rebasePatterns(override.files, projectFromOutput) ?? []
    override.excludeFiles = rebasePatterns(override.excludeFiles, projectFromOutput)
  }

  for (const override of oxfmtConfig.overrides ?? []) {
    override.files = rebasePatterns(override.files, projectFromOutput) ?? []
    override.excludeFiles = rebasePatterns(override.excludeFiles, projectFromOutput)
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

  return { status: 'ok' }
}

function countRebasablePatterns(oxlintConfig: OxlintConfig, oxfmtConfig: OxfmtConfig): number {
  const groups = [
    oxlintConfig.ignorePatterns,
    oxfmtConfig.ignorePatterns,
    ...(oxlintConfig.overrides ?? []).flatMap((override) => [
      override.files,
      override.excludeFiles,
    ]),
    ...(oxfmtConfig.overrides ?? []).flatMap((override) => [override.files, override.excludeFiles]),
  ]

  return groups.reduce(
    (total, patterns) =>
      total + (patterns ?? []).filter((pattern) => !isAbsolute(stripNegation(pattern))).length,
    0,
  )
}

function stripNegation(pattern: string): string {
  return pattern.startsWith('!') ? pattern.slice(1) : pattern
}

function rebasePatterns(
  patterns: string[] | undefined,
  projectFromOutput: string,
): string[] | undefined {
  if (!patterns || !projectFromOutput) {
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
    losses: reporter.getLosses(),
    suggestions: [],
    summary: {
      biomeConfigPath: biomeConfigPath ?? 'not found',
      oxlintConfigPath,
      oxfmtConfigPath,
      rulesConverted: 0,
      rulesSkipped: 0,
      oxlintRulesEmitted: 0,
      overridesConverted: 0,
      formatterOverridesConverted: 0,
      formatterLanguageOverrides: 0,
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
