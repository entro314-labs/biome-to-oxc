import { resolve } from 'node:path'

import { z } from 'zod'

import { pathExists, readJsonFile, writeTextFileAtomically } from './fs-utils.js'
import type { Reporter } from './types.js'

interface TurboConfig {
  $schema?: string
  pipeline?: Record<string, TurboTask>
  tasks?: Record<string, TurboTask>
  [key: string]: unknown
}

interface TurboTask {
  dependsOn?: string[]
  outputs?: string[]
  cache?: boolean
  [key: string]: unknown
}

const TurboTaskSchema: z.ZodType<TurboTask> = z
  .object({
    dependsOn: z.array(z.string()).optional(),
    outputs: z.array(z.string()).optional(),
    cache: z.boolean().optional(),
  })
  .catchall(z.unknown())
const TurboConfigSchema: z.ZodType<TurboConfig> = z
  .object({
    $schema: z.string().optional(),
    pipeline: z.record(z.string(), TurboTaskSchema).optional(),
    tasks: z.record(z.string(), TurboTaskSchema).optional(),
  })
  .catchall(z.unknown())

export async function detectTurborepo(projectDir: string): Promise<boolean> {
  const turboJsonPath = resolve(projectDir, 'turbo.json')
  return pathExists(turboJsonPath)
}

export async function updateTurboConfig(
  projectDir: string,
  reporter: Reporter,
  dryRun: boolean,
  signal?: AbortSignal,
): Promise<void> {
  const turboJsonPath = resolve(projectDir, 'turbo.json')

  if (!(await pathExists(turboJsonPath))) {
    reporter.warn('turbo.json not found, skipping Turborepo updates')
    return
  }

  try {
    const turboConfig = await readJsonFile(
      turboJsonPath,
      TurboConfigSchema,
      `turbo configuration at ${turboJsonPath}`,
    )
    const taskCollectionKey = turboConfig.tasks ? 'tasks' : turboConfig.pipeline ? 'pipeline' : null

    if (!taskCollectionKey) {
      reporter.info('turbo.json does not define tasks/pipeline entries. No changes were applied.')
      return
    }

    const tasks = turboConfig[taskCollectionKey] ?? {}
    let modified = false

    modified =
      applyTaskDefaults(tasks, 'lint', {
        dependsOn: ['^build'],
        outputs: [],
      }) || modified
    modified =
      applyTaskDefaults(tasks, 'check', {
        dependsOn: ['^build'],
        outputs: [],
      }) || modified
    modified =
      applyTaskDefaults(tasks, 'format', {
        outputs: [],
      }) || modified
    modified =
      applyTaskDefaults(tasks, 'format:check', {
        outputs: [],
      }) || modified

    if (!modified) {
      reporter.info(
        'turbo.json already matches the recommended task metadata for lint/format tasks.',
      )
      return
    }

    if (dryRun) {
      reporter.info('Would update turbo.json task metadata for lint/format tasks (dry-run mode)')
      return
    }

    signal?.throwIfAborted()
    await writeTextFileAtomically(turboJsonPath, `${JSON.stringify(turboConfig, null, 2)}\n`, {
      signal,
    })
    reporter.info('Updated turbo.json task metadata for lint/format tasks')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    reporter.error(`Failed to update turbo.json: ${message}`)
  }
}

export function generateTurborepoSuggestions(): string[] {
  return [
    'Turborepo task metadata baseline:',
    '  "lint": { "dependsOn": ["^build"], "outputs": [] }',
    '  "check": { "dependsOn": ["^build"], "outputs": [] }',
    '  "format": { "outputs": [] }',
    '  "format:check": { "outputs": [] }',
  ]
}

function applyTaskDefaults(
  tasks: Record<string, TurboTask>,
  taskName: string,
  recommendedTask: Partial<TurboTask>,
): boolean {
  const existingTask = tasks[taskName]

  if (!existingTask) {
    return false
  }

  let modified = false

  if (
    recommendedTask.dependsOn &&
    !sameStringArray(existingTask.dependsOn, recommendedTask.dependsOn)
  ) {
    existingTask.dependsOn = [...recommendedTask.dependsOn]
    modified = true
  }

  if (recommendedTask.outputs && !sameStringArray(existingTask.outputs, recommendedTask.outputs)) {
    existingTask.outputs = [...recommendedTask.outputs]
    modified = true
  }

  return modified
}

function sameStringArray(left: string[] | undefined, right: string[]): boolean {
  if (!left || left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}
