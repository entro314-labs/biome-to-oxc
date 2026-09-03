import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
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

  it('skips legacy file deletion when a requested package update fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-delete-failure-'))
    const biomeConfigPath = join(dir, 'biome.json')
    const biomeIgnorePath = join(dir, '.biomeignore')
    const packageJsonPath = join(dir, 'package.json')

    await writeFile(biomeConfigPath, '{}\n', 'utf-8')
    await writeFile(biomeIgnorePath, 'dist/**\n', 'utf-8')
    await writeFile(packageJsonPath, '{ invalid json }\n', 'utf-8')

    const report = await migrate({
      configPath: biomeConfigPath,
      outputDir: dir,
      delete: true,
      updateScripts: true,
    })

    expect(report.success).toBe(false)
    expect(await pathExists(biomeConfigPath)).toBe(true)
    expect(await pathExists(biomeIgnorePath)).toBe(true)
    expect(await pathExists(join(dir, '.oxlintrc.json'))).toBe(false)
    expect(await pathExists(join(dir, '.oxfmtrc.jsonc'))).toBe(false)
    expect(report.suggestions).toContain(
      '--delete skipped because the migration did not complete successfully.',
    )
  })
})

describe('migrate output directory handling', () => {
  it('creates a missing output directory before writing generated configs', async () => {
    const { biomeConfigPath, dir } = await setupMigrationFixture()
    const outputDir = join(dir, 'generated', 'config')

    // No .biomeignore, so no glob needs to point back up at the project root.
    await writeFile(join(dir, '.biomeignore'), '\n', 'utf-8')

    const report = await migrate({
      configPath: biomeConfigPath,
      outputDir,
    })

    expect(await pathExists(join(outputDir, '.oxlintrc.json'))).toBe(true)
    expect(await pathExists(join(outputDir, '.oxfmtrc.jsonc'))).toBe(true)
    // A config below the project root resolves its ignorePatterns against its own
    // directory, so the Oxfmt-only language exclusions cannot cover the whole project.
    expect(report.success).toBe(false)
    expect(report.losses.some((loss) => loss.includes('below the Biome project root'))).toBe(true)
  })

  it('rejects report paths that would overwrite migration state', async () => {
    const { biomeConfigPath, dir, packageJsonPath } = await setupMigrationFixture()
    const originalPackage = await readFile(packageJsonPath, 'utf-8')

    const report = await migrate({
      configPath: biomeConfigPath,
      outputDir: dir,
      report: 'package.json',
    })

    expect(report.success).toBe(false)
    expect(report.errors.some((message) => message.includes('Report path conflicts'))).toBe(true)
    expect(await readFile(packageJsonPath, 'utf-8')).toBe(originalPackage)
    expect(await pathExists(join(dir, '.oxlintrc.json'))).toBe(false)
  })

  it('rolls back migration state when a requested report cannot be written', async () => {
    const { biomeConfigPath, dir, packageJsonPath } = await setupMigrationFixture()
    const originalPackage = await readFile(packageJsonPath, 'utf-8')
    await writeFile(join(dir, 'blocked'), 'not a directory\n', 'utf-8')

    const report = await migrate({
      configPath: biomeConfigPath,
      outputDir: dir,
      report: 'blocked/report.json',
    })

    expect(report.success).toBe(false)
    expect(
      report.errors.some((message) => message.includes('Failed to write migration report')),
    ).toBe(true)
    expect(await readFile(packageJsonPath, 'utf-8')).toBe(originalPackage)
    expect(await pathExists(join(dir, '.oxlintrc.json'))).toBe(false)
    expect(await pathExists(join(dir, '.oxfmtrc.jsonc'))).toBe(false)
  })

  it('refuses to write configs below the project root when globs would need ".."', async () => {
    const { biomeConfigPath, dir, packageJsonPath } = await setupMigrationFixture()
    const outputDir = join(dir, 'generated', 'config')
    const originalPackage = await readFile(packageJsonPath, 'utf-8')

    await writeFile(
      biomeConfigPath,
      `${JSON.stringify({ files: { ignore: ['coverage/**'] } }, null, 2)}\n`,
      'utf-8',
    )

    const report = await migrate({ configPath: biomeConfigPath, outputDir })

    // Oxlint and Oxfmt reject `..` in config globs, so this layout is unrepresentable.
    expect(report.success).toBe(false)
    expect(
      report.errors.some((message) => message.includes('sits below the Biome project root')),
    ).toBe(true)
    expect(await pathExists(join(outputDir, '.oxlintrc.json'))).toBe(false)
    expect(await readFile(packageJsonPath, 'utf-8')).toBe(originalPackage)
  })

  it('rebases globs onto an output directory that is an ancestor of the project', async () => {
    const { dir } = await setupMigrationFixture()
    const projectDir = join(dir, 'packages', 'app')
    await mkdir(projectDir, { recursive: true })

    const biomeConfigPath = join(projectDir, 'biome.json')
    const packageJsonPath = join(projectDir, 'package.json')

    await writeFile(
      biomeConfigPath,
      `${JSON.stringify(
        {
          files: { ignore: ['coverage/**'] },
          overrides: [
            {
              includes: ['src/**/*.ts', '!src/generated/**'],
              linter: { rules: { style: { noVar: 'error' } } },
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf-8',
    )
    await writeFile(
      packageJsonPath,
      `${JSON.stringify({
        name: 'fixture',
        scripts: { check: 'biome check .' },
        devDependencies: { '@biomejs/biome': '^2.0.0' },
      })}\n`,
      'utf-8',
    )

    const report = await migrate({
      configPath: biomeConfigPath,
      outputDir: dir,
      updateScripts: true,
    })

    const oxlint = JSON.parse(await readFile(join(dir, '.oxlintrc.json'), 'utf-8')) as {
      ignorePatterns: string[]
      overrides: Array<{ excludeFiles?: string[]; files: string[] }>
    }

    expect(report.success).toBe(true)
    expect(oxlint.ignorePatterns).toEqual(['packages/app/coverage/**'])
    expect(oxlint.overrides[0]).toMatchObject({
      files: ['packages/app/src/**/*.ts'],
      excludeFiles: ['packages/app/src/generated/**'],
    })
  })
})

describe('migrate extends handling', () => {
  it('fails when an extends entry exists but cannot be parsed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-extends-'))
    const biomeConfigPath = join(dir, 'biome.json')
    const brokenExtendsPath = join(dir, 'shared.json')

    await writeFile(
      biomeConfigPath,
      `${JSON.stringify({ extends: './shared.json' }, null, 2)}\n`,
      'utf-8',
    )
    await writeFile(brokenExtendsPath, '{ "linter": { "rules": [ } }\n', 'utf-8')

    const report = await migrate({
      configPath: biomeConfigPath,
      outputDir: dir,
    })

    expect(report.success).toBe(false)
    expect(
      report.errors.some((message) => message.includes('Failed to resolve extends entry')),
    ).toBe(true)
    expect(await pathExists(join(dir, '.oxlintrc.json'))).toBe(false)
    expect(await pathExists(join(dir, '.oxfmtrc.jsonc'))).toBe(false)
  })

  it('fails instead of silently dropping a missing extends entry', async () => {
    const { biomeConfigPath, dir } = await setupMigrationFixture()
    await writeFile(biomeConfigPath, '{ "extends": "./missing.json" }\n', 'utf-8')

    const report = await migrate({ configPath: biomeConfigPath, outputDir: dir })

    expect(report.success).toBe(false)
    expect(report.errors.some((message) => message.includes('Extended config not found'))).toBe(
      true,
    )
    expect(await pathExists(join(dir, '.oxlintrc.json'))).toBe(false)
  })

  it('accepts modern Biome presets, group severities, and info/on rule levels', async () => {
    const { biomeConfigPath, dir } = await setupMigrationFixture()
    await writeFile(
      biomeConfigPath,
      `${JSON.stringify({
        linter: {
          rules: {
            preset: 'none',
            suspicious: 'info',
            style: { noVar: 'on' },
          },
        },
      })}\n`,
      'utf-8',
    )

    const report = await migrate({ configPath: biomeConfigPath, outputDir: dir })
    const oxlint = JSON.parse(await readFile(join(dir, '.oxlintrc.json'), 'utf-8')) as {
      categories: Record<string, string>
      rules: Record<string, string>
    }

    expect(report.success).toBe(true)
    expect(oxlint.categories).toMatchObject({ correctness: 'off', suspicious: 'warn' })
    expect(oxlint.rules['no-var']).toBe('warn')
    expect(report.warnings.some((message) => message.includes('was approximated'))).toBe(true)
  })
})

describe('migrate Turborepo handling', () => {
  it('adds missing defaults without overwriting existing task semantics', async () => {
    const { biomeConfigPath, dir } = await setupMigrationFixture()
    const turboPath = join(dir, 'turbo.json')
    await writeFile(
      turboPath,
      `${JSON.stringify({
        tasks: {
          lint: { dependsOn: ['$TURBO_DEFAULT$'], outputs: ['lint-report.json'] },
          format: {},
        },
      })}\n`,
      'utf-8',
    )

    const report = await migrate({ configPath: biomeConfigPath, outputDir: dir, turborepo: true })
    const turbo = JSON.parse(await readFile(turboPath, 'utf-8')) as {
      tasks: Record<string, { dependsOn?: string[]; outputs?: string[] }>
    }

    expect(report.success).toBe(true)
    expect(turbo.tasks.lint.dependsOn).toEqual(['$TURBO_DEFAULT$', '^build'])
    expect(turbo.tasks.lint.outputs).toEqual(['lint-report.json'])
    expect(turbo.tasks.format.outputs).toEqual([])
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
    expect(stderr.toString()).toContain('preset "recommended" was approximated')
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
    expect(stderr.toString()).toContain('preset "recommended" was approximated')
    expect(stdout.toString()).toContain('Found Biome config:')
    expect(stdout.toString()).toContain('Created Oxlint config:')
  })

  it('prints a concise success summary without verbose mode', async () => {
    const { dir, biomeConfigPath } = await setupMigrationFixture()
    const stdout = new MemoryStream()
    const stderr = new MemoryStream()

    const exitCode = await runCli(['--config', biomeConfigPath, '--output-dir', dir], {
      stdout,
      stderr,
    })

    expect(exitCode).toBe(0)
    expect(stdout.toString()).toContain('Migration completed.')
    expect(stdout.toString()).toContain('Rules converted:')
  })

  it('returns exit code 1 with a user-facing message when the operation is aborted', async () => {
    const { dir, biomeConfigPath } = await setupMigrationFixture()
    const stdout = new MemoryStream()
    const stderr = new MemoryStream()
    const controller = new AbortController()
    controller.abort(new DOMException('Cancelled before run', 'AbortError'))

    const exitCode = await runCli(['--config', biomeConfigPath, '--output-dir', dir], {
      signal: controller.signal,
      stdout,
      stderr,
    })

    expect(exitCode).toBe(1)
    expect(stdout.toString()).toBe('')
    expect(stderr.toString()).toContain('Migration cancelled.')
  })

  it('creates a termination handler that aborts in-flight work cleanly', () => {
    const controller = new AbortController()
    const stderr = new MemoryStream()
    const handleSigint = createTerminationHandler('SIGINT', controller, stderr)

    handleSigint()

    expect(controller.signal.aborted).toBe(true)
    expect(stderr.toString()).toContain('Received SIGINT')
  })

  it('creates a SIGTERM handler and ignores duplicate signals after aborting once', () => {
    const controller = new AbortController()
    const stderr = new MemoryStream()
    const handleSigterm = createTerminationHandler('SIGTERM', controller, stderr)

    handleSigterm()
    handleSigterm()

    expect(controller.signal.aborted).toBe(true)
    const output = stderr.toString()
    expect(output).toContain('Received SIGTERM')
    expect((output.match(/Received SIGTERM/gu) ?? []).length).toBe(1)
  })
})

describe('migrate semantic-loss safeguards', () => {
  it('refuses to delete the Biome setup when a rule has no Oxlint equivalent', async () => {
    const { biomeConfigPath, biomeIgnorePath, dir, packageJsonPath } = await setupMigrationFixture()

    await writeFile(
      biomeConfigPath,
      `${JSON.stringify({ linter: { rules: { nursery: { noSecrets: 'error' } } } })}\n`,
      'utf-8',
    )
    await writeFile(
      packageJsonPath,
      `${JSON.stringify({ name: 'fixture', devDependencies: { '@biomejs/biome': '^2.5.7' } })}\n`,
      'utf-8',
    )

    const report = await migrate({
      configPath: biomeConfigPath,
      outputDir: dir,
      delete: true,
      updateScripts: true,
    })

    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
      devDependencies: Record<string, string>
    }

    expect(report.success).toBe(false)
    expect(report.losses).toContain('No Oxlint equivalent found for Biome rule: noSecrets')
    expect(report.cleanup).toMatchObject({ requested: true, performed: false })
    // The only working configuration must survive a known-lossy conversion.
    expect(await pathExists(biomeConfigPath)).toBe(true)
    expect(await pathExists(biomeIgnorePath)).toBe(true)
    expect(packageJson.devDependencies['@biomejs/biome']).toBe('^2.5.7')
  })

  it('completes cleanup when the conversion is lossless', async () => {
    const { biomeConfigPath, biomeIgnorePath, dir, packageJsonPath } = await setupMigrationFixture()

    await writeFile(
      biomeConfigPath,
      `${JSON.stringify({ linter: { rules: { style: { noVar: 'error' } } } })}\n`,
      'utf-8',
    )
    await writeFile(
      packageJsonPath,
      `${JSON.stringify({ name: 'fixture', devDependencies: { '@biomejs/biome': '^2.5.7' } })}\n`,
      'utf-8',
    )

    const report = await migrate({
      configPath: biomeConfigPath,
      outputDir: dir,
      delete: true,
      updateScripts: true,
    })

    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
      devDependencies: Record<string, string>
    }

    expect(report.success).toBe(true)
    expect(report.losses).toEqual([])
    expect(report.cleanup).toMatchObject({ requested: true, performed: true })
    expect(await pathExists(biomeConfigPath)).toBe(false)
    expect(await pathExists(biomeIgnorePath)).toBe(false)
    expect(packageJson.devDependencies['@biomejs/biome']).toBeUndefined()
  })
})

describe('migrate file selection fidelity', () => {
  it('translates negated includes into ignore patterns for both tools', async () => {
    const { biomeConfigPath, dir } = await setupMigrationFixture()

    await writeFile(
      biomeConfigPath,
      `${JSON.stringify({
        files: { includes: ['!**/*.generated.ts'] },
        linter: { includes: ['!src/legacy/**'] },
        formatter: { includes: ['!**/*.min.js'] },
      })}\n`,
      'utf-8',
    )

    await migrate({ configPath: biomeConfigPath, outputDir: dir })

    const oxlint = JSON.parse(await readFile(join(dir, '.oxlintrc.json'), 'utf-8')) as {
      ignorePatterns: string[]
    }
    const oxfmt = JSON.parse(await readFile(join(dir, '.oxfmtrc.jsonc'), 'utf-8')) as {
      ignorePatterns: string[]
    }

    expect(oxlint.ignorePatterns).toContain('**/*.generated.ts')
    expect(oxlint.ignorePatterns).toContain('src/legacy/**')
    expect(oxfmt.ignorePatterns).toContain('**/*.generated.ts')
    expect(oxfmt.ignorePatterns).toContain('**/*.min.js')
  })

  it('applies .biomeignore to the formatter as well as the linter', async () => {
    const { biomeConfigPath, dir } = await setupMigrationFixture()

    await migrate({ configPath: biomeConfigPath, outputDir: dir })

    const oxlint = JSON.parse(await readFile(join(dir, '.oxlintrc.json'), 'utf-8')) as {
      ignorePatterns: string[]
    }
    const oxfmt = JSON.parse(await readFile(join(dir, '.oxfmtrc.jsonc'), 'utf-8')) as {
      ignorePatterns: string[]
    }

    expect(oxlint.ignorePatterns).toContain('dist/**')
    expect(oxfmt.ignorePatterns).toContain('dist/**')
  })

  it('keeps Oxfmt from formatting file types Biome never touched', async () => {
    const { biomeConfigPath, dir } = await setupMigrationFixture()

    await migrate({ configPath: biomeConfigPath, outputDir: dir })

    const oxfmt = JSON.parse(await readFile(join(dir, '.oxfmtrc.jsonc'), 'utf-8')) as {
      ignorePatterns: string[]
      sortPackageJson: boolean
    }

    expect(oxfmt.ignorePatterns).toEqual(
      expect.arrayContaining(['**/*.{yaml,yml}', '**/*.toml', '**/*.{md,mdx}']),
    )
    // Oxfmt defaults this to true; Biome never reordered package.json.
    expect(oxfmt.sortPackageJson).toBe(false)
  })
})

describe('migrate report accounting', () => {
  it('counts source rules rather than emitted target rules', async () => {
    const { biomeConfigPath, dir } = await setupMigrationFixture()

    await writeFile(
      biomeConfigPath,
      `${JSON.stringify({
        linter: { rules: { recommended: false, style: { noCommonJs: 'error' } } },
      })}\n`,
      'utf-8',
    )

    const report = await migrate({ configPath: biomeConfigPath, outputDir: dir })

    // noCommonJs expands to three Oxlint rules but is one source rule.
    expect(report.summary.rulesConverted).toBe(1)
    expect(report.summary.oxlintRulesEmitted).toBe(3)
  })
})

describe('migrate concurrency', () => {
  it('locks the project the Biome config belongs to, not the working directory', async () => {
    const { biomeConfigPath, dir } = await setupMigrationFixture()

    // A live foreign process holding the project lock must block a second migration
    // even though this process is running from a different working directory.
    await writeFile(
      join(dir, '.biome-to-oxc.lock'),
      JSON.stringify({ pid: process.ppid, startedAt: Date.now() }),
      'utf-8',
    )

    const report = await migrate({ configPath: biomeConfigPath, outputDir: dir })

    expect(report.success).toBe(false)
    expect(
      report.errors.some((message) =>
        message.includes('Another biome-to-oxc migration is running'),
      ),
    ).toBe(true)
    expect(await pathExists(join(dir, '.oxlintrc.json'))).toBe(false)
  })

  it('releases the lock so a later migration can run', async () => {
    const { biomeConfigPath, dir } = await setupMigrationFixture()

    await migrate({ configPath: biomeConfigPath, outputDir: dir })
    const second = await migrate({ configPath: biomeConfigPath, outputDir: dir })

    expect(second.errors).toEqual([])
    expect(await pathExists(join(dir, '.biome-to-oxc.lock'))).toBe(false)
  })
})

describe('migrate assist actions', () => {
  it('writes the Oxfmt sorting options a Biome assist config asks for', async () => {
    const { biomeConfigPath, dir } = await setupMigrationFixture()

    await writeFile(
      biomeConfigPath,
      JSON.stringify({
        assist: {
          actions: {
            source: {
              organizeImports: { level: 'on', options: { sortBareImports: true } },
              useSortedPackageJson: 'on',
              useSortedKeys: 'on',
            },
          },
        },
      }),
      'utf-8',
    )

    const report = await migrate({ configPath: biomeConfigPath, outputDir: dir })
    const oxfmtConfig = JSON.parse(await readFile(join(dir, '.oxfmtrc.jsonc'), 'utf-8')) as {
      sortImports?: unknown
      sortPackageJson?: unknown
    }

    expect(report.errors).toEqual([])
    expect(oxfmtConfig.sortImports).toEqual({ sortSideEffects: true })
    expect(oxfmtConfig.sortPackageJson).toBe(true)
    // `assist` is now a recognised section, so it must not be reported as a dropped field.
    expect(report.losses.some((loss) => loss.includes('top-level field "assist"'))).toBe(false)
    // `useSortedKeys` has no Oxfmt counterpart, so it must be.
    expect(report.losses.some((loss) => loss.includes('"useSortedKeys"'))).toBe(true)
  })
})
