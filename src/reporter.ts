import pc from 'picocolors'

import type { Reporter } from './types.js'

interface ReporterStream {
  write(chunk: string): boolean | undefined
}

interface ReporterOptions {
  verbose?: boolean
  stdout?: ReporterStream
  stderr?: ReporterStream
}

export class CollectingReporter implements Reporter {
  protected readonly warnings: string[] = []
  protected readonly errors: string[] = []
  protected readonly losses: string[] = []

  warn(message: string): void {
    this.warnings.push(message)
  }

  error(message: string): void {
    this.errors.push(message)
  }

  loss(message: string): void {
    this.losses.push(message)
    this.warn(message)
  }

  info(_message: string): void {}

  getWarnings(): string[] {
    return [...this.warnings]
  }

  getErrors(): string[] {
    return [...this.errors]
  }

  getLosses(): string[] {
    return [...this.losses]
  }
}

export class DefaultReporter extends CollectingReporter {
  private readonly verbose: boolean
  private readonly stdout: ReporterStream
  private readonly stderr: ReporterStream

  constructor(options: ReporterOptions = {}) {
    super()
    this.verbose = options.verbose ?? false
    this.stdout = options.stdout ?? process.stdout
    this.stderr = options.stderr ?? process.stderr
  }

  override warn(message: string): void {
    super.warn(message)
    this.stderr.write(`${pc.yellow('⚠')} ${message}\n`)
  }

  override loss(message: string): void {
    this.losses.push(message)
    super.warn(message)
    this.stderr.write(`${pc.magenta('⊘')} ${message}\n`)
  }

  override error(message: string): void {
    super.error(message)
    this.stderr.write(`${pc.red('✖')} ${message}\n`)
  }

  override info(message: string): void {
    if (!this.verbose) {
      return
    }

    this.stdout.write(`${message}\n`)
  }
}
