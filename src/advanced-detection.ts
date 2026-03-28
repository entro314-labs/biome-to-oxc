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
    features.hasImportSorting = Object.keys(biomeConfig.linter.rules).some(
      (key) =>
        key.toLowerCase().includes('import') &&
        (key.toLowerCase().includes('sort') || key.toLowerCase().includes('order')),
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
    suggestions.push('  - sortTailwindcss enabled with common class attributes')
    suggestions.push('  - Supports: class, className, :class attributes')
    suggestions.push('  - Supports: clsx, cn, classNames, tw functions')
  }

  if (features.hasImportSorting) {
    suggestions.push('')
    suggestions.push('Import sorting detected:')
    suggestions.push('  - sortImports enabled')
    suggestions.push('  - Imports will be sorted alphabetically with newlines between groups')
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
    suggestions.push('  - sortPackageJson enabled for all package.json files')
    suggestions.push('  - Consider using workspace-specific overrides')
  }

  return suggestions
}
