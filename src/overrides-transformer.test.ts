import { describe, expect, it } from 'vitest'

import { transformOverridesToOxlint } from './overrides-transformer.js'
import { CollectingReporter } from './reporter.js'

describe('transformOverridesToOxlint', () => {
  it('maps biome override ignore patterns to Oxlint excludeFiles', () => {
    const reporter = new CollectingReporter()

    const { overrides } = transformOverridesToOxlint(
      [
        {
          include: ['src/**/*.ts'],
          ignore: ['src/generated/**'],
          linter: {
            rules: {
              style: {
                noVar: 'error',
              },
            },
          },
        },
      ],
      reporter,
    )

    expect(overrides).toEqual([
      {
        files: ['src/**/*.ts'],
        excludeFiles: ['src/generated/**'],
        rules: {
          'no-var': 'error',
        },
      },
    ])
    expect(reporter.getWarnings()).toEqual([])
  })

  it('does not emit schema-invalid categories in Oxlint overrides', () => {
    const reporter = new CollectingReporter()

    const { overrides } = transformOverridesToOxlint(
      [
        {
          include: ['tests/**'],
          linter: { rules: { suspicious: { recommended: false, noDebugger: 'off' } } },
        },
      ],
      reporter,
    )

    expect(overrides).toEqual([{ files: ['tests/**'], rules: { 'no-debugger': 'off' } }])
    expect(reporter.getWarnings()).toContain(
      'Biome category presets in the override for tests/** cannot be represented by Oxlint overrides; those per-glob category severities are lost.',
    )
  })
})
