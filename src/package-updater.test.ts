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
      'Keeping @biomejs/biome and the Biome config because these package scripts still invoke Biome: check',
    )
  })

  it('applies the DOM script preset without --update-scripts and installs its tools', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: {
        check: 'biome check',
        lint: 'biome lint',
      },
    })
    const expectedToolVersions = await getExpectedToolVersions()
    const reporter = new CollectingReporter()

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
      'type-check': 'tsc --noEmit',
    })
    expect(pkg.devDependencies.oxlint).toBe(expectedToolVersions.oxlint)
    expect(pkg.devDependencies.oxfmt).toBe(expectedToolVersions.oxfmt)
    expect(pkg.devDependencies['oxlint-tsgolint']).toBe(expectedToolVersions.oxlintTsgolint)
    expect(pkg.devDependencies['@typescript/native-preview']).toBeUndefined()
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

  it('keeps a script read-only when Biome --unsafe comes without --write', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      scripts: {
        lint: 'biome lint --unsafe .',
        check: 'biome check --unsafe .',
      },
    })

    await updatePackageJson(dir, new CollectingReporter(), false, {
      updateScripts: true,
      fixStrategy: 'safe',
    })

    const pkg = await readPackageJson(packagePath)

    expect(pkg.scripts.lint).toBe('oxlint .')
    expect(pkg.scripts.check).toBe('oxlint . && oxfmt --check .')
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

describe('updatePackageJson Oxc tool versions', () => {
  it.each([
    { name: 'adds a missing tool', existing: undefined, action: 'added', kept: false },
    { name: 'raises an older range', existing: '^1.50.0', action: 'updated', kept: false },
    { name: 'keeps a newer range', existing: '^99.0.0', action: 'already-present', kept: true },
    {
      name: 'keeps a catalog reference',
      existing: 'catalog:',
      action: 'already-present',
      kept: true,
    },
    { name: 'keeps a dist-tag', existing: 'latest', action: 'already-present', kept: true },
  ])('$name', async ({ existing, action, kept }) => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      devDependencies: existing === undefined ? {} : { oxlint: existing },
    })
    const expected = await getExpectedToolVersions()

    const summary = await updatePackageJson(dir, new CollectingReporter(), false)
    const pkg = await readPackageJson(packagePath)

    expect(pkg.devDependencies.oxlint).toBe(kept ? existing : expected.oxlint)
    expect(summary.devDependencies.find((change) => change.name === 'oxlint')?.action).toBe(action)
  })

  it('does not add a devDependency for a tool the project installs as a dependency', async () => {
    const { dir, packagePath } = await setupPackageJson({
      name: 'fixture',
      dependencies: { oxfmt: '^99.0.0' },
    })

    await updatePackageJson(dir, new CollectingReporter(), false)

    const content = JSON.parse(await readFile(packagePath, 'utf-8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(content.dependencies.oxfmt).toBe('^99.0.0')
    expect(content.devDependencies.oxfmt).toBeUndefined()
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
