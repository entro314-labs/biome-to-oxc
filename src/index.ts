import { writeFile, rename, stat, readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'

import { detectProjectFeatures, generateFeatureSpecificSuggestions } from './advanced-detection.js'
import { findBiomeConfig, loadBiomeConfig, resolveBiomeExtends } from './config-loader.js'
import {
  detectESLint,
  generateESLintBridgeSuggestions,
  generateESLintFormatterBridgeSuggestions,
} from './eslint-detector.js'
import { generateOxfmtConfig } from './formatter-mapper.js'
import { buildJsPluginScaffold, collectUnsupportedBiomeRules } from './js-plugin-scaffolder.js'
import { transformOverridesToOxlint } from './overrides-transformer.js'
import { generateOxfmtOverrides } from './oxfmt-overrides.js'
import { generateOxlintConfig } from './oxlint-generator.js'
import { updatePackageJson } from './package-updater.js'
import { detectPrettier, generatePrettierMigrationSuggestions } from './prettier-detector.js'
import { writeReportToFile } from './report-writer.js'
import { DefaultReporter } from './reporter.js'
import {
  detectTurborepo,
  updateTurboConfig,
  generateTurborepoSuggestions,
} from './turbo-updater.js'
import type {
  BiomeConfig,
  MigrationOptions,
  MigrationReport,
  PackageUpdateSummary,
} from './types.js'

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function detectWorkspaceMonorepo(projectDir: string): Promise<boolean> {
  const packageJsonPath = resolve(projectDir, 'package.json')

  if (!(await fileExists(packageJsonPath))) {
    return false
  }

  try {
    const content = await readFile(packageJsonPath, 'utf-8')
    const parsed = JSON.parse(content) as { workspaces?: unknown }
    return parsed.workspaces !== undefined
  } catch {
    return false
  }
}

export async function migrate(options: MigrationOptions = {}): Promise<MigrationReport> {
  const reporter = new DefaultReporter()
  const cwd = process.cwd()
  const outputDir = options.outputDir ?? cwd
  const typeAwareProfile = options.typeAwareProfile ?? 'standard'
  const typeCheckEnabled = options.typeCheck ?? typeAwareProfile === 'strict'
  const typeAwareEnabled = options.typeAware ?? (typeCheckEnabled || typeAwareProfile === 'strict')

  let biomeConfigPath: string | undefined

  if (options.configPath) {
    biomeConfigPath = resolve(cwd, options.configPath)
    if (!(await fileExists(biomeConfigPath))) {
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
    const configDir = dirname(biomeConfigPath)
    biomeConfig = await resolveBiomeExtends(biomeConfig, configDir, reporter)
  } catch {
    return createErrorReport(reporter, biomeConfigPath)
  }

  // Detect advanced project features for cutting-edge optimizations
  const projectFeatures = detectProjectFeatures(biomeConfig, reporter)

  const oxlintConfig = generateOxlintConfig(biomeConfig, reporter, {
    enableImportGraph: options.importGraph ?? false,
    importCycleMaxDepth: options.importCycleMaxDepth ?? 3,
    typeAwareProfile: typeCheckEnabled ? 'strict' : typeAwareProfile,
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

  const detectedIntegrations = {
    turborepo: options.turborepo ? detectTurborepo(outputDir) : false,
    eslint: options.eslintBridge ? detectESLint(outputDir) : false,
    prettier: options.prettier ? !!detectPrettier(outputDir) : false,
    typescript:
      projectFeatures.hasTypeScript || (oxlintConfig.plugins?.includes('typescript') ?? false),
  }

  const oxlintConfigPath = resolve(outputDir, '.oxlintrc.json')
  const oxfmtConfigPath = resolve(outputDir, '.oxfmtrc.jsonc')

  const suggestions: string[] = []
  const unsupportedRules = collectUnsupportedBiomeRules(reporter.getWarnings())
  const workspaceMonorepo = await detectWorkspaceMonorepo(outputDir)

  if (options.jsPlugins && unsupportedRules.length > 0) {
    const jsPluginEntries = buildJsPluginScaffold(options.jsPlugin)

    if (jsPluginEntries.length > 0) {
      oxlintConfig.jsPlugins = jsPluginEntries
      suggestions.push('Configured jsPlugins scaffolds for unsupported rules:')
      suggestions.push(
        `  ${jsPluginEntries.map((entry) => (typeof entry === 'string' ? entry : `${entry.name} <= ${entry.specifier}`)).join(', ')}`,
      )
    } else {
      suggestions.push(
        'Unsupported rules detected. Add JS plugin specifiers to scaffold plugin aliases:',
      )
      suggestions.push(
        '  --js-plugin eslint-plugin-<name> [--js-plugin @scope/eslint-plugin-<name>]',
      )
    }

    suggestions.push(
      `Unsupported Biome rules for JS plugin fallback: ${unsupportedRules.join(', ')}`,
    )
  }

  if (typeAwareEnabled && detectedIntegrations.typescript) {
    const typeAwareCommand = typeCheckEnabled
      ? 'npx oxlint --type-aware --type-check'
      : 'npx oxlint --type-aware'

    suggestions.push('Type-aware linting profile detected. Install oxlint-tsgolint:')
    suggestions.push('  pnpm add -D oxlint-tsgolint@latest')
    suggestions.push(`  ${typeAwareCommand}`)
    suggestions.push('Type-aware mode uses the tsgolint backend.')
    suggestions.push('Note: Type-aware linting is alpha and not semver-stable.')
    suggestions.push(
      'TypeScript compatibility caveat: migrate deprecated tsconfig options if needed (typescript-go / TS7+ behavior).',
    )
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

  if (await fileExists(resolve(outputDir, '.eslintignore'))) {
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

  if (detectedIntegrations.prettier) {
    const prettierPath = detectPrettier(outputDir)
    if (prettierPath) {
      suggestions.push(...generatePrettierMigrationSuggestions(prettierPath, reporter))
    }
  }

  // Add cutting-edge feature-specific suggestions
  const featureSuggestions = generateFeatureSpecificSuggestions(projectFeatures)
  if (featureSuggestions.length > 0) {
    suggestions.push(...featureSuggestions)
  }

  let packageJsonSummary: PackageUpdateSummary | undefined

  if (!options.dryRun) {
    if (!options.noBackup) {
      await backupExistingConfigs(oxlintConfigPath, oxfmtConfigPath, reporter)
    }

    await writeFile(oxlintConfigPath, `${JSON.stringify(oxlintConfig, null, 2)}\n`, 'utf-8')
    reporter.info(`Created Oxlint config: ${oxlintConfigPath}`)

    await writeFile(oxfmtConfigPath, `${JSON.stringify(oxfmtConfig, null, 2)}\n`, 'utf-8')
    reporter.info(`Created Oxfmt config: ${oxfmtConfigPath}`)

    packageJsonSummary = updatePackageJson(outputDir, reporter, false, {
      updateScripts: options.updateScripts,
      typeAware: typeAwareEnabled,
      typeCheck: typeCheckEnabled,
      typeAwareProfile,
      fixStrategy: options.fixStrategy,
    })

    if (options.turborepo && detectedIntegrations.turborepo) {
      updateTurboConfig(outputDir, reporter, false)
    }
  } else {
    reporter.info('Dry-run mode: No files will be written')
    reporter.info(`Would create: ${oxlintConfigPath}`)
    reporter.info(`Would create: ${oxfmtConfigPath}`)

    packageJsonSummary = updatePackageJson(outputDir, reporter, true, {
      updateScripts: options.updateScripts,
      typeAware: typeAwareEnabled,
      typeCheck: typeCheckEnabled,
      typeAwareProfile,
      fixStrategy: options.fixStrategy,
    })
  }

  const rulesConverted = Object.keys(oxlintConfig.rules ?? {}).length
  const overridesConverted = (oxlintConfig.overrides ?? []).length

  const report: MigrationReport = {
    success: true,
    warnings: reporter.getWarnings(),
    errors: reporter.getErrors(),
    suggestions,
    summary: {
      biomeConfigPath,
      oxlintConfigPath,
      oxfmtConfigPath,
      rulesConverted,
      rulesSkipped: reporter.getWarnings().filter((w) => w.includes('No Oxlint equivalent')).length,
      overridesConverted,
      formatterOverridesConverted: formatterOverridesCount,
    },
    packageJson: packageJsonSummary,
    detectedIntegrations,
  }

  if (options.report && !options.dryRun) {
    const reportPath = resolve(outputDir, options.report)
    writeReportToFile(report, reportPath, reporter)
  }

  return report
}

async function backupExistingConfigs(
  oxlintConfigPath: string,
  oxfmtConfigPath: string,
  reporter: DefaultReporter,
): Promise<void> {
  if (await fileExists(oxlintConfigPath)) {
    const backupPath = `${oxlintConfigPath}.backup`
    await rename(oxlintConfigPath, backupPath)
    reporter.info(`Backed up existing Oxlint config to: ${backupPath}`)
  }

  if (await fileExists(oxfmtConfigPath)) {
    const backupPath = `${oxfmtConfigPath}.backup`
    await rename(oxfmtConfigPath, backupPath)
    reporter.info(`Backed up existing Oxfmt config to: ${backupPath}`)
  }
}

function createErrorReport(reporter: DefaultReporter, biomeConfigPath?: string): MigrationReport {
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

export * from './types.js'
