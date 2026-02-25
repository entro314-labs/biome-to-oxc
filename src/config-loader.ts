import { readFile } from 'node:fs/promises';
 // Keep synchronous check for simple path resolution if needed, but prefer async access usually.
// Actually, strict async migration means avoiding blocking calls.
import { stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import type { BiomeConfig, Reporter } from './types.js';
import { normalizeBiomeConfig } from './schema-normalizer.js';

const BIOME_CONFIG_NAMES = ['biome.json', 'biome.jsonc'];

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function findBiomeConfig(startDir: string): Promise<string | undefined> {
  for (const name of BIOME_CONFIG_NAMES) {
    const configPath = resolve(startDir, name);
    if (await fileExists(configPath)) {
      return configPath;
    }
  }
  return undefined;
}

async function findMonorepoRoot(startDir: string): Promise<string | undefined> {
  let currentDir = startDir;
  const root = resolve('/');

  while (currentDir !== root) {
    if (await fileExists(join(currentDir, '.git'))) {
      return currentDir;
    }

    const packageJsonPath = join(currentDir, 'package.json');
    if (await fileExists(packageJsonPath)) {
      try {
        const content = await readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(content);
        if (packageJson.workspaces) {
          return currentDir;
        }
      } catch {
        // Continue searching
      }
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return undefined;
}

export async function loadBiomeConfig(
  configPath: string,
  reporter: Reporter,
): Promise<BiomeConfig> {
  try {
    const content = await readFile(configPath, 'utf-8');
    const config = parseJsonc(content) as BiomeConfig;

    if (!config) {
      throw new Error('Failed to parse Biome configuration');
    }

    const normalized = normalizeBiomeConfig(config, reporter);
    return normalized;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reporter.error(`Failed to load Biome config from ${configPath}: ${message}`);
    throw error;
  }
}

export async function resolveBiomeExtends(
  config: BiomeConfig,
  configDir: string,
  reporter: Reporter,
): Promise<BiomeConfig> {
  if (!config.extends) {
    return config;
  }

  const extendsArray = Array.isArray(config.extends) ? config.extends : [config.extends];
  let mergedConfig: BiomeConfig = {};

  for (const extendPath of extendsArray) {
    let resolvedPath: string;

    if (extendPath === '//') {
      const monorepoRoot = await findMonorepoRoot(configDir);
      if (!monorepoRoot) {
        reporter.warn('Monorepo root ("//" extends) not found. Skipping this extends.');
        continue;
      }
      const rootConfigPath = await findBiomeConfig(monorepoRoot);
      if (!rootConfigPath) {
        reporter.warn(`No Biome config found at monorepo root: ${monorepoRoot}`);
        continue;
      }
      resolvedPath = rootConfigPath;
    } else {
      resolvedPath = resolve(configDir, extendPath);
    }

    if (!(await fileExists(resolvedPath))) {
      reporter.warn(`Extended config not found: ${extendPath}`);
      continue;
    }

    try {
      const extendedConfig = await loadBiomeConfig(resolvedPath, reporter);
      const extendedDir = dirname(resolvedPath);
      // Recursively resolve extends
      const resolvedExtendedConfig = await resolveBiomeExtends(
        extendedConfig,
        extendedDir,
        reporter,
      );

      mergedConfig = deepMerge(mergedConfig, resolvedExtendedConfig);
    } catch  {
      reporter.warn(`Failed to load extended config: ${extendPath}`);
    }
  }

  const { extends: _, ...configWithoutExtends } = config;
  return deepMerge(mergedConfig, configWithoutExtends);
}

function deepMerge<T>(target: T, source: T): T {
  if (!source) return target;
  if (!target) return source;

  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (isObject(sourceValue) && isObject(targetValue)) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }

  return result;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
