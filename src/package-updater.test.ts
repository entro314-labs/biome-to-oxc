import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { updatePackageJson } from './package-updater.js'
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

function setupPackageJson(content: object): { dir: string; packagePath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'biome-to-oxc-'))
  const packagePath = join(dir, 'package.json')
  writeFileSync(packagePath, `${JSON.stringify(content, null, 2)}\n`, 'utf-8')
  return { dir, packagePath }
}

describe('updatePackageJson', () => {
  it('maps Biome unsafe fixes to dangerous oxlint fix level and formatter write mode', () => {
    const { dir, packagePath } = setupPackageJson({
      name: 'fixture',
      scripts: {
        check: 'biome check --write --unsafe .',
      },
    })

    const reporter = new SilentReporter()

    updatePackageJson(dir, reporter, false, {
      updateScripts: true,
      fixStrategy: 'safe',
    })

    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8')) as {
      scripts: Record<string, string>
    }

    expect(pkg.scripts.check).toBe(
      'oxlint --fix --fix-suggestions --fix-dangerously . && oxfmt --write .',
    )
  })

  it('enables typed command and dependency when typeCheck is requested directly', () => {
    const { dir, packagePath } = setupPackageJson({
      name: 'fixture',
      scripts: {
        lint: 'biome lint',
      },
      devDependencies: {
        oxlint: '^1.0.0',
      },
    })

    const reporter = new SilentReporter()

    updatePackageJson(dir, reporter, false, {
      updateScripts: true,
      typeCheck: true,
    })

    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8')) as {
      scripts: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(pkg.scripts.lint).toBe('oxlint --type-aware --type-check')
    expect(pkg.devDependencies['oxlint-tsgolint']).toBeDefined()
  })

  it('preserves compatibility with strict type-aware profile', () => {
    const { dir, packagePath } = setupPackageJson({
      name: 'fixture',
      scripts: {
        lint: 'biome lint --write src',
      },
      devDependencies: {},
    })

    const reporter = new SilentReporter()

    updatePackageJson(dir, reporter, false, {
      updateScripts: true,
      typeAwareProfile: 'strict',
      typeAware: false,
    })

    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8')) as {
      scripts: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(pkg.scripts.lint).toBe('oxlint --type-aware --type-check --fix src')
    expect(pkg.devDependencies['oxlint-tsgolint']).toBeDefined()
  })
})
