import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Reporter } from './types.js'

const ESLINT_CONFIG_NAMES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  '.eslintrc.json',
  '.eslintrc',
]

export function detectESLint(projectDir: string): boolean {
  for (const name of ESLINT_CONFIG_NAMES) {
    if (existsSync(resolve(projectDir, name))) {
      return true
    }
  }
  return false
}

export function generateESLintBridgeSuggestions(reporter: Reporter): string[] {
  const suggestions: string[] = [
    'ESLint configuration detected. To run Oxlint alongside ESLint:',
    '',
    '1. Install eslint-plugin-oxlint:',
    '   pnpm add -D eslint-plugin-oxlint',
    '',
    '2. Add to your ESLint config (flat config):',
    '   import oxlint from "eslint-plugin-oxlint";',
    '   export default [',
    '     oxlint.configs.recommended,',
    '     // your other configs',
    '   ];',
    '',
    '3. Or for legacy config (.eslintrc):',
    '   {',
    '     "extends": ["plugin:oxlint/recommended"]',
    '   }',
    '',
    '4. Run both tools:',
    '   pnpm oxlint && pnpm eslint .',
  ]

  reporter.info('ESLint bridge suggestions generated')
  return suggestions
}

export function generateESLintFormatterBridgeSuggestions(): string[] {
  return [
    '',
    'To integrate Oxfmt with ESLint:',
    '',
    '1. Install eslint-plugin-oxfmt:',
    '   pnpm add -D oxfmt eslint-plugin-oxfmt',
    '',
    '2. Add to your ESLint flat config:',
    '   import pluginOxfmt from "eslint-plugin-oxfmt";',
    '   export default [',
    '     {',
    '       ...pluginOxfmt.configs.recommended,',
    '       files: ["**/*.{js,ts,mjs,cjs,jsx,tsx}"],',
    '     }',
    '   ];',
  ]
}
