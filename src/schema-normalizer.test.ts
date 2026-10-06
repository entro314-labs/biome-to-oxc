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

  it('drops a re-include below a directory an earlier exception still excludes', () => {
    const reporter = new CollectingReporter()

    const { files } = normalizeBiomeConfig(
      {
        files: {
          includes: [
            '**',
            '!build/**',
            'build/keep.ts',
            'build/sub/keep.ts',
            '!lib',
            'lib/keep.ts',
            '!out/**',
            'out/sub',
            'out/sub/keep.ts',
          ],
        },
      },
      reporter,
    )

    // Biome stops at an excluded directory, so neither file below one is ever reached.
    // `out/sub` re-includes the directory itself, which makes `out/sub/keep.ts` reachable.
    expect(files?.exclude).toEqual([
      'build/**',
      '!build/keep.ts',
      '/lib',
      'out/**',
      '!out/sub',
      '!out/sub/keep.ts',
    ])
    expect(reporter.getLosses()).toEqual([])
    expect(reporter.getWarnings()).toHaveLength(2)
    expect(reporter.getWarnings()[0]).toContain('"build/sub/keep.ts" in files')
    expect(reporter.getWarnings()[0]).toContain('"build/sub"')
    expect(reporter.getWarnings()[1]).toContain('"lib/keep.ts" in files')
  })

  it('keeps a glob re-include that reaches some of its files', () => {
    const reporter = new CollectingReporter()

    const { files } = normalizeBiomeConfig(
      { files: { includes: ['**', '!lib/**', 'lib/**/keep.ts'] } },
      reporter,
    )

    expect(files?.exclude).toEqual(['lib/**', '!lib/**/keep.ts'])
    expect(reporter.getWarnings()).toEqual([])
  })

  it('lists only the leading patterns as the positive selection', () => {
    const reporter = new CollectingReporter()

    const { files } = normalizeBiomeConfig(
      { files: { includes: ['src/**', '!src/gen/**', 'src/gen/keep.ts'] } },
      reporter,
    )

    expect(files?.include).toEqual(['src/**'])
    expect(files?.exclude).toEqual(['src/gen/**', '!src/gen/keep.ts'])
  })

  it('splits an override even when a leading pattern is repeated as a re-include', () => {
    const reporter = new CollectingReporter()

    const { overrides } = normalizeBiomeConfig(
      { overrides: [{ includes: ['src/**', '!src/gen/**', 'src/**'] }] },
      reporter,
    )

    expect(overrides).toEqual([
      { include: ['src/**'], exclude: ['src/gen/**'], includes: undefined },
      { include: ['src/**'], exclude: undefined, includes: undefined },
    ])
  })

  it('leaves the canonical match-all plus exceptions form as plain exclusions', () => {
    const reporter = new CollectingReporter()

    const { files } = normalizeBiomeConfig({ files: { includes: ['**', '!dist/**'] } }, reporter)

    expect(files?.include).toBeUndefined()
    expect(files?.exclude).toEqual(['dist/**'])
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

describe('normalizeBiomeConfig patterns ending in a slash', () => {
  it('migrates no exclusion for an exception Biome matches against nothing', () => {
    const reporter = new CollectingReporter()

    const { files } = normalizeBiomeConfig(
      { files: { includes: ['**', '!out/', '!!tmp/', '!dist/**'] } },
      reporter,
    )

    expect(files?.exclude).toEqual(['dist/**'])
    // Nothing was force-ignored either, so there is no force-ignore loss to report.
    expect(reporter.getLosses()).toEqual([])
    expect(reporter.getWarnings()).toHaveLength(2)
    expect(reporter.getWarnings()[0]).toContain('"!out/" in files')
    expect(reporter.getWarnings()[0]).toContain('add "out/**"')
    expect(reporter.getWarnings()[1]).toContain('"!!tmp/" in files')
    expect(reporter.getWarnings()[1]).toContain('add "tmp/**"')
  })

  it('migrates no re-include for a positive pattern Biome matches against nothing', () => {
    const reporter = new CollectingReporter()

    const { files, overrides } = normalizeBiomeConfig(
      {
        files: { includes: ['**', '!out/**', 'out/'] },
        overrides: [{ includes: ['src/**', '!src/gen/**', 'src/gen/'] }],
      },
      reporter,
    )

    expect(files?.exclude).toEqual(['out/**'])
    expect(overrides).toEqual([
      { include: ['src/**'], exclude: ['src/gen/**'], includes: undefined },
    ])
    expect(reporter.getWarnings()).toHaveLength(2)
  })

  it('keeps a leading positive pattern, so the selection is still reported', () => {
    const reporter = new CollectingReporter()

    const { files } = normalizeBiomeConfig({ files: { includes: ['src/'] } }, reporter)

    expect(files?.include).toEqual(['src/'])
    expect(reporter.getWarnings()).toHaveLength(1)
    expect(reporter.getWarnings()[0]).toContain('"src/" in files')
  })
})

describe('normalizeBiomeConfig root anchoring of includes patterns', () => {
  it('anchors a top-level exception without a slash, which ignorePatterns matches at any depth', () => {
    const reporter = new CollectingReporter()

    const { files, linter } = normalizeBiomeConfig(
      {
        files: { includes: ['**', '!dist', '!*.gen.ts', '!pkg/out', '!**/tmp', 'keep.gen.ts'] },
        linter: { includes: ['**', '!!coverage'] },
      },
      reporter,
    )

    expect(files?.exclude).toEqual(['/dist', '/*.gen.ts', 'pkg/out', '**/tmp', '!/keep.gen.ts'])
    expect(linter?.exclude).toEqual(['/coverage'])
  })

  it('anchors override patterns without a slash with `./`, where a leading slash matches nothing', () => {
    const reporter = new CollectingReporter()

    const { overrides } = normalizeBiomeConfig(
      { overrides: [{ includes: ['*.ts', 'src/**', '!*.d.ts', '!**/*.gen.ts', './*.mts'] }] },
      reporter,
    )

    expect(overrides).toEqual([
      { include: ['./*.ts', 'src/**'], exclude: ['./*.d.ts', '**/*.gen.ts'], includes: undefined },
      { include: ['./*.mts'], exclude: undefined, includes: undefined },
    ])
    expect(reporter.getWarnings()).toEqual([])
  })

  it('leaves the legacy include and ignore fields, which Biome 1 matched at any depth', () => {
    const reporter = new CollectingReporter()

    const { files, overrides } = normalizeBiomeConfig(
      {
        files: { include: ['src'], ignore: ['dist'] },
        overrides: [{ include: ['*.ts'], ignore: ['gen'] }],
      },
      reporter,
    )

    expect(files).toMatchObject({ include: ['src'], ignore: ['dist'], exclude: undefined })
    expect(overrides?.[0]).toMatchObject({ include: ['*.ts'], ignore: ['gen'], exclude: undefined })
  })

  it('migrates nothing for a pattern Biome cannot match because of how it starts', () => {
    const reporter = new CollectingReporter()

    const { files } = normalizeBiomeConfig(
      { files: { includes: ['**', '!/gen', '!./out/**', '!build/**', '/build/keep.ts'] } },
      reporter,
    )

    expect(files?.exclude).toEqual(['build/**'])
    expect(reporter.getWarnings()).toHaveLength(3)
    expect(reporter.getWarnings()[0]).toContain('"!/gen" in files starts with "/"')
    expect(reporter.getWarnings()[0]).toContain('add "/gen"')
    expect(reporter.getWarnings()[1]).toContain('"!./out/**" in files starts with "./"')
    expect(reporter.getWarnings()[1]).toContain('add "out/**"')
    expect(reporter.getWarnings()[2]).toContain('"/build/keep.ts" in files starts with "/"')
  })
})

describe('joinExclusions', () => {
  it('puts the list carrying a re-include first, so it cannot lift the other list', () => {
    expect(joinExclusions(['dist/**'], ['gen/**', '!gen/keep.ts'])).toEqual([
      'gen/**',
      '!gen/keep.ts',
      'dist/**',
    ])
    expect(joinExclusions(['build/**', '!build/keep.ts'], ['gen/**'])).toEqual([
      'build/**',
      '!build/keep.ts',
      'gen/**',
    ])
    expect(joinExclusions(undefined, undefined)).toEqual([])
  })
})
