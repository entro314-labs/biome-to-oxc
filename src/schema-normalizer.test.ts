import { describe, expect, it } from 'vitest'

import { CollectingReporter } from './reporter.js'
import { joinExclusions, normalizeBiomeConfig } from './schema-normalizer.js'

describe('normalizeBiomeConfig re-includes after a negated pattern', () => {
  it('keeps a pattern listed after an exception as a `!` entry, in source order', () => {
    const reporter = new CollectingReporter()

    const { files } = normalizeBiomeConfig(
      { files: { includes: ['**', '!build/**', 'build/keep.ts', '!**/*.test.ts'] } },
      reporter,
    )

    expect(files?.include).toBeUndefined()
    expect(files?.exclude).toEqual(['build/**', '!build/keep.ts', '**/*.test.ts'])
    expect(reporter.getLosses()).toEqual([])
  })

  it('leaves the canonical match-all plus exceptions form as plain exclusions', () => {
    const reporter = new CollectingReporter()

    const { files } = normalizeBiomeConfig({ files: { includes: ['**', '!dist'] } }, reporter)

    expect(files?.include).toBeUndefined()
    expect(files?.exclude).toEqual(['dist'])
  })

  it('splits an override that re-includes files into overrides excludeFiles can express', () => {
    const reporter = new CollectingReporter()

    const { overrides } = normalizeBiomeConfig(
      {
        overrides: [
          {
            includes: ['src/**', '!src/gen/**', 'src/gen/keep.ts', 'src/gen/also.ts', '!**/*.d.ts'],
            formatter: { lineWidth: 120 },
          },
        ],
      },
      reporter,
    )

    expect(overrides).toEqual([
      {
        include: ['src/**'],
        exclude: ['src/gen/**', '**/*.d.ts'],
        includes: undefined,
        formatter: { lineWidth: 120 },
      },
      {
        include: ['src/gen/keep.ts', 'src/gen/also.ts'],
        exclude: ['**/*.d.ts'],
        includes: undefined,
        formatter: { lineWidth: 120 },
      },
    ])
    expect(reporter.getLosses()).toEqual([])
  })

  it('leaves an override without a re-include as one override', () => {
    const reporter = new CollectingReporter()

    const { overrides } = normalizeBiomeConfig(
      { overrides: [{ includes: ['src/**', '!src/gen/**'] }] },
      reporter,
    )

    expect(overrides).toEqual([
      { include: ['src/**'], exclude: ['src/gen/**'], includes: undefined },
    ])
  })

  it('keeps the re-includes of files and reports those of a tool when both carry some', () => {
    const reporter = new CollectingReporter()

    const { files, formatter, linter } = normalizeBiomeConfig(
      {
        files: { includes: ['**', '!build/**', 'build/keep.ts'] },
        formatter: { includes: ['**', '!gen/**', 'gen/keep.ts'] },
        linter: { includes: ['**', '!vendor/**'] },
      },
      reporter,
    )

    expect(files?.exclude).toEqual(['build/**', '!build/keep.ts'])
    expect(formatter?.exclude).toEqual(['gen/**'])
    expect(linter?.exclude).toEqual(['vendor/**'])
    expect(reporter.getLosses()).toHaveLength(1)
    expect(reporter.getLosses()[0]).toContain('gen/keep.ts')
  })
})

describe('joinExclusions', () => {
  it('puts the list carrying a re-include first, so it cannot lift the other list', () => {
    expect(joinExclusions(['dist'], ['gen/**', '!gen/keep.ts'])).toEqual([
      'gen/**',
      '!gen/keep.ts',
      'dist',
    ])
    expect(joinExclusions(['build/**', '!build/keep.ts'], ['gen/**'])).toEqual([
      'build/**',
      '!build/keep.ts',
      'gen/**',
    ])
    expect(joinExclusions(undefined, undefined)).toEqual([])
  })
})
