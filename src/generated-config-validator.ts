import type { OxfmtConfig, OxlintConfig } from './types.js'

/**
 * Structural validation of the generated configs against constraints both target tools
 * enforce at load time.
 *
 * Oxlint and Oxfmt resolve glob patterns relative to the directory holding the config
 * file and reject `..` outright: "Invalid pattern `../x` in `ignorePatterns`: `..` is not
 * supported, patterns are resolved within the config file's directory". Emitting such a
 * config produces files that neither tool can load, so the migration must catch it before
 * it deletes the Biome setup those configs are meant to replace.
 */
export function validateGeneratedConfigs(
  oxlintConfig: OxlintConfig,
  oxfmtConfig: OxfmtConfig,
): string[] {
  return [
    ...validatePatternGroups('.oxlintrc.json', collectOxlintPatternGroups(oxlintConfig)),
    ...validatePatternGroups('.oxfmtrc.jsonc', collectOxfmtPatternGroups(oxfmtConfig)),
  ]
}

interface PatternGroup {
  field: string
  patterns: string[] | undefined
}

function collectOxlintPatternGroups(config: OxlintConfig): PatternGroup[] {
  return [
    { field: 'ignorePatterns', patterns: config.ignorePatterns },
    ...(config.overrides ?? []).flatMap((override, index) => [
      { field: `overrides[${index}].files`, patterns: override.files },
      { field: `overrides[${index}].excludeFiles`, patterns: override.excludeFiles },
    ]),
  ]
}

function collectOxfmtPatternGroups(config: OxfmtConfig): PatternGroup[] {
  return [
    { field: 'ignorePatterns', patterns: config.ignorePatterns },
    ...(config.overrides ?? []).flatMap((override, index) => [
      { field: `overrides[${index}].files`, patterns: override.files },
      { field: `overrides[${index}].excludeFiles`, patterns: override.excludeFiles },
    ]),
  ]
}

function validatePatternGroups(configName: string, groups: PatternGroup[]): string[] {
  const problems: string[] = []

  for (const { field, patterns } of groups) {
    for (const pattern of patterns ?? []) {
      const problem = findPatternProblem(pattern)

      if (problem) {
        problems.push(`${configName}: ${field} pattern "${pattern}" ${problem}`)
      }
    }
  }

  return problems
}

function findPatternProblem(pattern: string): string | undefined {
  const body = pattern.startsWith('!') ? pattern.slice(1) : pattern

  if (body.split('/').includes('..')) {
    return 'escapes the config directory with "..", which Oxlint and Oxfmt reject'
  }

  if (body.startsWith('/') || /^[A-Za-z]:[/\\]/u.test(body)) {
    return 'is an absolute path, but patterns are resolved within the config directory'
  }

  return undefined
}
