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

  it('passes through boolean objectWrap values for newer oxfmt configs', () => {
    const reporter = new SilentReporter()

    const config = generateOxfmtConfig(
      {
        formatter: {
          objectWrap: true,
        },
      },
      reporter,
    )

    expect(config.objectWrap).toBe(true)
  })
})
