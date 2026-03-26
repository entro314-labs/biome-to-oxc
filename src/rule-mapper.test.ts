import { describe, expect, it } from 'vitest'

import {
  extractRulesFromBiomeConfig,
  mapBiomeRuleSeverity,
  mapBiomeRuleToOxlint,
} from './rule-mapper.js'
import type { BiomeLinterRules, Reporter } from './types.js'

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

describe('rule-mapper parity expansion', () => {
  it('maps expanded Biome parity rules to Oxlint equivalents', () => {
    const reporter = new SilentReporter()

    const mappings: Record<string, string> = {
      noAccessKey: 'jsx_a11y/no-access-key',
      noArguments: 'prefer-rest-params',
      noAriaHiddenOnFocusable: 'jsx_a11y/no-aria-hidden-on-focusable',
      noBarrelFile: 'oxc/no-barrel-file',
      noConstantBinaryExpressions: 'no-constant-binary-expression',
      noConsole: 'no-console',
      noDefaultExport: 'import/no-default-export',
      noDuplicateElseIf: 'no-dupe-else-if',
      noEmptyBlockStatements: 'no-empty',
      noExcessiveCognitiveComplexity: 'complexity',
      noConfusingVoidType: 'typescript/no-invalid-void-type',
      noExtraNonNullAssertion: 'typescript/no-extra-non-null-assertion',
      noFloatingPromises: 'typescript/no-floating-promises',
      noFocusedTests: 'jest/no-focused-tests',
      noForEach: 'unicorn/no-array-for-each',
      noGlobalEval: 'no-eval',
      noImplicitBoolean: 'no-implicit-coercion',
      noInvalidBuiltinInstantiation: 'no-new-native-nonconstructor',
      noLabelWithoutControl: 'jsx_a11y/label-has-associated-control',
      noInvalidUseBeforeDeclaration: 'no-use-before-define',
      noNodejsModules: 'import/no-nodejs-modules',
      noNonNullAssertion: 'typescript/no-non-null-assertion',
      noParameterAssign: 'no-param-reassign',
      noParameterProperties: 'typescript/parameter-properties',
      noShadow: 'no-shadow',
      noSkippedTests: 'jest/no-disabled-tests',
      noStaticElementInteractions: 'jsx_a11y/no-static-element-interactions',
      noUnknownProperty: 'react/no-unknown-property',
      noUnusedFunctionParameters: 'no-unused-vars',
      noUnusedImports: 'no-unused-vars',
      noUnnecessaryConditions: 'typescript/no-unnecessary-condition',
      noUselessThisAlias: 'typescript/no-this-alias',
      noUselessTernary: 'no-unneeded-ternary',
      useAltText: 'jsx_a11y/alt-text',
      useAsConstAssertion: 'typescript/prefer-as-const',
      useAwait: 'require-await',
      useAwaitThenable: 'typescript/await-thenable',
      useButtonType: 'react/button-has-type',
      useExportType: 'typescript/consistent-type-exports',
      useExhaustiveSwitchCases: 'typescript/switch-exhaustiveness-check',
      useFilenamingConvention: 'unicorn/filename-case',
      useHtmlLang: 'jsx_a11y/html-has-lang',
      useImportType: 'typescript/consistent-type-imports',
      useJsxKeyInIterable: 'react/jsx-key',
      useKeyWithClickEvents: 'jsx_a11y/click-events-have-key-events',
      useLiteralKeys: 'typescript/dot-notation',
      useNodejsImportProtocol: 'unicorn/prefer-node-protocol',
      useOptionalChain: 'typescript/prefer-optional-chain',
      useSemanticElements: 'jsx_a11y/prefer-tag-over-role',
      useSimplifiedLogicExpression: 'unicorn/prefer-logical-operator-over-ternary',
      useTemplate: 'prefer-template',
      useValidAriaRole: 'jsx_a11y/aria-role',
      useValidLang: 'jsx_a11y/lang',
    }

    for (const [biomeRule, oxlintRule] of Object.entries(mappings)) {
      expect(mapBiomeRuleToOxlint(biomeRule, reporter)).toBe(oxlintRule)
    }

    expect(reporter.getWarnings()).toEqual([])
  })

  it('normalizes non-oxlint severities to supported levels', () => {
    const reporter = new SilentReporter()

    expect(mapBiomeRuleSeverity('info' as never)).toBe('warn')
    expect(mapBiomeRuleSeverity({ level: 'info' } as never)).toBe('warn')
    expect(mapBiomeRuleSeverity('allow' as never)).toBe('off')
    expect(mapBiomeRuleSeverity('deny' as never)).toBe('error')

    expect(mapBiomeRuleSeverity('critical' as never, reporter, 'noFoo')).toBe('warn')
    expect(mapBiomeRuleSeverity('critical' as never, reporter, 'noFoo')).toBe('warn')

    expect(reporter.getWarnings()).toEqual([
      'Unsupported Biome severity "critical" for rule noFoo. Normalized to "warn" for Oxlint compatibility.',
    ])
  })

  it('warns only once per unmapped rule per reporter', () => {
    const reporter = new SilentReporter()

    expect(mapBiomeRuleToOxlint('unknownRule', reporter)).toBeNull()
    expect(mapBiomeRuleToOxlint('unknownRule', reporter)).toBeNull()
    expect(mapBiomeRuleToOxlint('anotherUnknownRule', reporter)).toBeNull()

    expect(reporter.getWarnings()).toEqual([
      'No Oxlint equivalent found for Biome rule: unknownRule',
      'No Oxlint equivalent found for Biome rule: anotherUnknownRule',
    ])
  })

  it('extracts mapped rules from Biome config without false unsupported warnings', () => {
    const reporter = new SilentReporter()

    const linterRules: BiomeLinterRules = {
      correctness: {
        noInvalidUseBeforeDeclaration: 'error',
        noEmptyBlockStatements: 'warn',
        noFloatingPromises: 'error',
        noExtraNonNullAssertion: 'warn',
      },
      style: {
        noForEach: 'warn',
        useTemplate: 'error',
        useImportType: 'warn',
        useAsConstAssertion: 'warn',
      },
      suspicious: {
        noUselessTernary: 'error',
        noArguments: 'warn',
        noNonNullAssertion: 'error',
      },
      security: {
        noGlobalEval: 'error',
      },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toMatchObject({
      'no-use-before-define': 'error',
      'no-empty': 'warn',
      'typescript/no-floating-promises': 'error',
      'unicorn/no-array-for-each': 'warn',
      'prefer-template': 'error',
      'typescript/consistent-type-imports': 'warn',
      'typescript/no-extra-non-null-assertion': 'warn',
      'no-unneeded-ternary': 'error',
      'prefer-rest-params': 'warn',
      'no-eval': 'error',
      'typescript/no-non-null-assertion': 'error',
      'typescript/prefer-as-const': 'warn',
    })

    expect(reporter.getWarnings()).toEqual([])
  })
})
