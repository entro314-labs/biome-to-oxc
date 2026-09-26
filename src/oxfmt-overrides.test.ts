import { describe, expect, it } from 'vitest'

import { generateOxfmtOverrides } from './oxfmt-overrides.js'
import { CollectingReporter } from './reporter.js'

describe('generateOxfmtOverrides', () => {
  it('maps json formatter overrides when include patterns are json-specific', () => {
    const reporter = new CollectingReporter()

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
    const reporter = new CollectingReporter()

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
      'Biome css.formatter settings for src/**/* were dropped: Oxfmt overrides select by file glob, and these patterns are not css-specific, so applying them would also reformat other languages.',
    ])
  })

  it('maps per-override graphql.formatter options for GraphQL-only globs', () => {
    const reporter = new CollectingReporter()

    const overrides = generateOxfmtOverrides(
      [
        {
          include: ['schema/**/*.graphql'],
          graphql: { formatter: { indentWidth: 4, bracketSpacing: false } },
        },
        {
          include: ['src/**/*'],
          graphql: { formatter: { indentWidth: 4 } },
        },
      ],
      reporter,
    )

    expect(overrides).toEqual([
      { files: ['schema/**/*.graphql'], options: { tabWidth: 4, bracketSpacing: false } },
    ])
    expect(reporter.getLosses()).toEqual([
      'Biome graphql.formatter settings for src/**/* were dropped: Oxfmt overrides select by file glob, and these patterns are not graphql-specific, so applying them would also reformat other languages.',
    ])
  })

  it('passes through Svelte formatter options in base overrides', () => {
    const reporter = new CollectingReporter()

    const overrides = generateOxfmtOverrides(
      [
        {
          include: ['src/**/*.svelte'],
          formatter: {
            svelte: true,
          },
        },
      ],
      reporter,
    )

    expect(overrides).toEqual([
      {
        files: ['src/**/*.svelte'],
        options: {
          svelte: true,
        },
      },
    ])
    expect(reporter.getWarnings()).toEqual([])
  })

  it('passes through JSDoc formatter options in base overrides', () => {
    const reporter = new CollectingReporter()

    const overrides = generateOxfmtOverrides(
      [
        {
          include: ['src/**/*.ts'],
          formatter: {
            jsdoc: {
              addDefaultToDescription: false,
              preferCodeFences: true,
            },
          },
        },
      ],
      reporter,
    )

    expect(overrides).toEqual([
      {
        files: ['src/**/*.ts'],
        options: {
          jsdoc: {
            addDefaultToDescription: false,
            preferCodeFences: true,
          },
        },
      },
    ])
    expect(reporter.getWarnings()).toEqual([])
  })
})
