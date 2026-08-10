import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadBiomeConfig } from './config-loader.js'
import { CollectingReporter } from './reporter.js'

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

    const reporter = new CollectingReporter()
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

    const reporter = new CollectingReporter()

    await expect(loadBiomeConfig(configPath, reporter)).rejects.toThrow(/JSONC parsing failed/)
  })
})

describe('Biome 2.x schema compatibility', () => {
  it('accepts lineEnding "auto" and reports the Oxfmt gap instead of failing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-schema-'))
    const configPath = join(dir, 'biome.json')
    await writeFile(configPath, '{ "formatter": { "lineEnding": "auto" } }\n', 'utf-8')
    const reporter = new CollectingReporter()

    const config = await loadBiomeConfig(configPath, reporter)

    expect(config.formatter?.lineEnding).toBe('auto')
    expect(reporter.getErrors()).toEqual([])
  })

  it('treats explicitly null sections as unset, matching Biome’s nullable schema', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-schema-'))
    const configPath = join(dir, 'biome.json')
    await writeFile(
      configPath,
      '{ "linter": null, "vcs": null, "formatter": { "lineWidth": 100 } }\n',
      'utf-8',
    )
    const reporter = new CollectingReporter()

    const config = await loadBiomeConfig(configPath, reporter)

    expect(config.linter).toBeUndefined()
    expect(config.vcs).toBeUndefined()
    expect(config.formatter?.lineWidth).toBe(100)
    expect(reporter.getErrors()).toEqual([])
  })
})
