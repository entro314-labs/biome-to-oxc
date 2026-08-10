import { describe, expect, it } from 'vitest'

import { detectProjectFeatures, generateFeatureSpecificSuggestions } from './advanced-detection.js'
import { CollectingReporter } from './reporter.js'

describe('advanced detection', () => {
  it('detects import sorting hints from nested biome rule names', () => {
    const reporter = new CollectingReporter()

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
