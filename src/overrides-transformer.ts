import { extractRulesFromBiomeConfig } from './rule-mapper.js'
import type { BiomeOverride, OxlintOverride, Reporter } from './types.js'

export interface OverrideTransformResult {
  overrides: OxlintOverride[]
  /** Distinct Biome rule names in overrides that produced at least one Oxlint rule. */
  sourceRulesConverted: Set<string>
  /** Distinct Biome rule names in overrides with no Oxlint equivalent. */
  sourceRulesSkipped: Set<string>
}

export function transformOverridesToOxlint(
  biomeOverrides: BiomeOverride[] | undefined,
  reporter: Reporter,
): OverrideTransformResult {
  const oxlintOverrides: OxlintOverride[] = []
  const sourceRulesConverted = new Set<string>()
  const sourceRulesSkipped = new Set<string>()

  if (!biomeOverrides || biomeOverrides.length === 0) {
    return { overrides: oxlintOverrides, sourceRulesConverted, sourceRulesSkipped }
  }

  for (const override of biomeOverrides) {
    if (!override.include || override.include.length === 0) {
      reporter.loss(
        'A Biome override without positive include patterns applies to every file; Oxlint overrides require a file glob, so this override was dropped.',
      )
      continue
    }

    if (override.linter?.enabled === false) {
      continue
    }

    const oxlintOverride: OxlintOverride = {
      files: override.include,
    }

    // `ignore` and negated `includes` exceptions both exclude files from the override.
    const excludeFiles = [...new Set([...(override.ignore ?? []), ...(override.exclude ?? [])])]

    if (excludeFiles.length > 0) {
      oxlintOverride.excludeFiles = excludeFiles
    }

    if (override.linter?.rules) {
      const { rules, categories, ...ruleStats } = extractRulesFromBiomeConfig(
        override.linter.rules,
        reporter,
      )

      for (const ruleName of ruleStats.sourceRulesConverted) {
        sourceRulesConverted.add(ruleName)
      }

      for (const ruleName of ruleStats.sourceRulesSkipped) {
        sourceRulesSkipped.add(ruleName)
      }

      if (Object.keys(rules).length > 0) {
        oxlintOverride.rules = rules
      }

      if (Object.keys(categories).length > 0) {
        reporter.loss(
          `Biome category presets in the override for ${override.include.join(', ')} cannot be represented by Oxlint overrides; those per-glob category severities are lost.`,
        )
      }
    }

    if (override.javascript?.globals) {
      const globals: Record<string, boolean | 'readonly' | 'writable' | 'off'> = {}

      for (const globalVar of override.javascript.globals) {
        globals[globalVar] = 'readonly'
      }

      if (Object.keys(globals).length > 0) {
        oxlintOverride.globals = globals
      }
    }

    oxlintOverrides.push(oxlintOverride)
  }

  return { overrides: oxlintOverrides, sourceRulesConverted, sourceRulesSkipped }
}

export function collectDisabledOxlintOverridePatterns(
  biomeOverrides: BiomeOverride[] | undefined,
): string[] {
  return (biomeOverrides ?? []).flatMap((override) =>
    override.linter?.enabled === false ? (override.include ?? []) : [],
  )
}
