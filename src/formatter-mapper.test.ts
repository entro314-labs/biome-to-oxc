import { describe, expect, it } from 'vitest'

import { generateOxfmtConfig } from './formatter-mapper.js'
import { CollectingReporter } from './reporter.js'

describe('generateOxfmtConfig', () => {
  it('does not enable package sorting by default for an empty biome config', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig({}, reporter)

    expect(config.sortPackageJson).toBe(false)
    expect(config.sortImports).toBeUndefined()
    expect(config.sortTailwindcss).toBeUndefined()
    expect(config.jsdoc).toBeUndefined()
  })

  it('passes through explicitly configured experimental formatter options', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      {
        formatter: {
          sortPackageJson: {
            sortScripts: true,
          },
          experimentalSortImports: {
            order: 'asc',
            newlinesBetween: true,
          },
        },
      },
      reporter,
    )

    expect(config.sortPackageJson).toEqual({
      sortScripts: true,
    })
    expect(config.sortImports).toEqual({
      order: 'asc',
      newlinesBetween: true,
    })
  })

  it('rejects objectWrap values that are invalid in the current Oxfmt schema', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      {
        formatter: {
          objectWrap: true,
        },
      },
      reporter,
    )

    expect(config.objectWrap).toBeUndefined()
    expect(reporter.getWarnings()).toContain(
      'Ignoring invalid Oxfmt objectWrap value true; expected "preserve" or "collapse".',
    )
  })

  it('disables Oxfmt when Biome formatting is globally disabled', () => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig({ formatter: { enabled: false } }, reporter)

    expect(config.ignorePatterns).toEqual(['**/*'])
  })

  it('keeps language-specific shared options scoped to language overrides', () => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig(
      {
        formatter: { lineWidth: 80 },
        javascript: { formatter: { lineWidth: 120, indentWidth: 4 } },
        json: { formatter: { lineWidth: 90, trailingCommas: 'none' } },
        css: { formatter: { quoteStyle: 'single' } },
      },
      reporter,
    )

    expect(config.printWidth).toBe(80)
    expect(config.overrides).toEqual([
      {
        files: ['**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}'],
        options: { printWidth: 120, tabWidth: 4 },
      },
      {
        files: ['**/*.{json,jsonc,json5}'],
        options: { printWidth: 90, trailingComma: 'none' },
      },
      {
        files: ['**/*.{css,scss,sass,less}'],
        options: { singleQuote: true },
      },
    ])
  })

  it('passes through explicitly configured Svelte formatter options', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      {
        formatter: {
          svelte: {
            allowShorthand: false,
            indentScriptAndStyle: false,
            sortOrder: 'scripts-markup-styles-options',
          },
        },
      },
      reporter,
    )

    expect(config.svelte).toEqual({
      allowShorthand: false,
      indentScriptAndStyle: false,
      sortOrder: 'scripts-markup-styles-options',
    })
  })

  it('passes through explicitly configured JSDoc formatter options', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      {
        formatter: {
          jsdoc: {
            bracketSpacing: true,
            commentLineStrategy: 'multiline',
            lineWrappingStyle: 'balance',
          },
        },
      },
      reporter,
    )

    expect(config.jsdoc).toEqual({
      bracketSpacing: true,
      commentLineStrategy: 'multiline',
      lineWrappingStyle: 'balance',
    })
  })
})

describe('generateOxfmtConfig for Biome formatter options with new Oxfmt equivalents', () => {
  it('maps javascript.formatter.operatorLinebreak onto experimentalOperatorPosition', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      { javascript: { formatter: { operatorLinebreak: 'before' } } },
      reporter,
    )

    expect(config.overrides?.[0]?.options).toMatchObject({
      experimentalOperatorPosition: 'start',
    })
    expect(reporter.getLosses()).toEqual([])
  })

  it('maps Biome expand onto objectWrap and reports the mode Oxfmt lacks', () => {
    const reporter = new CollectingReporter()

    expect(generateOxfmtConfig({ formatter: { expand: 'auto' } }, reporter).objectWrap).toBe(
      'preserve',
    )
    expect(generateOxfmtConfig({ formatter: { expand: 'never' } }, reporter).objectWrap).toBe(
      'collapse',
    )
    expect(reporter.getLosses()).toEqual([])

    const alwaysReporter = new CollectingReporter()
    const config = generateOxfmtConfig({ formatter: { expand: 'always' } }, alwaysReporter)

    expect(config.objectWrap).toBeUndefined()
    expect(alwaysReporter.getLosses()).toHaveLength(1)
    expect(alwaysReporter.getLosses()[0]).toContain('expand "always"')
  })

  it('maps trailingNewline and bracketSameLine, which Oxfmt supports directly', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      { formatter: { trailingNewline: false, bracketSameLine: true } },
      reporter,
    )

    expect(config.insertFinalNewline).toBe(false)
    expect(config.bracketSameLine).toBe(true)
    expect(reporter.getLosses()).toEqual([])
  })

  it('still reports the Biome formatter options Oxfmt has no equivalent for', () => {
    const reporter = new CollectingReporter()

    generateOxfmtConfig({ formatter: { delimiterSpacing: true, useEditorconfig: true } }, reporter)

    expect(reporter.getLosses()).toEqual([
      'Biome formatter option "delimiterSpacing" has no Oxfmt equivalent and was not migrated.',
      'Biome formatter option "useEditorconfig" has no Oxfmt equivalent and was not migrated.',
    ])
  })
})
