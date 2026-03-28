import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createTerminationHandler, runCli } from '../bin/biome-to-oxc.js'
import { migrate } from './index.js'

const originalCwd = process.cwd()

afterEach(() => {
  process.chdir(originalCwd)
})

class MemoryStream {
  readonly chunks: string[] = []

  write(chunk: string): boolean {
    this.chunks.push(chunk)
    return true
  }

  toString(): string {
    return this.chunks.join('')
  }
}

async function setupMigrationFixture(): Promise<{
  biomeConfigPath: string
  biomeIgnorePath: string
  dir: string
  packageJsonPath: string
}> {
  const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-migrate-'))
  const biomeConfigPath = join(dir, 'biome.json')
  const biomeIgnorePath = join(dir, '.biomeignore')
  const packageJsonPath = join(dir, 'package.json')

  await writeFile(biomeConfigPath, '{}\n', 'utf-8')
  await writeFile(biomeIgnorePath, 'dist/**\n', 'utf-8')
  await writeFile(packageJsonPath, '{"name":"fixture"}\n', 'utf-8')

  return { dir, biomeConfigPath, biomeIgnorePath, packageJsonPath }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

describe('migrate --delete', () => {
  it('deletes legacy biome config and .biomeignore files', async () => {
    const { dir, biomeConfigPath, biomeIgnorePath } = await setupMigrationFixture()

    const report = await migrate({
      configPath: biomeConfigPath,
      outputDir: dir,
      delete: true,
    })

    expect(report.success).toBe(true)
    expect(await pathExists(biomeConfigPath)).toBe(false)
    expect(await pathExists(biomeIgnorePath)).toBe(false)
    expect(await pathExists(join(dir, '.oxlintrc.json'))).toBe(true)
    expect(await pathExists(join(dir, '.oxfmtrc.jsonc'))).toBe(true)
    expect(report.suggestions.some((item) => item.includes('--delete enabled: removed'))).toBe(true)
  })

  it('keeps files intact in dry-run mode while reporting planned deletions', async () => {
    const { dir, biomeConfigPath, biomeIgnorePath } = await setupMigrationFixture()

    const report = await migrate({
      configPath: biomeConfigPath,
      outputDir: dir,
      delete: true,
      dryRun: true,
    })

    expect(report.success).toBe(true)
    expect(await pathExists(biomeConfigPath)).toBe(true)
    expect(await pathExists(biomeIgnorePath)).toBe(true)
    expect(report.suggestions.some((item) => item.includes('--delete enabled: would remove'))).toBe(
      true,
    )
  })
})

describe('runCli', () => {
  it('prints help text', async () => {
    const stdout = new MemoryStream()
    const stderr = new MemoryStream()

    const exitCode = await runCli(['--help'], { stdout, stderr })

    expect(exitCode).toBe(0)
    expect(stderr.toString()).toBe('')
    expect(stdout.toString()).toMatchInlineSnapshot(`
      "Usage: biome-to-oxc [options]

      Migrate from Biome to Oxc ecosystem (oxlint + oxfmt + oxlint-tsgolint)

      Options:
        -V, --version                     output the version number
        -c, --config <path>               Path to biome.json or biome.jsonc
        -o, --output-dir <path>           Output directory for generated configs
        --dry-run                         Show what would be done without making
                                          changes
        --delete                          Delete legacy Biome files after migration
                                          (biome.json/biome.jsonc and .biomeignore)
        --no-backup                       Skip backup of existing config files
        --update-scripts                  Update package.json scripts to use
                                          oxlint/oxfmt
        --type-aware                      Include type-aware linting guidance and
                                          dependencies
        --type-check                      Enable strict typed linting mode (implies
                                          --type-aware)
        --type-aware-profile <profile>    Type-aware profile: standard (--type-aware)
                                          or strict (--type-aware --type-check)
                                          (choices: "standard", "strict", default:
                                          "standard")
        --fix-strategy <strategy>         Fix mode for rewritten scripts: safe |
                                          suggestions | dangerous (choices: "safe",
                                          "suggestions", "dangerous", default: "safe")
        --js-plugins                      Emit jsPlugins scaffold when unsupported
                                          rules are detected
        --js-plugin <specifier>           JS plugin specifier to scaffold
                                          (repeatable). Example:
                                          eslint-plugin-playwright (default: [])
        --import-graph                    Add import graph baseline (import/no-cycle)
                                          to generated Oxlint config
        --import-cycle-max-depth <depth>  Max depth for import/no-cycle when
                                          --import-graph is enabled (default: 3)
        --turborepo                       Detect and update turbo.json task metadata
                                          for Turborepo integration
        --eslint-bridge                   Provide ESLint bridge suggestions for
                                          running alongside ESLint
        --prettier                        Detect Prettier config and provide migration
                                          suggestions
        --report <path>                   Write the migration report to a JSON file
        --json                            Print the migration report as JSON to stdout
        -v, --verbose                     Show detailed migration information
        -h, --help                        display help for command
      "
    `)
  })

  it('prints the package version', async () => {
    const stdout = new MemoryStream()
    const stderr = new MemoryStream()
    const packageJson = JSON.parse(
      await readFile(join(process.cwd(), 'package.json'), 'utf-8'),
    ) as {
      version: string
    }

    const exitCode = await runCli(['--version'], { stdout, stderr })

    expect(exitCode).toBe(0)
    expect(stderr.toString()).toBe('')
    expect(stdout.toString().trim()).toBe(packageJson.version)
  })

  it('returns exit code 2 for invalid option values', async () => {
    const stdout = new MemoryStream()
    const stderr = new MemoryStream()

    const exitCode = await runCli(['--import-cycle-max-depth', '0'], { stdout, stderr })

    expect(exitCode).toBe(2)
    expect(stdout.toString()).toBe('')
    expect(stderr.toString()).toContain('Expected a positive integer.')
  })

  it('writes the report file and supports --json output', async () => {
    const { dir, biomeConfigPath } = await setupMigrationFixture()
    const stdout = new MemoryStream()
    const stderr = new MemoryStream()
    const reportPath = join(dir, 'nested', 'report.json')

    const exitCode = await runCli(
      [
        '--config',
        biomeConfigPath,
        '--output-dir',
        dir,
        '--report',
        'nested/report.json',
        '--json',
        '--verbose',
      ],
      { stdout, stderr },
    )

    expect(exitCode).toBe(0)
    expect(stderr.toString()).toBe('')
    expect(stdout.toString()).toContain('"success": true')
    expect(stdout.toString()).toContain('"biomeConfigPath"')
    expect(await pathExists(reportPath)).toBe(true)
  })

  it('prints info messages when --verbose is enabled', async () => {
    const { dir, biomeConfigPath } = await setupMigrationFixture()
    const stdout = new MemoryStream()
    const stderr = new MemoryStream()

    const exitCode = await runCli(['--config', biomeConfigPath, '--output-dir', dir, '--verbose'], {
      stdout,
      stderr,
    })

    expect(exitCode).toBe(0)
    expect(stderr.toString()).toBe('')
    expect(stdout.toString()).toContain('Found Biome config:')
    expect(stdout.toString()).toContain('Created Oxlint config:')
  })

  it('creates a termination handler that aborts in-flight work cleanly', () => {
    const controller = new AbortController()
    const stderr = new MemoryStream()
    const handleSigint = createTerminationHandler('SIGINT', controller, stderr)

    handleSigint()

    expect(controller.signal.aborted).toBe(true)
    expect(stderr.toString()).toContain('Received SIGINT')
  })
})
