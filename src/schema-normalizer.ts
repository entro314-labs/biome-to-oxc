import type { BiomeConfig, Reporter } from './types.js'

export interface NormalizedSelection {
  /** Positive selectors that narrow which files a tool processes. */
  include: string[] | undefined
  /** Negated `includes` exceptions (`!pattern`), which exclude files. */
  exclude: string[] | undefined
}

interface SelectionSource {
  include?: string[]
  includes?: string[]
}

/**
 * Splits a Biome selection into positive selectors and negated exceptions.
 *
 * Biome 2.x `includes` mixes both: a bare pattern selects files, `!pattern` excludes
 * them again, and `!!pattern` force-ignores a path at the scanner level. The legacy
 * `include` field carries positive selectors only.
 */
export function normalizeIncludeFields(
  obj: SelectionSource,
  fieldName: string,
  reporter: Reporter,
): NormalizedSelection {
  if (obj.include && obj.includes) {
    reporter.warn(
      `Both 'include' and 'includes' found in ${fieldName}. Using 'include' and ignoring 'includes'.`,
    )
    return { include: obj.include, exclude: undefined }
  }

  if (obj.includes) {
    return splitIncludes(obj.includes, fieldName, reporter)
  }

  return { include: obj.include, exclude: undefined }
}

function splitIncludes(
  includes: string[],
  fieldName: string,
  reporter: Reporter,
): NormalizedSelection {
  const include: string[] = []
  const exclude: string[] = []

  for (const pattern of includes) {
    if (pattern.startsWith('!!')) {
      // Force-ignore removes a path from Biome's scanner entirely. Oxc has no
      // scanner-level equivalent, so the closest representation is a plain ignore.
      exclude.push(pattern.slice(2))
      reporter.loss(
        `Biome force-ignore pattern "${pattern}" in ${fieldName} was migrated as a plain ignore; Oxc has no scanner-level force-ignore, so files reachable through other tooling paths may still be processed.`,
      )
      continue
    }

    if (pattern.startsWith('!')) {
      exclude.push(pattern.slice(1))
      continue
    }

    include.push(pattern)
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
    normalized.linter = { ...normalized.linter, include, exclude, includes: undefined }
  }

  if (normalized.formatter) {
    const { include, exclude } = withoutMatchAllSelection(
      normalizeIncludeFields(normalized.formatter, 'formatter', reporter),
    )
    normalized.formatter = { ...normalized.formatter, include, exclude, includes: undefined }
  }

  if (normalized.overrides) {
    normalized.overrides = normalized.overrides.map((override, index) => {
      const { include, exclude } = normalizeIncludeFields(override, `overrides[${index}]`, reporter)
      return { ...override, include, exclude, includes: undefined }
    })
  }

  return normalized
}
