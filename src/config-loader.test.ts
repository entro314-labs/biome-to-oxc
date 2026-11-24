import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { detectBiomeVersion, loadBiomeConfig } from './config-loader.js'
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

  it('reads the Biome 2.6 yaml, markdown and tailwind sections without reporting a loss', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-schema-'))
    const configPath = join(dir, 'biome.json')
    await writeFile(
      configPath,
      JSON.stringify({
        yaml: { formatter: { quoteStyle: 'single' } },
        markdown: { formatter: { proseWrap: 'always' } },
        // Only Biome's Tailwind lint rules read this; each enabled one is reported as unmapped.
        tailwind: { attributes: ['class'], mergeFunctions: ['cn'] },
      }),
      'utf-8',
    )
    const reporter = new CollectingReporter()

    const config = await loadBiomeConfig(configPath, reporter)

    expect(config.yaml?.formatter?.quoteStyle).toBe('single')
    expect(config.markdown?.formatter?.proseWrap).toBe('always')
    expect(reporter.getLosses()).toEqual([])
  })
})

describe('detectBiomeVersion', () => {
  async function installBiome(dir: string, version: string): Promise<void> {
    const packageDir = join(dir, 'node_modules', '@biomejs', 'biome')
    await mkdir(packageDir, { recursive: true })
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({ version }), 'utf-8')
  }

  it('reads the installed Biome, including one hoisted to a workspace root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'biome-to-oxc-version-'))
    const packageDir = join(root, 'packages', 'app')
    await mkdir(packageDir, { recursive: true })
    await installBiome(root, '2.5.15')

    const version = await detectBiomeVersion(
      packageDir,
      { $schema: 'https://biomejs.dev/schemas/2.6.8/schema.json' },
      new CollectingReporter(),
    )

    expect(version).toBe('2.5.15')
  })

  it('falls back to the version in the config $schema when Biome is not installed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-version-'))

    expect(
      await detectBiomeVersion(
        dir,
        { $schema: 'https://biomejs.dev/schemas/2.5.15/schema.json' },
        new CollectingReporter(),
      ),
    ).toBe('2.5.15')
    expect(await detectBiomeVersion(dir, {}, new CollectingReporter())).toBeUndefined()
  })
})
