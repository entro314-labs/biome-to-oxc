import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Reporter } from './types.js';

type PackageJson = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
};

export function updatePackageJson(projectDir: string, reporter: Reporter, dryRun: boolean): void {
  const packageJsonPath = resolve(projectDir, 'package.json');

  if (!existsSync(packageJsonPath)) {
    reporter.warn('package.json not found, skipping script updates');
    return;
  }

  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    const packageJson: PackageJson = JSON.parse(content);

    let modified = false;

    if (packageJson.scripts) {
      modified = updateScripts(packageJson.scripts, reporter) || modified;
    }

    if (packageJson.devDependencies) {
      modified = updateDependencies(packageJson.devDependencies, reporter) || modified;
    }

    if (packageJson.dependencies) {
      modified = updateDependencies(packageJson.dependencies, reporter) || modified;
    }

    if (modified && !dryRun) {
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
      reporter.info('Updated package.json');
    } else if (modified && dryRun) {
      reporter.info('Would update package.json (dry-run mode)');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reporter.error(`Failed to update package.json: ${message}`);
  }
}

function updateScripts(scripts: Record<string, string>, reporter: Reporter): boolean {
  let modified = false;

  for (const [name, script] of Object.entries(scripts)) {
    let newScript = script;

    if (script.includes('biome check')) {
      newScript = newScript.replace(/biome check/g, 'oxlint && oxfmt --check');
      modified = true;
      reporter.info(`Updated script "${name}": biome check → oxlint && oxfmt --check`);
    }

    if (script.includes('biome lint')) {
      newScript = newScript.replace(/biome lint/g, 'oxlint');
      modified = true;
      reporter.info(`Updated script "${name}": biome lint → oxlint`);
    }

    if (script.includes('biome format')) {
      newScript = newScript.replace(/biome format/g, 'oxfmt');
      modified = true;
      reporter.info(`Updated script "${name}": biome format → oxfmt`);
    }

    if (script.includes('biome ci')) {
      newScript = newScript.replace(/biome ci/g, 'oxlint && oxfmt --check');
      modified = true;
      reporter.info(`Updated script "${name}": biome ci → oxlint && oxfmt --check`);
    }

    if (newScript !== script) {
      scripts[name] = newScript;
    }
  }

  return modified;
}

function updateDependencies(dependencies: Record<string, string>, reporter: Reporter): boolean {
  let modified = false;

  if (dependencies['@biomejs/biome']) {
    delete dependencies['@biomejs/biome'];
    dependencies['oxlint'] = '^1.41.0';
    dependencies['oxfmt'] = '^0.26.0';
    modified = true;
    reporter.info('Replaced @biomejs/biome with oxlint and oxfmt in dependencies');
  }

  return modified;
}
