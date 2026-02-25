export type BiomeConfig = {
  $schema?: string;
  extends?: string | string[];
  root?: boolean;
  files?: BiomeFilesConfig;
  vcs?: BiomeVcsConfig;
  linter?: BiomeLinterConfig;
  formatter?: BiomeFormatterConfig;
  javascript?: BiomeJavaScriptConfig;
  json?: BiomeJsonConfig;
  css?: BiomeCssConfig;
  overrides?: BiomeOverride[];
};

export type BiomeFilesConfig = {
  include?: string[];
  includes?: string[];
  ignore?: string[];
  ignoreUnknown?: boolean;
  maxSize?: number;
};

export type BiomeVcsConfig = {
  enabled?: boolean;
  clientKind?: 'git';
  useIgnoreFile?: boolean;
  root?: string;
  defaultBranch?: string;
};

export type BiomeLinterConfig = {
  enabled?: boolean;
  include?: string[];
  includes?: string[];
  ignore?: string[];
  rules?: BiomeLinterRules;
};

export type BiomeLinterRules = {
  recommended?: boolean;
  all?: boolean;
  [category: string]: boolean | BiomeRuleGroup | undefined;
};

export type BiomeRuleGroup = {
  recommended?: boolean;
  all?: boolean;
  [rule: string]: BiomeRuleSeverity | boolean | undefined;
};

export type BiomeRuleSeverity =
  | 'off'
  | 'warn'
  | 'error'
  | { level: 'off' | 'warn' | 'error'; options?: unknown };

export type BiomeFormatterConfig = {
  enabled?: boolean;
  include?: string[];
  includes?: string[];
  ignore?: string[];
  formatWithErrors?: boolean;
  indentStyle?: 'tab' | 'space';
  indentWidth?: number;
  lineEnding?: 'lf' | 'crlf' | 'cr';
  lineWidth?: number;
  attributePosition?: 'auto' | 'multiline';
  bracketSpacing?: boolean;
  // Additional options that might exist
  [key: string]: unknown;
};

export type BiomeJavaScriptConfig = {
  parser?: {
    unsafeParameterDecoratorsEnabled?: boolean;
    jsxEverywhere?: boolean;
  };
  formatter?: {
    enabled?: boolean;
    quoteStyle?: 'single' | 'double';
    jsxQuoteStyle?: 'single' | 'double';
    quoteProperties?: 'asNeeded' | 'preserve';
    trailingCommas?: 'all' | 'es5' | 'none';
    semicolons?: 'always' | 'asNeeded';
    arrowParentheses?: 'always' | 'asNeeded';
    bracketSameLine?: boolean;
    bracketSpacing?: boolean;
    indentStyle?: 'tab' | 'space';
    indentWidth?: number;
    lineEnding?: 'lf' | 'crlf' | 'cr';
    lineWidth?: number;
    // Capture any additional options
    [key: string]: unknown;
  };
  linter?: {
    enabled?: boolean;
  };
  globals?: string[];
  // Capture any additional JS config
  [key: string]: unknown;
};

export type BiomeJsonConfig = {
  parser?: {
    allowComments?: boolean;
    allowTrailingCommas?: boolean;
  };
  formatter?: {
    enabled?: boolean;
    indentStyle?: 'tab' | 'space';
    indentWidth?: number;
    lineEnding?: 'lf' | 'crlf' | 'cr';
    lineWidth?: number;
    trailingCommas?: 'none' | 'all';
  };
  linter?: {
    enabled?: boolean;
  };
};

export type BiomeCssConfig = {
  parser?: {
    cssModules?: boolean;
  };
  formatter?: {
    enabled?: boolean;
    indentStyle?: 'tab' | 'space';
    indentWidth?: number;
    lineEnding?: 'lf' | 'crlf' | 'cr';
    lineWidth?: number;
    quoteStyle?: 'single' | 'double';
  };
  linter?: {
    enabled?: boolean;
  };
};

export type BiomeOverride = {
  include?: string[];
  includes?: string[];
  ignore?: string[];
  linter?: BiomeLinterConfig;
  formatter?: BiomeFormatterConfig;
  javascript?: BiomeJavaScriptConfig;
  json?: BiomeJsonConfig;
  css?: BiomeCssConfig;
};

export type FixStrategy = 'safe' | 'suggestions' | 'dangerous';
export type TypeAwareProfile = 'standard' | 'strict';

export type OxlintBuiltinPlugin =
  | 'eslint'
  | 'react'
  | 'unicorn'
  | 'typescript'
  | 'oxc'
  | 'import'
  | 'jsdoc'
  | 'jest'
  | 'vitest'
  | 'jsx-a11y'
  | 'nextjs'
  | 'react-perf'
  | 'promise'
  | 'node'
  | 'vue';

export type OxlintJsPlugin =
  | string
  | {
      name: string;
      specifier: string;
    };

export type OxlintSettings = {
  jsdoc?: {
    augmentsExtendsReplacesDocs?: boolean;
    exemptDestructuredRootsFromChecks?: boolean;
    ignoreInternal?: boolean;
    ignorePrivate?: boolean;
    ignoreReplacesDocs?: boolean;
    implementsReplacesDocs?: boolean;
    overrideReplacesDocs?: boolean;
    tagNamePreference?: Record<string, string>;
  };
  'jsx-a11y'?: {
    attributes?: Record<string, string[]>;
    components?: Record<string, string>;
    polymorphicPropName?: string | null;
  };
  next?: {
    rootDir?: string | string[];
  };
  react?: {
    componentWrapperFunctions?: string[];
    formComponents?:
      | string[]
      | Array<string | { name: string; formAttribute?: string | string[] }>;
    linkComponents?:
      | string[]
      | Array<string | { name: string; linkAttribute?: string | string[] }>;
    version?: string | null;
  };
  vitest?: {
    typecheck?: boolean;
  };
  [key: string]: unknown;
};

export type OxlintConfig = {
  $schema?: string;
  env?: Record<string, boolean>;
  globals?: Record<string, boolean | 'readonly' | 'writable' | 'off'>;
  plugins?: OxlintBuiltinPlugin[];
  jsPlugins?: OxlintJsPlugin[];
  categories?: Record<string, 'off' | 'warn' | 'error'>;
  rules?: Record<string, OxlintRuleSeverity>;
  overrides?: OxlintOverride[];
  ignorePatterns?: string[];
  settings?: OxlintSettings;
};

export type OxlintOverride = {
  files: string[];
  env?: Record<string, boolean>;
  globals?: Record<string, boolean | 'readonly' | 'writable' | 'off'>;
  plugins?: OxlintBuiltinPlugin[];
  jsPlugins?: OxlintJsPlugin[];
  categories?: Record<string, 'off' | 'warn' | 'error'>;
  rules?: Record<string, OxlintRuleSeverity>;
};

export type OxlintRuleSeverity =
  | 'off'
  | 'warn'
  | 'error'
  | ['off' | 'warn' | 'error', ...unknown[]];

export type OxfmtOverride = {
  files: string[];
  excludeFiles?: string[];
  options?: Partial<Omit<OxfmtConfig, '$schema' | 'ignorePatterns' | 'overrides'>>;
};

export type OxfmtConfig = {
  $schema?: string;
  // Core Prettier-compatible options
  printWidth?: number;
  tabWidth?: number;
  useTabs?: boolean;
  semi?: boolean;
  singleQuote?: boolean;
  quoteProps?: 'as-needed' | 'consistent' | 'preserve';
  jsxSingleQuote?: boolean;
  trailingComma?: 'none' | 'es5' | 'all';
  bracketSpacing?: boolean;
  bracketSameLine?: boolean;
  arrowParens?: 'always' | 'avoid';
  endOfLine?: 'lf' | 'crlf' | 'cr';
  singleAttributePerLine?: boolean;

  // Object formatting
  objectWrap?: 'preserve' | 'collapse';

  // Line endings
  insertFinalNewline?: boolean;

  // Embedded language formatting
  embeddedLanguageFormatting?: 'auto' | 'off';

  // HTML/Prose options
  htmlWhitespaceSensitivity?: 'css' | 'strict' | 'ignore';
  proseWrap?: 'always' | 'never' | 'preserve';

  // Vue options
  vueIndentScriptAndStyle?: boolean;

  // Sorting features
  sortImports?: {
    order?: 'asc' | 'desc';
    newlinesBetween?: boolean;
    ignoreCase?: boolean;
    internalPattern?: string[];
    partitionByComment?: boolean;
    partitionByNewline?: boolean;
    sortSideEffects?: boolean;
  };
  sortPackageJson?:
    | boolean
    | {
        sortScripts?: boolean;
      };
  sortTailwindcss?: {
    attributes?: string[];
    functions?: string[];
    preserveDuplicates?: boolean;
    preserveWhitespace?: boolean;
    config?: string;
    stylesheet?: string;
  };

  // Backward-compatible aliases (legacy field names)
  experimentalSortImports?: {
    order?: 'asc' | 'desc';
    newlinesBetween?: boolean;
    ignoreCase?: boolean;
    internalPattern?: string[];
    partitionByComment?: boolean;
    partitionByNewline?: boolean;
    sortSideEffects?: boolean;
  };
  experimentalSortPackageJson?: {
    sortScripts?: boolean;
  };
  experimentalTailwindcss?: {
    attributes?: string[];
    functions?: string[];
    preserveDuplicates?: boolean;
    preserveWhitespace?: boolean;
    config?: string;
    stylesheet?: string;
  };

  ignorePatterns?: string[];
  overrides?: OxfmtOverride[];
};

export type MigrationOptions = {
  configPath?: string;
  outputDir?: string;
  dryRun?: boolean;
  noBackup?: boolean;
  updateScripts?: boolean;
  verbose?: boolean;
  typeAware?: boolean;
  typeAwareProfile?: TypeAwareProfile;
  fixStrategy?: FixStrategy;
  jsPlugins?: boolean;
  jsPlugin?: string[];
  importGraph?: boolean;
  importCycleMaxDepth?: number;
  turborepo?: boolean;
  eslintBridge?: boolean;
  prettier?: boolean;
  report?: string;
};

export type PackageScriptUpdate = {
  name: string;
  before: string;
  after: string;
};

export type PackageDependencyRemoval = {
  name: string;
  dependencyType: 'dependencies' | 'devDependencies';
  version?: string;
};

export type PackageDevDependencyChange = {
  name: string;
  action: 'added' | 'already-present' | 'updated';
  from?: string;
  to: string;
};

export type PackageUpdateSummary = {
  packageJsonPath: string;
  found: boolean;
  dryRun: boolean;
  scriptsUpdated: PackageScriptUpdate[];
  dependenciesRemoved: PackageDependencyRemoval[];
  devDependencies: PackageDevDependencyChange[];
  changed: boolean;
};

export type MigrationReport = {
  success: boolean;
  warnings: string[];
  errors: string[];
  suggestions: string[];
  packageJson?: PackageUpdateSummary;
  summary: {
    biomeConfigPath: string;
    oxlintConfigPath: string;
    oxfmtConfigPath: string;
    rulesConverted: number;
    rulesSkipped: number;
    overridesConverted: number;
    formatterOverridesConverted: number;
  };
  detectedIntegrations?: {
    turborepo?: boolean;
    eslint?: boolean;
    prettier?: boolean;
    typescript?: boolean;
  };
};

export type Reporter = {
  warn(message: string): void;
  error(message: string): void;
  info(message: string): void;
  getWarnings(): string[];
  getErrors(): string[];
};
