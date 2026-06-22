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
      noAccessKey: 'jsx-a11y/no-access-key',
      noArguments: 'prefer-rest-params',
      noAriaHiddenOnFocusable: 'jsx-a11y/no-aria-hidden-on-focusable',
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
      noConditionalExpect: 'jest/no-conditional-expect',
      noDuplicateTestHooks: 'jest/no-duplicate-hooks',
      noExcessiveNestedTestSuites: 'jest/max-nested-describe',
      noForEach: 'unicorn/no-array-for-each',
      noGlobalEval: 'no-eval',
      noIdenticalTestTitle: 'jest/no-identical-title',
      noImplicitBoolean: 'no-implicit-coercion',
      noImpliedEval: 'no-implied-eval',
      noInteractiveElementToNoninteractiveRole:
        'jsx-a11y/no-interactive-element-to-noninteractive-role',
      noInvalidBuiltinInstantiation: 'no-new-native-nonconstructor',
      noJsxLiterals: 'react/jsx-no-literals',
      noLabelWithoutControl: 'jsx-a11y/label-has-associated-control',
      noInvalidUseBeforeDeclaration: 'no-use-before-define',
      noMisplacedAssertion: 'jest/no-standalone-expect',
      noNestedComponentDefinitions: 'react/no-unstable-nested-components',
      noNodejsModules: 'import/no-nodejs-modules',
      noNoninteractiveElementInteractions: 'jsx-a11y/no-noninteractive-element-interactions',
      noNoninteractiveElementToInteractiveRole:
        'jsx-a11y/no-noninteractive-element-to-interactive-role',
      noNonNullAssertion: 'typescript/no-non-null-assertion',
      noParameterAssign: 'no-param-reassign',
      noParameterProperties: 'typescript/parameter-properties',
      noShadow: 'no-shadow',
      noSkippedTests: 'jest/no-disabled-tests',
      noSwitchDeclarations: 'no-case-declarations',
      noStaticElementInteractions: 'jsx-a11y/no-static-element-interactions',
      noUnknownProperty: 'react/no-unknown-property',
      noUnusedFunctionParameters: 'no-unused-vars',
      noUnusedImports: 'no-unused-vars',
      noUnnecessaryConditions: 'typescript/no-unnecessary-condition',
      noUselessThisAlias: 'typescript/no-this-alias',
      noUselessTernary: 'no-unneeded-ternary',
      noVueDataObjectDeclaration: 'vue/no-deprecated-data-object-declaration',
      noVueDuplicateKeys: 'vue/no-dupe-keys',
      noVueReservedKeys: 'vue/no-reserved-keys',
      noVueReservedProps: 'vue/no-reserved-props',
      useAltText: 'jsx-a11y/alt-text',
      useArrowFunction: 'prefer-arrow-callback',
      useAsConstAssertion: 'typescript/prefer-as-const',
      useAwait: 'require-await',
      useAwaitThenable: 'typescript/await-thenable',
      useButtonType: 'react/button-has-type',
      useConsistentMethodSignatures: 'typescript/method-signature-style',
      useConsistentMemberAccessibility: 'typescript/explicit-member-accessibility',
      useConsistentTestIt: 'jest/consistent-test-it',
      useExpect: 'jest/expect-expect',
      useExportType: 'typescript/consistent-type-exports',
      useExhaustiveSwitchCases: 'typescript/switch-exhaustiveness-check',
      useFilenamingConvention: 'unicorn/filename-case',
      useFocusableInteractive: 'jsx-a11y/interactive-supports-focus',
      useHtmlLang: 'jsx-a11y/html-has-lang',
      useImportType: 'typescript/consistent-type-imports',
      useJsxKeyInIterable: 'react/jsx-key',
      useKeyWithClickEvents: 'jsx-a11y/click-events-have-key-events',
      useLiteralKeys: 'typescript/dot-notation',
      useNamedCaptureGroup: 'prefer-named-capture-group',
      useNodejsImportProtocol: 'unicorn/prefer-node-protocol',
      useOptionalChain: 'typescript/prefer-optional-chain',
      useReactFunctionComponents: 'react/prefer-function-component',
      useRegexLiterals: 'prefer-regex-literals',
      useSemanticElements: 'jsx-a11y/prefer-tag-over-role',
      useSimplifiedLogicExpression: 'unicorn/prefer-logical-operator-over-ternary',
      useTemplate: 'prefer-template',
      useTestHooksOnTop: 'jest/prefer-hooks-on-top',
      useUnicodeRegex: 'require-unicode-regexp',
      useValidAriaRole: 'jsx-a11y/aria-role',
      useValidLang: 'jsx-a11y/lang',
      useVueNextTickPromise: 'vue/next-tick-style',
    }

    for (const [biomeRule, oxlintRule] of Object.entries(mappings)) {
      expect(mapBiomeRuleToOxlint(biomeRule, reporter)).toBe(oxlintRule)
    }

    expect(reporter.getWarnings()).toEqual([])
  })

  it('preserves supported options for method signature style parity', () => {
    const reporter = new SilentReporter()

    const linterRules: BiomeLinterRules = {
      nursery: {
        useConsistentMethodSignatures: {
          level: 'error',
          options: {
            style: 'method',
          },
        },
      },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toMatchObject({
      'typescript/method-signature-style': ['error', 'method'],
    })

    expect(reporter.getWarnings()).toEqual([])
  })

  it('preserves supported JSX literal options', () => {
    const reporter = new SilentReporter()

    const linterRules: BiomeLinterRules = {
      style: {
        noJsxLiterals: {
          level: 'warn',
          options: {
            allowedStrings: ['OK'],
            ignoreProps: true,
            noStrings: true,
          },
        },
      },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toMatchObject({
      'react/jsx-no-literals': [
        'warn',
        {
          allowedStrings: ['OK'],
          ignoreProps: true,
          noAttributeStrings: true,
          noStrings: true,
        },
      ],
    })

    expect(reporter.getWarnings()).toEqual([])
  })

  it('maps Vue nextTick promise parity with the matching Oxlint style option', () => {
    const reporter = new SilentReporter()

    const linterRules: BiomeLinterRules = {
      nursery: {
        useVueNextTickPromise: 'error',
      },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toMatchObject({
      'vue/next-tick-style': ['error', 'promise'],
    })

    expect(reporter.getWarnings()).toEqual([])
  })

  it('maps active Biome rules with native Oxlint parity', () => {
    const reporter = new SilentReporter()

    const mappings: Record<string, string> = {
      noAutofocus: 'jsx-a11y/no-autofocus',
      noAwaitInLoops: 'no-await-in-loop',
      noBaseToString: 'typescript/no-base-to-string',
      noBitwiseOperators: 'no-bitwise',
      noDocumentCookie: 'unicorn/no-document-cookie',
      noDuplicateEnumValues: 'typescript/no-duplicate-enum-values',
      noImportCycles: 'import/no-cycle',
      noMisusedPromises: 'typescript/no-misused-promises',
      noParametersOnlyUsedInRecursion: 'oxc/only-used-in-recursion',
      noRestrictedTypes: 'typescript/no-restricted-types',
      noStaticOnlyClass: 'unicorn/no-static-only-class',
      noYodaExpression: 'yoda',
      useArraySortCompare: 'typescript/require-array-sort-compare',
      useAtIndex: 'unicorn/prefer-at',
      useConsistentArrayType: 'typescript/array-type',
      useDefaultSwitchClauseLast: 'default-case-last',
      useGoogleFontDisplay: 'nextjs/google-font-display',
      useIterableCallbackReturn: 'array-callback-return',
      useNullishCoalescing: 'typescript/prefer-nullish-coalescing',
      useTestHooksInOrder: 'jest/prefer-hooks-in-order',
      useVueConsistentDefinePropsDeclaration: 'vue/define-props-declaration',
    }

    for (const [biomeRule, oxlintRule] of Object.entries(mappings)) {
      expect(mapBiomeRuleToOxlint(biomeRule, reporter)).toBe(oxlintRule)
    }

    expect(reporter.getWarnings()).toEqual([])
  })

  it('emits both Jest and Vitest equivalents for generic Biome test rules', () => {
    const reporter = new SilentReporter()

    const linterRules: BiomeLinterRules = {
      complexity: {
        noExcessiveNestedTestSuites: 'warn',
      },
      nursery: {
        noConditionalExpect: 'error',
        noIdenticalTestTitle: 'warn',
        useConsistentTestIt: 'warn',
        useExpect: 'error',
        useTestHooksInOrder: 'error',
        useTestHooksOnTop: 'warn',
      },
      suspicious: {
        noDuplicateTestHooks: 'error',
        noFocusedTests: 'error',
        noMisplacedAssertion: 'warn',
        noSkippedTests: 'warn',
      },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toMatchObject({
      'jest/consistent-test-it': 'warn',
      'jest/expect-expect': 'error',
      'jest/max-nested-describe': 'warn',
      'jest/no-conditional-expect': 'error',
      'jest/no-disabled-tests': 'warn',
      'jest/no-duplicate-hooks': 'error',
      'jest/no-focused-tests': 'error',
      'jest/no-identical-title': 'warn',
      'jest/no-standalone-expect': 'warn',
      'jest/prefer-hooks-on-top': 'warn',
      'jest/prefer-hooks-in-order': 'error',
      'vitest/consistent-test-it': 'warn',
      'vitest/expect-expect': 'error',
      'vitest/max-nested-describe': 'warn',
      'vitest/no-conditional-expect': 'error',
      'vitest/no-disabled-tests': 'warn',
      'vitest/no-duplicate-hooks': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/no-identical-title': 'warn',
      'vitest/no-standalone-expect': 'warn',
      'vitest/prefer-hooks-in-order': 'error',
      'vitest/prefer-hooks-on-top': 'warn',
    })

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
        noSwitchDeclarations: 'error',
      },
      style: {
        noForEach: 'warn',
        useTemplate: 'error',
        useImportType: 'warn',
        useAsConstAssertion: 'warn',
        useConsistentMemberAccessibility: 'warn',
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
      'typescript/explicit-member-accessibility': 'warn',
      'typescript/no-extra-non-null-assertion': 'warn',
      'no-unneeded-ternary': 'error',
      'prefer-rest-params': 'warn',
      'no-eval': 'error',
      'no-case-declarations': 'error',
      'typescript/no-non-null-assertion': 'error',
      'typescript/prefer-as-const': 'warn',
    })

    expect(reporter.getWarnings()).toEqual([])
  })
})
