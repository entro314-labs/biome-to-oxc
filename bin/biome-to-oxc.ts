#!/usr/bin/env node

import { realpath } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Command, CommanderError, InvalidArgumentError, Option } from 'commander'
import pc from 'picocolors'
import { z } from 'zod'

import { findClosestPackageJson, readJsonFile } from '../src/fs-utils.js'
import { migrate } from '../src/index.js'
import { DefaultReporter } from '../src/reporter.js'
import type { FixStrategy, MigrationOptions, TypeAwareProfile } from '../src/types.js'

interface CliWriteStream {
  write(chunk: string): boolean | undefined
}

interface CliRuntimeOptions {
  signal?: AbortSignal
  stderr?: CliWriteStream
  stdout?: CliWriteStream
}

interface CliPackageMetadata {
  description: string
  name: string
  version: string
}

interface ParsedCliOptions {
  backup?: boolean
  config?: string
  delete?: boolean
  dom?: boolean
  dryRun?: boolean
  eslintBridge?: boolean
  fixStrategy?: FixStrategy
  importCycleMaxDepth?: number
  importGraph?: boolean
  jsPlugin?: string[]
  jsPlugins?: boolean
  json?: boolean
  outputDir?: string
  prettier?: boolean
  report?: string
  turborepo?: boolean
  typeAware?: boolean
  typeAwareProfile?: TypeAwareProfile
  typeCheck?: boolean
  updateScripts?: boolean
  verbose?: boolean
}

const CliPackageMetadataSchema = z.object({
  description: z.string().default('Migrate from Biome to the Oxc tooling stack'),
  name: z.string().default('biome-to-oxc'),
  version: z.string(),
})
const MigrationOptionsSchema = z.object({
  configPath: z.string().optional(),
  outputDir: z.string().optional(),
  dryRun: z.boolean().default(false),
  delete: z.boolean().default(false),
  noBackup: z.boolean().default(false),
  updateScripts: z.boolean().default(false),
  dom: z.boolean().default(false),
  verbose: z.boolean().default(false),
  typeAware: z.boolean().default(false),
  typeCheck: z.boolean().default(false),
  typeAwareProfile: z.enum(['standard', 'strict']).default('standard'),
  fixStrategy: z.enum(['safe', 'suggestions', 'dangerous']).default('safe'),
  jsPlugins: z.boolean().default(false),
  jsPlugin: z.array(z.string()).default([]),
  importGraph: z.boolean().default(false),
  importCycleMaxDepth: z.number().int().positive().default(3),
  turborepo: z.boolean().default(false),
  eslintBridge: z.boolean().default(false),
  prettier: z.boolean().default(false),
  report: z.string().optional(),
})

export async function runCli(
  argv: string[],
  runtimeOptions: CliRuntimeOptions = {},
): Promise<number> {
  const stdout = runtimeOptions.stdout ?? process.stdout
  const stderr = runtimeOptions.stderr ?? process.stderr

  try {
    const packageMetadata = await loadCliPackageMetadata()
    const command = createCommand(packageMetadata, { stdout, stderr })

    try {
      await command.parseAsync(argv, { from: 'user' })
    } catch (err) {
      if (err instanceof CommanderError) {
        return err.exitCode === 0 ? 0 : 2
      }

      throw err
    }

    const parsedCliOptions = command.opts<ParsedCliOptions>()
    const normalizedOptions = normalizeMigrationOptions(parsedCliOptions)
    const validationResult = MigrationOptionsSchema.safeParse(normalizedOptions)

    if (!validationResult.success) {
      stderr.write(`${pc.red('✖')} Invalid options:\n`)
      for (const issue of validationResult.error.issues) {
        const path = issue.path.length > 0 ? issue.path.join('.') : '<root>'
        stderr.write(`  - ${path}: ${issue.message}\n`)
      }
      return 2
    }

    const migrationOptions: MigrationOptions = {
      ...validationResult.data,
      signal: runtimeOptions.signal,
    }
    const reporter = new DefaultReporter({
      verbose: validationResult.data.verbose && !parsedCliOptions.json,
      stdout,
      stderr,
    })
    const report = await migrate(migrationOptions, reporter)

    if (parsedCliOptions.json) {
      stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    }

    return report.success ? 0 : 1
  } catch (err) {
    if (isAbortError(err)) {
      stderr.write(`${pc.yellow('⚠')} Migration cancelled.\n`)
      return 1
    }

    stderr.write(`${pc.red('✖')} ${formatUnexpectedError(err)}\n`)
    return 1
  }
}

export function createTerminationHandler(
  signalName: NodeJS.Signals,
  controller: AbortController,
  stderr: CliWriteStream,
): () => void {
  return () => {
    if (controller.signal.aborted) {
      return
    }

    stderr.write(`${pc.yellow('⚠')} Received ${signalName}. Waiting for cleanup to finish.\n`)
    controller.abort(new DOMException(`Received ${signalName}`, 'AbortError'))
  }
}

function createCommand(
  packageMetadata: CliPackageMetadata,
  streams: { stderr: CliWriteStream; stdout: CliWriteStream },
): Command {
  const command = new Command()

  command
    .name(packageMetadata.name)
    .description(packageMetadata.description)
    .version(packageMetadata.version)
    .helpOption('-h, --help', 'display help for command')
    .showHelpAfterError()
    .showSuggestionAfterError()
    .exitOverride()
    .configureOutput({
      writeErr: (chunk) => {
        streams.stderr.write(chunk)
      },
      writeOut: (chunk) => {
        streams.stdout.write(chunk)
      },
    })
    .option('-c, --config <path>', 'Path to biome.json or biome.jsonc')
    .option('-o, --output-dir <path>', 'Output directory for generated configs')
    .option('--dry-run', 'Show what would be done without making changes')
    .option(
      '--delete',
      'Delete legacy Biome files after migration (biome.json/biome.jsonc and .biomeignore)',
    )
    .option('--no-backup', 'Skip backup of existing config files')
    .option('--update-scripts', 'Update package.json scripts to use oxlint/oxfmt')
    .addOption(new Option('--dom').hideHelp())
    .option('--type-aware', 'Include type-aware linting guidance and dependencies')
    .option('--type-check', 'Enable strict typed linting mode (implies --type-aware)')
    .addOption(
      new Option(
        '--type-aware-profile <profile>',
        'Type-aware profile: standard (--type-aware) or strict (--type-aware --type-check)',
      )
        .choices(['standard', 'strict'])
        .default('standard'),
    )
    .addOption(
      new Option(
        '--fix-strategy <strategy>',
        'Fix mode for rewritten scripts: safe | suggestions | dangerous',
      )
        .choices(['safe', 'suggestions', 'dangerous'])
        .default('safe'),
    )
    .option('--js-plugins', 'Emit jsPlugins scaffold when unsupported rules are detected')
    .option(
      '--js-plugin <specifier>',
      'JS plugin specifier to scaffold (repeatable). Example: eslint-plugin-playwright',
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option(
      '--import-graph',
      'Add import graph baseline (import/no-cycle) to generated Oxlint config',
    )
    .option(
      '--import-cycle-max-depth <depth>',
      'Max depth for import/no-cycle when --import-graph is enabled',
      parsePositiveInteger,
      3,
    )
    .option('--turborepo', 'Detect and update turbo.json task metadata for Turborepo integration')
    .option('--eslint-bridge', 'Provide ESLint bridge suggestions for running alongside ESLint')
    .option('--prettier', 'Detect Prettier config and provide migration suggestions')
    .option('--report <path>', 'Write the migration report to a JSON file')
    .option('--json', 'Print the migration report as JSON to stdout')
    .option('-v, --verbose', 'Show detailed migration information')

  return command
}

async function loadCliPackageMetadata(): Promise<CliPackageMetadata> {
  const packageDirectory = dirname(fileURLToPath(import.meta.url))
  const packageManifestPath = await findClosestPackageJson(packageDirectory)

  if (!packageManifestPath) {
    throw new Error('Unable to locate the CLI package manifest.')
  }

  return readJsonFile(
    packageManifestPath,
    CliPackageMetadataSchema,
    `CLI package manifest at ${packageManifestPath}`,
  )
}

function normalizeMigrationOptions(
  options: ParsedCliOptions,
): z.input<typeof MigrationOptionsSchema> {
  const typeAwareProfile = options.typeAwareProfile ?? 'standard'
  const typeCheck = options.typeCheck ?? typeAwareProfile === 'strict'
  const typeAware = options.typeAware ?? (typeCheck || typeAwareProfile === 'strict')

  return {
    configPath: options.config,
    outputDir: options.outputDir,
    dryRun: options.dryRun,
    delete: options.delete,
    noBackup: options.backup === false,
    updateScripts: options.updateScripts,
    dom: options.dom,
    verbose: options.verbose,
    typeAware,
    typeCheck,
    typeAwareProfile,
    fixStrategy: options.fixStrategy,
    jsPlugins: options.jsPlugins,
    jsPlugin: options.jsPlugin,
    importGraph: options.importGraph,
    importCycleMaxDepth: options.importCycleMaxDepth,
    turborepo: options.turborepo,
    eslintBridge: options.eslintBridge,
    prettier: options.prettier,
    report: options.report,
  }
}

function parsePositiveInteger(value: string): number {
  const parsedValue = Number.parseInt(value, 10)

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new InvalidArgumentError('Expected a positive integer.')
  }

  return parsedValue
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function formatUnexpectedError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

async function runAsMain(): Promise<void> {
  const controller = new AbortController()
  const { stderr } = process
  const handleSigint = createTerminationHandler('SIGINT', controller, stderr)
  const handleSigterm = createTerminationHandler('SIGTERM', controller, stderr)

  process.on('SIGINT', handleSigint)
  process.on('SIGTERM', handleSigterm)

  try {
    process.exitCode = await runCli(process.argv.slice(2), {
      signal: controller.signal,
      stderr,
      stdout: process.stdout,
    })
  } finally {
    process.off('SIGINT', handleSigint)
    process.off('SIGTERM', handleSigterm)
  }
}

if (await isMainModule()) {
  void runAsMain().catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`${pc.red('✖')} ${message}\n`)
    process.exitCode = 1
  })
}

async function isMainModule(): Promise<boolean> {
  const invokedPath = process.argv[1]

  if (!invokedPath) {
    return false
  }

  try {
    const [currentFile, invokedFile] = await Promise.all([
      realpath(fileURLToPath(import.meta.url)),
      realpath(invokedPath),
    ])
    return currentFile === invokedFile
  } catch {
    return fileURLToPath(import.meta.url) === invokedPath
  }
}
