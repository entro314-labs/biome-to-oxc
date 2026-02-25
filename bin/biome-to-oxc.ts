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
  typeAwareProfile: z.enum(['standard', 'strict']).default('standard'),
  fixStrategy: z.enum(['safe', 'suggestions', 'dangerous']).default('safe'),
  jsPlugins: z.boolean().default(false),
  jsPlugin: z.array(z.string()).optional(),
  importGraph: z.boolean().default(false),
  importCycleMaxDepth: z.number().int().positive().default(3),
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
    .option(
      '--type-aware-profile <profile>',
      'Type-aware profile: standard (--type-aware) or strict (--type-aware --type-check)',
      'standard',
    )
    .option(
      '--fix-strategy <strategy>',
      'Fix mode for rewritten scripts: safe | suggestions | dangerous',
      'safe',
    )
    .option('--js-plugins', 'Emit jsPlugins scaffold when unsupported rules are detected')
    .option(
      '--js-plugin <specifier>',
      'JS plugin specifier to scaffold (repeatable). Example: eslint-plugin-playwright',
      (value: string, previous: string[] = []) => {
        previous.push(value);
        return previous;
      },
      [],
    )
    .option('--import-graph', 'Add import graph baseline (import/no-cycle) to generated Oxlint config')
    .option(
      '--import-cycle-max-depth <depth>',
      'Max depth for import/no-cycle when --import-graph is enabled',
      (value: string) => Number.parseInt(value, 10),
      3,
    )
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
          validationResult.error.issues.forEach((err: z.ZodIssue) => {
            console.error(`  - ${err.path.join('.')}: ${err.message}`);
          });
          process.exit(1);
        }

        const migrationOptions: MigrationOptions = validationResult.data;

        const report = await migrate(migrationOptions);

        if (report.success) {
          const dryRun = migrationOptions.dryRun ?? false;









          if (report.packageJson) {
            const pkg = report.packageJson;


            if (!pkg.found) {

            } else if (!pkg.changed) {

            } else {
              for (const removal of pkg.dependenciesRemoved) {


              }

              const devDepChanges = pkg.devDependencies.filter(
                (change) => change.action !== 'already-present',
              );

              for (const change of devDepChanges) {
                if (change.action === 'added') {

                } else {


                }
              }

              for (const _scriptChange of pkg.scriptsUpdated) {

              }
            }

            if (pkg.found && migrationOptions.updateScripts && pkg.scriptsUpdated.length === 0) {

            }
          }

          if (report.detectedIntegrations) {
            const integrations = Object.entries(report.detectedIntegrations)
              .filter(([_, detected]) => detected)
              .map(([name]) => name);

            if (integrations.length > 0) {


            }
          }

          if (report.warnings.length > 0) {

            if (migrationOptions.verbose) {
              report.warnings.forEach((w) => {

              });
            } else {

            }
          }

          if (report.suggestions.length > 0) {

            if (migrationOptions.verbose) {
              report.suggestions.forEach((s) => {

              });
            } else {

            }
          }

          if (!migrationOptions.updateScripts) {

          }

          if (migrationOptions.report) {
            if (migrationOptions.dryRun) {

            } else {

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
      } catch (error) {
        console.error(pc.red('\n✖ Unexpected error during migration:'));
        console.error(error instanceof Error ? error.stack : error);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(pc.red('✖ Fatal error:'), error);
  process.exit(1);
});
