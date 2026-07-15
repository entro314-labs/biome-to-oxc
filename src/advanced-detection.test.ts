import { describe, expect, it } from 'vitest'

import { detectProjectFeatures, generateFeatureSpecificSuggestions } from './advanced-detection.js'
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

describe('advanced detection', () => {
  it('detects import sorting hints from nested biome rule names', () => {
    const reporter = new SilentReporter()

    const features = detectProjectFeatures(
      {
        linter: {
          rules: {
            style: {
              sortImports: 'error',
            },
          },
        },
      },
      reporter,
    )

    expect(features.hasImportSorting).toBe(true)
    expect(generateFeatureSpecificSuggestions(features)).toContain(
      '  - Review whether to opt into Oxfmt sortImports manually',
    )
  })
})
