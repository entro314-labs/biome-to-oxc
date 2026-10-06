import { describe, expect, it } from 'vitest'

import {
  buildUnsupportedRuleFallbackSuggestions,
  collectUnsupportedBiomeRules,
  recommendJsPluginSpecifiersForUnsupportedRules,
} from './js-plugin-scaffolder.js'
import { getMappedBiomeRuleNames } from './rule-mapper.js'

describe('js-plugin-scaffolder fallback guidance', () => {
  it('collects and de-duplicates unsupported biome rule warnings', () => {
    const warnings = [
      'No Oxlint equivalent found for Biome rule: noReExportAll',
      'No Oxlint equivalent found for Biome rule: noReExportAll',
      'No Oxlint equivalent found for Biome rule: noRedundantUseStrict',
      'Some unrelated warning',
    ]

    expect(collectUnsupportedBiomeRules(warnings)).toEqual([
      'noReExportAll',
      'noRedundantUseStrict',
    ])
  })

  it('recommends plugin packages for unsupported rules with known JS-plugin fallbacks', () => {
    const unsupportedRules = ['noReExportAll', 'noRedundantUseStrict']

    expect(recommendJsPluginSpecifiersForUnsupportedRules(unsupportedRules)).toEqual([
      'eslint-plugin-import',
    ])
  })

  it('builds actionable fallback guidance entries for known unsupported rules', () => {
    const suggestions = buildUnsupportedRuleFallbackSuggestions([
      'noReExportAll',
      'noRedundantUseStrict',
      'unknownRule',
    ])

    expect(suggestions).toContain('Fallback for noReExportAll:')
    expect(suggestions).toContain('  - JS plugin rule candidates: import/export')
    expect(suggestions).toContain('  - Suggested --js-plugin values: eslint-plugin-import')

    expect(suggestions).toContain('Fallback for noRedundantUseStrict:')

    expect(suggestions.some((line) => line.includes('unknownRule'))).toBe(false)
  })

  it('points at the closest native rules for Biome rules that have no equivalent', () => {
    const suggestions = buildUnsupportedRuleFallbackSuggestions(['noDeprecatedImports', 'noForIn'])

    expect(suggestions).toContain('  - Native alternatives: typescript/no-deprecated')
    expect(suggestions).toContain(
      '  - Native alternatives: guard-for-in, typescript/no-for-in-array',
    )
    // Neither is an equivalent, so no JS plugin is suggested and the note says what differs.
    expect(
      recommendJsPluginSpecifiersForUnsupportedRules(['noDeprecatedImports', 'noForIn']),
    ).toEqual([])
    expect(suggestions.filter((line) => line.startsWith('  - Note:'))).toHaveLength(2)
  })

  it('carries no fallback guidance for Biome rules that now map to a native Oxlint rule', () => {
    expect(buildUnsupportedRuleFallbackSuggestions(getMappedBiomeRuleNames())).toEqual([])
  })
})
