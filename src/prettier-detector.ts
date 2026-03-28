import { resolve } from 'node:path'

import { pathExists } from './fs-utils.js'
import type { Reporter } from './types.js'

const PRETTIER_CONFIG_NAMES = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.json5',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.ts',
  '.prettierrc.mts',
  '.prettierrc.cts',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  'prettier.config.ts',
  'prettier.config.mts',
  'prettier.config.cts',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
]

export async function detectPrettier(projectDir: string): Promise<string | undefined> {
  for (const name of PRETTIER_CONFIG_NAMES) {
    const configPath = resolve(projectDir, name)
    if (await pathExists(configPath)) {
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
    '   pnpm exec oxfmt --migrate=prettier',
    '',
    '2. This will:',
    '   - Read your Prettier config',
    '   - Generate .oxfmtrc.jsonc with equivalent settings',
    '   - Preserve your formatting preferences',
    '',
    '3. Review the generated config and test:',
    '   pnpm exec oxfmt --check .',
    '',
    'Note: Oxfmt is Prettier-compatible but may have minor differences.',
    'Test thoroughly before committing changes.',
  ]

  reporter.info('Prettier migration suggestions generated')
  return suggestions
}
