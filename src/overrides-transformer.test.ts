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
  it('warns when biome override ignore patterns cannot be represented', () => {
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
        rules: {
          'no-var': 'error',
        },
      },
    ])
    expect(reporter.getWarnings()).toContain(
      'Biome override ignore patterns cannot be represented in Oxlint overrides and require manual review: src/**/*.ts',
    )
  })
})
