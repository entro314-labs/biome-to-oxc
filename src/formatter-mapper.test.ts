import { describe, expect, it } from 'vitest'

import { generateOxfmtConfig } from './formatter-mapper.js'
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

describe('generateOxfmtConfig', () => {
  it('does not enable package sorting by default for an empty biome config', () => {
    const reporter = new SilentReporter()

    const config = generateOxfmtConfig({}, reporter)

    expect(config.sortPackageJson).toBeUndefined()
    expect(config.sortImports).toBeUndefined()
    expect(config.sortTailwindcss).toBeUndefined()
    expect(config.jsdoc).toBeUndefined()
  })

  it('passes through explicitly configured experimental formatter options', () => {
    const reporter = new SilentReporter()

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
    const reporter = new SilentReporter()

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
    const reporter = new SilentReporter()
    const config = generateOxfmtConfig({ formatter: { enabled: false } }, reporter)

    expect(config.ignorePatterns).toEqual(['**/*'])
  })

  it('keeps language-specific shared options scoped to language overrides', () => {
    const reporter = new SilentReporter()
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
    const reporter = new SilentReporter()

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
    const reporter = new SilentReporter()

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
