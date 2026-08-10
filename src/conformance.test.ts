import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { migrate } from './index.js'

const execFileAsync = promisify(execFile)

const BIOME_BIN = join(process.cwd(), 'node_modules', '.bin', 'biome')
const OXFMT_BIN = join(process.cwd(), 'node_modules', '.bin', 'oxfmt')
const OXLINT_BIN = join(process.cwd(), 'node_modules', '.bin', 'oxlint')

/**
 * Source-versus-target conformance.
 *
 * The unit suite can only prove the migration emits the JSON it intends to emit. These
 * tests run the real Biome, Oxlint and Oxfmt binaries over the same fixture and compare
 * what the tools actually do, which is the only way to catch a generated config that is
 * syntactically fine but semantically wrong — a widened format scope, or a config neither
 * target tool can load.
 */

interface ToolRun {
  stdout: string
  stderr: string
  exitCode: number
}

async function run(binary: string, args: string[], cwd: string): Promise<ToolRun> {
  try {
    const { stdout, stderr } = await execFileAsync(binary, args, { cwd })
    return { stdout, stderr, exitCode: 0 }
  } catch (err) {
    const failure = err as { stdout?: string; stderr?: string; code?: number }
    return {
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
      exitCode: failure.code ?? 1,
    }
  }
}

/** Files Biome would reformat, read from its machine-readable reporter. */
async function biomeFormatScope(dir: string): Promise<Set<string>> {
  const { stdout } = await run(BIOME_BIN, ['format', '.', '--reporter=json'], dir)
  const report = JSON.parse(stdout) as {
    diagnostics?: Array<{ location?: { path?: string } }>
  }

  return new Set(
    (report.diagnostics ?? [])
      .map((diagnostic) => diagnostic.location?.path)
      .filter((path): path is string => typeof path === 'string'),
  )
}

/** Files Oxfmt would reformat under the generated config. */
async function oxfmtFormatScope(dir: string): Promise<Set<string>> {
  const { stdout } = await run(
    OXFMT_BIN,
    ['--config', '.oxfmtrc.jsonc', '--list-different', '.'],
    dir,
  )

  return new Set(
    stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  )
}

/** Restricts a scope to the fixture's own source tree, ignoring config files. */
function sourceFilesOnly(scope: Set<string>): string[] {
  return [...scope].filter((path) => path.startsWith('src/') || path.startsWith('build/')).sort()
}

async function writeFixtureFiles(dir: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(dir, relativePath)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf-8')
  }
}

/** Deliberately mis-formatted so every supported file is in scope for reformatting. */
const UNFORMATTED_SOURCES = {
  'src/app.ts': 'const a={x:1,y:2}\n',
  'src/app.test.ts': 'const b={x:1,y:2}\n',
  'src/styles.css': 'a{color:red}\n',
  'src/data.json': '{"a":1,"b":2}\n',
  'src/notes.md': '#  Heading\n\n*  item\n',
  'src/config.yaml': 'a:   1\nb:    2\n',
  'build/generated.ts': 'const c={x:1,y:2}\n',
}

async function setupConformanceFixture(
  biomeConfig: object,
  extraFiles: Record<string, string> = {},
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-conformance-'))

  await writeFixtureFiles(dir, { ...UNFORMATTED_SOURCES, ...extraFiles })
  // Written pre-formatted so the config files themselves never enter either tool's scope.
  await writeFile(join(dir, 'biome.json'), `${JSON.stringify(biomeConfig, null, 2)}\n`, 'utf-8')
  await writeFile(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: 'conformance-fixture' }, null, 2)}\n`,
    'utf-8',
  )

  return dir
}

describe('source-versus-target formatter scope', () => {
  it('formats the same source files as Biome for a default configuration', async () => {
    const dir = await setupConformanceFixture({})

    const biomeScope = await biomeFormatScope(dir)
    const report = await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxfmtScope = await oxfmtFormatScope(dir)

    expect(report.errors).toEqual([])
    // Oxfmt formats YAML and Markdown by default and Biome does not; the generated config
    // has to hold that difference back.
    expect(sourceFilesOnly(oxfmtScope)).toEqual(sourceFilesOnly(biomeScope))
    expect(sourceFilesOnly(biomeScope)).not.toContain('src/config.yaml')
    expect(sourceFilesOnly(oxfmtScope)).not.toContain('src/config.yaml')
  })

  it('honours negated includes the same way Biome does', async () => {
    const dir = await setupConformanceFixture({
      files: { includes: ['**', '!**/*.test.ts', '!build/**'] },
    })

    const biomeScope = await biomeFormatScope(dir)
    await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxfmtScope = await oxfmtFormatScope(dir)

    expect(sourceFilesOnly(biomeScope)).not.toContain('src/app.test.ts')
    expect(sourceFilesOnly(biomeScope)).not.toContain('build/generated.ts')
    expect(sourceFilesOnly(oxfmtScope)).toEqual(sourceFilesOnly(biomeScope))
  })

  it('applies .biomeignore, which Biome 2.x itself ignores, as a deliberate narrowing', async () => {
    const dir = await setupConformanceFixture({}, { '.biomeignore': 'build/**\n' })

    const biomeScope = await biomeFormatScope(dir)
    await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxfmtScope = await oxfmtFormatScope(dir)

    // Biome 2.5 has no .biomeignore support, so it still formats the ignored tree.
    expect(sourceFilesOnly(biomeScope)).toContain('build/generated.ts')
    // The migration honours the file for projects carrying one. Narrowing is the safe
    // direction, but it is a real difference and must stay deliberate.
    expect(sourceFilesOnly(oxfmtScope)).not.toContain('build/generated.ts')
    expect(sourceFilesOnly(oxfmtScope)).toEqual(
      sourceFilesOnly(biomeScope).filter((path) => !path.startsWith('build/')),
    )
  })

  it('honours formatter-level exclusions the same way Biome does', async () => {
    const dir = await setupConformanceFixture({
      formatter: { includes: ['**', '!build/**', '!src/*.json'] },
    })

    const biomeScope = await biomeFormatScope(dir)
    await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxfmtScope = await oxfmtFormatScope(dir)

    expect(sourceFilesOnly(biomeScope)).not.toContain('build/generated.ts')
    expect(sourceFilesOnly(biomeScope)).not.toContain('src/data.json')
    expect(sourceFilesOnly(oxfmtScope)).toEqual(sourceFilesOnly(biomeScope))
  })
})

describe('generated configs load in the real target tools', () => {
  it('produces configs that Oxlint and Oxfmt both accept', async () => {
    const dir = await setupConformanceFixture({
      files: { includes: ['**', '!build/**'] },
      // `noVar` sits in `suspicious` in Biome 2.5; the mapper looks rules up by name
      // regardless of group, which is why it survives Biome moving rules between groups.
      linter: { rules: { suspicious: { noVar: 'error' } } },
      overrides: [
        {
          includes: ['src/**/*.ts', '!src/vendor/**'],
          linter: { rules: { suspicious: { noDebugger: 'off' } } },
        },
      ],
    })

    // The fixture is a config real Biome accepts, so a config error here can only come
    // from what the migration generated.
    const biomeRun = await run(BIOME_BIN, ['check', '.'], dir)
    expect(biomeRun.stderr).not.toContain('unknown key')

    await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })

    const oxlintRun = await run(OXLINT_BIN, ['--config', '.oxlintrc.json', '.'], dir)
    const oxfmtRun = await run(OXFMT_BIN, ['--config', '.oxfmtrc.jsonc', '--check', '.'], dir)

    // A config-load failure is reported on stderr; lint/format findings are not.
    expect(oxlintRun.stderr).not.toContain('Failed to parse')
    expect(oxlintRun.stdout).not.toContain('invalid config file')
    expect(oxfmtRun.stderr).not.toContain('Failed to parse configuration')
    expect(oxfmtRun.stdout).not.toContain('Failed to parse configuration')
  })
})

describe('Biome override precedence', () => {
  it('resolves overlapping overrides identically to Oxfmt', async () => {
    const source = 'export const value = { alpha: 1, beta: 2, gamma: 3, delta: 4, epsilon: 5 };\n'
    const dir = await setupConformanceFixture(
      {
        overrides: [
          { includes: ['src/**/*.ts'], formatter: { lineWidth: 40 } },
          { includes: ['**/*.ts'], formatter: { indentStyle: 'space' } },
        ],
      },
      { 'src/wide.ts': source },
    )

    await run(BIOME_BIN, ['format', '--write', 'src/wide.ts'], dir)
    const biomeFormatted = await readFile(join(dir, 'src/wide.ts'), 'utf-8')

    const report = await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    await writeFile(join(dir, 'src/wide.ts'), source, 'utf-8')
    await run(OXFMT_BIN, ['--config', '.oxfmtrc.jsonc', 'src/wide.ts'], dir)
    const oxfmtFormatted = await readFile(join(dir, 'src/wide.ts'), 'utf-8')

    // Both tools merge overlapping overrides field by field, with later entries winning:
    // the width comes from the first override and the indent style from the second.
    expect(biomeFormatted).toContain('\n  alpha: 1,')
    expect(biomeFormatted.trimEnd().split('\n').length).toBeGreaterThan(1)
    expect(oxfmtFormatted).toBe(biomeFormatted)

    // Because the models agree, an overlap is not a semantic loss.
    expect(report.losses).toEqual([])
    expect(report.success).toBe(true)
  })
})
