import { describe, expect, it } from 'vitest'

import {
  buildUnsupportedRuleFallbackSuggestions,
  collectUnsupportedBiomeRules,
  recommendJsPluginSpecifiersForUnsupportedRules,
} from './js-plugin-scaffolder.js'

describe('js-plugin-scaffolder fallback guidance', () => {
  it('collects and de-duplicates unsupported biome rule warnings', () => {
    const warnings = [
      'No Oxlint equivalent found for Biome rule: noReExportAll',
      'No Oxlint equivalent found for Biome rule: noReExportAll',
      'No Oxlint equivalent found for Biome rule: useSingleVarDeclarator',
      'Some unrelated warning',
    ]

    expect(collectUnsupportedBiomeRules(warnings)).toEqual([
      'noReExportAll',
      'useSingleVarDeclarator',
    ])
  })

  it('recommends plugin packages for unsupported rules with known JS-plugin fallbacks', () => {
    const unsupportedRules = ['noReExportAll', 'noRedundantUseStrict', 'useSingleVarDeclarator']

    expect(recommendJsPluginSpecifiersForUnsupportedRules(unsupportedRules)).toEqual([
      'eslint-plugin-import',
    ])
  })

  it('builds actionable fallback guidance entries for known unsupported rules', () => {
    const suggestions = buildUnsupportedRuleFallbackSuggestions([
      'noReExportAll',
      'noRedundantUseStrict',
      'useSingleVarDeclarator',
      'unknownRule',
    ])

    expect(suggestions).toContain('Fallback for noReExportAll:')
    expect(suggestions).toContain('  - JS plugin rule candidates: import/export')
    expect(suggestions).toContain('  - Suggested --js-plugin values: eslint-plugin-import')

    expect(suggestions).toContain('Fallback for noRedundantUseStrict:')
    expect(suggestions).toContain('Fallback for useSingleVarDeclarator:')

    expect(suggestions.some((line) => line.includes('unknownRule'))).toBe(false)
  })
})
