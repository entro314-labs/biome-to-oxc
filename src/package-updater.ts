import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  PackageDependencyRemoval,
  PackageDevDependencyChange,
  PackageScriptUpdate,
  PackageUpdateSummary,
  Reporter,
} from './types.js';

type PackageJson = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
};

const OXLINT_VERSION = '^1.41.0';
const OXFMT_VERSION = '^0.26.0';

export function updatePackageJson(
  projectDir: string,
  reporter: Reporter,
  dryRun: boolean,
  options: { updateScripts?: boolean } = {},
): PackageUpdateSummary {
  const packageJsonPath = resolve(projectDir, 'package.json');
  const summary: PackageUpdateSummary = {
    packageJsonPath,
    found: false,
    dryRun,
    scriptsUpdated: [],
    dependenciesRemoved: [],
    devDependencies: [],
    changed: false,
  };

  if (!existsSync(packageJsonPath)) {
    reporter.warn('package.json not found, skipping dependency and script updates');
    return summary;
  }

  try {
    summary.found = true;
    const content = readFileSync(packageJsonPath, 'utf-8');
    const packageJson: PackageJson = JSON.parse(content);

    let modified = false;
    const updateScriptsEnabled = options.updateScripts ?? false;

    if (updateScriptsEnabled && packageJson.scripts) {
      modified =
        updateScripts(packageJson.scripts, reporter, summary.scriptsUpdated) || modified;
    }

    if (packageJson.devDependencies) {
      modified =
        removeBiomeDependency(
          packageJson.devDependencies,
          'devDependencies',
          summary.dependenciesRemoved,
          reporter,
        ) || modified;
    }

    if (packageJson.dependencies) {
      modified =
        removeBiomeDependency(
          packageJson.dependencies,
          'dependencies',
          summary.dependenciesRemoved,
          reporter,
        ) || modified;
    }

    if (!packageJson.devDependencies) {
      packageJson.devDependencies = {};
    }

    modified =
      ensureDevDependency(
        packageJson.devDependencies,
        'oxlint',
        OXLINT_VERSION,
        summary.devDependencies,
      ) || modified;
    modified =
      ensureDevDependency(
        packageJson.devDependencies,
        'oxfmt',
        OXFMT_VERSION,
        summary.devDependencies,
      ) || modified;

    summary.changed = modified;

    if (modified && !dryRun) {
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
      reporter.info('Updated package.json');
    } else if (modified && dryRun) {
      reporter.info('Would update package.json (dry-run mode)');
    }

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reporter.error(`Failed to update package.json: ${message}`);
    return summary;
  }
}

function updateScripts(
  scripts: Record<string, string>,
  reporter: Reporter,
  updates: PackageScriptUpdate[],
): boolean {
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
      updates.push({ name, before: script, after: newScript });
    }
  }

  return modified;
}

function removeBiomeDependency(
  dependencies: Record<string, string>,
  dependencyType: PackageDependencyRemoval['dependencyType'],
  removals: PackageDependencyRemoval[],
  reporter: Reporter,
): boolean {
  let modified = false;

  if (dependencies['@biomejs/biome']) {
    const version = dependencies['@biomejs/biome'];
    delete dependencies['@biomejs/biome'];
    modified = true;
    removals.push({ name: '@biomejs/biome', dependencyType, version });
    reporter.info(`Removed @biomejs/biome from ${dependencyType}`);
  }

  return modified;
}

function ensureDevDependency(
  dependencies: Record<string, string>,
  name: string,
  version: string,
  changes: PackageDevDependencyChange[],
): boolean {
  const existing = dependencies[name];

  if (!existing) {
    dependencies[name] = version;
    changes.push({ name, action: 'added', to: version });
    return true;
  }

  if (existing !== version) {
    dependencies[name] = version;
    changes.push({ name, action: 'updated', from: existing, to: version });
    return true;
  }

  changes.push({ name, action: 'already-present', to: existing });
  return false;
}
