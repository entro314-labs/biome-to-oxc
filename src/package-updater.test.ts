import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { updatePackageJson } from './package-updater.js'
import { CollectingReporter } from './reporter.js'

const PackageJsonSchema = z.object({
  devDependencies: z.record(z.string(), z.string()).default({}),
  scripts: z.record(z.string(), z.string()).default({}),
})
const ToolVersionManifestSchema = z.object({
  devDependencies: z.record(z.string(), z.string()),
})

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
  it('keeps Biome installed unless removal was explicitly permitted', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: { check: 'biome check .' },
      devDependencies: { '@biomejs/biome': '^2.0.0' },
    })
    const reporter = new CollectingReporter()

    const summary = await updatePackageJson(dir, reporter, false)
    const pkg = await readPackageJson(packagePath)

    expect(pkg.scripts.check).toBe('biome check .')
    expect(pkg.devDependencies['@biomejs/biome']).toBe('^2.0.0')
    expect(summary.dependenciesRemoved).toEqual([])
  })

  it('keeps Biome installed when a script still invokes it even if removal is permitted', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: { check: 'biome check .' },
      devDependencies: { '@biomejs/biome': '^2.0.0' },
    })
    const reporter = new CollectingReporter()

    const summary = await updatePackageJson(dir, reporter, false, { removeBiome: true })
    const pkg = await readPackageJson(packagePath)

    expect(pkg.devDependencies['@biomejs/biome']).toBe('^2.0.0')
    expect(summary.dependenciesRemoved).toEqual([])
    expect(reporter.getWarnings()).toContain(
      'Keeping @biomejs/biome because these package scripts still invoke Biome: check',
    )
  })

  it('preserves manifest key order when writing dependency changes', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      version: '1.0.0',
      private: true,
      scripts: { build: 'tsc' },
    })
    const reporter = new CollectingReporter()

    await updatePackageJson(dir, reporter, false)

    const content = await readFile(packagePath, 'utf-8')
    const keys = Object.keys(JSON.parse(content) as Record<string, unknown>)

    expect(keys.slice(0, 4)).toEqual(['name', 'version', 'private', 'scripts'])
  })

  it('keeps Biome installed when a complex script cannot be rewritten safely', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: { check: 'biome check . && tsc --noEmit' },
      devDependencies: { '@biomejs/biome': '^2.0.0' },
    })
    const reporter = new CollectingReporter()

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
    const reporter = new CollectingReporter()

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
    const reporter = new CollectingReporter()

    const summary = await updatePackageJson(nestedDir, reporter, false)
    const pkg = await readPackageJson(packagePath)

    expect(summary.packageJsonPath).toBe(packagePath)
    expect(pkg.devDependencies.oxlint).toBeDefined()
    expect(pkg.devDependencies.oxfmt).toBeDefined()
  })

  it('maps Biome unsafe fixes to dangerous oxlint fix level and formatter write mode', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: {
        check: 'biome check --write --unsafe .',
      },
    })
    const reporter = new CollectingReporter()

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
    const reporter = new CollectingReporter()

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
    const reporter = new CollectingReporter()

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
    const reporter = new CollectingReporter()

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
    const reporter = new CollectingReporter()

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

describe('updatePackageJson executable parsing', () => {
  const runnerCases = [
    { name: 'bare', script: 'biome check .', expected: 'oxlint . && oxfmt --check .' },
    { name: 'npx', script: 'npx @biomejs/biome check .', expected: 'oxlint . && oxfmt --check .' },
    {
      name: 'pnpm exec',
      script: 'pnpm exec @biomejs/biome format --write .',
      expected: 'oxfmt --write .',
    },
    { name: 'yarn', script: 'yarn biome lint .', expected: 'oxlint .' },
    { name: 'bunx', script: 'bunx @biomejs/biome lint .', expected: 'oxlint .' },
    {
      name: 'bin path',
      script: './node_modules/.bin/biome lint .',
      expected: 'oxlint .',
    },
    { name: 'exec', script: 'exec biome lint .', expected: 'oxlint .' },
  ]

  for (const { name, script, expected } of runnerCases) {
    it(`rewrites the whole Biome executable token for the ${name} form`, async () => {
      const { dir, packagePath } = await setupPackageJson({
        name: 'fixture',
        scripts: { task: script },
      })
      const reporter = new CollectingReporter()

      await updatePackageJson(dir, reporter, false, { updateScripts: true })
      const pkg = await readPackageJson(packagePath)

      expect(pkg.scripts.task).toBe(expected)
      // The package-qualified specifier must never survive as `@biomejs/oxlint`.
      expect(pkg.scripts.task).not.toContain('@biomejs')
    })
  }
})

describe('updatePackageJson lockfile reporting', () => {
  it('flags the detected lockfile as stale after dependency changes', async () => {
    const { dir } = await setupPackageJson({ name: 'fixture' })
    await writeFile(join(dir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n", 'utf-8')
    const reporter = new CollectingReporter()

    const summary = await updatePackageJson(dir, reporter, false)

    expect(summary.lockfile).toMatchObject({ installCommand: 'pnpm install', stale: true })
    expect(reporter.getWarnings().some((warning) => warning.includes('was not updated'))).toBe(true)
  })
})
