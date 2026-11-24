import type {
  BiomeCssConfig,
  BiomeFormatterConfig,
  BiomeGraphqlConfig,
  BiomeJavaScriptConfig,
  BiomeJsonConfig,
  BiomeMarkdownConfig,
  BiomeOverride,
  BiomeYamlConfig,
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
  'astro',
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
const GRAPHQL_EXTENSIONS = ['graphql', 'gql']

/**
 * File extensions Biome 2.6 formats as YAML (`crates/biome_languages/src/yaml.rs`). Oxfmt
 * recognises only some of them; `OXFMT_UNRECOGNISED_YAML_EXTENSIONS` lists the rest.
 */
const YAML_EXTENSIONS = [
  'yaml',
  'yml',
  'cff',
  'eyaml',
  'eyml',
  'mir',
  'reek',
  'rviz',
  'sublime-syntax',
  'syntax',
  'yaml-tmlanguage',
  'yaml-tmpreferences',
  'yaml-tmtheme',
  'yaml.sed',
  'yml.mysql',
]
/** Dotfiles Biome formats as YAML by name; Oxfmt does too. */
const YAML_FILENAMES = ['.clang-format', '.clang-tidy', '.gemrc']
/**
 * Biome YAML extensions Oxfmt does not format by default. `cff` is among them because Oxfmt
 * only recognises `CITATION.cff` by name, while Biome formats every `.cff` file.
 */
const OXFMT_UNRECOGNISED_YAML_EXTENSIONS = [
  'cff',
  'eyaml',
  'eyml',
  'yaml-tmpreferences',
  'yaml-tmtheme',
  'yaml.sed',
  'yml.mysql',
]
/** Biome formats Markdown by these two extensions only. */
const MARKDOWN_EXTENSIONS = ['md', 'markdown']

/** Every file Biome formats as YAML, as Oxfmt globs. */
export const BIOME_YAML_FILE_PATTERNS = [
  `**/*.{${YAML_EXTENSIONS.join(',')}}`,
  `**/{${YAML_FILENAMES.join(',')}}`,
]
/** The Biome YAML files Oxfmt only formats when they are associated with YAML. */
export const OXFMT_UNRECOGNISED_YAML_PATTERN = `**/*.{${OXFMT_UNRECOGNISED_YAML_EXTENSIONS.join(',')}}`
export const BIOME_MARKDOWN_FILE_PATTERN = `**/*.{${MARKDOWN_EXTENSIONS.join(',')}}`
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

const YAML_FORMATTER_KEYS = new Set([
  'enabled',
  'bracketSpacing',
  'indentWidth',
  'lineEnding',
  'lineWidth',
  'quoteStyle',
  'trailingNewline',
  ...EXPLICIT_OXFMT_OPTION_KEYS,
  ...Object.keys(LEGACY_EXPLICIT_OXFMT_OPTION_ALIASES),
])
const MARKDOWN_FORMATTER_KEYS = new Set([
  'enabled',
  'formatEmbeds',
  'indentStyle',
  'indentWidth',
  'lineEnding',
  'lineWidth',
  'proseWrap',
  'trailingNewline',
  ...EXPLICIT_OXFMT_OPTION_KEYS,
  ...Object.keys(LEGACY_EXPLICIT_OXFMT_OPTION_ALIASES),
])

const GRAPHQL_FORMATTER_KEYS = new Set([
  'enabled',
  'bracketSpacing',
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

    if (override.assist) {
      reporter.loss(
        `Biome override for ${files.join(', ')} configures assist actions; per-override assist is not migrated, so only the top-level assist configuration reached the Oxfmt config.`,
      )
    }
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

    const graphqlOptions = mapGraphqlFormatterOptions(override.graphql?.formatter, reporter)
    pushScopedOverride(
      oxfmtOverrides,
      files,
      excludeFiles,
      graphqlOptions,
      reporter,
      'graphql.formatter',
      GRAPHQL_EXTENSIONS,
    )

    const yamlOptions = mapYamlFormatterOptions(override.yaml?.formatter, reporter)
    pushScopedOverride(
      oxfmtOverrides,
      files,
      excludeFiles,
      yamlOptions,
      reporter,
      'yaml.formatter',
      // The dotfile names match the same `.name` check the extensions do.
      [...YAML_EXTENSIONS, ...YAML_FILENAMES.map((name) => name.slice(1))],
    )

    const markdownOptions = mapMarkdownFormatterOptions(override.markdown?.formatter, reporter)
    pushScopedOverride(
      oxfmtOverrides,
      files,
      excludeFiles,
      markdownOptions,
      reporter,
      'markdown.formatter',
      MARKDOWN_EXTENSIONS,
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

  mapLineEnding(formatter.lineEnding, 'overrides[].formatter', options, reporter)

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

  mapLineEnding(jsFormatter.lineEnding, 'javascript.formatter', options, reporter)

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

  mapLineEnding(jsonFormatter.lineEnding, 'json.formatter', options, reporter)

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

  mapLineEnding(cssFormatter.lineEnding, 'css.formatter', options, reporter)

  if (cssFormatter.quoteStyle !== undefined) {
    options.singleQuote = cssFormatter.quoteStyle === 'single'
  }

  if (cssFormatter.trailingNewline !== undefined) {
    options.insertFinalNewline = cssFormatter.trailingNewline
  }

  applyExplicitFormatterOptionPassThrough([cssFormatter], options, reporter)

  return options
}

function mapGraphqlFormatterOptions(
  graphqlFormatter: BiomeGraphqlConfig['formatter'] | undefined,
  reporter: Reporter,
): Partial<Record<string, unknown>> {
  const options: Record<string, unknown> = {}

  if (!graphqlFormatter) {
    return options
  }

  // `quoteStyle` is accepted but not mapped: GraphQL strings are always double-quoted, and
  // neither Biome nor Oxfmt changes them for a single-quote setting.
  warnAboutUnsupportedKeys(graphqlFormatter, GRAPHQL_FORMATTER_KEYS, 'graphql.formatter', reporter)

  if (graphqlFormatter.lineWidth !== undefined) {
    options.printWidth = graphqlFormatter.lineWidth
  }

  if (graphqlFormatter.indentStyle !== undefined) {
    options.useTabs = graphqlFormatter.indentStyle === 'tab'
  }

  if (graphqlFormatter.indentWidth !== undefined) {
    options.tabWidth = graphqlFormatter.indentWidth
  }

  mapLineEnding(graphqlFormatter.lineEnding, 'graphql.formatter', options, reporter)

  if (graphqlFormatter.bracketSpacing !== undefined) {
    options.bracketSpacing = graphqlFormatter.bracketSpacing
  }

  if (graphqlFormatter.trailingNewline !== undefined) {
    options.insertFinalNewline = graphqlFormatter.trailingNewline
  }

  applyExplicitFormatterOptionPassThrough([graphqlFormatter], options, reporter)

  return options
}

function mapYamlFormatterOptions(
  yamlFormatter: BiomeYamlConfig['formatter'] | undefined,
  reporter: Reporter,
): Partial<Record<string, unknown>> {
  const options: Record<string, unknown> = {}

  if (!yamlFormatter) {
    return options
  }

  warnAboutUnsupportedKeys(yamlFormatter, YAML_FORMATTER_KEYS, 'yaml.formatter', reporter)

  if (yamlFormatter.lineWidth !== undefined) {
    options.printWidth = yamlFormatter.lineWidth
  }

  if (yamlFormatter.indentWidth !== undefined) {
    options.tabWidth = yamlFormatter.indentWidth
  }

  mapLineEnding(yamlFormatter.lineEnding, 'yaml.formatter', options, reporter)

  if (yamlFormatter.quoteStyle !== undefined) {
    options.singleQuote = yamlFormatter.quoteStyle === 'single'
  }

  if (yamlFormatter.bracketSpacing !== undefined) {
    options.bracketSpacing = yamlFormatter.bracketSpacing
  }

  if (yamlFormatter.trailingNewline !== undefined) {
    options.insertFinalNewline = yamlFormatter.trailingNewline
  }

  applyExplicitFormatterOptionPassThrough([yamlFormatter], options, reporter)

  return options
}

function mapMarkdownFormatterOptions(
  markdownFormatter: BiomeMarkdownConfig['formatter'] | undefined,
  reporter: Reporter,
): Partial<Record<string, unknown>> {
  const options: Record<string, unknown> = {}

  if (!markdownFormatter) {
    return options
  }

  warnAboutUnsupportedKeys(
    markdownFormatter,
    MARKDOWN_FORMATTER_KEYS,
    'markdown.formatter',
    reporter,
  )

  if (markdownFormatter.lineWidth !== undefined) {
    options.printWidth = markdownFormatter.lineWidth
  }

  // `indentStyle` and `indentWidth` are accepted but not mapped: Biome's Markdown output is
  // the same whatever they say, so the Markdown override pins Oxfmt's indent instead.

  mapLineEnding(markdownFormatter.lineEnding, 'markdown.formatter', options, reporter)

  if (markdownFormatter.proseWrap !== undefined) {
    options.proseWrap = markdownFormatter.proseWrap
  }

  // Biome formats fenced code blocks, frontmatter and HTML blocks with their own language's
  // formatter unless `formatEmbeds` is off; Oxfmt does the same unless this is `off`.
  if (markdownFormatter.formatEmbeds === false) {
    options.embeddedLanguageFormatting = 'off'
  }

  if (markdownFormatter.trailingNewline !== undefined) {
    options.insertFinalNewline = markdownFormatter.trailingNewline
  }

  applyExplicitFormatterOptionPassThrough([markdownFormatter], options, reporter)

  return options
}

/**
 * Oxfmt has no `auto` line ending and rejects the whole config when it meets one. Its `lf`
 * default matches Biome's `auto` everywhere but Windows, so `auto` is reported, not emitted.
 */
function mapLineEnding(
  lineEnding: 'lf' | 'crlf' | 'cr' | 'auto' | undefined,
  label: string,
  options: Record<string, unknown>,
  reporter: Reporter,
): void {
  if (lineEnding === 'auto') {
    reporter.loss(
      `Biome ${label}.lineEnding "auto" has no Oxfmt equivalent; Oxfmt will write LF for those files. On Windows checkouts this changes the emitted line endings.`,
    )
  } else if (lineEnding !== undefined) {
    options.endOfLine = lineEnding
  }
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
