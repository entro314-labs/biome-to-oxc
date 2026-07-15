import type { BiomeConfig, Reporter } from './types.js'

export interface ProjectFeatures {
  hasVue: boolean
  hasReact: boolean
  hasTailwind: boolean
  hasTypeScript: boolean
  hasImportSorting: boolean
  hasMonorepo: boolean
  hasGraphQL: boolean
  hasCSS: boolean
  hasHTML: boolean
}

export function detectProjectFeatures(
  biomeConfig: BiomeConfig,
  reporter: Reporter,
): ProjectFeatures {
  const features: ProjectFeatures = {
    hasVue: false,
    hasReact: false,
    hasTailwind: false,
    hasTypeScript: false,
    hasImportSorting: false,
    hasMonorepo: false,
    hasGraphQL: false,
    hasCSS: false,
    hasHTML: false,
  }

  const allIncludes = [
    ...(biomeConfig.files?.include ?? []),
    ...(biomeConfig.linter?.include ?? []),
    ...(biomeConfig.formatter?.include ?? []),
  ]

  // Vue detection
  features.hasVue = allIncludes.some(
    (pattern) => pattern.includes('.vue') || pattern.toLowerCase().includes('vue'),
  )

  // React detection
  features.hasReact =
    allIncludes.some(
      (pattern) =>
        pattern.includes('.jsx') ||
        pattern.includes('.tsx') ||
        pattern.toLowerCase().includes('react'),
    ) || !!biomeConfig.javascript?.parser?.jsxEverywhere

  // Tailwind detection
  features.hasTailwind = allIncludes.some(
    (pattern) =>
      pattern.toLowerCase().includes('tailwind') ||
      pattern.includes('tw-') ||
      pattern.includes('tailwind.config'),
  )

  // TypeScript detection
  features.hasTypeScript = allIncludes.some(
    (pattern) => pattern.includes('.ts') || pattern.includes('.tsx') || pattern.includes('.mts'),
  )

  // Import sorting detection
  if (biomeConfig.linter?.rules && typeof biomeConfig.linter.rules === 'object') {
    features.hasImportSorting = collectNestedRuleNames(biomeConfig.linter.rules).some(
      (ruleName) =>
        ruleName.toLowerCase().includes('import') &&
        (ruleName.toLowerCase().includes('sort') || ruleName.toLowerCase().includes('order')),
    )
  }

  // Monorepo detection
  features.hasMonorepo =
    !!biomeConfig.extends &&
    (Array.isArray(biomeConfig.extends)
      ? biomeConfig.extends.includes('//')
      : biomeConfig.extends === '//')

  // GraphQL detection
  features.hasGraphQL = allIncludes.some(
    (pattern) =>
      pattern.includes('.graphql') ||
      pattern.includes('.gql') ||
      pattern.toLowerCase().includes('graphql'),
  )

  // CSS detection
  features.hasCSS =
    allIncludes.some(
      (pattern) =>
        pattern.includes('.css') ||
        pattern.includes('.scss') ||
        pattern.includes('.sass') ||
        pattern.includes('.less'),
    ) || !!biomeConfig.css

  // HTML detection
  features.hasHTML =
    allIncludes.some((pattern) => pattern.includes('.html') || pattern.includes('.htm')) ||
    biomeConfig.html !== undefined

  // Log detected features
  const detectedFeatures = Object.entries(features)
    .filter(([_, value]) => value)
    .map(([key]) => key.replace('has', ''))

  if (detectedFeatures.length > 0) {
    reporter.info(`Detected project features: ${detectedFeatures.join(', ')}`)
  }

  return features
}

export function generateFeatureSpecificSuggestions(features: ProjectFeatures): string[] {
  const suggestions: string[] = []

  if (features.hasVue) {
    suggestions.push('')
    suggestions.push('Vue.js detected:')
    suggestions.push('  - vueIndentScriptAndStyle option configured')
    suggestions.push('  - Consider using @vue/eslint-config-prettier for Vue-specific formatting')
  }

  if (features.hasTailwind) {
    suggestions.push('')
    suggestions.push('Tailwind CSS detected:')
    suggestions.push('  - Review whether to opt into Oxfmt sortTailwindcss manually')
    suggestions.push('  - Common attributes: class, className, :class')
    suggestions.push('  - Common functions: clsx, cn, classNames, tw')
  }

  if (features.hasImportSorting) {
    suggestions.push('')
    suggestions.push('Import sorting detected:')
    suggestions.push('  - Review whether to opt into Oxfmt sortImports manually')
  }

  if (features.hasGraphQL) {
    suggestions.push('')
    suggestions.push('GraphQL detected:')
    suggestions.push('  - Consider using graphql-prettier for GraphQL formatting')
    suggestions.push('  - Oxfmt may support GraphQL in future releases')
  }

  if (features.hasMonorepo) {
    suggestions.push('')
    suggestions.push('Monorepo detected:')
    suggestions.push('  - Consider using workspace-specific overrides')
  }

  return suggestions
}

function collectNestedRuleNames(rules: Record<string, unknown>): string[] {
  const ruleNames: string[] = []

  for (const [key, value] of Object.entries(rules)) {
    if (key === 'recommended' || key === 'all') {
      continue
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const nestedKey of Object.keys(value)) {
        if (nestedKey === 'recommended' || nestedKey === 'all') {
          continue
        }

        ruleNames.push(nestedKey)
      }
    }
  }

  return ruleNames
}
