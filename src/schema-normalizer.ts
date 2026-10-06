import type { BiomeConfig, BiomeOverride, Reporter } from './types.js'

export interface NormalizedSelection {
  /** Positive selectors that narrow which files a tool processes. */
  include: string[] | undefined
  /**
   * Exclusions in source order, read the way `ignorePatterns` reads them: a negated
   * `includes` exception (`!pattern`) is listed as `pattern`, and a positive pattern that
   * follows one as `!pattern`, because Biome lets it select files the exception removed.
   */
  exclude: string[] | undefined
}

interface SelectionSource {
  include?: string[]
  includes?: string[]
}

/** Where a selection's patterns end up: top-level `ignorePatterns`, or an override's globs. */
type PatternTarget = 'ignorePatterns' | 'override'

/**
 * Biome 2 anchors every `includes` pattern at the config root, so `dist` and `*.gen.ts` only
 * match there. Oxlint and Oxfmt match a pattern without a `/` at any depth, and anchor one
 * with a leading `/` in `ignorePatterns` but with `./` in an override's `files` and
 * `excludeFiles`, where a leading `/` matches nothing.
 */
function anchorAtRoot(pattern: string, target: PatternTarget): string {
  if (pattern.includes('/') || pattern === '**') {
    return pattern
  }

  return `${target === 'ignorePatterns' ? '/' : './'}${pattern}`
}

/** Why Biome 2 matches `pattern` against no path, if it does. */
function findUnmatchableReason(pattern: string): string | undefined {
  const body = pattern.replace(/^!{1,2}/u, '')

  if (body.endsWith('/')) {
    return 'ends with "/"'
  }

  if (body.startsWith('/')) {
    return 'starts with "/"'
  }

  // Biome drops a leading `./` from a positive pattern only.
  return body !== pattern && body.startsWith('./') ? 'starts with "./"' : undefined
}

/**
 * Splits a Biome selection into positive selectors and negated exceptions.
 *
 * Biome 2.x `includes` mixes both: a bare pattern selects files, `!pattern` excludes
 * them again, and `!!pattern` force-ignores a path at the scanner level. The patterns
 * apply in order, so a bare pattern after an exception re-includes what it matches, and a
 * pattern ending in `/` matches nothing. The legacy `include` field carries positive
 * selectors only.
 */
export function normalizeIncludeFields(
  obj: SelectionSource,
  fieldName: string,
  reporter: Reporter,
  target: PatternTarget = 'ignorePatterns',
): NormalizedSelection {
  if (obj.include && obj.includes) {
    reporter.warn(
      `Both 'include' and 'includes' found in ${fieldName}. Using 'include' and ignoring 'includes'.`,
    )
    return { include: obj.include, exclude: undefined }
  }

  if (obj.includes) {
    return splitIncludes(obj.includes, fieldName, reporter, target)
  }

  return { include: obj.include, exclude: undefined }
}

function splitIncludes(
  includes: string[],
  fieldName: string,
  reporter: Reporter,
  target: PatternTarget,
): NormalizedSelection {
  const include: string[] = []
  const exclude: string[] = []

  for (const pattern of includes) {
    // Carrying over a pattern Biome matches against no path would exclude, or select, files
    // Biome treats differently: `ignorePatterns` reads `out/` and `/out` as the directory.
    const unmatchable = findUnmatchableReason(pattern)

    if (unmatchable && pattern.startsWith('!')) {
      const body = pattern.replace(/^!{1,2}/u, '')
      const intended = anchorAtRoot(
        `${body.replace(/^\.?\//u, '')}${body.endsWith('/') ? '**' : ''}`,
        target,
      )
      const destination =
        target === 'ignorePatterns'
          ? 'the Oxlint and Oxfmt ignorePatterns'
          : 'the excludeFiles of the migrated override'

      reporter.warn(
        `Biome exception "${pattern}" in ${fieldName} ${unmatchable} and matches no file in Biome, so it excludes nothing and nothing was migrated for it. If the path was meant to be excluded, add "${intended}" to ${destination}.`,
      )
      continue
    }

    if (unmatchable) {
      reporter.warn(
        `Biome pattern "${pattern}" in ${fieldName} ${unmatchable} and matches no file in Biome, so it selects nothing.`,
      )
    }

    if (pattern.startsWith('!!')) {
      // Force-ignore removes a path from Biome's scanner entirely. Oxc has no
      // scanner-level equivalent, so the closest representation is a plain ignore.
      exclude.push(anchorAtRoot(pattern.slice(2), target))
      reporter.loss(
        `Biome force-ignore pattern "${pattern}" in ${fieldName} was migrated as a plain ignore; Oxc has no scanner-level force-ignore, so files reachable through other tooling paths may still be processed.`,
      )
      continue
    }

    if (pattern.startsWith('!')) {
      exclude.push(anchorAtRoot(pattern.slice(1), target))
      continue
    }

    const anchored = unmatchable ? pattern : anchorAtRoot(pattern.replace(/^\.\//u, ''), target)

    // A top-level selection is only ever reported, so it keeps the spelling the config used.
    // One that matches nothing is kept too, so the positive selection is still reported.
    include.push(target === 'override' ? anchored : pattern)

    if (exclude.length > 0 && !unmatchable) {
      exclude.push(`!${anchored}`)
    }
  }

  return {
    include: include.length > 0 ? include : undefined,
    exclude: exclude.length > 0 ? exclude : undefined,
  }
}

/** Patterns that select every file, which Biome 2.x configs list before their `!` exceptions. */
const MATCH_ALL_PATTERNS = new Set(['**', '**/*'])

/**
 * Drops a positive selection that already selects every file. `["**", "!dist"]` is Biome's
 * canonical way to exclude a directory, and the positive part narrows nothing, so keeping
 * it would report an unrepresentable include selection for a config that has none.
 */
function withoutMatchAllSelection(selection: NormalizedSelection): NormalizedSelection {
  return selection.include?.some((pattern) => MATCH_ALL_PATTERNS.has(pattern))
    ? { ...selection, include: undefined }
    : selection
}

function isReinclude(pattern: string): boolean {
  return pattern.startsWith('!')
}

/**
 * Joins the `files` exclusions with a tool's own for one `ignorePatterns` list. A `!` entry
 * lifts every earlier pattern it matches, so the list carrying one goes first and cannot lift
 * the other list's exclusions. `normalizeBiomeConfig` leaves at most one of the two with any.
 */
export function joinExclusions(filesExclude: string[] = [], toolExclude: string[] = []): string[] {
  return toolExclude.some(isReinclude)
    ? [...toolExclude, ...filesExclude]
    : [...filesExclude, ...toolExclude]
}

/**
 * `files.includes` bounds what a tool's own `includes` can select, but both end up in one
 * `ignorePatterns` list, where a re-include from either would lift the other's exclusions.
 * When both carry re-includes only those of `files` are kept.
 */
function withoutToolReincludes(
  exclude: string[] | undefined,
  fieldName: string,
  filesExclude: string[] | undefined,
  reporter: Reporter,
): string[] | undefined {
  const reincludes = exclude?.filter(isReinclude) ?? []

  if (!exclude || reincludes.length === 0 || !filesExclude?.some(isReinclude)) {
    return exclude
  }

  reporter.loss(
    `Biome ${fieldName}.includes re-includes ${reincludes.map((pattern) => pattern.slice(1)).join(', ')} after a negated pattern, and files.includes re-includes files too; one ignorePatterns list cannot keep the two sets of exceptions apart, so the files ${fieldName}.includes re-includes stay excluded.`,
  )
  return exclude.filter((pattern) => !isReinclude(pattern))
}

/**
 * Splits an override selection that re-includes files into selections that need no
 * re-include. An override's `excludeFiles` cannot carry an exception to an exclusion, but
 * Biome selects a file when the last pattern matching it is a positive one, which is the
 * union of every positive pattern less the exceptions listed after it. So the patterns
 * ahead of the first exception keep every exception, and each run of re-includes keeps
 * only the exceptions that follow it.
 */
function splitReincludes(selection: NormalizedSelection): NormalizedSelection[] {
  const ordered = selection.exclude ?? []

  if (!ordered.some(isReinclude)) {
    return [selection]
  }

  const exceptionsFrom = (index: number): string[] | undefined => {
    const exceptions = ordered.slice(index).filter((pattern) => !isReinclude(pattern))
    return exceptions.length > 0 ? exceptions : undefined
  }
  const reincluded = new Set(ordered.filter(isReinclude).map((pattern) => pattern.slice(1)))
  const leading = selection.include?.filter((pattern) => !reincluded.has(pattern)) ?? []
  const selections: NormalizedSelection[] =
    leading.length > 0 ? [{ include: leading, exclude: exceptionsFrom(0) }] : []

  let run: string[] | undefined

  for (const [index, pattern] of ordered.entries()) {
    if (!isReinclude(pattern)) {
      run = undefined
      continue
    }

    if (!run) {
      run = []
      selections.push({ include: run, exclude: exceptionsFrom(index) })
    }

    run.push(pattern.slice(1))
  }

  return selections
}

export function normalizeBiomeConfig(config: BiomeConfig, reporter: Reporter): BiomeConfig {
  const normalized = { ...config }

  if (normalized.files) {
    const { include, exclude } = withoutMatchAllSelection(
      normalizeIncludeFields(normalized.files, 'files', reporter),
    )
    normalized.files = { ...normalized.files, include, exclude, includes: undefined }
  }

  if (normalized.linter) {
    const { include, exclude } = withoutMatchAllSelection(
      normalizeIncludeFields(normalized.linter, 'linter', reporter),
    )
    normalized.linter = {
      ...normalized.linter,
      include,
      exclude: withoutToolReincludes(exclude, 'linter', normalized.files?.exclude, reporter),
      includes: undefined,
    }
  }

  if (normalized.formatter) {
    const { include, exclude } = withoutMatchAllSelection(
      normalizeIncludeFields(normalized.formatter, 'formatter', reporter),
    )
    normalized.formatter = {
      ...normalized.formatter,
      include,
      exclude: withoutToolReincludes(exclude, 'formatter', normalized.files?.exclude, reporter),
      includes: undefined,
    }
  }

  if (normalized.overrides) {
    const overrides: BiomeOverride[] = []

    for (const [index, override] of normalized.overrides.entries()) {
      const selection = normalizeIncludeFields(
        override,
        `overrides[${index}]`,
        reporter,
        'override',
      )

      for (const { include, exclude } of splitReincludes(selection)) {
        overrides.push({ ...override, include, exclude, includes: undefined })
      }
    }

    normalized.overrides = overrides
  }

  return normalized
}
