import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Reporter } from './types.js'

const PRETTIER_CONFIG_NAMES = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.json5',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
]

export function detectPrettier(projectDir: string): string | undefined {
  for (const name of PRETTIER_CONFIG_NAMES) {
    const configPath = resolve(projectDir, name)
    if (existsSync(configPath)) {
      return configPath
    }
  }
  return undefined
}

export function generatePrettierMigrationSuggestions(
  prettierConfigPath: string,
  reporter: Reporter,
): string[] {
  const suggestions: string[] = [
    `Prettier configuration detected at: ${prettierConfigPath}`,
    '',
    'Oxfmt can automatically migrate Prettier configs:',
    '',
    '1. Run the Oxfmt migration command:',
    '   npx oxfmt --migrate=prettier',
    '',
    '2. This will:',
    '   - Read your Prettier config',
    '   - Generate .oxfmtrc.jsonc with equivalent settings',
    '   - Preserve your formatting preferences',
    '',
    '3. Review the generated config and test:',
    '   npx oxfmt --check',
    '',
    'Note: Oxfmt is Prettier-compatible but may have minor differences.',
    'Test thoroughly before committing changes.',
  ]

  reporter.info('Prettier migration suggestions generated')
  return suggestions
}
