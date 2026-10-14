import { describe, expect, it } from 'vitest'

import { generatePrettierMigrationSuggestions } from './prettier-detector.js'
import { CollectingReporter } from './reporter.js'

describe('generatePrettierMigrationSuggestions', () => {
  it('has the generated Oxfmt config moved aside, since oxfmt --migrate refuses to overwrite one', () => {
    const suggestions = generatePrettierMigrationSuggestions(
      '/project/.prettierrc.json',
      new CollectingReporter(),
    ).join('\n')

    expect(suggestions).toContain('pnpm exec oxfmt --migrate=prettier')
    expect(suggestions).toContain('.oxfmtrc.json')
    expect(suggestions).not.toContain('.oxfmtrc.jsonc with equivalent settings')
    expect(suggestions).toMatch(/refuses to run while an Oxfmt config exists/)
  })

  it.each(['.prettierrc.yaml', '.prettierrc.yml', '.prettierrc.json5'])(
    'asks for %s to be converted, since oxfmt --migrate reads only JSON, JS and TS',
    (name) => {
      const suggestions = generatePrettierMigrationSuggestions(
        `/project/${name}`,
        new CollectingReporter(),
      ).join('\n')

      expect(suggestions).toContain(`Convert ${name} to JSON`)
    },
  )

  it('warns that an extensionless .prettierrc is read as JSON', () => {
    const suggestions = generatePrettierMigrationSuggestions(
      '/project/.prettierrc',
      new CollectingReporter(),
    ).join('\n')

    expect(suggestions).toContain('If .prettierrc is written in YAML, convert it to JSON')
  })

  it('does not ask for a JSON or JS config to be converted', () => {
    for (const name of ['.prettierrc.json', 'prettier.config.mjs']) {
      const suggestions = generatePrettierMigrationSuggestions(
        `/project/${name}`,
        new CollectingReporter(),
      ).join('\n')

      expect(suggestions).not.toMatch(/convert/i)
    }
  })
})
