import type { BiomeConfig, OxlintConfig, Reporter } from './types.js';
import { extractRulesFromBiomeConfig } from './rule-mapper.js';

export function generateOxlintConfig(biomeConfig: BiomeConfig, reporter: Reporter): OxlintConfig {
  const oxlintConfig: OxlintConfig = {
    $schema: './node_modules/oxlint/configuration_schema.json',
    plugins: [],
  };

  if (biomeConfig.linter?.enabled === false) {
    reporter.warn(
      'Biome linter is disabled. Oxlint config will be created but may need manual review.',
    );
  }

  const { rules, categories } = extractRulesFromBiomeConfig(biomeConfig.linter?.rules, reporter);

  if (Object.keys(categories).length > 0) {
    oxlintConfig.categories = categories;
  }

  if (Object.keys(rules).length > 0) {
    oxlintConfig.rules = rules;
  }

  determinePlugins(oxlintConfig);
  mapIgnorePatterns(biomeConfig, oxlintConfig);
  mapEnvironment(biomeConfig, oxlintConfig);

  return oxlintConfig;
}

function determinePlugins(oxlintConfig: OxlintConfig): void {
  const plugins = new Set<string>();

  if (oxlintConfig.rules) {
    for (const ruleName of Object.keys(oxlintConfig.rules)) {
      if (ruleName.startsWith('typescript/') || ruleName.startsWith('@typescript-eslint/')) {
        plugins.add('typescript');
      } else if (ruleName.startsWith('react/') || ruleName.startsWith('react-hooks/')) {
        plugins.add('react');
      } else if (ruleName.startsWith('react_perf/') || ruleName.startsWith('react-perf/')) {
        plugins.add('react-perf');
      } else if (ruleName.startsWith('unicorn/')) {
        plugins.add('unicorn');
      } else if (ruleName.startsWith('import/')) {
        plugins.add('import');
      } else if (ruleName.startsWith('jsx_a11y/') || ruleName.startsWith('jsx-a11y/')) {
        plugins.add('jsx-a11y');
      } else if (ruleName.startsWith('jest/')) {
        plugins.add('jest');
      } else if (ruleName.startsWith('vitest/')) {
        plugins.add('vitest');
      } else if (ruleName.startsWith('nextjs/')) {
        plugins.add('nextjs');
      } else if (ruleName.startsWith('promise/')) {
        plugins.add('promise');
      } else if (ruleName.startsWith('jsdoc/')) {
        plugins.add('jsdoc');
      } else if (ruleName.startsWith('vue/')) {
        plugins.add('vue');
      } else if (ruleName.startsWith('n/') || ruleName.startsWith('node/')) {
        plugins.add('node');
      }
    }
  }

  if (plugins.size > 0) {
    oxlintConfig.plugins = Array.from(plugins).sort();
  }
}

function mapIgnorePatterns(biomeConfig: BiomeConfig, oxlintConfig: OxlintConfig): void {
  const ignorePatterns: string[] = [];

  if (biomeConfig.files?.ignore) {
    ignorePatterns.push(...biomeConfig.files.ignore);
  }

  if (biomeConfig.linter?.ignore) {
    ignorePatterns.push(...biomeConfig.linter.ignore);
  }

  if (ignorePatterns.length > 0) {
    oxlintConfig.ignorePatterns = ignorePatterns;
  }
}

function mapEnvironment(biomeConfig: BiomeConfig, oxlintConfig: OxlintConfig): void {
  if (biomeConfig.javascript?.globals) {
    const globals: Record<string, boolean | 'readonly' | 'writable' | 'off'> = {};

    for (const globalVar of biomeConfig.javascript.globals) {
      globals[globalVar] = 'readonly';
    }

    if (Object.keys(globals).length > 0) {
      oxlintConfig.globals = globals;
    }
  }
}
