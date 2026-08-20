import { generateOxfmtOverrides, mapBiomeExpandToObjectWrap } from './oxfmt-overrides.js'
import type { BiomeConfig, BiomeFormatterConfig, OxfmtConfig, Reporter } from './types.js'

const EXPLICIT_OXFMT_OPTION_KEYS = [
  'objectWrap',
  'experimentalOperatorPosition',
  'insertFinalNewline',
  'embeddedLanguageFormatting',
  'htmlWhitespaceSensitivity',
  'proseWrap',
  'vueIndentScriptAndStyle',
  'jsdoc',
  'sortImports',
  'sortPackageJson',
  'sortTailwindcss',
  'svelte',
] as const
const LEGACY_EXPLICIT_OXFMT_OPTION_ALIASES = {
  experimentalSortImports: 'sortImports',
  experimentalSortPackageJson: 'sortPackageJson',
  experimentalTailwindcss: 'sortTailwindcss',
} as const
const GLOBAL_FORMATTER_KEYS = new Set([
  'enabled',
  'include',
  'includes',
  'ignore',
  'formatWithErrors',
  'indentStyle',
  'indentWidth',
  'lineEnding',
  'lineWidth',
  'attributePosition',
  'bracketSpacing',
  'bracketSameLine',
  'expand',
  'trailingNewline',
  ...EXPLICIT_OXFMT_OPTION_KEYS,
  ...Object.keys(LEGACY_EXPLICIT_OXFMT_OPTION_ALIASES),
])
const JAVASCRIPT_FORMATTER_KEYS = new Set([
  'enabled',
  'quoteStyle',
  'jsxQuoteStyle',
  'quoteProperties',
  'trailingCommas',
  'semicolons',
  'arrowParentheses',
  'bracketSameLine',
  'bracketSpacing',
  'expand',
  'indentStyle',
  'indentWidth',
  'lineEnding',
  'lineWidth',
  'operatorLinebreak',
  'trailingNewline',
  ...EXPLICIT_OXFMT_OPTION_KEYS,
  ...Object.keys(LEGACY_EXPLICIT_OXFMT_OPTION_ALIASES),
])

/**
 * File types Oxfmt formats that Biome does not, so a faithful migration must exclude
 * them rather than silently widen the set of formatted files.
 */
const OXFMT_ONLY_IGNORE_PATTERNS = ['**/*.{yaml,yml}', '**/*.toml', '**/*.{md,mdx}'] as const

export interface OxfmtGenerationOptions {
  biomeIgnorePatterns?: string[]
}

export function generateOxfmtConfig(
  biomeConfig: BiomeConfig,
  reporter: Reporter,
  options: OxfmtGenerationOptions = {},
): OxfmtConfig {
  const oxfmtConfig: OxfmtConfig = {
    $schema: './node_modules/oxfmt/configuration_schema.json',
  }

  const { formatter } = biomeConfig
  const jsFormatter = biomeConfig.javascript?.formatter
  warnAboutUnsupportedFormatterKeys(formatter, GLOBAL_FORMATTER_KEYS, 'formatter', reporter)
  warnAboutUnsupportedFormatterKeys(
    jsFormatter,
    JAVASCRIPT_FORMATTER_KEYS,
    'javascript.formatter',
    reporter,
  )

  if (formatter?.enabled === false) {
    const languageFormatterEnabled =
      jsFormatter?.enabled === true ||
      biomeConfig.json?.formatter?.enabled === true ||
      biomeConfig.css?.formatter?.enabled === true

    if (!languageFormatterEnabled) {
      oxfmtConfig.ignorePatterns = ['**/*']
    } else {
      reporter.loss(
        'Biome global formatting is disabled with a language formatter re-enabled; Oxfmt cannot represent that enable-only selection, so more files will be formatted than Biome formatted.',
      )
    }
  }

  const positiveSelectors = [...(biomeConfig.files?.include ?? []), ...(formatter?.include ?? [])]

  if (positiveSelectors.length > 0) {
    reporter.loss(
      `Biome files/formatter positive include selection (${positiveSelectors.join(', ')}) cannot be represented in an Oxfmt config; Oxfmt will format every file not covered by ignorePatterns, which is a wider set. Pass equivalent paths to the Oxfmt CLI before replacing Biome.`,
    )
  }

  mapFormatterOptions(formatter, oxfmtConfig, reporter)
  mapIgnorePatterns(biomeConfig, oxfmtConfig, options.biomeIgnorePatterns ?? [])
  mapDisabledLanguageFormatters(biomeConfig, oxfmtConfig)
  applyExplicitFormatterOptionPassThrough([formatter], oxfmtConfig, reporter)
  oxfmtConfig.sortPackageJson ??= false

  const languageOverrides = generateOxfmtOverrides(
    [
      {
        include: ['**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}'],
        javascript: biomeConfig.javascript,
      },
      { include: ['**/*.{json,jsonc,json5}'], json: biomeConfig.json },
      { include: ['**/*.{css,scss,sass,less}'], css: biomeConfig.css },
    ],
    reporter,
  )

  if (languageOverrides.length > 0) {
    oxfmtConfig.overrides = languageOverrides
  }

  return oxfmtConfig
}

/**
 * Excludes the file types Oxfmt formats but Biome does not.
 *
 * Applied after glob rebasing: these patterns are relative to the generated config's own
 * directory rather than to the Biome project root, so they must not take part in the
 * rebase decision.
 */
export function excludeOxfmtOnlyLanguages(oxfmtConfig: OxfmtConfig): void {
  const existingPatterns = oxfmtConfig.ignorePatterns ?? []

  // Everything is already ignored, so per-language patterns would only add noise.
  if (existingPatterns.includes('**/*')) {
    return
  }

  oxfmtConfig.ignorePatterns = [...new Set([...existingPatterns, ...OXFMT_ONLY_IGNORE_PATTERNS])]
}

function mapDisabledLanguageFormatters(biomeConfig: BiomeConfig, oxfmtConfig: OxfmtConfig): void {
  const disabledPatterns: string[] = []

  if (biomeConfig.javascript?.formatter?.enabled === false) {
    disabledPatterns.push('**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}')
  }
  if (biomeConfig.json?.formatter?.enabled === false) {
    disabledPatterns.push('**/*.{json,jsonc,json5}')
  }
  if (biomeConfig.css?.formatter?.enabled === false) {
    disabledPatterns.push('**/*.{css,scss,sass,less}')
  }

  if (disabledPatterns.length > 0) {
    oxfmtConfig.ignorePatterns = [
      ...new Set([...(oxfmtConfig.ignorePatterns ?? []), ...disabledPatterns]),
    ]
  }
}

function warnAboutUnsupportedFormatterKeys(
  formatter: Record<string, unknown> | undefined,
  supportedKeys: Set<string>,
  label: string,
  reporter: Reporter,
): void {
  for (const [key, value] of Object.entries(formatter ?? {})) {
    // Normalization sets absent selection fields to `undefined`; those are not user config.
    if (value === undefined) {
      continue
    }

    if (!supportedKeys.has(key)) {
      reporter.loss(`Biome ${label} option "${key}" has no Oxfmt equivalent and was not migrated.`)
    }
  }
}

function mapFormatterOptions(
  formatter: BiomeFormatterConfig | undefined,
  oxfmtConfig: OxfmtConfig,
  reporter: Reporter,
): void {
  const globalLineWidth = formatter?.lineWidth
  // Biome default is 80, Oxfmt default is 100
  // Always set explicitly to avoid confusion
  const lineWidth = globalLineWidth ?? 80

  oxfmtConfig.printWidth = lineWidth

  const globalIndentStyle = formatter?.indentStyle
  const indentStyle = globalIndentStyle ?? 'tab'
  oxfmtConfig.useTabs = indentStyle === 'tab'

  const globalIndentWidth = formatter?.indentWidth
  const indentWidth = globalIndentWidth
  if (indentWidth !== undefined && indentWidth !== 2) {
    oxfmtConfig.tabWidth = indentWidth
  }

  const lineEnding = formatter?.lineEnding ?? 'lf'
  if (lineEnding === 'auto') {
    // Oxfmt's schema states `"auto"` is not supported; its default `lf` matches Biome's
    // `auto` on macOS/Linux but diverges on Windows, where Biome would emit CRLF.
    reporter.loss(
      'Biome formatter.lineEnding "auto" has no Oxfmt equivalent; Oxfmt will always write LF. On Windows checkouts this changes the emitted line endings.',
    )
  } else if (lineEnding !== 'lf') {
    oxfmtConfig.endOfLine = lineEnding
  }

  oxfmtConfig.singleQuote = false
  oxfmtConfig.jsxSingleQuote = false
  oxfmtConfig.quoteProps = 'as-needed'
  oxfmtConfig.trailingComma = 'all'
  oxfmtConfig.semi = true
  oxfmtConfig.arrowParens = 'always'

  const globalBracketSpacing = formatter?.bracketSpacing
  const bracketSpacing = globalBracketSpacing
  if (bracketSpacing !== undefined) {
    oxfmtConfig.bracketSpacing = bracketSpacing
  }

  if (formatter?.bracketSameLine !== undefined) {
    oxfmtConfig.bracketSameLine = formatter.bracketSameLine
  }

  const attributePosition = formatter?.attributePosition
  if (attributePosition === 'multiline') {
    oxfmtConfig.singleAttributePerLine = true
  } else if (attributePosition === 'auto') {
    oxfmtConfig.singleAttributePerLine = false
  }

  const objectWrap = mapBiomeExpandToObjectWrap(formatter?.expand, 'formatter', reporter)
  if (objectWrap) {
    oxfmtConfig.objectWrap = objectWrap
  }

  if (formatter?.trailingNewline !== undefined) {
    oxfmtConfig.insertFinalNewline = formatter.trailingNewline
  }

  if (formatter?.formatWithErrors) {
    reporter.warn("Biome's formatWithErrors option is not supported in Oxfmt")
  }
}

function mapIgnorePatterns(
  biomeConfig: BiomeConfig,
  oxfmtConfig: OxfmtConfig,
  additionalIgnorePatterns: string[],
): void {
  const ignorePatterns: string[] = [
    ...(oxfmtConfig.ignorePatterns ?? []),
    ...additionalIgnorePatterns,
    ...(biomeConfig.files?.ignore ?? []),
    ...(biomeConfig.formatter?.ignore ?? []),
    // Negated `includes` exceptions are exclusions, so they map onto ignorePatterns.
    ...(biomeConfig.files?.exclude ?? []),
    ...(biomeConfig.formatter?.exclude ?? []),
  ]

  if (ignorePatterns.length > 0) {
    oxfmtConfig.ignorePatterns = [...new Set(ignorePatterns)]
  }
}

function applyExplicitFormatterOptionPassThrough(
  sources: Array<Record<string, unknown> | undefined>,
  oxfmtConfig: OxfmtConfig,
  reporter: Reporter,
): void {
  const target = oxfmtConfig as Record<string, unknown>

  for (const source of sources) {
    if (!source) {
      continue
    }

    for (const key of EXPLICIT_OXFMT_OPTION_KEYS) {
      const value = source[key]

      if (value !== undefined) {
        if (key === 'objectWrap' && value !== 'preserve' && value !== 'collapse') {
          reporter.warn(
            `Ignoring invalid Oxfmt objectWrap value ${JSON.stringify(value)}; expected "preserve" or "collapse".`,
          )
          continue
        }
        target[key] = value
      }
    }

    for (const [legacyKey, targetKey] of Object.entries(LEGACY_EXPLICIT_OXFMT_OPTION_ALIASES)) {
      const value = source[legacyKey]

      if (value !== undefined && target[targetKey] === undefined) {
        target[targetKey] = value
      }
    }
  }
}
