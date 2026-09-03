import { describe, expect, it } from 'vitest'

import { transformOverridesToOxlint } from './overrides-transformer.js'
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

describe('generateOxlintConfig type-aware rule fallbacks', () => {
  const biomeConfig: BiomeConfig = {
    linter: {
      rules: {
        complexity: { useArrayFind: 'error' },
        nursery: { useIncludes: 'error', useStringStartsEndsWith: 'warn' },
      },
    },
  }

  it('substitutes non-type-aware rules when type-aware linting is off', () => {
    const reporter = new CollectingReporter()

    const { config } = generateOxlintConfig(biomeConfig, reporter)

    // Biome runs these three without type information, so the migration must not leave
    // coverage behind a tsgolint backend the generated config never turns on.
    expect(config.rules).toMatchObject({
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-includes': 'error',
      'unicorn/prefer-string-starts-ends-with': 'warn',
    })
    expect(config.rules?.['typescript/prefer-find']).toBeUndefined()
    expect(config.rules?.['typescript/prefer-includes']).toBeUndefined()
    expect(config.rules?.['typescript/prefer-string-starts-ends-with']).toBeUndefined()
  })

  it('keeps the type-aware rules when type-aware linting is on, so nothing reports twice', () => {
    const reporter = new CollectingReporter()

    const { config } = generateOxlintConfig(biomeConfig, reporter, { typeAware: true })

    expect(config.rules).toMatchObject({
      'typescript/prefer-find': 'error',
      'typescript/prefer-includes': 'error',
      'typescript/prefer-string-starts-ends-with': 'warn',
    })
    expect(config.rules?.['unicorn/prefer-array-find']).toBeUndefined()
    expect(config.rules?.['unicorn/prefer-includes']).toBeUndefined()
    expect(config.rules?.['unicorn/prefer-string-starts-ends-with']).toBeUndefined()
    expect(reporter.getLosses()).toEqual([])
  })

  it('reports the one fallback that covers less than the rule it replaces', () => {
    const reporter = new CollectingReporter()

    generateOxlintConfig(biomeConfig, reporter)

    const losses = reporter.getLosses()

    expect(losses).toHaveLength(1)
    expect(losses[0]).toContain('useStringStartsEndsWith')
    expect(losses[0]).toContain('unicorn/prefer-string-starts-ends-with')
  })

  it('applies the same substitution inside overrides', () => {
    const reporter = new CollectingReporter()

    const { overrides } = transformOverridesToOxlint(
      [{ include: ['src/**'], linter: { rules: { complexity: { useArrayFind: 'error' } } } }],
      reporter,
    )

    expect(overrides[0]?.rules).toMatchObject({ 'unicorn/prefer-array-find': 'error' })
  })
})
