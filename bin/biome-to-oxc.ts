#!/usr/bin/env node

import { program } from 'commander';
import pc from 'picocolors';
import { z } from 'zod';
import { migrate } from '../src/index.js';
import type { MigrationOptions } from '../src/types.js';

const packageJson = {
  name: 'biome-to-oxc',
  version: '0.1.0',
  description: 'Migrate from Biome to Oxc ecosystem (oxlint + oxfmt)',
};

// Zod schema for runtime validation
const MigrationOptionsSchema = z.object({
  configPath: z.string().optional(),
  outputDir: z.string().optional(),
  dryRun: z.boolean().default(false),
  noBackup: z.boolean().default(false),
  updateScripts: z.boolean().default(false),
  verbose: z.boolean().default(false),
  typeAware: z.boolean().default(false),
  turborepo: z.boolean().default(false),
  eslintBridge: z.boolean().default(false),
  prettier: z.boolean().default(false),
  report: z.string().optional(),
});

// Handle interrupt signals
const handleSignal = (signal: string, code: number) => {
  console.error(pc.red(`\n✖ Received ${signal}, exiting...`));
  process.exit(code);
};

process.on('SIGINT', () => handleSignal('SIGINT', 130));
process.on('SIGTERM', () => handleSignal('SIGTERM', 143));

process.on('unhandledRejection', (reason) => {
  console.error(pc.red('\n✖ Unhandled Promise Rejection:'));
  console.error(reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(pc.red('\n✖ Uncaught Exception:'));
  console.error(error);
  process.exit(1);
});

async function main() {
  program
    .name('biome-to-oxc')
    .version(packageJson.version)
    .description(packageJson.description)
    .option('-c, --config <path>', 'Path to biome.json or biome.jsonc')
    .option('-o, --output-dir <path>', 'Output directory for generated configs')
    .option('--dry-run', 'Show what would be done without making changes')
    .option('--no-backup', 'Skip backup of existing config files')
    .option('--update-scripts', 'Update package.json scripts to use oxlint/oxfmt')
    .option('--type-aware', 'Include type-aware linting guidance and dependencies')
    .option('--turborepo', 'Detect and update turbo.json for Turborepo integration')
    .option('--eslint-bridge', 'Provide ESLint bridge suggestions for running alongside ESLint')
    .option('--prettier', 'Detect Prettier config and provide migration suggestions')
    .option('--report <path>', 'Write detailed JSON migration report to specified path')
    .option('-v, --verbose', 'Show detailed migration information')
    .action(async (rawOptions) => {
      try {
        // Normalize options (commander transforms --no-backup to backup: false, we need to map it back)
        const opts = {
          ...rawOptions,
          noBackup: !rawOptions.backup, // map from commander's negation
        };
        // Remove the auxiliary backup prop from commander
        delete opts.backup;

        const validationResult = MigrationOptionsSchema.safeParse(opts);

        if (!validationResult.success) {
          console.error(pc.red('✖ Invalid options:'));
          validationResult.error.errors.forEach((err) => {
            console.error(`  - ${err.path.join('.')}: ${err.message}`);
          });
          process.exit(1);
        }

        const migrationOptions: MigrationOptions = validationResult.data;

        const report = await migrate(migrationOptions);

        if (report.success) {










          if (report.detectedIntegrations) {
            const integrations = Object.entries(report.detectedIntegrations)
              .filter(([_, detected]) => detected)
              if (report.success) {
                const dryRun = migrationOptions.dryRun ?? false;
                const heading = dryRun ? '✔ Migration preview' : '✔ Migration complete';
                console.log(pc.green(`\n${heading}`));

                console.log(pc.cyan(`\nConfiguration output${dryRun ? ' (planned)' : ''}:`));
                console.log(`  ${dryRun ? 'Would create' : 'Created'} Oxlint config: ${report.summary.oxlintConfigPath}`);
                console.log(`  ${dryRun ? 'Would create' : 'Created'} Oxfmt config: ${report.summary.oxfmtConfigPath}`);
                console.log(
                  `  Lint rules converted: ${report.summary.rulesConverted} (skipped: ${report.summary.rulesSkipped})`,
                );
                console.log(
                  `  Overrides converted: ${report.summary.overridesConverted} (formatter overrides: ${report.summary.formatterOverridesConverted})`,
                );

                if (report.packageJson) {
                  const pkg = report.packageJson;
                  console.log(pc.cyan(`\npackage.json updates${pkg.dryRun ? ' (planned)' : ''}:`));

                  if (!pkg.found) {
                    console.log(`  package.json not found; dependency and script updates skipped.`);
                  } else if (!pkg.changed) {
                    console.log(`  No package.json changes needed.`);
                  } else {
                    for (const removal of pkg.dependenciesRemoved) {
                      const versionLabel = removal.version ? ` (${removal.version})` : '';
                      console.log(
                        `  ${pkg.dryRun ? 'Would remove' : 'Removed'} ${removal.name} from ${removal.dependencyType}${versionLabel}`,
                      );
                    }

                    const devDepChanges = pkg.devDependencies.filter(
                      (change) => change.action !== 'already-present',
                    );

                    for (const change of devDepChanges) {
                      if (change.action === 'added') {
                        console.log(
                          `  ${pkg.dryRun ? 'Would add' : 'Added'} devDependency ${change.name}@${change.to}`,
                        );
                      } else {
                        const fromVersion = change.from ?? 'unknown';
                        console.log(
                          `  ${pkg.dryRun ? 'Would update' : 'Updated'} devDependency ${change.name} ${fromVersion} → ${change.to}`,
                        );
                      }
                    }

                    for (const scriptChange of pkg.scriptsUpdated) {
                      console.log(
                        `  ${pkg.dryRun ? 'Would update' : 'Updated'} script "${scriptChange.name}": ${scriptChange.before} → ${scriptChange.after}`,
                      );
                    }
                  }

                  if (pkg.found && migrationOptions.updateScripts && pkg.scriptsUpdated.length === 0) {
                    console.log('  No Biome scripts found to update.');
                  }
                }

                if (report.detectedIntegrations) {
                  const integrations = Object.entries(report.detectedIntegrations)
                    .filter(([_, detected]) => detected)
                    .map(([name]) => name);

                  if (integrations.length > 0) {
                    console.log(pc.cyan('\nDetected integrations:'));
                    console.log(`  ${integrations.join(', ')}`);
                  }
                }

                if (report.warnings.length > 0) {
                  console.log(pc.yellow(`\nWarnings (${report.warnings.length}):`));
                  if (migrationOptions.verbose) {
                    report.warnings.forEach((w) => {
                      console.log(`  - ${w}`);
                    });
                  } else {
                    console.log('  Run with --verbose to see all warning details.');
                  }
                }

                if (report.suggestions.length > 0) {
                  console.log(pc.cyan(`\nNext steps (${report.suggestions.length}):`));
                  if (migrationOptions.verbose) {
                    report.suggestions.forEach((s) => {
                      console.log(`  - ${s}`);
                    });
                  } else {
                    console.log('  Run with --verbose to see all suggestions.');
                  }
                }

                if (!migrationOptions.updateScripts) {
                  console.log(pc.dim('\nNote: Script updates were skipped (use --update-scripts to enable).'));
                }

                if (migrationOptions.report) {
                  if (migrationOptions.dryRun) {
                    console.log(pc.dim(`\nReport output skipped in dry-run mode: ${migrationOptions.report}`));
                  } else {
                    console.log(pc.green(`\nDetailed report written to: ${migrationOptions.report}`));
                  }
                }

                process.exit(0);
              } else {
                console.error(pc.red('\n✖ Migration failed.'));

                if (report.errors.length > 0) {
                  console.error(pc.red(`Errors (${report.errors.length}):`));
                  report.errors.forEach((e) => {
                    console.error(`  - ${e}`);
                  });
                }

                process.exit(1);
              }
});
