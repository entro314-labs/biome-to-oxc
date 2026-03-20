import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

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

const DOM_SCRIPT_PRESET: Record<string, string> = {
  check: 'oxlint . && oxfmt --check .',
  'check:fix': 'oxlint --fix . && oxfmt .',
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

const OXLINT_VERSION = '^1.56.0'
const OXFMT_VERSION = '^0.41.0'
const OXLINT_TSGOLINT_VERSION = '^0.17.1'

export function updatePackageJson(
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
  } = {},
): PackageUpdateSummary {
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

  if (!existsSync(packageJsonPath)) {
    reporter.warn('package.json not found, skipping dependency and script updates')
    return summary
  }

  try {
    summary.found = true
    const content = readFileSync(packageJsonPath, 'utf-8')
    const packageJson: PackageJson = JSON.parse(content)

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
        OXLINT_VERSION,
        summary.devDependencies,
      ) || modified
    modified =
      ensureDevDependency(
        packageJson.devDependencies,
        'oxfmt',
        OXFMT_VERSION,
        summary.devDependencies,
      ) || modified

    if (needsTypeAwareDependency) {
      modified =
        ensureDevDependency(
          packageJson.devDependencies,
          'oxlint-tsgolint',
          OXLINT_TSGOLINT_VERSION,
          summary.devDependencies,
        ) || modified
    }

    summary.changed = modified

    if (modified && !dryRun) {
      writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf-8')
      reporter.info('Updated package.json')
    } else if (modified && dryRun) {
      reporter.info('Would update package.json (dry-run mode)')
    }

    return summary
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
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
        fixByStrategy: lintFixByStrategy,
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
