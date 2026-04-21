import type {
  BiomeCssConfig,
  BiomeFormatterConfig,
  BiomeJavaScriptConfig,
  BiomeJsonConfig,
  BiomeOverride,
  OxfmtOverride,
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
const JAVASCRIPT_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx', 'mjs', 'mts', 'cjs', 'cts']
const JSON_EXTENSIONS = ['json', 'jsonc', 'json5']
const CSS_EXTENSIONS = ['css', 'scss', 'sass', 'less']

export function generateOxfmtOverrides(
  biomeOverrides: BiomeOverride[] | undefined,
  reporter: Reporter,
): OxfmtOverride[] {
  if (!biomeOverrides || biomeOverrides.length === 0) {
    return []
  }

  const oxfmtOverrides: OxfmtOverride[] = []

  for (const override of biomeOverrides) {
    const files = override.include
    if (!files || files.length === 0) {
      continue
    }

    const excludeFiles = override.ignore && override.ignore.length > 0 ? override.ignore : undefined
    const baseOptions = mapBaseFormatterOptions(override.formatter, reporter)
    pushOverride(oxfmtOverrides, files, excludeFiles, baseOptions)

    const jsOptions = mapJavaScriptFormatterOptions(override.javascript?.formatter)
    pushScopedOverride(
      oxfmtOverrides,
      files,
      excludeFiles,
      jsOptions,
      reporter,
      'javascript.formatter',
      JAVASCRIPT_EXTENSIONS,
    )

    const jsonOptions = mapJsonFormatterOptions(override.json?.formatter)
    pushScopedOverride(
      oxfmtOverrides,
      files,
      excludeFiles,
      jsonOptions,
      reporter,
      'json.formatter',
      JSON_EXTENSIONS,
    )

    const cssOptions = mapCssFormatterOptions(override.css?.formatter)
    pushScopedOverride(
      oxfmtOverrides,
      files,
      excludeFiles,
      cssOptions,
      reporter,
      'css.formatter',
      CSS_EXTENSIONS,
    )
  }

  return oxfmtOverrides
}

function pushOverride(
  target: OxfmtOverride[],
  files: string[],
  excludeFiles: string[] | undefined,
  options: Partial<Record<string, unknown>>,
): void {
  if (Object.keys(options).length === 0) {
    return
  }

  const override: OxfmtOverride = {
    files,
    options,
  }

  if (excludeFiles) {
    override.excludeFiles = excludeFiles
  }

  target.push(override)
}

function pushScopedOverride(
  target: OxfmtOverride[],
  files: string[],
  excludeFiles: string[] | undefined,
  options: Partial<Record<string, unknown>>,
  reporter: Reporter,
  formatterLabel: string,
  allowedExtensions: string[],
): void {
  if (Object.keys(options).length === 0) {
    return
  }

  if (!filesAreScopedToExtensions(files, allowedExtensions)) {
    reporter.warn(
      `Skipping ${formatterLabel} override because Oxfmt overrides are file-glob based and these include patterns are not ${formatterLabel.split('.')[0]}-specific: ${files.join(', ')}`,
    )
    return
  }

  pushOverride(target, files, excludeFiles, options)
}

function mapBaseFormatterOptions(
  formatter: BiomeFormatterConfig | undefined,
  reporter: Reporter,
): Partial<Record<string, unknown>> {
  const options: Record<string, unknown> = {}

  if (!formatter) {
    return options
  }

  if (formatter.lineWidth !== undefined) {
    options.printWidth = formatter.lineWidth
  }

  if (formatter.indentStyle !== undefined) {
    options.useTabs = formatter.indentStyle === 'tab'
  }

  if (formatter.indentWidth !== undefined) {
    options.tabWidth = formatter.indentWidth
  }

  if (formatter.lineEnding !== undefined) {
    options.endOfLine = formatter.lineEnding
  }

  if (formatter.bracketSpacing !== undefined) {
    options.bracketSpacing = formatter.bracketSpacing
  }

  if (formatter.attributePosition !== undefined) {
    options.singleAttributePerLine = formatter.attributePosition === 'multiline'
  }

  if (formatter.formatWithErrors) {
    reporter.warn("Biome's formatWithErrors option is not supported in Oxfmt overrides")
  }

  applyExplicitFormatterOptionPassThrough([formatter], options)

  return options
}

function mapJavaScriptFormatterOptions(
  jsFormatter: BiomeJavaScriptConfig['formatter'] | undefined,
): Partial<Record<string, unknown>> {
  const options: Record<string, unknown> = {}

  if (!jsFormatter) {
    return options
  }

  if (jsFormatter.lineWidth !== undefined) {
    options.printWidth = jsFormatter.lineWidth
  }

  if (jsFormatter.indentStyle !== undefined) {
    options.useTabs = jsFormatter.indentStyle === 'tab'
  }

  if (jsFormatter.indentWidth !== undefined) {
    options.tabWidth = jsFormatter.indentWidth
  }

  if (jsFormatter.lineEnding !== undefined) {
    options.endOfLine = jsFormatter.lineEnding
  }

  if (jsFormatter.quoteStyle !== undefined) {
    options.singleQuote = jsFormatter.quoteStyle === 'single'
  }

  if (jsFormatter.jsxQuoteStyle !== undefined) {
    options.jsxSingleQuote = jsFormatter.jsxQuoteStyle === 'single'
  }

  if (jsFormatter.quoteProperties !== undefined) {
    options.quoteProps = jsFormatter.quoteProperties === 'preserve' ? 'preserve' : 'as-needed'
  }

  if (jsFormatter.trailingCommas !== undefined) {
    options.trailingComma =
      jsFormatter.trailingCommas === 'none'
        ? 'none'
        : jsFormatter.trailingCommas === 'es5'
          ? 'es5'
          : 'all'
  }

  if (jsFormatter.semicolons !== undefined) {
    options.semi = jsFormatter.semicolons === 'always'
  }

  if (jsFormatter.arrowParentheses !== undefined) {
    options.arrowParens = jsFormatter.arrowParentheses === 'always' ? 'always' : 'avoid'
  }

  if (jsFormatter.bracketSpacing !== undefined) {
    options.bracketSpacing = jsFormatter.bracketSpacing
  }

  if (jsFormatter.bracketSameLine !== undefined) {
    options.bracketSameLine = jsFormatter.bracketSameLine
  }

  applyExplicitFormatterOptionPassThrough([jsFormatter], options)

  return options
}

function mapJsonFormatterOptions(
  jsonFormatter: BiomeJsonConfig['formatter'] | undefined,
): Partial<Record<string, unknown>> {
  const options: Record<string, unknown> = {}

  if (!jsonFormatter) {
    return options
  }

  if (jsonFormatter.lineWidth !== undefined) {
    options.printWidth = jsonFormatter.lineWidth
  }

  if (jsonFormatter.indentStyle !== undefined) {
    options.useTabs = jsonFormatter.indentStyle === 'tab'
  }

  if (jsonFormatter.indentWidth !== undefined) {
    options.tabWidth = jsonFormatter.indentWidth
  }

  if (jsonFormatter.lineEnding !== undefined) {
    options.endOfLine = jsonFormatter.lineEnding
  }

  if (jsonFormatter.trailingCommas !== undefined) {
    options.trailingComma = jsonFormatter.trailingCommas === 'none' ? 'none' : 'all'
  }

  applyExplicitFormatterOptionPassThrough([jsonFormatter], options)

  return options
}

function mapCssFormatterOptions(
  cssFormatter: BiomeCssConfig['formatter'] | undefined,
): Partial<Record<string, unknown>> {
  const options: Record<string, unknown> = {}

  if (!cssFormatter) {
    return options
  }

  if (cssFormatter.lineWidth !== undefined) {
    options.printWidth = cssFormatter.lineWidth
  }

  if (cssFormatter.indentStyle !== undefined) {
    options.useTabs = cssFormatter.indentStyle === 'tab'
  }

  if (cssFormatter.indentWidth !== undefined) {
    options.tabWidth = cssFormatter.indentWidth
  }

  if (cssFormatter.lineEnding !== undefined) {
    options.endOfLine = cssFormatter.lineEnding
  }

  if (cssFormatter.quoteStyle !== undefined) {
    options.singleQuote = cssFormatter.quoteStyle === 'single'
  }

  applyExplicitFormatterOptionPassThrough([cssFormatter], options)

  return options
}

function applyExplicitFormatterOptionPassThrough(
  sources: Array<Record<string, unknown> | undefined>,
  options: Record<string, unknown>,
): void {
  for (const source of sources) {
    if (!source) {
      continue
    }

    for (const key of EXPLICIT_OXFMT_OPTION_KEYS) {
      const value = source[key]

      if (value !== undefined) {
        options[key] = value
      }
    }

    for (const [legacyKey, targetKey] of Object.entries(LEGACY_EXPLICIT_OXFMT_OPTION_ALIASES)) {
      const value = source[legacyKey]

      if (value !== undefined && options[targetKey] === undefined) {
        options[targetKey] = value
      }
    }
  }
}

function filesAreScopedToExtensions(files: string[], extensions: string[]): boolean {
  return files.every((filePattern) => patternTargetsExtension(filePattern, extensions))
}

function patternTargetsExtension(pattern: string, extensions: string[]): boolean {
  const normalizedPattern = pattern.toLowerCase()

  return extensions.some((extension) => {
    if (normalizedPattern.includes(`.${extension}`)) {
      return true
    }

    const bracePattern = new RegExp(`\\{[^}]*\\b${extension}\\b[^}]*\\}`, 'u')
    return bracePattern.test(normalizedPattern)
  })
}
