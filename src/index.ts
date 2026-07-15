import { unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

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
import { writeTextFileAtomically, copyFileIfExists, pathExists, readJsonFile } from './fs-utils.js'
import {
  buildJsPluginScaffold,
  buildUnsupportedRuleFallbackSuggestions,
  collectUnsupportedBiomeRules,
  recommendJsPluginSpecifiersForUnsupportedRules,
} from './js-plugin-scaffolder.js'
import { transformOverridesToOxlint } from './overrides-transformer.js'
import { generateOxfmtOverrides } from './oxfmt-overrides.js'
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

  let biomeConfig: BiomeConfig
  try {
    biomeConfig = await loadBiomeConfig(biomeConfigPath, reporter)
    biomeConfig = await resolveBiomeExtends(biomeConfig, dirname(biomeConfigPath), reporter)
  } catch {
    return createErrorReport(reporter, biomeConfigPath)
  }

  throwIfAborted(options.signal)

  const projectFeatures = detectProjectFeatures(biomeConfig, reporter)
  const biomeIgnorePatterns = await loadBiomeIgnorePatterns(outputDir, reporter)
  const oxlintConfig = generateOxlintConfig(biomeConfig, reporter, {
    enableImportGraph: options.importGraph ?? false,
    importCycleMaxDepth: options.importCycleMaxDepth ?? 3,
    typeAwareProfile: typeCheckEnabled ? 'strict' : typeAwareProfile,
    biomeIgnorePatterns,
  })
  const oxfmtConfig = generateOxfmtConfig(biomeConfig, reporter)

  let formatterOverridesCount = 0

  if (biomeConfig.overrides) {
    const oxlintOverrides = transformOverridesToOxlint(biomeConfig.overrides, reporter)
    if (oxlintOverrides.length > 0) {
      oxlintConfig.overrides = oxlintOverrides
    }

    const oxfmtOverrides = generateOxfmtOverrides(biomeConfig.overrides, reporter)
    if (oxfmtOverrides.length > 0) {
      oxfmtConfig.overrides = oxfmtOverrides
      formatterOverridesCount = oxfmtOverrides.length
    }
  }

  const prettierConfigPath = options.prettier ? await detectPrettier(outputDir) : undefined
  const detectedIntegrations = {
    turborepo: options.turborepo ? await detectTurborepo(outputDir) : false,
    eslint: options.eslintBridge ? await detectESLint(outputDir) : false,
    prettier: prettierConfigPath !== undefined,
    typescript:
      projectFeatures.hasTypeScript || (oxlintConfig.plugins?.includes('typescript') ?? false),
  }

  const oxlintConfigPath = resolve(outputDir, '.oxlintrc.json')
  const oxfmtConfigPath = resolve(outputDir, '.oxfmtrc.jsonc')
  const suggestions = await buildSuggestions({
    biomeIgnorePatterns,
    detectedIntegrations,
    options,
    oxlintConfig,
    outputDir,
    prettierConfigPath,
    projectFeatures,
    reporter,
    typeAwareEnabled,
    typeCheckEnabled,
    typeAwareProfile,
    workspaceMonorepo: await detectWorkspaceMonorepo(outputDir),
  })
  let packageJsonSummary: PackageUpdateSummary | undefined
  let deletedLegacyFiles: string[] = []
  let deleteWasAttempted = false

  try {
    if (!options.dryRun) {
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
      packageJsonSummary = await updatePackageJson(outputDir, reporter, false, {
        updateScripts: options.updateScripts,
        dom: options.dom,
        typeAware: typeAwareEnabled,
        typeCheck: typeCheckEnabled,
        typeAwareProfile,
        fixStrategy: options.fixStrategy,
        signal: options.signal,
      })
      throwIfMigrationErrorsIncreased(packageJsonErrorCount, reporter)

      if (options.turborepo && detectedIntegrations.turborepo) {
        const turboErrorCount = reporter.getErrors().length
        await updateTurboConfig(outputDir, reporter, false, options.signal)
        throwIfMigrationErrorsIncreased(turboErrorCount, reporter)
      }

      if (options.delete) {
        deleteWasAttempted = true
        deletedLegacyFiles = await cleanupLegacyBiomeFiles(
          outputDir,
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

      packageJsonSummary = await updatePackageJson(outputDir, reporter, true, {
        updateScripts: options.updateScripts,
        dom: options.dom,
        typeAware: typeAwareEnabled,
        typeCheck: typeCheckEnabled,
        typeAwareProfile,
        fixStrategy: options.fixStrategy,
        signal: options.signal,
      })

      if (options.turborepo && detectedIntegrations.turborepo) {
        const turboErrorCount = reporter.getErrors().length
        await updateTurboConfig(outputDir, reporter, true, options.signal)
        throwIfMigrationErrorsIncreased(turboErrorCount, reporter)
      }

      if (options.delete) {
        deleteWasAttempted = true
        deletedLegacyFiles = await cleanupLegacyBiomeFiles(
          outputDir,
          biomeConfigPath,
          true,
          reporter,
          options.signal,
        )
      }
    }
  } catch (err) {
    if (isAbortError(err)) {
      throw err
    }

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
    await writeReportToFile(buildReport(), reportPath, reporter, options.signal)
  }

  return buildReport()
}

async function buildSuggestions({
  biomeIgnorePatterns,
  detectedIntegrations,
  options,
  oxlintConfig,
  outputDir,
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
  outputDir: string
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

  if (await pathExists(resolve(outputDir, '.eslintignore'))) {
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
  outputDir: string,
  primaryBiomeConfigPath: string,
  dryRun: boolean,
  reporter: Reporter,
  signal?: AbortSignal,
): Promise<string[]> {
  const candidates = new Set<string>([primaryBiomeConfigPath, resolve(outputDir, '.biomeignore')])

  for (const configName of LEGACY_BIOME_CONFIG_NAMES) {
    candidates.add(resolve(outputDir, configName))
  }

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
      reporter.warn(
        `Failed to delete legacy Biome file ${candidatePath}: ${formatErrorMessage(err)}`,
      )
    }
  }

  return touchedPaths.sort((left, right) => left.localeCompare(right))
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

function createErrorReport(reporter: Reporter, biomeConfigPath?: string): MigrationReport {
  return {
    success: false,
    warnings: reporter.getWarnings(),
    errors: reporter.getErrors(),
    suggestions: [],
    summary: {
      biomeConfigPath: biomeConfigPath ?? 'not found',
      oxlintConfigPath: '',
      oxfmtConfigPath: '',
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
