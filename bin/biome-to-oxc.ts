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
              .map(([name]) => name);

            if (integrations.length > 0) {
              
            }
          }

          if (report.warnings.length > 0) {
            
            if (migrationOptions.verbose) {
              report.warnings.forEach((w) => {});
            } else {
              
            }
          }

          if (report.suggestions.length > 0) {
            
            if (migrationOptions.verbose) {
              report.suggestions.forEach((s) => {});
            } else {
              
            }
          }

          
          
          
          
          
          

          if (!migrationOptions.updateScripts) {
            
          }

          if (migrationOptions.report) {
            
          }

          process.exit(0);
        } else {
          

          if (report.errors.length > 0) {
            
            report.errors.forEach((e) => {});
          }

          process.exit(1);
        }
      } catch (error) {
        console.error(pc.red('\n✖ Unexpected error during migration:'));
        console.error(error instanceof Error ? error.stack : error);
        process.exit(1);
      }
    });

  await program.parseAsync();
}

main().catch((error) => {
  console.error(pc.red('✖ Fatal error:'), error);
  process.exit(1);
});
