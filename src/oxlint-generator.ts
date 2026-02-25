import type {
  BiomeConfig,
  OxlintBuiltinPlugin,
  OxlintConfig,
  OxlintSettings,
  Reporter,
  TypeAwareProfile,
} from './types.js';
import { extractRulesFromBiomeConfig } from './rule-mapper.js';

type OxlintGenerationOptions = {
  enableImportGraph?: boolean;
  importCycleMaxDepth?: number;
  typeAwareProfile?: TypeAwareProfile;
};

const DEFAULT_PLUGINS: OxlintBuiltinPlugin[] = ['oxc', 'typescript', 'unicorn'];
const PLUGIN_SORT_ORDER: OxlintBuiltinPlugin[] = [
  'eslint',
  'oxc',
  'typescript',
  'unicorn',
  'import',
  'react',
  'react-perf',
  'jsx-a11y',
  'nextjs',
  'vitest',
  'jest',
  'jsdoc',
  'promise',
  'node',
  'vue',
];

export function generateOxlintConfig(
  biomeConfig: BiomeConfig,
  reporter: Reporter,
  options: OxlintGenerationOptions = {},
): OxlintConfig {
  const oxlintConfig: OxlintConfig = {
    $schema: './node_modules/oxlint/configuration_schema.json',
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

  if (options.enableImportGraph) {
    addImportGraphRecipe(oxlintConfig, options.importCycleMaxDepth ?? 3);
  }

  determinePlugins(oxlintConfig);
  mapIgnorePatterns(biomeConfig, oxlintConfig);
  mapEnvironment(biomeConfig, oxlintConfig);
  mapSettings(biomeConfig, oxlintConfig, options.typeAwareProfile ?? 'standard');

  return oxlintConfig;
}

function addImportGraphRecipe(oxlintConfig: OxlintConfig, maxDepth: number): void {
  if (!oxlintConfig.rules) {
    oxlintConfig.rules = {};
  }

  if (!oxlintConfig.rules['import/no-cycle']) {
    oxlintConfig.rules['import/no-cycle'] = ['error', { maxDepth: Math.max(1, maxDepth) }];
  }
}

function determinePlugins(oxlintConfig: OxlintConfig): void {
  const plugins = new Set<OxlintBuiltinPlugin>();

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

  if (plugins.size === 0) {
    delete oxlintConfig.plugins;
    return;
  }

  const usesNonDefaultPlugin = Array.from(plugins).some((plugin) => !DEFAULT_PLUGINS.includes(plugin));

  if (!usesNonDefaultPlugin) {
    // Keep Oxlint defaults by omitting `plugins` entirely.
    delete oxlintConfig.plugins;
    return;
  }

  for (const defaultPlugin of DEFAULT_PLUGINS) {
    plugins.add(defaultPlugin);
  }

  oxlintConfig.plugins = sortPlugins(Array.from(plugins));
}

function sortPlugins(plugins: OxlintBuiltinPlugin[]): OxlintBuiltinPlugin[] {
  return plugins.sort((a, b) => {
    const ia = PLUGIN_SORT_ORDER.indexOf(a);
    const ib = PLUGIN_SORT_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
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

function mapSettings(
  biomeConfig: BiomeConfig,
  oxlintConfig: OxlintConfig,
  typeAwareProfile: TypeAwareProfile,
): void {
  const settings: OxlintSettings = {};
  const activePlugins = new Set(oxlintConfig.plugins ?? []);

  const hasReact =
    activePlugins.has('react') ||
    biomeConfig.javascript?.parser?.jsxEverywhere === true ||
    biomeConfig.files?.include?.some((pattern) => /\.(jsx|tsx)$/.test(pattern)) ||
    false;

  if (hasReact) {
    settings.react = {
      version: null,
      linkComponents: [],
      formComponents: [],
      componentWrapperFunctions: [],
    };
  }

  if (activePlugins.has('jsx-a11y')) {
    settings['jsx-a11y'] = {
      polymorphicPropName: null,
      components: {},
      attributes: {},
    };
  }

  const nextHints =
    activePlugins.has('nextjs') ||
    biomeConfig.files?.include?.some(
      (pattern) => pattern.includes('next') || pattern.includes('app/') || pattern.includes('pages/'),
    ) ||
    false;

  if (nextHints) {
    settings.next = {
      rootDir: [],
    };
  }

  if (activePlugins.has('vitest')) {
    settings.vitest = {
      typecheck: typeAwareProfile === 'strict',
    };
  }

  if (activePlugins.has('jsdoc')) {
    settings.jsdoc = {
      ignorePrivate: false,
      ignoreInternal: false,
      ignoreReplacesDocs: true,
      overrideReplacesDocs: true,
      augmentsExtendsReplacesDocs: false,
      implementsReplacesDocs: false,
      exemptDestructuredRootsFromChecks: false,
      tagNamePreference: {},
    };
  }

  if (Object.keys(settings).length > 0) {
    oxlintConfig.settings = settings;
  }
}
