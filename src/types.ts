export interface BiomeConfig {
  $schema?: string
  extends?: string | string[]
  root?: boolean
  files?: BiomeFilesConfig
  vcs?: BiomeVcsConfig
  linter?: BiomeLinterConfig
  formatter?: BiomeFormatterConfig
  javascript?: BiomeJavaScriptConfig
  json?: BiomeJsonConfig
  css?: BiomeCssConfig
  html?: Record<string, unknown>
  overrides?: BiomeOverride[]
}

export interface BiomeFilesConfig {
  include?: string[]
  includes?: string[]
  /** Negated `includes` entries (`!pattern`), split out during normalization. */
  exclude?: string[]
  ignore?: string[]
  ignoreUnknown?: boolean
  maxSize?: number
}

export interface BiomeVcsConfig {
  enabled?: boolean
  clientKind?: 'git'
  useIgnoreFile?: boolean
  root?: string
  defaultBranch?: string
}

export interface BiomeLinterConfig {
  enabled?: boolean
  include?: string[]
  includes?: string[]
  /** Negated `includes` entries (`!pattern`), split out during normalization. */
  exclude?: string[]
  ignore?: string[]
  rules?: BiomeLinterRules
}

export interface BiomeLinterRules {
  recommended?: boolean
  all?: boolean
  preset?: 'recommended' | 'all' | 'none'
  [category: string]:
    | boolean
    | BiomeRuleGroup
    | BiomeRuleSeverityValue
    | 'recommended'
    | 'all'
    | 'none'
    | undefined
}

export interface BiomeRuleGroup {
  recommended?: boolean
  all?: boolean
  preset?: 'recommended' | 'all' | 'none'
  [rule: string]: BiomeRuleSeverity | boolean | 'recommended' | 'all' | 'none' | undefined
}

export type BiomeRuleSeverityValue = 'off' | 'on' | 'info' | 'warn' | 'error'

export type BiomeRuleSeverity =
  | BiomeRuleSeverityValue
  | { level: BiomeRuleSeverityValue; options?: unknown }

export interface BiomeFormatterConfig {
  enabled?: boolean
  include?: string[]
  includes?: string[]
  /** Negated `includes` entries (`!pattern`), split out during normalization. */
  exclude?: string[]
  ignore?: string[]
  formatWithErrors?: boolean
  indentStyle?: 'tab' | 'space'
  indentWidth?: number
  lineEnding?: 'lf' | 'crlf' | 'cr' | 'auto'
  lineWidth?: number
  attributePosition?: 'auto' | 'multiline'
  bracketSpacing?: boolean
  // Additional options that might exist
  [key: string]: unknown
}

export interface BiomeJavaScriptConfig {
  parser?: {
    unsafeParameterDecoratorsEnabled?: boolean
    jsxEverywhere?: boolean
  }
  formatter?: {
    enabled?: boolean
    quoteStyle?: 'single' | 'double'
    jsxQuoteStyle?: 'single' | 'double'
    quoteProperties?: 'asNeeded' | 'preserve'
    trailingCommas?: 'all' | 'es5' | 'none'
    semicolons?: 'always' | 'asNeeded'
    arrowParentheses?: 'always' | 'asNeeded'
    bracketSameLine?: boolean
    bracketSpacing?: boolean
    indentStyle?: 'tab' | 'space'
    indentWidth?: number
    lineEnding?: 'lf' | 'crlf' | 'cr' | 'auto'
    lineWidth?: number
    // Capture any additional options
    [key: string]: unknown
  }
  linter?: {
    enabled?: boolean
  }
  globals?: string[]
  // Capture any additional JS config
  [key: string]: unknown
}

export interface BiomeJsonConfig {
  parser?: {
    allowComments?: boolean
    allowTrailingCommas?: boolean
  }
  formatter?: {
    enabled?: boolean
    indentStyle?: 'tab' | 'space'
    indentWidth?: number
    lineEnding?: 'lf' | 'crlf' | 'cr' | 'auto'
    lineWidth?: number
    trailingCommas?: 'none' | 'all'
  }
  linter?: {
    enabled?: boolean
  }
}

export interface BiomeCssConfig {
  parser?: {
    cssModules?: boolean
  }
  formatter?: {
    enabled?: boolean
    indentStyle?: 'tab' | 'space'
    indentWidth?: number
    lineEnding?: 'lf' | 'crlf' | 'cr' | 'auto'
    lineWidth?: number
    quoteStyle?: 'single' | 'double'
  }
  linter?: {
    enabled?: boolean
  }
}

export interface BiomeOverride {
  include?: string[]
  includes?: string[]
  /** Negated `includes` entries (`!pattern`), split out during normalization. */
  exclude?: string[]
  ignore?: string[]
  linter?: BiomeLinterConfig
  formatter?: BiomeFormatterConfig
  javascript?: BiomeJavaScriptConfig
  json?: BiomeJsonConfig
  css?: BiomeCssConfig
}

export type FixStrategy = 'safe' | 'suggestions' | 'dangerous'
export type TypeAwareProfile = 'standard' | 'strict'

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
  | 'vue'

export type OxlintJsPlugin =
  | string
  | {
      name: string
      specifier: string
    }

export interface OxlintSettings {
  jsdoc?: {
    augmentsExtendsReplacesDocs?: boolean
    exemptDestructuredRootsFromChecks?: boolean
    ignoreInternal?: boolean
    ignorePrivate?: boolean
    ignoreReplacesDocs?: boolean
    implementsReplacesDocs?: boolean
    overrideReplacesDocs?: boolean
    tagNamePreference?: Record<string, string>
  }
  'jsx-a11y'?: {
    attributes?: Record<string, string[]>
    components?: Record<string, string>
    polymorphicPropName?: string | null
  }
  next?: {
    rootDir?: string | string[]
  }
  react?: {
    componentWrapperFunctions?: string[]
    formComponents?: string[] | Array<string | { name: string; formAttribute?: string | string[] }>
    linkComponents?: string[] | Array<string | { name: string; linkAttribute?: string | string[] }>
    version?: string | null
  }
  vitest?: {
    typecheck?: boolean
  }
  [key: string]: unknown
}

export interface OxlintConfig {
  $schema?: string
  options?: {
    typeAware?: boolean
    typeCheck?: boolean
  }
  env?: Record<string, boolean>
  globals?: Record<string, boolean | 'readonly' | 'writable' | 'off'>
  plugins?: OxlintBuiltinPlugin[]
  jsPlugins?: OxlintJsPlugin[]
  categories?: Record<string, 'off' | 'warn' | 'error'>
  rules?: Record<string, OxlintRuleSeverity>
  overrides?: OxlintOverride[]
  ignorePatterns?: string[]
  settings?: OxlintSettings
}

export interface OxlintOverride {
  files: string[]
  excludeFiles?: string[]
  env?: Record<string, boolean>
  globals?: Record<string, boolean | 'readonly' | 'writable' | 'off'>
  plugins?: OxlintBuiltinPlugin[]
  jsPlugins?: OxlintJsPlugin[]
  rules?: Record<string, OxlintRuleSeverity>
}

export type OxlintRuleSeverity = 'off' | 'warn' | 'error' | ['off' | 'warn' | 'error', ...unknown[]]

export interface OxfmtOverride {
  files: string[]
  excludeFiles?: string[]
  options?: Partial<Omit<OxfmtConfig, '$schema' | 'ignorePatterns' | 'overrides'>>
}

export interface OxfmtConfig {
  $schema?: string
  // Core Prettier-compatible options
  printWidth?: number
  tabWidth?: number
  useTabs?: boolean
  semi?: boolean
  singleQuote?: boolean
  quoteProps?: 'as-needed' | 'consistent' | 'preserve'
  jsxSingleQuote?: boolean
  trailingComma?: 'none' | 'es5' | 'all'
  bracketSpacing?: boolean
  bracketSameLine?: boolean
  arrowParens?: 'always' | 'avoid'
  endOfLine?: 'lf' | 'crlf' | 'cr'
  singleAttributePerLine?: boolean

  // Object formatting
  objectWrap?: 'preserve' | 'collapse'

  // Line endings
  insertFinalNewline?: boolean

  // Embedded language formatting
  embeddedLanguageFormatting?: 'auto' | 'off'

  // HTML/Prose options
  htmlWhitespaceSensitivity?: 'css' | 'strict' | 'ignore'
  proseWrap?: 'always' | 'never' | 'preserve'

  // Vue options
  vueIndentScriptAndStyle?: boolean

  // JSDoc formatting
  jsdoc?:
    | boolean
    | {
        addDefaultToDescription?: boolean
        bracketSpacing?: boolean
        capitalizeDescriptions?: boolean
        commentLineStrategy?: 'singleLine' | 'multiline' | 'keep'
        descriptionTag?: boolean
        descriptionWithDot?: boolean
        keepUnparsableExampleIndent?: boolean
        lineWrappingStyle?: 'greedy' | 'balance'
        preferCodeFences?: boolean
        separateReturnsFromParam?: boolean
        separateTagGroups?: boolean
      }

  // Svelte options
  svelte?:
    | boolean
    | {
        allowShorthand?: boolean
        indentScriptAndStyle?: boolean
        sortOrder?: string
      }

  // Sorting features
  sortImports?: {
    order?: 'asc' | 'desc'
    newlinesBetween?: boolean
    ignoreCase?: boolean
    internalPattern?: string[]
    partitionByComment?: boolean
    partitionByNewline?: boolean
    sortSideEffects?: boolean
  }
  sortPackageJson?:
    | boolean
    | {
        sortScripts?: boolean
      }
  sortTailwindcss?: {
    attributes?: string[]
    functions?: string[]
    preserveDuplicates?: boolean
    preserveWhitespace?: boolean
    config?: string
    stylesheet?: string
  }

  // Backward-compatible aliases (legacy field names)
  experimentalSortImports?: {
    order?: 'asc' | 'desc'
    newlinesBetween?: boolean
    ignoreCase?: boolean
    internalPattern?: string[]
    partitionByComment?: boolean
    partitionByNewline?: boolean
    sortSideEffects?: boolean
  }
  experimentalSortPackageJson?: {
    sortScripts?: boolean
  }
  experimentalTailwindcss?: {
    attributes?: string[]
    functions?: string[]
    preserveDuplicates?: boolean
    preserveWhitespace?: boolean
    config?: string
    stylesheet?: string
  }

  ignorePatterns?: string[]
  overrides?: OxfmtOverride[]
}

export interface MigrationOptions {
  configPath?: string
  outputDir?: string
  dryRun?: boolean
  delete?: boolean
  noBackup?: boolean
  updateScripts?: boolean
  dom?: boolean
  verbose?: boolean
  typeAware?: boolean
  typeCheck?: boolean
  typeAwareProfile?: TypeAwareProfile
  fixStrategy?: FixStrategy
  jsPlugins?: boolean
  jsPlugin?: string[]
  importGraph?: boolean
  importCycleMaxDepth?: number
  turborepo?: boolean
  eslintBridge?: boolean
  prettier?: boolean
  report?: string
  signal?: AbortSignal
}

export interface PackageScriptUpdate {
  name: string
  before: string
  after: string
}

export interface PackageDependencyRemoval {
  name: string
  dependencyType: 'dependencies' | 'devDependencies'
  version?: string
}

export interface PackageDevDependencyChange {
  name: string
  action: 'added' | 'already-present' | 'updated'
  from?: string
  to: string
}

export interface PackageUpdateSummary {
  packageJsonPath: string
  found: boolean
  dryRun: boolean
  scriptsUpdated: PackageScriptUpdate[]
  dependenciesRemoved: PackageDependencyRemoval[]
  devDependencies: PackageDevDependencyChange[]
  changed: boolean
  /** Lockfile that dependency changes invalidated, when one was detected. */
  lockfile?: LockfileStatus
}

export interface LockfileStatus {
  path: string
  /** Command that regenerates the lockfile from the updated manifest. */
  installCommand: string
  /** True when this run changed dependencies, so the lockfile no longer matches. */
  stale: boolean
}

export interface MigrationReport {
  /**
   * True when the migration wrote every requested change without errors AND the
   * generated configuration is a complete replacement for the Biome setup.
   * A migration with semantic losses reports `success: false` because the project
   * still depends on behaviour that Oxc does not reproduce.
   */
  success: boolean
  warnings: string[]
  errors: string[]
  /** Source behaviour the generated target configs provably do not reproduce. */
  losses: string[]
  suggestions: string[]
  packageJson?: PackageUpdateSummary
  summary: {
    biomeConfigPath: string
    oxlintConfigPath: string
    oxfmtConfigPath: string
    /** Distinct Biome source rules that produced at least one Oxlint rule. */
    rulesConverted: number
    /** Distinct Biome source rules with no Oxlint equivalent. */
    rulesSkipped: number
    /** Oxlint rule entries emitted (one source rule can emit several). */
    oxlintRulesEmitted: number
    overridesConverted: number
    /** Oxfmt overrides derived from Biome `overrides` entries. */
    formatterOverridesConverted: number
    /** Oxfmt overrides synthesized to carry per-language Biome formatter settings. */
    formatterLanguageOverrides: number
  }
  detectedIntegrations?: {
    turborepo?: boolean
    eslint?: boolean
    prettier?: boolean
    typescript?: boolean
  }
  cleanup?: CleanupOutcome
}

export interface CleanupOutcome {
  /** Whether `--delete` was requested. */
  requested: boolean
  /** Whether legacy Biome files were (or in dry-run, would be) removed. */
  performed: boolean
  /** Why cleanup was withheld, when it was requested but not performed. */
  blockedReason?: string
  /** Legacy Biome files removed, or that would be removed in dry-run. */
  files: string[]
}

export interface Reporter {
  warn(message: string): void
  error(message: string): void
  info(message: string): void
  /**
   * Records a semantic-loss diagnostic: source behaviour that the generated target
   * configuration provably does not reproduce.
   *
   * Unlike {@link Reporter.warn}, a loss blocks destructive cleanup (`--delete`) and
   * removal of the Biome dependency, because the migrated project is not yet a
   * complete replacement for the Biome setup. Losses are also recorded as warnings so
   * that existing warning consumers keep seeing them.
   */
  loss(message: string): void
  getWarnings(): string[]
  getErrors(): string[]
  getLosses(): string[]
}
