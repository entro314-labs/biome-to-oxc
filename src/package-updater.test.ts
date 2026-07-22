import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { updatePackageJson } from './package-updater.js'
import type { Reporter } from './types.js'

const PackageJsonSchema = z.object({
  devDependencies: z.record(z.string(), z.string()).default({}),
  scripts: z.record(z.string(), z.string()).default({}),
})
const ToolVersionManifestSchema = z.object({
  devDependencies: z.record(z.string(), z.string()),
})

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

async function setupPackageJson(content: object): Promise<{ dir: string; packagePath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-'))
  const packagePath = join(dir, 'package.json')

  await writeFile(packagePath, `${JSON.stringify(content, null, 2)}\n`, 'utf-8')

  return { dir, packagePath }
}

async function readPackageJson(packagePath: string) {
  const content = await readFile(packagePath, 'utf-8')
  return PackageJsonSchema.parse(JSON.parse(content))
}

async function getExpectedToolVersions() {
  const content = await readFile(join(process.cwd(), 'package.json'), 'utf-8')
  const packageJson = ToolVersionManifestSchema.parse(JSON.parse(content))

  return {
    oxlint: packageJson.devDependencies.oxlint,
    oxfmt: packageJson.devDependencies.oxfmt,
    oxlintTsgolint: packageJson.devDependencies['oxlint-tsgolint'],
  }
}

describe('updatePackageJson', () => {
  it('keeps Biome installed when scripts are not requested for migration', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: { check: 'biome check .' },
      devDependencies: { '@biomejs/biome': '^2.0.0' },
    })
    const reporter = new SilentReporter()

    const summary = await updatePackageJson(dir, reporter, false)
    const pkg = await readPackageJson(packagePath)

    expect(pkg.scripts.check).toBe('biome check .')
    expect(pkg.devDependencies['@biomejs/biome']).toBe('^2.0.0')
    expect(summary.dependenciesRemoved).toEqual([])
    expect(reporter.getWarnings()).toContain(
      'Keeping @biomejs/biome because these package scripts still invoke Biome: check',
    )
  })

  it('keeps Biome installed when a complex script cannot be rewritten safely', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: { check: 'biome check . && tsc --noEmit' },
      devDependencies: { '@biomejs/biome': '^2.0.0' },
    })
    const reporter = new SilentReporter()

    await updatePackageJson(dir, reporter, false, { updateScripts: true })
    const pkg = await readPackageJson(packagePath)

    expect(pkg.scripts.check).toBe('biome check . && tsc --noEmit')
    expect(pkg.devDependencies['@biomejs/biome']).toBe('^2.0.0')
  })

  it('does not copy Biome-only CLI flags into incompatible Oxc commands', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: { check: 'biome check --changed .' },
      devDependencies: { '@biomejs/biome': '^2.0.0' },
    })
    const reporter = new SilentReporter()

    await updatePackageJson(dir, reporter, false, { updateScripts: true })
    const pkg = await readPackageJson(packagePath)

    expect(pkg.scripts.check).toBe('biome check --changed .')
    expect(pkg.devDependencies['@biomejs/biome']).toBe('^2.0.0')
    expect(reporter.getWarnings()).toContain(
      'Skipping script "check" because it contains Biome-specific option --changed that cannot be rewritten safely.',
    )
  })

  it('updates the nearest package manifest for a nested Biome config directory', async () => {
    const { dir, packagePath } = await setupPackageJson({ name: 'fixture' })
    const nestedDir = join(dir, 'packages', 'app', 'config')
    await mkdir(nestedDir, { recursive: true })
    const reporter = new SilentReporter()

    const summary = await updatePackageJson(nestedDir, reporter, false)
    const pkg = await readPackageJson(packagePath)

    expect(summary.packageJsonPath).toBe(packagePath)
    expect(pkg.devDependencies.oxlint).toBeDefined()
    expect(pkg.devDependencies.oxfmt).toBeDefined()
  })

  it('applies DOM script preset without --update-scripts', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: {
        check: 'biome check',
        lint: 'biome lint',
      },
    })
    const expectedToolVersions = await getExpectedToolVersions()
    const reporter = new SilentReporter()

    await updatePackageJson(dir, reporter, false, {
      dom: true,
      updateScripts: false,
    })

    const pkg = await readPackageJson(packagePath)

    expect(pkg.scripts).toMatchObject({
      check: 'oxlint . && oxfmt --check .',
      'check:fix': 'oxlint --fix . && oxfmt --write .',
      format: 'oxfmt --write .',
      'format:check': 'oxfmt --check .',
      lint: 'oxlint -f github . > lint.md 2>&1',
      'lint:fix': 'oxlint -f stylish --fix .',
      'lint:fix-unsafe':
        'oxlint -f stylish --react-plugin --import-plugin --react-perf-plugin --nextjs-plugin --type-aware --type-check --vitest-plugin --fix --fix-suggestions --fix-dangerously .',
      'check:fix-suggestions':
        'oxlint -f stylish --react-plugin --import-plugin --react-perf-plugin --nextjs-plugin --type-aware --type-check --vitest-plugin --fix --fix-suggestions . && oxfmt --write .',
      'type-check': 'tsgo --noEmit',
    })
    expect(pkg.devDependencies.oxlint).toBe(expectedToolVersions.oxlint)
    expect(pkg.devDependencies.oxfmt).toBe(expectedToolVersions.oxfmt)
    expect(pkg.devDependencies['oxlint-tsgolint']).toBe(expectedToolVersions.oxlintTsgolint)
  })

  it('maps Biome unsafe fixes to dangerous oxlint fix level and formatter write mode', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: {
        check: 'biome check --write --unsafe .',
      },
    })
    const reporter = new SilentReporter()

    await updatePackageJson(dir, reporter, false, {
      updateScripts: true,
      fixStrategy: 'safe',
    })

    const pkg = await readPackageJson(packagePath)

    expect(pkg.scripts.check).toBe(
      'oxlint --fix --fix-suggestions --fix-dangerously . && oxfmt --write .',
    )
  })

  it('pins rewritten scripts to generated configs outside the package root', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: {
        check: 'biome check .',
        format: 'biome format --write .',
      },
    })
    const reporter = new SilentReporter()

    await updatePackageJson(dir, reporter, false, {
      updateScripts: true,
      oxlintConfigPath: join(dir, 'generated config', '.oxlintrc.json'),
      oxfmtConfigPath: join(dir, 'generated config', '.oxfmtrc.jsonc'),
    })

    const pkg = await readPackageJson(packagePath)

    expect(pkg.scripts.check).toBe(
      "oxlint --config 'generated config/.oxlintrc.json' . && oxfmt --config 'generated config/.oxfmtrc.jsonc' --check .",
    )
    expect(pkg.scripts.format).toBe("oxfmt --config 'generated config/.oxfmtrc.jsonc' --write .")
  })

  it('enables typed command and dependency when typeCheck is requested directly', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: {
        lint: 'biome lint',
      },
      devDependencies: {
        oxlint: '^1.0.0',
      },
    })
    const expectedToolVersions = await getExpectedToolVersions()
    const reporter = new SilentReporter()

    await updatePackageJson(dir, reporter, false, {
      updateScripts: true,
      typeCheck: true,
    })

    const pkg = await readPackageJson(packagePath)

    expect(pkg.scripts.lint).toBe('oxlint --type-aware --type-check')
    expect(pkg.devDependencies.oxlint).toBe(expectedToolVersions.oxlint)
    expect(pkg.devDependencies.oxfmt).toBe(expectedToolVersions.oxfmt)
    expect(pkg.devDependencies['oxlint-tsgolint']).toBe(expectedToolVersions.oxlintTsgolint)
  })

  it('preserves compatibility with strict type-aware profile', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: {
        lint: 'biome lint --write src',
      },
      devDependencies: {},
    })
    const expectedToolVersions = await getExpectedToolVersions()
    const reporter = new SilentReporter()

    await updatePackageJson(dir, reporter, false, {
      updateScripts: true,
      typeAwareProfile: 'strict',
      typeAware: false,
    })

    const pkg = await readPackageJson(packagePath)

    expect(pkg.scripts.lint).toBe('oxlint --type-aware --type-check --fix src')
    expect(pkg.devDependencies.oxlint).toBe(expectedToolVersions.oxlint)
    expect(pkg.devDependencies.oxfmt).toBe(expectedToolVersions.oxfmt)
    expect(pkg.devDependencies['oxlint-tsgolint']).toBe(expectedToolVersions.oxlintTsgolint)
  })

  it('skips rewriting scripts that contain unsafe shell syntax', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: {
        check: 'biome check src > check.log 2>&1',
      },
      devDependencies: {},
    })
    const reporter = new SilentReporter()

    await updatePackageJson(dir, reporter, false, {
      updateScripts: true,
    })

    const pkg = await readPackageJson(packagePath)

    expect(pkg.scripts.check).toBe('biome check src > check.log 2>&1')
    expect(reporter.getWarnings()).toContain(
      'Skipping script "check" because it contains shell redirection that cannot be rewritten safely.',
    )
  })
})
