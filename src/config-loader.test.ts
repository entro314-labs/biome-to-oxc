import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadBiomeConfig } from './config-loader.js'
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

describe('loadBiomeConfig', () => {
  it('parses biome.jsonc files with comments and trailing commas', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-config-loader-'))
    const configPath = join(dir, 'biome.jsonc')
    await writeFile(
      configPath,
      `{
  // =========================================================
  // Linter
  // =========================================================
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,

      // ---------------------------------------------------------
      "suspicious": {
        "noExplicitAny": "error",
      },
    },
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
  },
}
`,
      'utf-8',
    )

    const reporter = new SilentReporter()
    const config = await loadBiomeConfig(configPath, reporter)

    expect(config.linter?.enabled).toBe(true)
    expect(config.linter?.rules?.suspicious).toEqual({ noExplicitAny: 'error' })
    expect(config.formatter?.enabled).toBe(true)
    expect(reporter.getErrors()).toEqual([])
  })

  it('still reports genuine JSONC syntax errors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-config-loader-'))
    const configPath = join(dir, 'biome.jsonc')
    await writeFile(configPath, '{ "linter": { "enabled": tru } }\n', 'utf-8')

    const reporter = new SilentReporter()

    await expect(loadBiomeConfig(configPath, reporter)).rejects.toThrow(/JSONC parsing failed/)
  })
})
