import { basename, extname, resolve } from 'node:path'

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
const UNREADABLE_BY_OXFMT_EXTENSIONS = new Set(['.yaml', '.yml', '.json5'])

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
  const configName = basename(prettierConfigPath)
  const suggestions: string[] = [
    `Prettier configuration detected at: ${prettierConfigPath}`,
    '',
    'Oxfmt can migrate a Prettier config with `oxfmt --migrate=prettier`, which writes',
    '.oxfmtrc.json and refuses to run while an Oxfmt config exists, including the one',
    'this migration generated.',
    '',
  ]

  // Oxfmt 0.73+ loads `.prettierrc` with JSON.parse and rejects YAML, JSON5 and TOML.
  if (UNREADABLE_BY_OXFMT_EXTENSIONS.has(extname(configName))) {
    suggestions.push(`Convert ${configName} to JSON first; Oxfmt reads only JSON, JS and TS.`, '')
  } else if (configName === '.prettierrc') {
    suggestions.push(
      'If .prettierrc is written in YAML, convert it to JSON first; Oxfmt reads it as JSON.',
      '',
    )
  }

  suggestions.push(
    '1. Move the generated Oxfmt config aside, then run:',
    '   pnpm exec oxfmt --migrate=prettier',
    '',
    '2. Merge the settings you want into one Oxfmt config and delete the other. The',
    '   generated config reproduces how Biome formatted the project.',
    '',
    '3. Test the result:',
    '   pnpm exec oxfmt --check .',
    '',
    'Note: Oxfmt is Prettier-compatible but may have minor differences.',
    'Test thoroughly before committing changes.',
  )

  reporter.info('Prettier migration suggestions generated')
  return suggestions
}
