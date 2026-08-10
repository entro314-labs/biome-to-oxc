import { describe, expect, it } from 'vitest'

import { generateOxlintConfig } from './oxlint-generator.js'
import { CollectingReporter } from './reporter.js'
import type { BiomeConfig } from './types.js'

describe('generateOxlintConfig ignore pattern mapping', () => {
  it('merges .biomeignore alias patterns into ignorePatterns', () => {
    const reporter = new CollectingReporter()
    const biomeConfig: BiomeConfig = {
      files: {
        ignore: ['dist/**'],
      },
      linter: {
        ignore: ['coverage/**'],
      },
    }

    const { config } = generateOxlintConfig(biomeConfig, reporter, {
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
    const reporter = new CollectingReporter()
    const { config } = generateOxlintConfig({}, reporter)

    expect(config.ignorePatterns).toBeUndefined()
  })

  it('disables every Oxlint category when the Biome linter is disabled', () => {
    const reporter = new CollectingReporter()
    const { config } = generateOxlintConfig(
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
    const reporter = new CollectingReporter()
    const { config } = generateOxlintConfig({}, reporter)

    expect(config.categories).toMatchObject({ correctness: 'warn', suspicious: 'warn' })
    expect(reporter.getWarnings().some((message) => message.includes('was approximated'))).toBe(
      true,
    )
  })

  it('emits stable root configuration for type-aware linting and type checking', () => {
    const reporter = new CollectingReporter()

    expect(generateOxlintConfig({}, reporter, { typeAware: true }).config.options).toEqual({
      typeAware: true,
    })
    expect(generateOxlintConfig({}, reporter, { typeCheck: true }).config.options).toEqual({
      typeAware: true,
      typeCheck: true,
    })
  })
})
