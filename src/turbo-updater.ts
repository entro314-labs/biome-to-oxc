import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import  { type Reporter } from './types.js'

interface TurboConfig {
  $schema?: string
  pipeline?: Record<string, TurboPipeline>
  tasks?: Record<string, TurboPipeline>
  [key: string]: unknown
}

interface TurboPipeline {
  dependsOn?: string[]
  outputs?: string[]
  cache?: boolean
  [key: string]: unknown
}

export function detectTurborepo(projectDir: string): boolean {
  const turboJsonPath = resolve(projectDir, 'turbo.json')
  return existsSync(turboJsonPath)
}

export function updateTurboConfig(projectDir: string, reporter: Reporter, dryRun: boolean): void {
  const turboJsonPath = resolve(projectDir, 'turbo.json')

  if (!existsSync(turboJsonPath)) {
    reporter.warn('turbo.json not found, skipping Turborepo updates')
    return
  }

  try {
    const content = readFileSync(turboJsonPath, 'utf-8')
    const turboConfig: TurboConfig = JSON.parse(content)

    let modified = false

    const tasks = turboConfig.pipeline ?? turboConfig.tasks ?? {}

    if (tasks.lint) {
      reporter.info('Found lint task in turbo.json - consider updating to use oxlint')
      modified = true
    }

    if (tasks.format) {
      reporter.info('Found format task in turbo.json - consider updating to use oxfmt')
      modified = true
    }

    if (tasks.check) {
      reporter.info(
        'Found check task in turbo.json - consider updating to use oxlint && oxfmt --check',
      )
      modified = true
    }

    if (modified && !dryRun) {
      reporter.info('Turborepo detected. Manual review of turbo.json recommended for task updates.')
    } else if (modified && dryRun) {
      reporter.info('Would suggest Turborepo task updates (dry-run mode)')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    reporter.error(`Failed to update turbo.json: ${message}`)
  }
}

export function generateTurborepoSuggestions(): string[] {
  return [
    'Update turbo.json tasks to use oxlint and oxfmt:',
    '  "lint": { "dependsOn": ["^build"], "outputs": [] }',
    '  "format": { "dependsOn": [], "outputs": [] }',
    '  "format:check": { "dependsOn": [], "outputs": [] }',
  ]
}
