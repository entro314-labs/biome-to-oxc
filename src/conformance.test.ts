import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { migrate } from './index.js'
import type { BiomeLinterRules } from './types.js'

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
  'src/schema.graphql': 'type Query{user(id:ID!):User}\n',
  'src/fragment.gql': 'fragment F on User{id name}\n',
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

/** `file:line` of every lint diagnostic Biome reports under `src/`. */
async function biomeLintLines(dir: string): Promise<string[]> {
  const { stdout } = await run(BIOME_BIN, ['lint', '.', '--reporter=json'], dir)
  const report = JSON.parse(stdout) as {
    diagnostics?: Array<{
      category?: string
      location?: { path?: string; start?: { line: number } }
    }>
  }

  return (report.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.category?.startsWith('lint/'))
    .map((diagnostic) => `${diagnostic.location?.path}:${diagnostic.location?.start?.line}`)
    .filter((line) => line.startsWith('src/'))
    .sort()
}

/** `file:line` of every diagnostic Oxlint reports under `src/` with the generated config. */
async function oxlintLintLines(dir: string): Promise<string[]> {
  const { stdout } = await run(
    OXLINT_BIN,
    ['--config', '.oxlintrc.json', '--format=json', '.'],
    dir,
  )
  const report = JSON.parse(stdout) as {
    diagnostics?: Array<{ filename: string; labels?: Array<{ span: { line: number } }> }>
  }

  return (report.diagnostics ?? [])
    .map((diagnostic) => `${diagnostic.filename}:${diagnostic.labels?.[0]?.span.line}`)
    .filter((line) => line.startsWith('src/'))
    .sort()
}

/** Formats fresh copies of `paths`, all holding `source`, and returns what each became. */
async function formatCopies(
  dir: string,
  paths: string[],
  source: string,
  binary: string,
  args: string[],
): Promise<string[]> {
  await writeFixtureFiles(dir, Object.fromEntries(paths.map((path) => [path, source])))
  await run(binary, [...args, ...paths], dir)
  return Promise.all(paths.map((path) => readFile(join(dir, path), 'utf-8')))
}

async function setupLintFixture(
  rules: BiomeLinterRules,
  files: Record<string, string>,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-lint-conformance-'))
  const biomeConfig = {
    linter: { rules: { recommended: false, ...rules } },
    formatter: { enabled: false },
    assist: { enabled: false },
  }

  await writeFixtureFiles(dir, {
    ...files,
    'biome.json': `${JSON.stringify(biomeConfig, null, 2)}\n`,
    'package.json': `${JSON.stringify({ name: 'lint-conformance-fixture' }, null, 2)}\n`,
  })

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
    expect(sourceFilesOnly(biomeScope)).toContain('src/fragment.gql')
    expect(sourceFilesOnly(biomeScope)).not.toContain('src/config.yaml')
    expect(sourceFilesOnly(oxfmtScope)).not.toContain('src/config.yaml')
  })

  it('honours negated includes the same way Biome does', async () => {
    const dir = await setupConformanceFixture({
      files: { includes: ['**', '!**/*.test.ts', '!build/**'] },
    })

    const biomeScope = await biomeFormatScope(dir)
    const report = await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxfmtScope = await oxfmtFormatScope(dir)

    expect(sourceFilesOnly(biomeScope)).not.toContain('src/app.test.ts')
    expect(sourceFilesOnly(biomeScope)).not.toContain('build/generated.ts')
    expect(sourceFilesOnly(oxfmtScope)).toEqual(sourceFilesOnly(biomeScope))
    // `**` selects every file, so the selection narrows nothing and loses nothing.
    expect(report.losses).toEqual([])
  })

  it('re-includes a file listed after a negated pattern the same way Biome does', async () => {
    const dir = await setupConformanceFixture(
      { files: { includes: ['**', '!build/**', 'build/keep.ts', 'build/nested/keep.ts'] } },
      {
        'build/keep.ts': 'const d={x:1,y:2}\n',
        'build/nested/keep.ts': 'const e={x:1,y:2}\n',
      },
    )

    const biomeScope = await biomeFormatScope(dir)
    const report = await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxfmtScope = await oxfmtFormatScope(dir)

    expect(sourceFilesOnly(biomeScope)).toContain('build/keep.ts')
    expect(sourceFilesOnly(biomeScope)).not.toContain('build/generated.ts')
    // Neither tool re-includes a file below a directory the exception removed.
    expect(sourceFilesOnly(biomeScope)).not.toContain('build/nested/keep.ts')
    expect(sourceFilesOnly(oxfmtScope)).toEqual(sourceFilesOnly(biomeScope))
    expect(report.losses).toEqual([])
  })

  it('keeps formatting a directory named by an exception that ends in a slash', async () => {
    const dir = await setupConformanceFixture({
      files: { includes: ['**', '!build/', '!**/*.test.ts'] },
    })

    const biomeScope = await biomeFormatScope(dir)
    const report = await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxfmtScope = await oxfmtFormatScope(dir)

    // Biome matches `build/` against no path, so the exception excludes nothing.
    expect(sourceFilesOnly(biomeScope)).toContain('build/generated.ts')
    expect(sourceFilesOnly(biomeScope)).not.toContain('src/app.test.ts')
    expect(sourceFilesOnly(oxfmtScope)).toEqual(sourceFilesOnly(biomeScope))
    expect(report.losses).toEqual([])
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

  it('stops formatting GraphQL when Biome disables its GraphQL formatter', async () => {
    const dir = await setupConformanceFixture({ graphql: { formatter: { enabled: false } } })

    const biomeScope = await biomeFormatScope(dir)
    await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxfmtScope = await oxfmtFormatScope(dir)

    expect(sourceFilesOnly(biomeScope)).not.toContain('src/schema.graphql')
    expect(sourceFilesOnly(biomeScope)).not.toContain('src/fragment.gql')
    expect(sourceFilesOnly(oxfmtScope)).toEqual(sourceFilesOnly(biomeScope))
  })

  it('honours formatter-level exclusions the same way Biome does', async () => {
    const dir = await setupConformanceFixture({
      formatter: { includes: ['**', '!build/**', '!src/*.json'] },
    })

    const biomeScope = await biomeFormatScope(dir)
    const report = await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    expect(report.losses).toEqual([])
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

describe('GraphQL formatter options', () => {
  it('formats GraphQL identically to Biome under migrated graphql.formatter options', async () => {
    const source =
      'query Q($id: ID = "x") { user(id: $id, filter: {name: "a", age: 3}) { id name } }\n'
    const dir = await setupConformanceFixture(
      {
        graphql: {
          formatter: { indentStyle: 'space', indentWidth: 4, lineWidth: 40, bracketSpacing: false },
        },
      },
      { 'src/query.graphql': source },
    )

    await run(BIOME_BIN, ['format', '--write', 'src/query.graphql'], dir)
    const biomeFormatted = await readFile(join(dir, 'src/query.graphql'), 'utf-8')

    const report = await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    await writeFile(join(dir, 'src/query.graphql'), source, 'utf-8')
    await run(OXFMT_BIN, ['--config', '.oxfmtrc.jsonc', 'src/query.graphql'], dir)
    const oxfmtFormatted = await readFile(join(dir, 'src/query.graphql'), 'utf-8')

    expect(biomeFormatted).toContain('\n    user(')
    expect(biomeFormatted).toContain('{name: "a", age: 3}')
    expect(oxfmtFormatted).toBe(biomeFormatted)
    expect(report.losses).toEqual([])
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

  it('applies an override to a file it re-includes after a negated pattern', async () => {
    const source = 'export const value = { alpha: 1, beta: 2, gamma: 3, delta: 4, epsilon: 5 };\n'
    const paths = ['src/main.ts', 'src/gen/skip.ts', 'src/gen/keep.ts']
    const dir = await setupConformanceFixture(
      {
        overrides: [
          {
            includes: ['src/**', '!src/gen/**', 'src/gen/keep.ts'],
            formatter: { lineWidth: 40 },
          },
        ],
      },
      Object.fromEntries(paths.map((path) => [path, source])),
    )

    const biomeFormatted = await formatCopies(dir, paths, source, BIOME_BIN, ['format', '--write'])
    const report = await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxfmtFormatted = await formatCopies(dir, paths, source, OXFMT_BIN, [
      '--config',
      '.oxfmtrc.jsonc',
    ])

    // The narrow width wraps the override's files and leaves the excluded one on one line.
    expect(biomeFormatted.map((text) => text.trimEnd().split('\n').length > 1)).toEqual([
      true,
      false,
      true,
    ])
    expect(oxfmtFormatted).toEqual(biomeFormatted)
    expect(report.losses).toEqual([])
  })

  it('applies an override pattern without a slash at the project root only', async () => {
    const source = 'export const value = { alpha: 1, beta: 2, gamma: 3, delta: 4, epsilon: 5 };\n'
    const paths = ['root.ts', 'skip.d.ts', 'src/deep.ts']
    const dir = await setupConformanceFixture({
      overrides: [{ includes: ['*.ts', '!*.d.ts'], formatter: { lineWidth: 40 } }],
    })

    const biomeFormatted = await formatCopies(dir, paths, source, BIOME_BIN, ['format', '--write'])
    const report = await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxfmtFormatted = await formatCopies(dir, paths, source, OXFMT_BIN, [
      '--config',
      '.oxfmtrc.jsonc',
    ])

    // Biome anchors `*.ts` at the root, so only the root file that is not a `.d.ts` wraps.
    expect(biomeFormatted.map((text) => text.trimEnd().split('\n').length > 1)).toEqual([
      true,
      false,
      false,
    ])
    expect(oxfmtFormatted).toEqual(biomeFormatted)
    expect(report.losses).toEqual([])
  })
})

interface LintParityCase {
  name: string
  rules: BiomeLinterRules
  files: Record<string, string>
}

describe('source-versus-target lint diagnostics', () => {
  it.each<LintParityCase>([
    {
      name: 'keeps unused variables reported when only unused parameters are turned off',
      rules: { correctness: { noUnusedVariables: 'error', noUnusedFunctionParameters: 'off' } },
      files: {
        'src/params.js': 'export function f(unused) {\n  return 1\n}\n',
        'src/vars.js': 'export function g() {\n  const unused = 1\n  return 2\n}\n',
      },
    },
    {
      name: 'reports thrown non-Error values without type-aware linting',
      rules: { style: { useThrowOnlyError: 'error' } },
      files: {
        'src/literal.js': 'export function f() {\n  throw "boom"\n}\n',
        'src/object.js': 'export function g() {\n  throw { code: 1 }\n}\n',
        'src/error.js': 'export function h() {\n  throw new Error("boom")\n}\n',
      },
    },
    {
      name: 'reports boolean JSX attributes written without a value',
      rules: { style: { noImplicitBoolean: 'error' } },
      files: {
        'src/implicit.jsx': 'export const A = () => <input disabled />\n',
        'src/explicit.jsx': 'export const B = () => <input disabled={true} />\n',
      },
    },
    {
      name: 'reports unnecessary JSX curly braces rather than missing statement braces',
      rules: { style: { useConsistentCurlyBraces: 'error' } },
      files: {
        'src/child.jsx': "export const A = () => <p>{'Hello'}</p>\n",
        'src/prop.jsx': "export const B = () => <p title={'Hello'} />\n",
        'src/plain.jsx': 'export const C = () => <p title="Hello">Hello</p>\n',
        'src/if.js': 'export function f(a) {\n  if (a) return 1\n  return 2\n}\n',
      },
    },
    {
      name: 'knows the browser and Node.js globals Biome knows',
      rules: {
        correctness: { noUndeclaredVariables: 'error' },
        suspicious: { noGlobalAssign: 'error' },
        security: { noGlobalEval: 'error' },
      },
      files: {
        'src/globals.js':
          'export const a = [window.location, document.title, process.env.X, console, Buffer]\n',
        'src/undeclared.js': 'export const b = Deno.version\n',
        'src/assign.js': 'window = 1\n',
      },
    },
    {
      name: 'allows labels on loops only',
      rules: { suspicious: { noConfusingLabels: 'error' } },
      files: {
        'src/block.js': 'export function f() {\n  label: {\n    return 1\n  }\n}\n',
        'src/loop.js':
          'export function g(xs) {\n  outer: for (const x of xs) {\n    if (x) break outer\n  }\n}\n',
      },
    },
    {
      name: 'allows loose equality against null',
      rules: { suspicious: { noDoubleEquals: 'error' } },
      files: {
        'src/loose.js': 'export const f = (a, b) => a == b\n',
        'src/null.js': 'export const g = (a) => a == null\n',
      },
    },
    {
      name: 'denies the globals Biome always denies',
      rules: { style: { noRestrictedGlobals: 'error' } },
      files: {
        'src/event.js': 'export const f = () => event.type\n',
        'src/local.js': 'export const g = (event) => event.type\n',
      },
    },
    {
      name: 'reports empty functions and static blocks as well as empty blocks',
      rules: { suspicious: { noEmptyBlockStatements: 'error' } },
      files: {
        'src/function.js': 'export function f() {}\n',
        'src/static.js': 'export class A {\n  static {}\n}\n',
        'src/block.js': 'export function g(a) {\n  if (a) {\n  }\n  return a\n}\n',
        'src/commented.js': 'export function h() {\n  // intentionally empty\n}\n',
      },
    },
    {
      name: 'forbids the public modifier by default',
      rules: { style: { useConsistentMemberAccessibility: 'error' } },
      files: {
        'src/public.ts': 'export class A {\n  public x = 1\n}\n',
        'src/implicit.ts':
          'export class B {\n  y = 1\n  private z = 2\n  get w() {\n    return this.z\n  }\n}\n',
      },
    },
    {
      name: 'reports static self-imports and self re-exports',
      rules: { nursery: { noSelfImport: 'error' } },
      files: {
        'src/self.js': 'import self from "./self.js"\nexport default self\n',
        'src/bare.ts': 'import bare from "./bare"\nexport default bare\n',
        'src/reexport.js': 'export * from "./reexport.js"\n',
        'src/other.js': 'import self from "./self.js"\nexport default self\n',
      },
    },
    {
      name: 'reports array, object and function default props in React components',
      rules: { nursery: { noReactObjectTypeAsDefaultProp: 'error' } },
      files: {
        'src/array.jsx': 'export function A({ items = [] }) {\n  return <p>{items}</p>\n}\n',
        'src/object.jsx': 'export const B = ({ config = {} }) => <p>{config.a}</p>\n',
        'src/function.jsx':
          'export const C = ({ onClick = () => {} }) => <button onClick={onClick} />\n',
        'src/stable.jsx':
          'const EMPTY = []\nexport const D = ({ items = EMPTY, count = 0 }) => <p>{items}{count}</p>\n',
      },
    },
    {
      name: 'reports Promise rejections with a non-Error reason',
      rules: { nursery: { usePromiseRejectErrors: 'error' } },
      files: {
        'src/static.js': 'export const a = Promise.reject("failed")\n',
        'src/empty.js': 'export const b = Promise.reject()\n',
        'src/executor.js': 'export const c = new Promise((resolve, reject) => reject(42))\n',
        'src/error.js':
          'export const d = Promise.reject(new Error("failed"))\nexport const e = (err) => Promise.reject(err)\n',
      },
    },
  ])('$name', async ({ rules, files }) => {
    const dir = await setupLintFixture(rules, files)

    const biomeLines = await biomeLintLines(dir)
    const report = await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxlintLines = await oxlintLintLines(dir)

    expect(report.errors).toEqual([])
    expect(biomeLines.length).toBeGreaterThan(0)
    expect(oxlintLines).toEqual(biomeLines)
  })

  it('warns that Oxlint re-includes a file below an excluded directory, which Biome does not', async () => {
    const dir = await setupConformanceFixture(
      {
        files: { includes: ['**', '!src/gen/**', 'src/gen/nested/keep.js'] },
        linter: { rules: { recommended: false, suspicious: { noDebugger: 'error' } } },
        formatter: { enabled: false },
        assist: { enabled: false },
      },
      { 'src/main.js': 'debugger\n', 'src/gen/nested/keep.js': 'debugger\n' },
    )

    const biomeLines = await biomeLintLines(dir)
    const report = await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxlintLines = await oxlintLintLines(dir)

    // A known difference, pinned so a change in either tool shows up here: `src/gen/nested`
    // is itself excluded, so Biome never reaches the file the later pattern names.
    expect(biomeLines).toEqual(['src/main.js:1'])
    expect(oxlintLines).toEqual(['src/gen/nested/keep.js:1', 'src/main.js:1'])
    expect(report.warnings.some((warning) => warning.includes('src/gen/nested/keep.js'))).toBe(true)
  })

  it('excludes a pattern without a slash at the project root only', async () => {
    const dir = await setupConformanceFixture(
      {
        files: { includes: ['**', '!gen', '!*.gen.js', '!/src/slash', '!./src/dot/**'] },
        linter: { rules: { recommended: false, suspicious: { noDebugger: 'error' } } },
        formatter: { enabled: false },
        assist: { enabled: false },
      },
      {
        'gen/skip.js': 'debugger\n',
        'skip.gen.js': 'debugger\n',
        'src/gen/keep.js': 'debugger\n',
        'src/keep.gen.js': 'debugger\n',
        // Biome matches neither exception below against anything, so both stay linted.
        'src/slash/keep.js': 'debugger\n',
        'src/dot/keep.js': 'debugger\n',
      },
    )
    const lintedOutsideSrc = async (binary: string, args: string[]): Promise<boolean> => {
      const { stdout } = await run(binary, args, dir)
      return stdout.includes('skip.js') || stdout.includes('skip.gen.js')
    }

    const biomeLines = await biomeLintLines(dir)
    const biomeLintsSkipped = await lintedOutsideSrc(BIOME_BIN, ['lint', '.', '--reporter=json'])
    const report = await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxlintLines = await oxlintLintLines(dir)
    const oxlintLintsSkipped = await lintedOutsideSrc(OXLINT_BIN, [
      '--config',
      '.oxlintrc.json',
      '--format=json',
      '.',
    ])

    expect(report.losses).toEqual([])
    expect(biomeLines).toEqual([
      'src/dot/keep.js:1',
      'src/gen/keep.js:1',
      'src/keep.gen.js:1',
      'src/slash/keep.js:1',
    ])
    expect(oxlintLines).toEqual(biomeLines)
    expect(biomeLintsSkipped).toBe(false)
    expect(oxlintLintsSkipped).toBe(false)
  })

  it('lints a file re-included after a negated pattern', async () => {
    const dir = await setupConformanceFixture(
      {
        files: { includes: ['**', '!src/gen/**', 'src/gen/keep.js'] },
        linter: { rules: { recommended: false, suspicious: { noDebugger: 'error' } } },
        formatter: { enabled: false },
        assist: { enabled: false },
      },
      {
        'src/main.js': 'debugger\n',
        'src/gen/skip.js': 'debugger\n',
        'src/gen/keep.js': 'debugger\n',
      },
    )

    const biomeLines = await biomeLintLines(dir)
    const report = await migrate({ configPath: join(dir, 'biome.json'), outputDir: dir })
    const oxlintLines = await oxlintLintLines(dir)

    expect(report.losses).toEqual([])
    expect(biomeLines).toEqual(['src/gen/keep.js:1', 'src/main.js:1'])
    expect(oxlintLines).toEqual(biomeLines)
  })
})

describe('source-versus-target type-aware lint diagnostics', () => {
  const tsconfig = `${JSON.stringify({
    compilerOptions: { strict: true, target: 'es2022', module: 'esnext', noEmit: true },
    include: ['src'],
  })}\n`

  it.each<LintParityCase>([
    {
      name: 'reports truthiness checks on nullable primitives',
      rules: { nursery: { useStrictBooleanExpressions: 'error' } },
      files: {
        'src/nullable.ts':
          'export function f(count: number | undefined, on?: boolean) {\n  if (count) return 1\n  if (on) return 2\n  return 0\n}\n',
        'src/strict.ts':
          'export function g(count: number, text: string, node: object | null) {\n  if (count) return 1\n  if (text) return 2\n  if (node) return 3\n  return 0\n}\n',
      },
    },
    {
      name: 'reports void applied to a call that already returns void',
      rules: { nursery: { noMeaninglessVoidOperator: 'error' } },
      files: {
        'src/void.ts': 'declare function log(): void\nvoid log()\nexport {}\n',
        'src/value.ts':
          'declare function count(): number\nvoid count()\nvoid Promise.resolve()\nexport {}\n',
      },
    },
  ])('$name', async ({ rules, files }) => {
    const dir = await setupLintFixture(rules, { ...files, 'tsconfig.json': tsconfig })

    const biomeLines = await biomeLintLines(dir)
    const report = await migrate({
      configPath: join(dir, 'biome.json'),
      outputDir: dir,
      typeAware: true,
    })
    const oxlintLines = await oxlintLintLines(dir)

    expect(report.errors).toEqual([])
    expect(biomeLines.length).toBeGreaterThan(0)
    expect(oxlintLines).toEqual(biomeLines)
  })
})
