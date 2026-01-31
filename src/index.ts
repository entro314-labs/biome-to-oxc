import { writeFile, rename, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import type {
  BiomeConfig,
  MigrationOptions,
  MigrationReport,
  OxlintConfig,
  OxfmtConfig,
} from './types.js';
import { DefaultReporter } from './reporter.js';
import { findBiomeConfig, loadBiomeConfig, resolveBiomeExtends } from './config-loader.js';
import { generateOxlintConfig } from './oxlint-generator.js';
import { generateOxfmtConfig } from './formatter-mapper.js';
import { transformOverridesToOxlint } from './overrides-transformer.js';
import { generateOxfmtOverrides } from './oxfmt-overrides.js';
import { updatePackageJson } from './package-updater.js';
import {
  detectTurborepo,
  updateTurboConfig,
  generateTurborepoSuggestions,
} from './turbo-updater.js';
import {
  detectESLint,
  generateESLintBridgeSuggestions,
  generateESLintFormatterBridgeSuggestions,
} from './eslint-detector.js';
import { detectPrettier, generatePrettierMigrationSuggestions } from './prettier-detector.js';
import { writeReportToFile, enhanceReportWithSuggestions } from './report-writer.js';
import { detectProjectFeatures, generateFeatureSpecificSuggestions } from './advanced-detection.js';

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function migrate(options: MigrationOptions = {}): Promise<MigrationReport> {
  const reporter = new DefaultReporter();
  const cwd = process.cwd();
  const outputDir = options.outputDir || cwd;

  let biomeConfigPath: string | undefined;

  if (options.configPath) {
    biomeConfigPath = resolve(cwd, options.configPath);
    if (!(await fileExists(biomeConfigPath))) {
      reporter.error(`Biome config not found at: ${biomeConfigPath}`);
      return createErrorReport(reporter, biomeConfigPath);
    }
  } else {
    biomeConfigPath = await findBiomeConfig(cwd);
    if (!biomeConfigPath) {
      reporter.error('No Biome configuration file found. Looking for biome.json or biome.jsonc');
      return createErrorReport(reporter);
    }
  }

  reporter.info(`Found Biome config: ${biomeConfigPath}`);

  let biomeConfig: BiomeConfig;
  try {
    biomeConfig = await loadBiomeConfig(biomeConfigPath, reporter);
    const configDir = dirname(biomeConfigPath);
    biomeConfig = await resolveBiomeExtends(biomeConfig, configDir, reporter);
  } catch (error) {
    return createErrorReport(reporter, biomeConfigPath);
  }

  // Detect advanced project features for cutting-edge optimizations
  const projectFeatures = detectProjectFeatures(biomeConfig, reporter);

  const oxlintConfig = generateOxlintConfig(biomeConfig, reporter);
  const oxfmtConfig = generateOxfmtConfig(biomeConfig, reporter);

  let formatterOverridesCount = 0;

  if (biomeConfig.overrides) {
    const oxlintOverrides = transformOverridesToOxlint(biomeConfig.overrides, reporter);
    if (oxlintOverrides.length > 0) {
      oxlintConfig.overrides = oxlintOverrides;
    }

    const oxfmtOverrides = generateOxfmtOverrides(biomeConfig.overrides, reporter);
    if (oxfmtOverrides.length > 0) {
      oxfmtConfig.overrides = oxfmtOverrides;
      formatterOverridesCount = oxfmtOverrides.length;
    }
  }

  const detectedIntegrations = {
    turborepo: options.turborepo ? detectTurborepo(outputDir) : false,
    eslint: options.eslintBridge ? detectESLint(outputDir) : false,
    prettier: options.prettier ? !!detectPrettier(outputDir) : false,
    typescript: oxlintConfig.plugins?.includes('typescript') || false,
  };

  const oxlintConfigPath = resolve(outputDir, '.oxlintrc.json');
  const oxfmtConfigPath = resolve(outputDir, '.oxfmtrc.jsonc');

  const suggestions: string[] = [];

  if (options.typeAware && detectedIntegrations.typescript) {
    suggestions.push('Type-aware linting detected. Install oxlint-tsgolint:');
    suggestions.push('  pnpm add -D oxlint-tsgolint@latest');
    suggestions.push('  npx oxlint --type-aware');
  }

  if (detectedIntegrations.turborepo) {
    suggestions.push(...generateTurborepoSuggestions());
  }

  if (detectedIntegrations.eslint) {
    suggestions.push(...generateESLintBridgeSuggestions(reporter));
    suggestions.push(...generateESLintFormatterBridgeSuggestions());
  }

  if (detectedIntegrations.prettier) {
    const prettierPath = detectPrettier(outputDir);
    if (prettierPath) {
      suggestions.push(...generatePrettierMigrationSuggestions(prettierPath, reporter));
    }
  }

  // Add cutting-edge feature-specific suggestions
  const featureSuggestions = generateFeatureSpecificSuggestions(projectFeatures);
  if (featureSuggestions.length > 0) {
    suggestions.push(...featureSuggestions);
  }

  if (!options.dryRun) {
    if (!options.noBackup) {
      await backupExistingConfigs(oxlintConfigPath, oxfmtConfigPath, reporter);
    }

    await writeFile(oxlintConfigPath, JSON.stringify(oxlintConfig, null, 2) + '\n', 'utf-8');
    reporter.info(`Created Oxlint config: ${oxlintConfigPath}`);

    await writeFile(oxfmtConfigPath, JSON.stringify(oxfmtConfig, null, 2) + '\n', 'utf-8');
    reporter.info(`Created Oxfmt config: ${oxfmtConfigPath}`);

    if (options.updateScripts) {
      updatePackageJson(outputDir, reporter, false);
    }

    if (options.turborepo && detectedIntegrations.turborepo) {
      updateTurboConfig(outputDir, reporter, false);
    }
  } else {
    reporter.info('Dry-run mode: No files will be written');
    reporter.info(`Would create: ${oxlintConfigPath}`);
    reporter.info(`Would create: ${oxfmtConfigPath}`);

    if (options.verbose) {
      
      
      
      
    }
  }

  const rulesConverted = Object.keys(oxlintConfig.rules || {}).length;
  const overridesConverted = (oxlintConfig.overrides || []).length;

  let report: MigrationReport = {
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
    detectedIntegrations,
  };

  if (options.report && !options.dryRun) {
    const reportPath = resolve(outputDir, options.report);
    writeReportToFile(report, reportPath, reporter);
  }

  return report;
}

async function backupExistingConfigs(
  oxlintConfigPath: string,
  oxfmtConfigPath: string,
  reporter: DefaultReporter,
): Promise<void> {
  if (await fileExists(oxlintConfigPath)) {
    const backupPath = `${oxlintConfigPath}.backup`;
    await rename(oxlintConfigPath, backupPath);
    reporter.info(`Backed up existing Oxlint config to: ${backupPath}`);
  }

  if (await fileExists(oxfmtConfigPath)) {
    const backupPath = `${oxfmtConfigPath}.backup`;
    await rename(oxfmtConfigPath, backupPath);
    reporter.info(`Backed up existing Oxfmt config to: ${backupPath}`);
  }
}

function createErrorReport(reporter: DefaultReporter, biomeConfigPath?: string): MigrationReport {
  return {
    success: false,
    warnings: reporter.getWarnings(),
    errors: reporter.getErrors(),
    suggestions: [],
    summary: {
      biomeConfigPath: biomeConfigPath || 'not found',
      oxlintConfigPath: '',
      oxfmtConfigPath: '',
      rulesConverted: 0,
      rulesSkipped: 0,
      overridesConverted: 0,
      formatterOverridesConverted: 0,
    },
  };
}

export * from './types.js';
