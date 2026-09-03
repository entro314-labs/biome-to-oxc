import { generateOxfmtOverrides, mapBiomeExpandToObjectWrap } from './oxfmt-overrides.js'
import type {
  BiomeAssistAction,
  BiomeAssistConfig,
  BiomeAssistSource,
  BiomeConfig,
  BiomeFormatterConfig,
  OxfmtConfig,
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

/**
 * The two Biome assist actions Oxfmt implements. Every other `assist.actions.source` entry
 * is a code action with no formatter equivalent, so enabling one is a migration loss.
 */
const OXFMT_BACKED_ASSIST_ACTIONS = new Set(['organizeImports', 'useSortedPackageJson'])

/** Group-level switches that sit alongside the actions and are not actions themselves. */
const ASSIST_GROUP_LEVEL_KEYS = new Set(['recommended', 'preset'])

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
  mapAssistActions(biomeConfig.assist, oxfmtConfig, reporter)
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

/**
 * Maps Biome's assist actions onto the Oxfmt options that implement them.
 *
 * Only actions the config turns on explicitly are migrated. Biome enables `organizeImports`
 * through its recommended set even when the config never mentions it, but both Oxfmt options
 * default to off here, so deriving them from a preset would start rewriting imports in
 * projects whose Biome config never asked for it.
 */
function mapAssistActions(
  assist: BiomeAssistConfig | undefined,
  oxfmtConfig: OxfmtConfig,
  reporter: Reporter,
): void {
  if (assist?.includes && assist.includes.length > 0) {
    reporter.loss(
      `Biome assist.includes (${assist.includes.join(', ')}) cannot be represented in an Oxfmt config; Oxfmt applies its sorting options to every file it formats.`,
    )
  }

  // Assist is on by default, so only an explicit `false` disables the actions below.
  if (assist?.enabled === false) {
    return
  }

  const source = assist?.actions?.source

  if (assist?.actions?.recommended || source?.recommended || source?.preset) {
    reporter.loss(
      'Biome assist actions were enabled through a preset rather than named individually; only the actions the config names explicitly were migrated to Oxfmt.',
    )
  }

  for (const [action, value] of Object.entries(source ?? {})) {
    if (ASSIST_GROUP_LEVEL_KEYS.has(action) || value === undefined) {
      continue
    }

    const level = readAssistActionLevel(value)

    if (level !== 'on') {
      continue
    }

    if (!OXFMT_BACKED_ASSIST_ACTIONS.has(action)) {
      reporter.loss(
        `Biome assist action "${action}" has no Oxfmt equivalent and was not migrated; its code action is lost.`,
      )
      continue
    }

    if (action === 'useSortedPackageJson') {
      oxfmtConfig.sortPackageJson = true
      // Both tools keep package.json sorted, but not into the same order; a first Oxfmt run
      // will reorder keys once. Verified by running both binaries over the same manifest.
      reporter.warn(
        "Biome assist action useSortedPackageJson became Oxfmt's sortPackageJson; the two use different key orders, so the first Oxfmt run will reorder package.json once.",
      )
      continue
    }

    oxfmtConfig.sortImports = mapOrganizeImportsOptions(value, reporter)
    reporter.warn(
      "Biome assist action organizeImports became Oxfmt's sortImports; the two group and order imports differently, so the first Oxfmt run will reorder imports once.",
    )
  }

  warnAboutDefaultOrganizeImports(source, oxfmtConfig, reporter)
}

/**
 * Biome runs `organizeImports` through its recommended assist set even when the config never
 * mentions it, so `biome check` sorts imports in essentially every project. Oxfmt's
 * `sortImports` defaults to off and deriving it from that default would start rewriting
 * imports in projects that never asked for it, so the difference is reported instead.
 *
 * Reported as a warning rather than a loss because it applies to nearly every migration, the
 * way the linter's category-preset approximation does.
 */
function warnAboutDefaultOrganizeImports(
  source: BiomeAssistSource | undefined,
  oxfmtConfig: OxfmtConfig,
  reporter: Reporter,
): void {
  const organizeImports = source?.organizeImports

  if (oxfmtConfig.sortImports !== undefined || organizeImports !== undefined) {
    return
  }

  reporter.warn(
    'Biome sorts imports by default through its recommended assist set. Oxfmt does not sort imports unless asked, so the generated config leaves them alone; set "sortImports" in the Oxfmt config to keep sorting them.',
  )
}

function readAssistActionLevel(
  value: BiomeAssistAction | boolean | 'recommended' | 'all' | 'none',
): 'on' | 'off' {
  if (typeof value === 'boolean') {
    return value ? 'on' : 'off'
  }

  if (typeof value === 'string') {
    return value === 'on' ? 'on' : 'off'
  }

  return value.level === 'on' ? 'on' : 'off'
}

/**
 * Translates the one `organizeImports` option Oxfmt has a counterpart for. Biome's `groups`
 * are matcher predicates (`:NODE:`, source globs) while Oxfmt's are a fixed list of group
 * names, so a faithful translation is not available and the ordering is reported as lost.
 */
function mapOrganizeImportsOptions(
  value: BiomeAssistAction | boolean | 'recommended' | 'all' | 'none',
  reporter: Reporter,
): NonNullable<OxfmtConfig['sortImports']> {
  const options =
    typeof value === 'object' && value.options && typeof value.options === 'object'
      ? (value.options as Record<string, unknown>)
      : undefined

  if (!options) {
    return {}
  }

  if (options.groups) {
    reporter.loss(
      'Biome assist action organizeImports option "groups" was not migrated; Biome\'s groups are matcher predicates while Oxfmt\'s are a fixed set of group names, so Oxfmt will sort imports into its default groups.',
    )
  }

  if (options.identifierOrder !== undefined && options.identifierOrder !== 'natural') {
    reporter.loss(
      `Biome assist action organizeImports option "identifierOrder": ${JSON.stringify(options.identifierOrder)} has no Oxfmt equivalent; Oxfmt sorts identifiers with its own order.`,
    )
  }

  return typeof options.sortBareImports === 'boolean'
    ? { sortSideEffects: options.sortBareImports }
    : {}
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
