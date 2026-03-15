import { describe, expect, it } from 'vitest'

import { generateOxlintConfig } from './oxlint-generator.js'
import type { BiomeConfig, Reporter } from './types.js'

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

describe('generateOxlintConfig ignore pattern mapping', () => {
  it('merges .biomeignore alias patterns into ignorePatterns', () => {
    const reporter = new SilentReporter()
    const biomeConfig: BiomeConfig = {
      files: {
        ignore: ['dist/**'],
      },
      linter: {
        ignore: ['coverage/**'],
      },
    }

    const config = generateOxlintConfig(biomeConfig, reporter, {
      biomeIgnorePatterns: ['legacy/**', '!legacy/keep.js'],
    })

    expect(config.ignorePatterns).toEqual([
      'legacy/**',
      '!legacy/keep.js',
      'dist/**',
      'coverage/**',
    ])
  })

  it('does not emit ignorePatterns when nothing is configured', () => {
    const reporter = new SilentReporter()
    const config = generateOxlintConfig({}, reporter)

    expect(config.ignorePatterns).toBeUndefined()
  })
})
