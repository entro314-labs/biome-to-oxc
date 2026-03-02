import pc from 'picocolors'

import type { Reporter } from './types.js'

export class DefaultReporter implements Reporter {
  private warnings: string[] = []
  private errors: string[] = []

  warn(message: string): void {
    this.warnings.push(message)
    console.warn(pc.yellow(`⚠ ${message}`))
  }

  error(message: string): void {
    this.errors.push(message)
    console.error(pc.red(`✖ ${message}`))
  }

  info(message: string): void {}

  getWarnings(): string[] {
    return this.warnings
  }

  getErrors(): string[] {
    return this.errors
  }
}
