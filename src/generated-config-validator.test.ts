import { describe, expect, it } from 'vitest'

import { validateGeneratedConfigs } from './generated-config-validator.js'

describe('validateGeneratedConfigs', () => {
  it('accepts patterns that stay inside the config directory', () => {
    const problems = validateGeneratedConfigs(
      {
        ignorePatterns: ['dist/**', '**/*.generated.ts'],
        overrides: [{ files: ['src/**/*.ts'], excludeFiles: ['src/vendor/**'] }],
      },
      { ignorePatterns: ['coverage/**'] },
    )

    expect(problems).toEqual([])
  })

  it('rejects parent traversal, which both target tools refuse to load', () => {
    const problems = validateGeneratedConfigs(
      { ignorePatterns: ['../../dist/**'] },
      { overrides: [{ files: ['../src/**/*.ts'] }] },
    )

    expect(problems).toEqual([
      '.oxlintrc.json: ignorePatterns pattern "../../dist/**" escapes the config directory with "..", which Oxlint and Oxfmt reject',
      '.oxfmtrc.jsonc: overrides[0].files pattern "../src/**/*.ts" escapes the config directory with "..", which Oxlint and Oxfmt reject',
    ])
  })

  it('rejects absolute patterns', () => {
    const problems = validateGeneratedConfigs({ ignorePatterns: ['/etc/**'] }, {})

    expect(problems).toEqual([
      '.oxlintrc.json: ignorePatterns pattern "/etc/**" is an absolute path, but patterns are resolved within the config directory',
    ])
  })

  it('checks the pattern body of negated entries', () => {
    const problems = validateGeneratedConfigs({ ignorePatterns: ['!../keep.js'] }, {})

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('escapes the config directory')
  })
})
