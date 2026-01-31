import type { BiomeOverride, OxlintOverride, Reporter } from './types.js';
import { extractRulesFromBiomeConfig } from './rule-mapper.js';

export function transformOverridesToOxlint(
  biomeOverrides: BiomeOverride[] | undefined,
  reporter: Reporter,
): OxlintOverride[] {
  if (!biomeOverrides || biomeOverrides.length === 0) {
    return [];
  }

  const oxlintOverrides: OxlintOverride[] = [];

  for (const override of biomeOverrides) {
    if (!override.include || override.include.length === 0) {
      reporter.warn('Skipping override without include patterns');
      continue;
    }

    const oxlintOverride: OxlintOverride = {
      files: override.include,
    };

    if (override.linter?.rules) {
      const { rules, categories } = extractRulesFromBiomeConfig(override.linter.rules, reporter);

      if (Object.keys(rules).length > 0) {
        oxlintOverride.rules = rules;
      }

      if (Object.keys(categories).length > 0) {
        oxlintOverride.categories = categories;
      }
    }

    if (override.javascript?.globals) {
      const globals: Record<string, boolean | 'readonly' | 'writable' | 'off'> = {};

      for (const globalVar of override.javascript.globals) {
        globals[globalVar] = 'readonly';
      }

      if (Object.keys(globals).length > 0) {
        oxlintOverride.globals = globals;
      }
    }

    oxlintOverrides.push(oxlintOverride);
  }

  return oxlintOverrides;
}
