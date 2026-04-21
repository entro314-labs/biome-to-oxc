import { describe, expect, it } from 'vitest'

import { generateOxfmtOverrides } from './oxfmt-overrides.js'
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

describe('generateOxfmtOverrides', () => {
  it('maps json formatter overrides when include patterns are json-specific', () => {
    const reporter = new SilentReporter()

    const overrides = generateOxfmtOverrides(
      [
        {
          include: ['**/*.json'],
          ignore: ['**/generated/*.json'],
          json: {
            formatter: {
              indentStyle: 'space',
              indentWidth: 4,
              trailingCommas: 'all',
            },
          },
        },
      ],
      reporter,
    )

    expect(overrides).toEqual([
      {
        files: ['**/*.json'],
        excludeFiles: ['**/generated/*.json'],
        options: {
          useTabs: false,
          tabWidth: 4,
          trailingComma: 'all',
        },
      },
    ])
    expect(reporter.getWarnings()).toEqual([])
  })

  it('warns instead of broadening scope for domain-specific formatter overrides', () => {
    const reporter = new SilentReporter()

    const overrides = generateOxfmtOverrides(
      [
        {
          include: ['src/**/*'],
          css: {
            formatter: {
              quoteStyle: 'single',
            },
          },
        },
      ],
      reporter,
    )

    expect(overrides).toEqual([])
    expect(reporter.getWarnings()).toEqual([
      'Skipping css.formatter override because Oxfmt overrides are file-glob based and these include patterns are not css-specific: src/**/*',
    ])
  })
})
