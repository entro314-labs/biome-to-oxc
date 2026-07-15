import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadBiomeIgnorePatterns, parseBiomeIgnoreContent } from './biome-ignore-loader.js'
import type { Reporter } from './types.js'

class SilentReporter implements Reporter {
  private readonly warnings: string[] = []
  private readonly errors: string[] = []

  warn(message: string): void {
    this.warnings.push(message)
  }

  error(message: string): void {
    this.errors.push(message)
  }

  info(_message: string): void {}

  getWarnings(): string[] {
    return this.warnings
  }

  getErrors(): string[] {
    return this.errors
  }
}

describe('biome-ignore-loader', () => {
  it('parses .biomeignore content while preserving useful patterns', () => {
    const content = [
      '# comment',
      '',
      'dist/**',
      'coverage/**',
      '!coverage/keep.js',
      '\\#literal-hash',
      '\\!literal-bang',
    ].join('\n')

    expect(parseBiomeIgnoreContent(content)).toEqual([
      'dist/**',
      'coverage/**',
      '!coverage/keep.js',
      '#literal-hash',
      '!literal-bang',
    ])
  })

  it('loads .biomeignore patterns from project root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-ignore-'))
    await writeFile(join(dir, '.biomeignore'), 'dist/**\n# c\n!dist/keep.js\n', 'utf-8')

    const reporter = new SilentReporter()
    const patterns = await loadBiomeIgnorePatterns(dir, reporter)

    expect(patterns).toEqual(['dist/**', '!dist/keep.js'])
    expect(reporter.getWarnings()).toEqual([])
  })

  it('warns when .biomeignore has no usable patterns', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-ignore-empty-'))
    await writeFile(join(dir, '.biomeignore'), '# only comments\n\n', 'utf-8')

    const reporter = new SilentReporter()
    const patterns = await loadBiomeIgnorePatterns(dir, reporter)

    expect(patterns).toEqual([])
    expect(reporter.getWarnings()).toEqual([
      '.biomeignore was found, but no ignore patterns remained after filtering comments/blank lines.',
    ])
  })

  it('warns and falls back when .biomeignore cannot be read as a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'biome-to-oxc-ignore-error-'))
    await mkdir(join(dir, '.biomeignore'))

    const reporter = new SilentReporter()
    const patterns = await loadBiomeIgnorePatterns(dir, reporter)

    expect(patterns).toEqual([])
    expect(reporter.getWarnings().length).toBe(1)
    expect(reporter.getWarnings()[0]).toContain('Failed to read .biomeignore at')
  })
})
