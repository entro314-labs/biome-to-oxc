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

const OXLINT_VERSION = '^1.50.0';
const OXFMT_VERSION = '^0.33.0';
const OXLINT_TSGOLINT_VERSION = '^0.15.0';

export function updatePackageJson(
  projectDir: string,
  reporter: Reporter,
  dryRun: boolean,
  options: { updateScripts?: boolean; typeAware?: boolean } = {},
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
    const typeAwareEnabled = options.typeAware ?? false;

    if (updateScriptsEnabled && packageJson.scripts) {
      modified = updateScripts(packageJson.scripts, reporter, summary.scriptsUpdated) || modified;
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

    if (typeAwareEnabled) {
      modified =
        ensureDevDependency(
          packageJson.devDependencies,
          'oxlint-tsgolint',
          OXLINT_TSGOLINT_VERSION,
          summary.devDependencies,
        ) || modified;
    }

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
    let newScript = stripExecBiome(script);
    let updated = false;

    const replacements = [
      {
        command: 'check',
        check: 'oxlint && oxfmt --check',
        fix: 'oxlint --fix && oxfmt',
        unsafeFix: 'oxlint --fix --fix-suggestions && oxfmt',
      },
      {
        command: 'ci',
        check: 'oxlint && oxfmt --check',
        fix: 'oxlint --fix && oxfmt',
        unsafeFix: 'oxlint --fix --fix-suggestions && oxfmt',
      },
      {
        command: 'lint',
        check: 'oxlint',
        fix: 'oxlint --fix',
        unsafeFix: 'oxlint --fix --fix-suggestions',
      },
      {
        command: 'format',
        check: 'oxfmt --check',
        fix: 'oxfmt',
        unsafeFix: 'oxfmt',
      },
    ];

    for (const mapping of replacements) {
      const result = replaceBiomeCommand(
        newScript,
        mapping.command,
        mapping.check,
        mapping.fix,
        mapping.unsafeFix,
      );
      if (result.didReplace) {
        updated = true;
      }
      newScript = result.updated;
    }

    if (updated) {
      modified = true;
      reporter.info(`Updated script "${name}" to use oxlint/oxfmt equivalents`);
    }

    if (newScript !== script) {
      scripts[name] = newScript;
      updates.push({ name, before: script, after: newScript });
    }
  }

  return modified;
}

function replaceBiomeCommand(
  script: string,
  command: string,
  checkReplacement: string,
  fixReplacement: string,
  unsafeFixReplacement: string,
): { updated: string; didReplace: boolean } {
  let didReplace = false;
  const regex = new RegExp(`\\bbiome\\s+${command}\\b([^&|]*)`, 'g');
  const updated = script.replace(regex, (_match, args: string) => {
    didReplace = true;
    const hasFix = /\s--(write|fix)\b/.test(args);
    const hasUnsafe = /\s--unsafe\b/.test(args);
    const cleanedArgs = args.replace(/\s--(write|fix|unsafe)\b/g, '').trim();
    const suffix = cleanedArgs.length > 0 ? ` ${cleanedArgs}` : '';
    const replacement = hasUnsafe
      ? unsafeFixReplacement
      : hasFix
        ? fixReplacement
        : checkReplacement;
    return applySuffixToCommands(replacement, suffix);
  });

  return { updated, didReplace };
}

function applySuffixToCommands(replacement: string, suffix: string): string {
  if (!suffix) {
    return replacement;
  }

  if (!replacement.includes('&&')) {
    return `${replacement}${suffix}`;
  }

  return replacement
    .split('&&')
    .map((part) => `${part.trim()}${suffix}`)
    .join(' && ');
}

function stripExecBiome(script: string): string {
  const execBiomePattern = /(^|[;&|()]|&&|\|\|)\s*exec\s+biome\b/g;
  return script.replace(execBiomePattern, (_match, prefix: string) => {
    if (!prefix) {
      return 'biome';
    }

    const spacer = prefix.length > 0 ? ' ' : '';
    return `${prefix}${spacer}biome`;
  });
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
