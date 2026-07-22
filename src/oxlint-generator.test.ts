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

  it('disables every Oxlint category when the Biome linter is disabled', () => {
    const reporter = new SilentReporter()
    const config = generateOxlintConfig(
      { linter: { enabled: false }, javascript: { linter: { enabled: false } } },
      reporter,
      { enableImportGraph: true },
    )

    expect(config.categories).toEqual({
      correctness: 'off',
      nursery: 'off',
      pedantic: 'off',
      perf: 'off',
      restriction: 'off',
      style: 'off',
      suspicious: 'off',
    })
    expect(config.rules).toBeUndefined()
  })

  it('makes Biome default recommended behavior explicit and visible', () => {
    const reporter = new SilentReporter()
    const config = generateOxlintConfig({}, reporter)

    expect(config.categories).toMatchObject({ correctness: 'warn', suspicious: 'warn' })
    expect(reporter.getWarnings().some((message) => message.includes('was approximated'))).toBe(
      true,
    )
  })

  it('emits stable root configuration for type-aware linting and type checking', () => {
    const reporter = new SilentReporter()

    expect(generateOxlintConfig({}, reporter, { typeAware: true }).options).toEqual({
      typeAware: true,
    })
    expect(generateOxlintConfig({}, reporter, { typeCheck: true }).options).toEqual({
      typeAware: true,
      typeCheck: true,
    })
  })
})
