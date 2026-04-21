import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import {
  findClosestPackageJson,
  pathExists,
  readJsonFile,
  writeTextFileAtomically,
} from './fs-utils.js'
import type {
  FixStrategy,
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

const DOM_SCRIPT_PRESET: Record<string, string> = {
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
    dom?: boolean
    typeAware?: boolean
    typeCheck?: boolean
    typeAwareProfile?: TypeAwareProfile
    fixStrategy?: FixStrategy
    signal?: AbortSignal
  } = {},
): Promise<PackageUpdateSummary> {
  const packageJsonPath = resolve(projectDir, 'package.json')
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
    const packageJson = await readJsonFile(
      packageJsonPath,
      PackageJsonSchema,
      `package manifest at ${packageJsonPath}`,
    )
    const recommendedVersions = await getRecommendedToolVersions()

    summary.found = true

    let modified = false
    const updateScriptsEnabled = options.updateScripts ?? false
    const domModeEnabled = options.dom ?? false
    const typeAwareProfile = options.typeAwareProfile ?? 'standard'
    const typeCheckEnabled = options.typeCheck ?? typeAwareProfile === 'strict'
    const typeAwareEnabled =
      options.typeAware ?? (typeCheckEnabled || typeAwareProfile === 'strict')
    const needsTypeAwareDependency = typeAwareEnabled || typeCheckEnabled || domModeEnabled
    const fixStrategy = options.fixStrategy ?? 'safe'

    if (domModeEnabled) {
      packageJson.scripts ??= {}
      modified = applyDomScriptPreset(packageJson.scripts, summary.scriptsUpdated) || modified
    } else if (updateScriptsEnabled && packageJson.scripts) {
      modified =
        updateScripts(packageJson.scripts, reporter, summary.scriptsUpdated, {
          typeAwareEnabled,
          typeCheckEnabled,
          fixStrategy,
        }) || modified
    }

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

function applyDomScriptPreset(
  scripts: Record<string, string>,
  updates: PackageScriptUpdate[],
): boolean {
  let modified = false

  for (const [scriptName, scriptValue] of Object.entries(DOM_SCRIPT_PRESET)) {
    const before = scripts[scriptName]

    if (before === scriptValue) {
      continue
    }

    scripts[scriptName] = scriptValue
    updates.push({ name: scriptName, before: before ?? '<missing>', after: scriptValue })
    modified = true
  }

  return modified
}

function updateScripts(
  scripts: Record<string, string>,
  reporter: Reporter,
  updates: PackageScriptUpdate[],
  options: {
    typeAwareEnabled: boolean
    typeCheckEnabled: boolean
    fixStrategy: FixStrategy
  },
): boolean {
  let modified = false
  const lintBase = buildLintBaseCommand(options.typeAwareEnabled, options.typeCheckEnabled)

  const lintFixByStrategy: Record<FixStrategy, string> = {
    safe: `${lintBase} --fix`,
    suggestions: `${lintBase} --fix --fix-suggestions`,
    dangerous: `${lintBase} --fix --fix-suggestions --fix-dangerously`,
  }

  for (const [name, script] of Object.entries(scripts)) {
    let newScript = stripExecBiome(script)
    let updated = false

    if (containsBiomeCommand(newScript)) {
      const unsafeRewriteReason = findUnsafeRewriteReason(newScript)

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
        check: `${lintBase} && oxfmt --check`,
        fixByStrategy: {
          safe: `${lintFixByStrategy.safe} && oxfmt --write`,
          suggestions: `${lintFixByStrategy.suggestions} && oxfmt --write`,
          dangerous: `${lintFixByStrategy.dangerous} && oxfmt --write`,
        },
      },
      {
        command: 'ci',
        check: `${lintBase} && oxfmt --check`,
        fixByStrategy: {
          safe: `${lintFixByStrategy.safe} && oxfmt --write`,
          suggestions: `${lintFixByStrategy.suggestions} && oxfmt --write`,
          dangerous: `${lintFixByStrategy.dangerous} && oxfmt --write`,
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
        check: 'oxfmt --check',
        fixByStrategy: {
          safe: 'oxfmt --write',
          suggestions: 'oxfmt --write',
          dangerous: 'oxfmt --write',
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

function containsBiomeCommand(script: string): boolean {
  return /\bbiome\s+(check|ci|lint|format)\b/u.test(script)
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
  const regex = new RegExp(`\\bbiome\\s+${command}\\b([^&|]*)`, 'g')
  const updated = script.replace(regex, (_match, args: string) => {
    didReplace = true
    const hasFix = /\s--(write|fix)\b/.test(args)
    const hasUnsafe = /\s--unsafe\b/.test(args)
    const cleanedArgs = args.replace(/\s--(write|fix|unsafe)\b/g, '').trim()
    const suffix = cleanedArgs.length > 0 ? ` ${cleanedArgs}` : ''
    const effectiveFixStrategy = hasUnsafe
      ? escalateFixStrategy(defaultFixStrategy, 'dangerous')
      : defaultFixStrategy

    const replacement = hasFix || hasUnsafe ? fixByStrategy[effectiveFixStrategy] : checkReplacement
    return applySuffixToCommands(replacement, suffix)
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

function buildLintBaseCommand(typeAwareEnabled: boolean, typeCheckEnabled: boolean): string {
  if (!typeAwareEnabled && !typeCheckEnabled) {
    return 'oxlint'
  }

  if (typeCheckEnabled) {
    return 'oxlint --type-aware --type-check'
  }

  return 'oxlint --type-aware'
}

function escalateFixStrategy(current: FixStrategy, minimum: FixStrategy): FixStrategy {
  const order: Record<FixStrategy, number> = {
    safe: 1,
    suggestions: 2,
    dangerous: 3,
  }

  return order[current] >= order[minimum] ? current : minimum
}

function stripExecBiome(script: string): string {
  const execBiomePattern = /(^|[;&|()]|&&|\|\|)\s*exec\s+biome\b/g
  return script.replace(execBiomePattern, (_match, prefix: string) => {
    if (!prefix) {
      return 'biome'
    }

    const spacer = prefix.length > 0 ? ' ' : ''
    return `${prefix}${spacer}biome`
  })
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
