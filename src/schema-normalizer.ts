import type { BiomeConfig, Reporter } from './types.js'

export function normalizeIncludeFields<T extends { include?: string[]; includes?: string[] }>(
  obj: T,
  fieldName: string,
  reporter: Reporter,
): string[] | undefined {
  if (obj.include && obj.includes) {
    reporter.warn(
      `Both 'include' and 'includes' found in ${fieldName}. Using 'include' and ignoring 'includes'.`,
    )
    return obj.include
  }

  if (obj.includes) {
    return obj.includes
  }

  return obj.include
}

export function normalizeBiomeConfig(config: BiomeConfig, reporter: Reporter): BiomeConfig {
  const normalized = { ...config }

  if (normalized.files) {
    const include = normalizeIncludeFields(normalized.files, 'files', reporter)
    normalized.files = {
      ...normalized.files,
      include,
      includes: undefined,
    }
  }

  if (normalized.linter) {
    const include = normalizeIncludeFields(normalized.linter, 'linter', reporter)
    normalized.linter = {
      ...normalized.linter,
      include,
      includes: undefined,
    }
  }

  if (normalized.formatter) {
    const include = normalizeIncludeFields(normalized.formatter, 'formatter', reporter)
    normalized.formatter = {
      ...normalized.formatter,
      include,
      includes: undefined,
    }
  }

  if (normalized.overrides) {
    normalized.overrides = normalized.overrides.map((override, index) => {
      const include = normalizeIncludeFields(override, `overrides[${index}]`, reporter)
      return {
        ...override,
        include,
        includes: undefined,
      }
    })
  }

  return normalized
}
