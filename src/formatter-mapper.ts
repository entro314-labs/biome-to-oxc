import type {
  BiomeConfig,
  BiomeFormatterConfig,
  BiomeJavaScriptConfig,
  OxfmtConfig,
  Reporter,
} from './types.js'

const EXPLICIT_OXFMT_OPTION_KEYS = [
  'objectWrap',
  'insertFinalNewline',
  'embeddedLanguageFormatting',
  'htmlWhitespaceSensitivity',
  'proseWrap',
  'vueIndentScriptAndStyle',
  'sortImports',
  'sortPackageJson',
  'sortTailwindcss',
] as const
const LEGACY_EXPLICIT_OXFMT_OPTION_ALIASES = {
  experimentalSortImports: 'sortImports',
  experimentalSortPackageJson: 'sortPackageJson',
  experimentalTailwindcss: 'sortTailwindcss',
} as const

export function generateOxfmtConfig(biomeConfig: BiomeConfig, reporter: Reporter): OxfmtConfig {
  const oxfmtConfig: OxfmtConfig = {
    $schema: './node_modules/oxfmt/configuration_schema.json',
  }

  const { formatter } = biomeConfig
  const jsFormatter = biomeConfig.javascript?.formatter

  if (formatter?.enabled === false && jsFormatter?.enabled === false) {
    reporter.warn(
      'Biome formatter is disabled. Oxfmt config will be created but may need manual review.',
    )
  }

  mapFormatterOptions(formatter, jsFormatter, oxfmtConfig, reporter)
  mapIgnorePatterns(biomeConfig, oxfmtConfig)
  applyExplicitFormatterOptionPassThrough([formatter, jsFormatter], oxfmtConfig)

  return oxfmtConfig
}

function mapFormatterOptions(
  formatter: BiomeFormatterConfig | undefined,
  jsFormatter: BiomeJavaScriptConfig['formatter'] | undefined,
  oxfmtConfig: OxfmtConfig,
  reporter: Reporter,
): void {
  const jsLineWidth = jsFormatter?.lineWidth
  const globalLineWidth = formatter?.lineWidth
  // Biome default is 80, Oxfmt default is 100
  // Always set explicitly to avoid confusion
  const lineWidth = jsLineWidth ?? globalLineWidth ?? 80

  oxfmtConfig.printWidth = lineWidth

  const jsIndentStyle = jsFormatter?.indentStyle
  const globalIndentStyle = formatter?.indentStyle
  const indentStyle = jsIndentStyle ?? globalIndentStyle ?? 'tab'
  oxfmtConfig.useTabs = indentStyle === 'tab'

  const jsIndentWidth = jsFormatter?.indentWidth
  const globalIndentWidth = formatter?.indentWidth
  const indentWidth = jsIndentWidth ?? globalIndentWidth
  if (indentWidth !== undefined && indentWidth !== 2) {
    oxfmtConfig.tabWidth = indentWidth
  }

  const jsLineEnding = jsFormatter?.lineEnding
  const globalLineEnding = formatter?.lineEnding
  const lineEnding = jsLineEnding ?? globalLineEnding ?? 'lf'
  if (lineEnding !== 'lf') {
    oxfmtConfig.endOfLine = lineEnding
  }

  const quoteStyle = jsFormatter?.quoteStyle ?? 'double'
  oxfmtConfig.singleQuote = quoteStyle === 'single'

  const jsxQuoteStyle = jsFormatter?.jsxQuoteStyle ?? 'double'
  oxfmtConfig.jsxSingleQuote = jsxQuoteStyle === 'single'

  const quoteProperties = jsFormatter?.quoteProperties ?? 'asNeeded'
  if (quoteProperties === 'preserve') {
    oxfmtConfig.quoteProps = 'preserve'
  } else {
    oxfmtConfig.quoteProps = 'as-needed'
  }

  const trailingCommas = jsFormatter?.trailingCommas ?? 'all'
  if (trailingCommas === 'none') {
    oxfmtConfig.trailingComma = 'none'
  } else if (trailingCommas === 'es5') {
    oxfmtConfig.trailingComma = 'es5'
  } else {
    oxfmtConfig.trailingComma = 'all'
  }

  const semicolons = jsFormatter?.semicolons ?? 'always'
  oxfmtConfig.semi = semicolons === 'always'

  const arrowParentheses = jsFormatter?.arrowParentheses ?? 'always'
  oxfmtConfig.arrowParens = arrowParentheses === 'always' ? 'always' : 'avoid'

  const jsBracketSpacing = jsFormatter?.bracketSpacing
  const globalBracketSpacing = formatter?.bracketSpacing
  const bracketSpacing = jsBracketSpacing ?? globalBracketSpacing
  if (bracketSpacing !== undefined) {
    oxfmtConfig.bracketSpacing = bracketSpacing
  }

  const bracketSameLine = jsFormatter?.bracketSameLine
  if (bracketSameLine !== undefined) {
    oxfmtConfig.bracketSameLine = bracketSameLine
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
  const ignorePatterns: string[] = []

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
): void {
  const target = oxfmtConfig as Record<string, unknown>

  for (const source of sources) {
    if (!source) {
      continue
    }

    for (const key of EXPLICIT_OXFMT_OPTION_KEYS) {
      const value = source[key]

      if (value !== undefined) {
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
