import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { Reporter } from './types.js'

const BIOME_IGNORE_FILE = '.biomeignore'

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export function parseBiomeIgnoreContent(content: string): string[] {
  const patterns: string[] = []

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim()

    if (line.length === 0 || line.startsWith('#')) {
      continue
    }

    if (line.startsWith('\\#') || line.startsWith('\\!')) {
      patterns.push(line.slice(1))
      continue
    }

    patterns.push(line)
  }

  return patterns
}

export async function loadBiomeIgnorePatterns(
  projectDir: string,
  reporter: Reporter,
): Promise<string[]> {
  const ignorePath = resolve(projectDir, BIOME_IGNORE_FILE)

  if (!(await fileExists(ignorePath))) {
    return []
  }

  try {
    const content = await readFile(ignorePath, 'utf-8')
    const patterns = parseBiomeIgnoreContent(content)

    if (patterns.length === 0) {
      reporter.warn(
        '.biomeignore was found, but no ignore patterns remained after filtering comments/blank lines.',
      )
    }

    return patterns
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    reporter.warn(`Failed to read .biomeignore at ${ignorePath}: ${message}`)
    return []
  }
}
