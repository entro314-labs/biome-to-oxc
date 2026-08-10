import { dirname, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import {
  findClosestPackageJson,
  pathExists,
  readJsonFile,
  readJsonFilePreservingKeyOrder,
  writeTextFileAtomically,
} from './fs-utils.js'
import type {
  FixStrategy,
  LockfileStatus,
  PackageDependencyRemoval,
  PackageDevDependencyChange,
  PackageScriptUpdate,
  PackageUpdateSummary,
  Reporter,
  TypeAwareProfile,
} from './types.js'

interface PackageJson {
  scripts?: Record<string, string>
  devDependencies?: Record<string, string>
  dependencies?: Record<string, string>
  [key: string]: unknown
}

interface RecommendedToolVersions {
  oxlint: string
  oxfmt: string
  'oxlint-tsgolint': string
}

const PackageJsonSchema: z.ZodType<PackageJson> = z
  .object({
    scripts: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
  })
  .catchall(z.unknown())
const ToolVersionManifestSchema = z
  .object({
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
  })
  .passthrough()

let recommendedToolVersionsPromise: Promise<RecommendedToolVersions> | undefined

export async function updatePackageJson(
  projectDir: string,
  reporter: Reporter,
  dryRun: boolean,
  options: {
    updateScripts?: boolean
    /**
     * Whether removing `@biomejs/biome` is permitted. The caller sets this only when
     * cleanup is semantically safe, so a lossy migration keeps Biome installable.
     */
    removeBiome?: boolean
    typeAware?: boolean
    typeCheck?: boolean
    typeAwareProfile?: TypeAwareProfile
    fixStrategy?: FixStrategy
    oxlintConfigPath?: string
    oxfmtConfigPath?: string
    signal?: AbortSignal
  } = {},
): Promise<PackageUpdateSummary> {
  const packageJsonPath =
    (await findClosestPackageJson(projectDir)) ?? resolve(projectDir, 'package.json')
  const summary: PackageUpdateSummary = {
    packageJsonPath,
    found: false,
    dryRun,
    scriptsUpdated: [],
    dependenciesRemoved: [],
    devDependencies: [],
    changed: false,
  }

  try {
    // Mutated in place and written back, so key order must survive the round trip.
    const packageJson = await readJsonFilePreservingKeyOrder(
      packageJsonPath,
      PackageJsonSchema,
      `package manifest at ${packageJsonPath}`,
    )
    const recommendedVersions = await getRecommendedToolVersions()

    summary.found = true

    let modified = false
    const updateScriptsEnabled = options.updateScripts ?? false
    const removeBiomeAllowed = options.removeBiome ?? false
    const typeAwareProfile = options.typeAwareProfile ?? 'standard'
    const typeCheckEnabled = options.typeCheck ?? typeAwareProfile === 'strict'
    const typeAwareEnabled =
      options.typeAware ?? (typeCheckEnabled || typeAwareProfile === 'strict')
    const needsTypeAwareDependency = typeAwareEnabled || typeCheckEnabled
    const fixStrategy = options.fixStrategy ?? 'safe'
    const oxlintCommand = buildConfiguredCommand(
      'oxlint',
      packageJsonPath,
      options.oxlintConfigPath,
    )
    const oxfmtCommand = buildConfiguredCommand('oxfmt', packageJsonPath, options.oxfmtConfigPath)

    if (updateScriptsEnabled && packageJson.scripts) {
      modified =
        updateScripts(packageJson.scripts, reporter, summary.scriptsUpdated, {
          typeAwareEnabled,
          typeCheckEnabled,
          fixStrategy,
          oxlintCommand,
          oxfmtCommand,
        }) || modified
    }

    const scriptsStillUsingBiome = Object.entries(packageJson.scripts ?? {})
      .filter(([, script]) => containsBiomeExecutable(script))
      .map(([name]) => name)

    if (!removeBiomeAllowed) {
      reporter.info(
        'Keeping @biomejs/biome: removing it requires --delete and a migration with no semantic losses.',
      )
    } else if (scriptsStillUsingBiome.length > 0) {
      reporter.warn(
        `Keeping @biomejs/biome because these package scripts still invoke Biome: ${scriptsStillUsingBiome.join(', ')}`,
      )
    } else {
      if (packageJson.devDependencies) {
        modified =
          removeBiomeDependency(
            packageJson.devDependencies,
            'devDependencies',
            summary.dependenciesRemoved,
            reporter,
          ) || modified
      }

      if (packageJson.dependencies) {
        modified =
          removeBiomeDependency(
            packageJson.dependencies,
            'dependencies',
            summary.dependenciesRemoved,
            reporter,
          ) || modified
      }
    }

    packageJson.devDependencies ??= {}

    modified =
      ensureDevDependency(
        packageJson.devDependencies,
        'oxlint',
        recommendedVersions.oxlint,
        summary.devDependencies,
      ) || modified
    modified =
      ensureDevDependency(
        packageJson.devDependencies,
        'oxfmt',
        recommendedVersions.oxfmt,
        summary.devDependencies,
      ) || modified

    if (needsTypeAwareDependency) {
      modified =
        ensureDevDependency(
          packageJson.devDependencies,
          'oxlint-tsgolint',
          recommendedVersions['oxlint-tsgolint'],
          summary.devDependencies,
        ) || modified
    }

    summary.changed = modified

    const dependenciesChanged =
      summary.dependenciesRemoved.length > 0 ||
      summary.devDependencies.some((change) => change.action !== 'already-present')
    summary.lockfile = await detectLockfile(dirname(packageJsonPath), dependenciesChanged)

    if (summary.lockfile?.stale) {
      reporter.warn(
        `Dependencies changed but ${summary.lockfile.path} was not updated; run \`${summary.lockfile.installCommand}\` before any frozen-lockfile install.`,
      )
    }

    if (modified && !dryRun) {
      options.signal?.throwIfAborted()
      await writeTextFileAtomically(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, {
        signal: options.signal,
      })
      reporter.info('Updated package.json')
    } else if (modified && dryRun) {
      reporter.info('Would update package.json (dry-run mode)')
    }

    return summary
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (isMissingFileError(err)) {
      reporter.warn('package.json not found, skipping dependency and script updates')
      return summary
    }

    summary.found = await pathExists(packageJsonPath)
    reporter.error(`Failed to update package.json: ${message}`)
    return summary
  }
}

/**
 * Lockfiles, most specific first. The migration edits the manifest but cannot regenerate
 * a lockfile without running the package manager, so it reports the required follow-up.
 */
const LOCKFILES = [
  { file: 'pnpm-lock.yaml', installCommand: 'pnpm install' },
  { file: 'bun.lock', installCommand: 'bun install' },
  { file: 'bun.lockb', installCommand: 'bun install' },
  { file: 'yarn.lock', installCommand: 'yarn install' },
  { file: 'package-lock.json', installCommand: 'npm install' },
] as const

async function detectLockfile(
  packageRoot: string,
  dependenciesChanged: boolean,
): Promise<LockfileStatus | undefined> {
  for (const { file, installCommand } of LOCKFILES) {
    const lockfilePath = resolve(packageRoot, file)

    if (await pathExists(lockfilePath)) {
      return { path: lockfilePath, installCommand, stale: dependenciesChanged }
    }
  }

  return undefined
}

function updateScripts(
  scripts: Record<string, string>,
  reporter: Reporter,
  updates: PackageScriptUpdate[],
  options: {
    typeAwareEnabled: boolean
    typeCheckEnabled: boolean
    fixStrategy: FixStrategy
    oxlintCommand: string
    oxfmtCommand: string
  },
): boolean {
  let modified = false
  const lintBase = buildLintBaseCommand(
    options.oxlintCommand,
    options.typeAwareEnabled,
    options.typeCheckEnabled,
  )

  const lintFixByStrategy: Record<FixStrategy, string> = {
    safe: `${lintBase} --fix`,
    suggestions: `${lintBase} --fix --fix-suggestions`,
    dangerous: `${lintBase} --fix --fix-suggestions --fix-dangerously`,
  }

  for (const [name, script] of Object.entries(scripts)) {
    let newScript = script
    let updated = false

    if (containsBiomeCommand(newScript)) {
      const unsafeRewriteReason =
        findUnsafeRewriteReason(newScript) ?? findUnsupportedBiomeOption(newScript)

      if (unsafeRewriteReason) {
        reporter.warn(
          `Skipping script "${name}" because it contains ${unsafeRewriteReason} that cannot be rewritten safely.`,
        )
        continue
      }
    }

    const replacements = [
      {
        command: 'check',
        check: `${lintBase} && ${options.oxfmtCommand} --check`,
        fixByStrategy: {
          safe: `${lintFixByStrategy.safe} && ${options.oxfmtCommand} --write`,
          suggestions: `${lintFixByStrategy.suggestions} && ${options.oxfmtCommand} --write`,
          dangerous: `${lintFixByStrategy.dangerous} && ${options.oxfmtCommand} --write`,
        },
      },
      {
        command: 'ci',
        check: `${lintBase} && ${options.oxfmtCommand} --check`,
        fixByStrategy: {
          safe: `${lintFixByStrategy.safe} && ${options.oxfmtCommand} --write`,
          suggestions: `${lintFixByStrategy.suggestions} && ${options.oxfmtCommand} --write`,
          dangerous: `${lintFixByStrategy.dangerous} && ${options.oxfmtCommand} --write`,
        },
      },
      {
        command: 'lint',
        check: lintBase,
        fixByStrategy: {
          safe: lintFixByStrategy.safe,
          suggestions: lintFixByStrategy.suggestions,
          dangerous: lintFixByStrategy.dangerous,
        },
      },
      {
        command: 'format',
        check: `${options.oxfmtCommand} --check`,
        fixByStrategy: {
          safe: `${options.oxfmtCommand} --write`,
          suggestions: `${options.oxfmtCommand} --write`,
          dangerous: `${options.oxfmtCommand} --write`,
        },
      },
    ]

    for (const mapping of replacements) {
      const result = replaceBiomeCommand(
        newScript,
        mapping.command,
        mapping.check,
        mapping.fixByStrategy,
        options.fixStrategy,
      )
      if (result.didReplace) {
        updated = true
      }
      newScript = result.updated
    }

    if (updated) {
      modified = true
      reporter.info(`Updated script "${name}" to use oxlint/oxfmt equivalents`)
    }

    if (newScript !== script) {
      scripts[name] = newScript
      updates.push({ name, before: script, after: newScript })
    }
  }

  return modified
}

/**
 * Package runners that may precede the Biome executable. Rewritten scripts drop the
 * runner and call the local `oxlint`/`oxfmt` binaries directly, which package managers
 * put on `PATH` for scripts.
 */
const PACKAGE_RUNNER_PREFIX = String.raw`(?:npx|bunx|pnpm\s+exec|pnpm\s+dlx|npm\s+exec|yarn\s+dlx|yarn|bun\s+x|bun\s+run|exec)`
/**
 * A whole executable token resolving to Biome: the bare binary, the package-qualified
 * specifier, or a path into a bin directory. Matching the trailing `biome` alone would
 * corrupt `@biomejs/biome` into `@biomejs/oxlint`.
 */
const BIOME_EXECUTABLE = String.raw`(?:@biomejs\/biome|(?:[\w.@-]+\/)*biome)`

function buildBiomeCommandPattern(subcommand: string, flags: string): RegExp {
  return new RegExp(
    String.raw`(^|\s)(?:${PACKAGE_RUNNER_PREFIX}\s+)?${BIOME_EXECUTABLE}\s+${subcommand}\b([^&|]*)`,
    flags,
  )
}

function findUnsupportedBiomeOption(script: string): string | undefined {
  const commandPattern = buildBiomeCommandPattern('(?:check|ci|lint|format)', 'gu')

  for (const match of script.matchAll(commandPattern)) {
    const argsWithoutSupportedFixFlags = (match[2] ?? '').replace(
      /\s--(?:write|fix|unsafe)\b/gu,
      '',
    )
    const unsupportedOption = argsWithoutSupportedFixFlags.match(
      /(?:^|\s)(-{1,2}[a-z][\w-]*)/iu,
    )?.[1]

    if (unsupportedOption) {
      return `Biome-specific option ${unsupportedOption}`
    }
  }

  return undefined
}

function containsBiomeCommand(script: string): boolean {
  return buildBiomeCommandPattern('(?:check|ci|lint|format)', 'u').test(script)
}

function containsBiomeExecutable(script: string): boolean {
  return new RegExp(
    String.raw`(^|\s)(?:${PACKAGE_RUNNER_PREFIX}\s+)?${BIOME_EXECUTABLE}\b`,
    'u',
  ).test(script)
}

function findUnsafeRewriteReason(script: string): string | undefined {
  const checks: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /&&|\|\|/u, reason: 'command chaining' },
    { pattern: /[<>]/u, reason: 'shell redirection' },
    { pattern: /(?<!\|)\|(?!\|)/u, reason: 'shell piping' },
    { pattern: /;/u, reason: 'multiple shell commands' },
    { pattern: /[`]/u, reason: 'command substitution' },
    { pattern: /\$\(/u, reason: 'command substitution' },
  ]

  for (const { pattern, reason } of checks) {
    if (pattern.test(script)) {
      return reason
    }
  }

  return undefined
}

function replaceBiomeCommand(
  script: string,
  command: string,
  checkReplacement: string,
  fixByStrategy: Record<FixStrategy, string>,
  defaultFixStrategy: FixStrategy,
): { updated: string; didReplace: boolean } {
  let didReplace = false
  const regex = buildBiomeCommandPattern(command, 'gu')
  const updated = script.replace(regex, (_match, leading: string, args: string) => {
    didReplace = true
    const hasFix = /\s--(write|fix)\b/u.test(args)
    const hasUnsafe = /\s--unsafe\b/u.test(args)
    const cleanedArgs = args.replace(/\s--(write|fix|unsafe)\b/gu, '').trim()
    const suffix = cleanedArgs.length > 0 ? ` ${cleanedArgs}` : ''
    const effectiveFixStrategy = hasUnsafe
      ? escalateFixStrategy(defaultFixStrategy, 'dangerous')
      : defaultFixStrategy

    const replacement = hasFix || hasUnsafe ? fixByStrategy[effectiveFixStrategy] : checkReplacement
    return `${leading}${applySuffixToCommands(replacement, suffix)}`
  })

  return { updated, didReplace }
}

function applySuffixToCommands(replacement: string, suffix: string): string {
  if (!suffix) {
    return replacement
  }

  if (!replacement.includes('&&')) {
    return `${replacement}${suffix}`
  }

  return replacement
    .split('&&')
    .map((part) => `${part.trim()}${suffix}`)
    .join(' && ')
}

function buildLintBaseCommand(
  oxlintCommand: string,
  typeAwareEnabled: boolean,
  typeCheckEnabled: boolean,
): string {
  if (!typeAwareEnabled && !typeCheckEnabled) {
    return oxlintCommand
  }

  if (typeCheckEnabled) {
    return `${oxlintCommand} --type-aware --type-check`
  }

  return `${oxlintCommand} --type-aware`
}

function buildConfiguredCommand(
  executable: string,
  packageJsonPath: string,
  configPath: string | undefined,
): string {
  if (!configPath) {
    return executable
  }

  const relativeConfigPath = posix.normalize(
    relative(dirname(packageJsonPath), configPath).replaceAll('\\', '/'),
  )
  return `${executable} --config ${quoteShellArgument(relativeConfigPath)}`
}

function quoteShellArgument(value: string): string {
  if (/^[\w./-]+$/u.test(value)) {
    return value
  }

  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function escalateFixStrategy(current: FixStrategy, minimum: FixStrategy): FixStrategy {
  const order: Record<FixStrategy, number> = {
    safe: 1,
    suggestions: 2,
    dangerous: 3,
  }

  return order[current] >= order[minimum] ? current : minimum
}

function removeBiomeDependency(
  dependencies: Record<string, string>,
  dependencyType: PackageDependencyRemoval['dependencyType'],
  removals: PackageDependencyRemoval[],
  reporter: Reporter,
): boolean {
  let modified = false

  if (dependencies['@biomejs/biome']) {
    const version = dependencies['@biomejs/biome']
    delete dependencies['@biomejs/biome']
    modified = true
    removals.push({ name: '@biomejs/biome', dependencyType, version })
    reporter.info(`Removed @biomejs/biome from ${dependencyType}`)
  }

  return modified
}

function ensureDevDependency(
  dependencies: Record<string, string>,
  name: string,
  version: string,
  changes: PackageDevDependencyChange[],
): boolean {
  const existing = dependencies[name]

  if (!existing) {
    dependencies[name] = version
    changes.push({ name, action: 'added', to: version })
    return true
  }

  if (existing !== version) {
    dependencies[name] = version
    changes.push({ name, action: 'updated', from: existing, to: version })
    return true
  }

  changes.push({ name, action: 'already-present', to: existing })
  return false
}

async function getRecommendedToolVersions(): Promise<RecommendedToolVersions> {
  recommendedToolVersionsPromise ??= loadRecommendedToolVersions()

  return recommendedToolVersionsPromise
}

async function loadRecommendedToolVersions(): Promise<RecommendedToolVersions> {
  const packageDirectory = dirname(fileURLToPath(import.meta.url))
  const packageManifestPath = await findClosestPackageJson(packageDirectory)

  if (!packageManifestPath) {
    throw new Error('Unable to locate the biome-to-oxc package manifest.')
  }

  const packageManifest = await readJsonFile(
    packageManifestPath,
    ToolVersionManifestSchema,
    `tool version manifest at ${packageManifestPath}`,
  )

  const knownVersions = {
    ...packageManifest.dependencies,
    ...packageManifest.devDependencies,
  }

  const { oxlint, oxfmt } = knownVersions
  const oxlintTsgolint = knownVersions['oxlint-tsgolint']

  if (!oxlint || !oxfmt || !oxlintTsgolint) {
    throw new Error(
      'Unable to determine the recommended oxlint, oxfmt, and oxlint-tsgolint versions.',
    )
  }

  return {
    oxlint,
    oxfmt,
    'oxlint-tsgolint': oxlintTsgolint,
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
