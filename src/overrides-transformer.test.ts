import { describe, expect, it } from 'vitest'

import { transformOverridesToOxlint } from './overrides-transformer.js'
import type { Reporter } from './types.js'

class SilentReporter implements Reporter {
  private readonly warnings: string[] = []
  private readonly errors: string[] = []

  warn(message: string): void {
    this.warnings.push(message)
  }

  error(message: string): void {
    this.errors.push(message)
  }

  info(_message: string): void {}

  getWarnings(): string[] {
    return this.warnings
  }

  getErrors(): string[] {
    return this.errors
  }
}

describe('transformOverridesToOxlint', () => {
  it('maps biome override ignore patterns to Oxlint excludeFiles', () => {
    const reporter = new SilentReporter()

    const overrides = transformOverridesToOxlint(
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
    const reporter = new SilentReporter()

    const overrides = transformOverridesToOxlint(
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
      'Biome category presets in the override for tests/** cannot be represented by Oxlint overrides and require manual review.',
    )
  })
})
