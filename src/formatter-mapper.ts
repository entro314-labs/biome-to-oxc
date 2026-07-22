import { generateOxfmtOverrides } from './oxfmt-overrides.js'
import type { BiomeConfig, BiomeFormatterConfig, OxfmtConfig, Reporter } from './types.js'

const EXPLICIT_OXFMT_OPTION_KEYS = [
  'objectWrap',
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
  'indentStyle',
  'indentWidth',
  'lineEnding',
  'lineWidth',
  ...EXPLICIT_OXFMT_OPTION_KEYS,
  ...Object.keys(LEGACY_EXPLICIT_OXFMT_OPTION_ALIASES),
])

export function generateOxfmtConfig(biomeConfig: BiomeConfig, reporter: Reporter): OxfmtConfig {
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
      reporter.warn(
        'Biome global formatting is disabled with a language formatter re-enabled; Oxfmt cannot represent that enable-only selection exactly.',
      )
    }
  }

  if ((biomeConfig.files?.include?.length ?? 0) > 0 || (formatter?.include?.length ?? 0) > 0) {
    reporter.warn(
      'Biome files/formatter include selection cannot be represented in an Oxfmt config; pass equivalent paths to the Oxfmt CLI or review ignorePatterns before replacing Biome.',
    )
  }

  mapFormatterOptions(formatter, oxfmtConfig, reporter)
  mapIgnorePatterns(biomeConfig, oxfmtConfig)
  mapDisabledLanguageFormatters(biomeConfig, oxfmtConfig)
  applyExplicitFormatterOptionPassThrough([formatter], oxfmtConfig, reporter)

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
  for (const key of Object.keys(formatter ?? {})) {
    if (!supportedKeys.has(key)) {
      reporter.warn(`Unsupported Biome ${label} option "${key}" was not migrated.`)
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

  const globalLineEnding = formatter?.lineEnding
  const lineEnding = globalLineEnding ?? 'lf'
  if (lineEnding !== 'lf') {
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

  const attributePosition = formatter?.attributePosition
  if (attributePosition === 'multiline') {
    oxfmtConfig.singleAttributePerLine = true
  } else if (attributePosition === 'auto') {
    oxfmtConfig.singleAttributePerLine = false
  }

  if (formatter?.formatWithErrors) {
    reporter.warn("Biome's formatWithErrors option is not supported in Oxfmt")
  }
}

function mapIgnorePatterns(biomeConfig: BiomeConfig, oxfmtConfig: OxfmtConfig): void {
  const ignorePatterns: string[] = [...(oxfmtConfig.ignorePatterns ?? [])]

  if (biomeConfig.files?.ignore) {
    ignorePatterns.push(...biomeConfig.files.ignore)
  }

  if (biomeConfig.formatter?.ignore) {
    ignorePatterns.push(...biomeConfig.formatter.ignore)
  }

  if (ignorePatterns.length > 0) {
    oxfmtConfig.ignorePatterns = ignorePatterns
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
