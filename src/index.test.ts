import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { migrate } from './index.js'

function setupMigrationFixture(): {
  dir: string
  biomeConfigPath: string
  biomeIgnorePath: string
} {
  const dir = mkdtempSync(join(tmpdir(), 'biome-to-oxc-migrate-'))
  const biomeConfigPath = join(dir, 'biome.json')
  const biomeIgnorePath = join(dir, '.biomeignore')

  writeFileSync(biomeConfigPath, '{}\n', 'utf-8')
  writeFileSync(biomeIgnorePath, 'dist/**\n', 'utf-8')
  writeFileSync(join(dir, 'package.json'), '{"name":"fixture"}\n', 'utf-8')

  return { dir, biomeConfigPath, biomeIgnorePath }
}

describe('migrate --delete', () => {
  it('deletes legacy biome config and .biomeignore files', async () => {
    const { dir, biomeConfigPath, biomeIgnorePath } = setupMigrationFixture()

    const report = await migrate({
      configPath: biomeConfigPath,
      outputDir: dir,
      delete: true,
    })

    expect(report.success).toBe(true)
    expect(existsSync(biomeConfigPath)).toBe(false)
    expect(existsSync(biomeIgnorePath)).toBe(false)
    expect(existsSync(join(dir, '.oxlintrc.json'))).toBe(true)
    expect(existsSync(join(dir, '.oxfmtrc.jsonc'))).toBe(true)
    expect(report.suggestions.some((item) => item.includes('--delete enabled: removed'))).toBe(true)
  })

  it('keeps files intact in dry-run mode while reporting planned deletions', async () => {
    const { dir, biomeConfigPath, biomeIgnorePath } = setupMigrationFixture()

    const report = await migrate({
      configPath: biomeConfigPath,
      outputDir: dir,
      delete: true,
      dryRun: true,
    })

    expect(report.success).toBe(true)
    expect(existsSync(biomeConfigPath)).toBe(true)
    expect(existsSync(biomeIgnorePath)).toBe(true)
    expect(report.suggestions.some((item) => item.includes('--delete enabled: would remove'))).toBe(
      true,
    )
  })
})
