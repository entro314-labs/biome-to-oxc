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
const JAVASCRIPT_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx', 'mjs', 'mts', 'cjs', 'cts']
const JSON_EXTENSIONS = ['json', 'jsonc', 'json5']
const CSS_EXTENSIONS = ['css', 'scss', 'sass', 'less']
const JSON_FORMATTER_KEYS = new Set([
  'enabled',
  'expand',
  'indentStyle',
  'indentWidth',
  'lineEnding',
  'lineWidth',
  'trailingCommas',
  'trailingNewline',
  ...EXPLICIT_OXFMT_OPTION_KEYS,
  ...Object.keys(LEGACY_EXPLICIT_OXFMT_OPTION_ALIASES),
])
const CSS_FORMATTER_KEYS = new Set([
  'enabled',
  'indentStyle',
  'indentWidth',
  'lineEnding',
  'lineWidth',
  'quoteStyle',
  'trailingNewline',
  ...EXPLICIT_OXFMT_OPTION_KEYS,
  ...Object.keys(LEGACY_EXPLICIT_OXFMT_OPTION_ALIASES),
])

/**
 * Biome's `expand` and Oxfmt's `objectWrap` agree on two of three modes: Biome's `auto`
 * (expand when the literal already has a newline after `{`) is Oxfmt's `preserve`, and
 * Biome's `never` is Oxfmt's `collapse`. Biome's `always` has no Oxfmt counterpart.
 */
export function mapBiomeExpandToObjectWrap(
  expand: unknown,
  label: string,
  reporter: Reporter,
): 'preserve' | 'collapse' | undefined {
  if (expand === 'auto') {
    return 'preserve'
  }
  if (expand === 'never') {
    return 'collapse'
  }
  if (expand === 'always') {
    reporter.loss(
      `Biome ${label}.expand "always" has no Oxfmt equivalent; Oxfmt's objectWrap only offers "preserve" and "collapse", so objects and arrays that fit on one line will not be forced to expand.`,
    )
  }
  return undefined
}

/** Biome places the operator after or before the break; Oxfmt names the same two positions. */
export function mapBiomeOperatorLinebreakToOxfmt(
  operatorLinebreak: unknown,
): 'start' | 'end' | undefined {
  if (operatorLinebreak === 'after') {
    return 'end'
  }
  if (operatorLinebreak === 'before') {
    return 'start'
  }
  return undefined
}

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

    // `ignore` and negated `includes` exceptions both exclude files from the override.
    const excludePatterns = [...new Set([...(override.ignore ?? []), ...(override.exclude ?? [])])]
    const excludeFiles = excludePatterns.length > 0 ? excludePatterns : undefined
    const baseOptions = mapBaseFormatterOptions(override.formatter, reporter)
    pushOverride(oxfmtOverrides, files, excludeFiles, baseOptions)

    const jsOptions = mapJavaScriptFormatterOptions(override.javascript?.formatter, reporter)
    pushScopedOverride(
      oxfmtOverrides,
      files,
      excludeFiles,
      jsOptions,
      reporter,
      'javascript.formatter',
      JAVASCRIPT_EXTENSIONS,
    )

    const jsonOptions = mapJsonFormatterOptions(override.json?.formatter, reporter)
    pushScopedOverride(
      oxfmtOverrides,
      files,
      excludeFiles,
      jsonOptions,
      reporter,
      'json.formatter',
      JSON_EXTENSIONS,
    )

    const cssOptions = mapCssFormatterOptions(override.css?.formatter, reporter)
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

export function collectDisabledOxfmtOverridePatterns(
  biomeOverrides: BiomeOverride[] | undefined,
): string[] {
  return (biomeOverrides ?? []).flatMap((override) =>
    override.formatter?.enabled === false ? (override.include ?? []) : [],
  )
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
    reporter.loss(
      `Biome ${formatterLabel} settings for ${files.join(', ')} were dropped: Oxfmt overrides select by file glob, and these patterns are not ${formatterLabel.split('.')[0]}-specific, so applying them would also reformat other languages.`,
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

  if (formatter.bracketSameLine !== undefined) {
    options.bracketSameLine = formatter.bracketSameLine
  }

  if (formatter.attributePosition !== undefined) {
    options.singleAttributePerLine = formatter.attributePosition === 'multiline'
  }

  const objectWrap = mapBiomeExpandToObjectWrap(formatter.expand, 'formatter', reporter)
  if (objectWrap) {
    options.objectWrap = objectWrap
  }

  if (formatter.trailingNewline !== undefined) {
    options.insertFinalNewline = formatter.trailingNewline
  }

  if (formatter.formatWithErrors) {
    reporter.warn("Biome's formatWithErrors option is not supported in Oxfmt overrides")
  }

  applyExplicitFormatterOptionPassThrough([formatter], options, reporter)

  return options
}

function mapJavaScriptFormatterOptions(
  jsFormatter: BiomeJavaScriptConfig['formatter'] | undefined,
  reporter: Reporter,
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

  if (jsFormatter.attributePosition !== undefined) {
    options.singleAttributePerLine = jsFormatter.attributePosition === 'multiline'
  }

  const objectWrap = mapBiomeExpandToObjectWrap(
    jsFormatter.expand,
    'javascript.formatter',
    reporter,
  )
  if (objectWrap) {
    options.objectWrap = objectWrap
  }

  const operatorPosition = mapBiomeOperatorLinebreakToOxfmt(jsFormatter.operatorLinebreak)
  if (operatorPosition) {
    options.experimentalOperatorPosition = operatorPosition
  }

  if (jsFormatter.trailingNewline !== undefined) {
    options.insertFinalNewline = jsFormatter.trailingNewline
  }

  applyExplicitFormatterOptionPassThrough([jsFormatter], options, reporter)

  return options
}

function mapJsonFormatterOptions(
  jsonFormatter: BiomeJsonConfig['formatter'] | undefined,
  reporter: Reporter,
): Partial<Record<string, unknown>> {
  const options: Record<string, unknown> = {}

  if (!jsonFormatter) {
    return options
  }

  warnAboutUnsupportedKeys(jsonFormatter, JSON_FORMATTER_KEYS, 'json.formatter', reporter)

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

  const objectWrap = mapBiomeExpandToObjectWrap(jsonFormatter.expand, 'json.formatter', reporter)
  if (objectWrap) {
    options.objectWrap = objectWrap
  }

  if (jsonFormatter.trailingNewline !== undefined) {
    options.insertFinalNewline = jsonFormatter.trailingNewline
  }

  applyExplicitFormatterOptionPassThrough([jsonFormatter], options, reporter)

  return options
}

function mapCssFormatterOptions(
  cssFormatter: BiomeCssConfig['formatter'] | undefined,
  reporter: Reporter,
): Partial<Record<string, unknown>> {
  const options: Record<string, unknown> = {}

  if (!cssFormatter) {
    return options
  }

  warnAboutUnsupportedKeys(cssFormatter, CSS_FORMATTER_KEYS, 'css.formatter', reporter)

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

  if (cssFormatter.trailingNewline !== undefined) {
    options.insertFinalNewline = cssFormatter.trailingNewline
  }

  applyExplicitFormatterOptionPassThrough([cssFormatter], options, reporter)

  return options
}

function warnAboutUnsupportedKeys(
  formatter: Record<string, unknown>,
  supportedKeys: Set<string>,
  label: string,
  reporter: Reporter,
): void {
  for (const [key, value] of Object.entries(formatter)) {
    // Normalization sets absent selection fields to `undefined`; those are not user config.
    if (value === undefined) {
      continue
    }

    if (!supportedKeys.has(key)) {
      reporter.loss(`Biome ${label} option "${key}" has no Oxfmt equivalent and was not migrated.`)
    }
  }
}

function applyExplicitFormatterOptionPassThrough(
  sources: Array<Record<string, unknown> | undefined>,
  options: Record<string, unknown>,
  reporter: Reporter,
): void {
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
