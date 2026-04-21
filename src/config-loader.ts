import { readFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'

import { parse as parseJsonc, printParseErrorCode } from 'jsonc-parser'
import type { ParseError as JsoncParseError } from 'jsonc-parser'
import { z } from 'zod'

import { formatZodIssues, pathExists, readJsonFile } from './fs-utils.js'
import { normalizeBiomeConfig } from './schema-normalizer.js'
import type {
  BiomeConfig,
  BiomeCssConfig,
  BiomeFormatterConfig,
  BiomeJavaScriptConfig,
  BiomeJsonConfig,
  BiomeLinterConfig,
  BiomeLinterRules,
  BiomeOverride,
  BiomeRuleGroup,
  Reporter,
} from './types.js'

const BIOME_CONFIG_NAMES = ['biome.json', 'biome.jsonc']
const IncludeFieldsSchema = z
  .object({
    include: z.array(z.string()).optional(),
    includes: z.array(z.string()).optional(),
  })
  .passthrough()
const BiomeRuleSeveritySchema = z.union([
  z.enum(['off', 'warn', 'error']),
  z
    .object({
      level: z.enum(['off', 'warn', 'error']),
      options: z.unknown().optional(),
    })
    .passthrough(),
])
const BiomeRuleGroupSchema: z.ZodType<BiomeRuleGroup> = z
  .object({
    recommended: z.boolean().optional(),
    all: z.boolean().optional(),
  })
  .catchall(z.union([BiomeRuleSeveritySchema, z.boolean()]))
const BiomeLinterRulesSchema: z.ZodType<BiomeLinterRules> = z
  .object({
    recommended: z.boolean().optional(),
    all: z.boolean().optional(),
  })
  .catchall(z.union([z.boolean(), BiomeRuleGroupSchema]))
const BiomeFormatterConfigSchema: z.ZodType<BiomeFormatterConfig> = IncludeFieldsSchema.extend({
  ignore: z.array(z.string()).optional(),
  formatWithErrors: z.boolean().optional(),
  indentStyle: z.enum(['tab', 'space']).optional(),
  indentWidth: z.number().int().optional(),
  lineEnding: z.enum(['lf', 'crlf', 'cr']).optional(),
  lineWidth: z.number().int().optional(),
  attributePosition: z.enum(['auto', 'multiline']).optional(),
  bracketSpacing: z.boolean().optional(),
}).passthrough()
const BiomeJavaScriptFormatterSchema: z.ZodType<NonNullable<BiomeJavaScriptConfig['formatter']>> = z
  .object({
    enabled: z.boolean().optional(),
    quoteStyle: z.enum(['single', 'double']).optional(),
    jsxQuoteStyle: z.enum(['single', 'double']).optional(),
    quoteProperties: z.enum(['asNeeded', 'preserve']).optional(),
    trailingCommas: z.enum(['all', 'es5', 'none']).optional(),
    semicolons: z.enum(['always', 'asNeeded']).optional(),
    arrowParentheses: z.enum(['always', 'asNeeded']).optional(),
    bracketSameLine: z.boolean().optional(),
    bracketSpacing: z.boolean().optional(),
    indentStyle: z.enum(['tab', 'space']).optional(),
    indentWidth: z.number().int().optional(),
    lineEnding: z.enum(['lf', 'crlf', 'cr']).optional(),
    lineWidth: z.number().int().optional(),
  })
  .passthrough()
const BiomeJavaScriptConfigSchema: z.ZodType<BiomeJavaScriptConfig> = z
  .object({
    parser: z
      .object({
        unsafeParameterDecoratorsEnabled: z.boolean().optional(),
        jsxEverywhere: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    formatter: BiomeJavaScriptFormatterSchema.optional(),
    linter: z
      .object({
        enabled: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    globals: z.array(z.string()).optional(),
  })
  .passthrough()
const BiomeJsonConfigSchema: z.ZodType<BiomeJsonConfig> = z
  .object({
    parser: z
      .object({
        allowComments: z.boolean().optional(),
        allowTrailingCommas: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    formatter: z
      .object({
        enabled: z.boolean().optional(),
        indentStyle: z.enum(['tab', 'space']).optional(),
        indentWidth: z.number().int().optional(),
        lineEnding: z.enum(['lf', 'crlf', 'cr']).optional(),
        lineWidth: z.number().int().optional(),
        trailingCommas: z.enum(['none', 'all']).optional(),
      })
      .passthrough()
      .optional(),
    linter: z
      .object({
        enabled: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
const BiomeCssConfigSchema: z.ZodType<BiomeCssConfig> = z
  .object({
    parser: z
      .object({
        cssModules: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    formatter: z
      .object({
        enabled: z.boolean().optional(),
        indentStyle: z.enum(['tab', 'space']).optional(),
        indentWidth: z.number().int().optional(),
        lineEnding: z.enum(['lf', 'crlf', 'cr']).optional(),
        lineWidth: z.number().int().optional(),
        quoteStyle: z.enum(['single', 'double']).optional(),
      })
      .passthrough()
      .optional(),
    linter: z
      .object({
        enabled: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
const BiomeLinterConfigSchema: z.ZodType<BiomeLinterConfig> = IncludeFieldsSchema.extend({
  enabled: z.boolean().optional(),
  ignore: z.array(z.string()).optional(),
  rules: BiomeLinterRulesSchema.optional(),
}).passthrough()
const BiomeOverrideSchema: z.ZodType<BiomeOverride> = z
  .object({
    include: z.array(z.string()).optional(),
    includes: z.array(z.string()).optional(),
    ignore: z.array(z.string()).optional(),
    linter: BiomeLinterConfigSchema.optional(),
    formatter: BiomeFormatterConfigSchema.optional(),
    javascript: BiomeJavaScriptConfigSchema.optional(),
    json: BiomeJsonConfigSchema.optional(),
    css: BiomeCssConfigSchema.optional(),
  })
  .passthrough()
const BiomeConfigSchema: z.ZodType<BiomeConfig> = z
  .object({
    $schema: z.string().optional(),
    extends: z.union([z.string(), z.array(z.string())]).optional(),
    root: z.boolean().optional(),
    files: z
      .object({
        include: z.array(z.string()).optional(),
        includes: z.array(z.string()).optional(),
        ignore: z.array(z.string()).optional(),
        ignoreUnknown: z.boolean().optional(),
        maxSize: z.number().int().optional(),
      })
      .passthrough()
      .optional(),
    vcs: z
      .object({
        enabled: z.boolean().optional(),
        clientKind: z.literal('git').optional(),
        useIgnoreFile: z.boolean().optional(),
        root: z.string().optional(),
        defaultBranch: z.string().optional(),
      })
      .passthrough()
      .optional(),
    linter: BiomeLinterConfigSchema.optional(),
    formatter: BiomeFormatterConfigSchema.optional(),
    javascript: BiomeJavaScriptConfigSchema.optional(),
    json: BiomeJsonConfigSchema.optional(),
    css: BiomeCssConfigSchema.optional(),
    html: z.record(z.string(), z.unknown()).optional(),
    overrides: z.array(BiomeOverrideSchema).optional(),
  })
  .passthrough()
const WorkspacePackageJsonSchema = z
  .object({
    workspaces: z.union([z.array(z.string()), z.record(z.string(), z.unknown())]).optional(),
  })
  .passthrough()

export async function findBiomeConfig(startDir: string): Promise<string | undefined> {
  for (const name of BIOME_CONFIG_NAMES) {
    const configPath = resolve(startDir, name)
    if (await pathExists(configPath)) {
      return configPath
    }
  }
  return undefined
}

async function findMonorepoRoot(startDir: string): Promise<string | undefined> {
  let currentDir = startDir

  while (true) {
    if (await pathExists(join(currentDir, '.git'))) {
      return currentDir
    }

    const packageJsonPath = join(currentDir, 'package.json')
    if (await pathExists(packageJsonPath)) {
      try {
        const packageJson = await readJsonFile(
          packageJsonPath,
          WorkspacePackageJsonSchema,
          `workspace package manifest at ${packageJsonPath}`,
        )
        if (packageJson.workspaces) {
          return currentDir
        }
      } catch {
        // Continue searching when parent manifests are not valid.
      }
    }

    const parentDir = dirname(currentDir)

    if (parentDir === currentDir) {
      return undefined
    }

    currentDir = parentDir
  }
}

export async function loadBiomeConfig(
  configPath: string,
  reporter: Reporter,
): Promise<BiomeConfig> {
  try {
    const content = await readFile(configPath, 'utf-8')
    const parseErrors: JsoncParseError[] = []
    const parsedConfig = parseJsonc(content, parseErrors) as unknown

    if (parseErrors.length > 0) {
      const formattedErrors = parseErrors
        .map((issue) => {
          const location = issue.offset >= 0 ? `offset ${issue.offset}` : 'unknown offset'
          return `${printParseErrorCode(issue.error)} at ${location}`
        })
        .join('; ')
      throw new Error(`JSONC parsing failed: ${formattedErrors}`)
    }

    const validationResult = BiomeConfigSchema.safeParse(parsedConfig)

    if (!validationResult.success) {
      throw new Error(`schema validation failed: ${formatZodIssues(validationResult.error)}`)
    }

    const normalized = normalizeBiomeConfig(validationResult.data, reporter)
    return normalized
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    reporter.error(`Failed to load Biome config from ${configPath}: ${message}`)
    throw err
  }
}

export async function resolveBiomeExtends(
  config: BiomeConfig,
  configDir: string,
  reporter: Reporter,
): Promise<BiomeConfig> {
  if (!config.extends) {
    return config
  }

  const extendsArray = Array.isArray(config.extends) ? config.extends : [config.extends]
  let mergedConfig: BiomeConfig = {}

  for (const extendPath of extendsArray) {
    let resolvedPath: string

    if (extendPath === '//') {
      const monorepoRoot = await findMonorepoRoot(configDir)
      if (!monorepoRoot) {
        reporter.warn('Monorepo root ("//" extends) not found. Skipping this extends.')
        continue
      }
      const rootConfigPath = await findBiomeConfig(monorepoRoot)
      if (!rootConfigPath) {
        reporter.warn(`No Biome config found at monorepo root: ${monorepoRoot}`)
        continue
      }
      resolvedPath = rootConfigPath
    } else {
      resolvedPath = resolve(configDir, extendPath)
    }

    if (!(await pathExists(resolvedPath))) {
      reporter.warn(`Extended config not found: ${extendPath}`)
      continue
    }

    try {
      const extendedConfig = await loadBiomeConfig(resolvedPath, reporter)
      const extendedDir = dirname(resolvedPath)
      // Recursively resolve extends
      const resolvedExtendedConfig = await resolveBiomeExtends(
        extendedConfig,
        extendedDir,
        reporter,
      )

      mergedConfig = deepMerge(mergedConfig, resolvedExtendedConfig)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      reporter.error(
        `Failed to resolve extends entry "${extendPath}" at ${resolvedPath}: ${message}`,
      )
      throw new Error(`Unable to resolve extends entry "${extendPath}"`, { cause: err })
    }
  }

  const { extends: _, ...configWithoutExtends } = config
  return deepMerge(mergedConfig, configWithoutExtends)
}

function deepMerge<T>(target: T, source: T): T {
  if (!source) return target
  if (!target) return source

  const result = { ...target }

  for (const key in source) {
    const sourceValue = source[key]
    const targetValue = result[key]

    if (isObject(sourceValue) && isObject(targetValue)) {
      result[key] = deepMerge(targetValue, sourceValue)
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue
    }
  }

  return result
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
