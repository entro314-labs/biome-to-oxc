import { basename } from 'node:path'

import type { OxlintJsPlugin } from './types.js'

interface UnsupportedRuleGuidance {
  nativeAlternatives?: string[]
  jsPluginSpecifiers?: string[]
  jsPluginRuleExamples?: string[]
  notes?: string
}

const RESERVED_JS_PLUGIN_NAMES = new Set([
  'react',
  'unicorn',
  'typescript',
  'oxc',
  'import',
  'jsdoc',
  'jest',
  'vitest',
  'jsx-a11y',
  'nextjs',
  'react-perf',
  'promise',
  'node',
  'vue',
  'eslint',
])

const UNSUPPORTED_BIOME_RULE_GUIDANCE: Record<string, UnsupportedRuleGuidance> = {
  noReExportAll: {
    nativeAlternatives: ['import/no-cycle', 'import/no-self-import'],
    jsPluginSpecifiers: ['eslint-plugin-import'],
    jsPluginRuleExamples: ['import/export'],
    notes:
      'No native Oxlint rule currently blocks `export *` directly. Use JS plugin fallback if strict re-export controls are required.',
  },
  noRedundantUseStrict: {
    nativeAlternatives: ['unicorn/prefer-module'],
    notes:
      'No native Oxlint equivalent for redundant `"use strict"` directives. For ESM, strict mode is already implicit.',
  },
  useSingleVarDeclarator: {
    notes:
      'No native Oxlint equivalent for enforcing single declarators (ESLint `one-var`). Consider custom JS plugin policy if this is mandatory.',
  },
}

export function collectUnsupportedBiomeRules(warnings: string[]): string[] {
  const unsupported = new Set<string>()

  for (const warning of warnings) {
    const match = warning.match(/No Oxlint equivalent found for Biome rule:\s*(.+)$/)
    if (match?.[1]) {
      unsupported.add(match[1].trim())
    }
  }

  return [...unsupported].sort()
}

export function buildJsPluginScaffold(specifiers: string[] | undefined): OxlintJsPlugin[] {
  if (!specifiers || specifiers.length === 0) {
    return []
  }

  const usedNames = new Set<string>()
  const entries: OxlintJsPlugin[] = []

  for (const rawSpecifier of specifiers) {
    const specifier = rawSpecifier.trim()
    if (!specifier) {
      continue
    }

    const baseName = normalizePluginName(getBaseAlias(specifier))
    const safeBaseName = RESERVED_JS_PLUGIN_NAMES.has(baseName) ? `${baseName}-js` : baseName
    const name = makeUniqueName(safeBaseName, usedNames)

    entries.push({ name, specifier })
  }

  return entries
}

export function recommendJsPluginSpecifiersForUnsupportedRules(
  unsupportedRules: string[],
): string[] {
  const specifiers = new Set<string>()

  for (const rule of unsupportedRules) {
    const guidance = UNSUPPORTED_BIOME_RULE_GUIDANCE[rule]
    if (!guidance?.jsPluginSpecifiers) {
      continue
    }

    for (const specifier of guidance.jsPluginSpecifiers) {
      specifiers.add(specifier)
    }
  }

  return [...specifiers].sort()
}

export function buildUnsupportedRuleFallbackSuggestions(unsupportedRules: string[]): string[] {
  const suggestions: string[] = []

  for (const rule of unsupportedRules) {
    const guidance = UNSUPPORTED_BIOME_RULE_GUIDANCE[rule]
    if (!guidance) {
      continue
    }

    suggestions.push(`Fallback for ${rule}:`)

    if (guidance.nativeAlternatives && guidance.nativeAlternatives.length > 0) {
      suggestions.push(`  - Native alternatives: ${guidance.nativeAlternatives.join(', ')}`)
    }

    if (guidance.jsPluginRuleExamples && guidance.jsPluginRuleExamples.length > 0) {
      suggestions.push(`  - JS plugin rule candidates: ${guidance.jsPluginRuleExamples.join(', ')}`)
    }

    if (guidance.jsPluginSpecifiers && guidance.jsPluginSpecifiers.length > 0) {
      suggestions.push(
        `  - Suggested --js-plugin values: ${guidance.jsPluginSpecifiers.join(', ')}`,
      )
    }

    if (guidance.notes) {
      suggestions.push(`  - Note: ${guidance.notes}`)
    }
  }

  return suggestions
}

function getBaseAlias(specifier: string): string {
  if (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')) {
    return basename(specifier).replace(/\.[^.]+$/, '')
  }

  if (specifier.startsWith('@')) {
    const [scope, pkg = 'plugin'] = specifier.split('/')
    const scopePart = scope.replace(/^@/, '')
    const pkgPart = pkg.replace(/^eslint-plugin-/, '') || 'plugin'
    return `${scopePart}-${pkgPart}`
  }

  return specifier.replace(/^eslint-plugin-/, '') || 'plugin'
}

function normalizePluginName(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized.length > 0 ? normalized : 'plugin'
}

function makeUniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base)
    return base
  }

  let i = 2
  while (used.has(`${base}-${i}`)) {
    i += 1
  }

  const candidate = `${base}-${i}`
  used.add(candidate)
  return candidate
}
