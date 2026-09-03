import { describe, expect, it } from 'vitest'

import { CollectingReporter } from './reporter.js'
import {
  extractRulesFromBiomeConfig,
  mapBiomeRuleSeverity,
  mapBiomeRuleToOxlint,
} from './rule-mapper.js'
import type { BiomeLinterRules } from './types.js'

describe('rule-mapper parity expansion', () => {
  it('maps expanded Biome parity rules to Oxlint equivalents', () => {
    const reporter = new CollectingReporter()

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
      useReactFunctionComponentDefinition: 'react/function-component-definition',
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

  it('maps current Biome source-equivalent rules to Oxlint equivalents', () => {
    const reporter = new CollectingReporter()

    const mappings: Record<string, string> = {
      noAdjacentSpacesInRegex: 'no-regex-spaces',
      noAmbiguousAnchorText: 'jsx-a11y/anchor-ambiguous-text',
      noBannedTypes: 'typescript/ban-types',
      noCommonJs: 'import/no-commonjs',
      noDuplicatedSpreadProps: 'react/jsx-props-no-spread-multi',
      noEmptySource: 'unicorn/no-empty-file',
      noEqualsToNull: 'no-eq-null',
      noExcessiveClassesPerFile: 'max-classes-per-file',
      noExcessiveNestedCallbacks: 'max-nested-callbacks',
      noIncrementDecrement: 'no-plusplus',
      noMultilineString: 'no-multi-str',
      noNegationElse: 'no-negated-condition',
      noNestedPromises: 'promise/no-nesting',
      noNextAsyncClientComponent: 'nextjs/no-async-client-component',
      noPositiveTabindex: 'jsx-a11y/tabindex-no-positive',
      noReactStringRefs: 'react/no-string-refs',
      noRestrictedElements: 'react/forbid-elements',
      noSubstr: 'unicorn/prefer-string-slice',
      noThenProperty: 'unicorn/no-thenable',
      noUnknownAttribute: 'react/no-unknown-property',
      noUnsafePlusOperands: 'typescript/restrict-plus-operands',
      noUnusedInstantiation: 'no-new',
      noUselessEscapeInRegex: 'no-useless-escape',
      noUselessLoneBlockStatements: 'no-lone-blocks',
      noUselessRegexBackrefs: 'no-useless-backreference',
      noUselessStringConcat: 'no-useless-concat',
      noUselessTypeConversion: 'typescript/no-unnecessary-type-conversion',
      noVueArrowFuncInWatch: 'vue/no-arrow-functions-in-watch',
      noVueImportCompilerMacros: 'vue/no-import-compiler-macros',
      useAdjacentOverloadSignatures: 'typescript/adjacent-overload-signatures',
      useArrayFind: 'typescript/prefer-find',
      useArrayLiterals: 'no-array-constructor',
      useBlockStatements: 'curly',
      useCollapsedElseIf: 'no-lonely-if',
      useCollapsedIf: 'unicorn/no-lonely-if',
      useConsistentArrowReturn: 'arrow-body-style',
      useConsistentBuiltinInstantiation: 'no-new-wrappers',
      useConsistentEnumValueType: 'typescript/no-mixed-enums',
      useConsistentTypeDefinitions: 'typescript/consistent-type-definitions',
      useErrorCause: 'preserve-caught-error',
      useFragmentSyntax: 'react/jsx-fragments',
      useGroupedAccessorPairs: 'grouped-accessor-pairs',
      useIframeSandbox: 'react/iframe-missing-sandbox',
      useIncludes: 'typescript/prefer-includes',
      useIsArray: 'unicorn/no-instanceof-array',
      useMaxParams: 'max-params',
      useNamespaceKeyword: 'typescript/prefer-namespace-keyword',
      useNumberNamespace: 'unicorn/prefer-number-properties',
      useNumberToFixedDigitsArgument: 'unicorn/require-number-to-fixed-digits-argument',
      useNumericSeparators: 'unicorn/numeric-separators-style',
      useSelfClosingElements: 'react/self-closing-comp',
      useShorthandAssign: 'operator-assignment',
      useSpreadOverApply: 'prefer-spread',
      useThisInClassMethods: 'class-methods-use-this',
    }

    for (const [biomeRule, oxlintRule] of Object.entries(mappings)) {
      expect(mapBiomeRuleToOxlint(biomeRule, reporter)).toBe(oxlintRule)
    }

    expect(reporter.getWarnings()).toEqual([])
  })

  it('emits every Oxlint rule needed to replace Biome noCommonJs', () => {
    const reporter = new CollectingReporter()
    const linterRules: BiomeLinterRules = {
      style: {
        noCommonJs: 'error',
      },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toMatchObject({
      'import/no-commonjs': 'error',
      'typescript/no-require-imports': 'error',
      'typescript/no-var-requires': 'error',
    })
    expect(reporter.getWarnings()).toEqual([])
  })

  it('preserves supported options for current source-equivalent rules', () => {
    const reporter = new CollectingReporter()
    const linterRules: BiomeLinterRules = {
      nursery: {
        noAmbiguousAnchorText: {
          level: 'warn',
          options: { words: ['read this', 'more'] },
        },
        noConsole: {
          level: 'error',
          options: { allow: ['error', 'warn'] },
        },
        noExcessiveClassesPerFile: {
          level: 'error',
          options: { maxClasses: 3 },
        },
        noIncrementDecrement: {
          level: 'warn',
          options: { allowForLoopAfterthoughts: true },
        },
        noRestrictedElements: {
          level: 'error',
          options: { elements: { button: 'Use Button instead.' } },
        },
        noUnknownAttribute: {
          level: 'warn',
          options: { ignore: ['css'] },
        },
        useConsistentArrowReturn: {
          level: 'error',
          options: { requireForObjectLiteral: true, style: 'asNeeded' },
        },
        useConsistentTypeDefinitions: {
          level: 'warn',
          options: { style: 'type' },
        },
        useErrorCause: {
          level: 'error',
          options: { requireCatchParameter: false },
        },
        useMaxParams: {
          level: 'warn',
          options: { max: 8 },
        },
        useNumericSeparators: {
          level: 'error',
          options: {
            binary: { groupLength: 4 },
            decimal: { groupLength: 3, minimumDigits: 5 },
            hexadecimal: { groupLength: 2 },
            octal: { groupLength: 4 },
          },
        },
        useReactFunctionComponentDefinition: {
          level: 'error',
          options: { namedComponents: 'arrowFunction' },
        },
        useThisInClassMethods: {
          level: 'warn',
          options: {
            ignoreClassesWithImplements: 'public-fields',
            ignoreMethods: ['render'],
            ignoreOverrideMethods: true,
          },
        },
      },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toMatchObject({
      'arrow-body-style': ['error', 'as-needed', { requireReturnForObjectLiteral: true }],
      'class-methods-use-this': [
        'warn',
        {
          exceptMethods: ['render'],
          ignoreClassesWithImplements: 'public-fields',
          ignoreOverrideMethods: true,
        },
      ],
      'jsx-a11y/anchor-ambiguous-text': ['warn', { words: ['read this', 'more'] }],
      'no-console': ['error', { allow: ['error', 'warn'] }],
      'max-classes-per-file': ['error', { max: 3 }],
      'max-params': ['warn', { max: 8 }],
      'no-plusplus': ['warn', { allowForLoopAfterthoughts: true }],
      'preserve-caught-error': ['error', { requireCatchParameter: false }],
      'react/forbid-elements': [
        'error',
        { forbid: [{ element: 'button', message: 'Use Button instead.' }] },
      ],
      'react/function-component-definition': ['error', { namedComponents: 'arrow-function' }],
      'react/no-unknown-property': ['warn', { ignore: ['css'] }],
      'typescript/consistent-type-definitions': ['warn', 'type'],
      'unicorn/numeric-separators-style': [
        'error',
        {
          binary: { groupLength: 4 },
          hexadecimal: { groupLength: 2 },
          number: { groupLength: 3, minimumDigits: 5 },
          octal: { groupLength: 4 },
        },
      ],
    })
    expect(reporter.getWarnings()).toEqual([])
  })

  it('preserves Biome defaults that differ from Oxlint defaults', () => {
    const reporter = new CollectingReporter()
    const linterRules: BiomeLinterRules = {
      nursery: {
        noExcessiveNestedCallbacks: 'warn',
        useErrorCause: 'error',
        useMaxParams: 'warn',
      },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toMatchObject({
      'max-nested-callbacks': ['warn', { max: 5 }],
      'max-params': ['warn', { max: 4 }],
      'preserve-caught-error': ['error', { requireCatchParameter: true }],
    })
    expect(reporter.getWarnings()).toEqual([])
  })

  it('warns when a Biome rule option has no Oxlint equivalent', () => {
    const reporter = new CollectingReporter()
    const linterRules: BiomeLinterRules = {
      suspicious: {
        noEmptySource: {
          level: 'error',
          options: { allowComments: true },
        },
      },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toMatchObject({
      'unicorn/no-empty-file': 'error',
    })
    expect(reporter.getWarnings()).toEqual([
      'Biome rule noEmptySource option "allowComments" is not supported by Oxlint unicorn/no-empty-file and was not migrated.',
    ])
  })

  it('warns instead of silently dropping unverified rule options and lossy severities', () => {
    const reporter = new CollectingReporter()
    const { rules } = extractRulesFromBiomeConfig(
      {
        suspicious: {
          noDoubleEquals: { level: 'info', options: { ignoreNull: true } },
        },
      },
      reporter,
    )

    expect(rules.eqeqeq).toBe('warn')
    expect(reporter.getWarnings()).toEqual([
      'Unsupported Biome severity "info" for rule noDoubleEquals. Normalized to "warn" for Oxlint compatibility.',
      'Biome rule noDoubleEquals options do not have a verified Oxlint mapping and were not migrated; the rule runs with Oxlint defaults instead.',
    ])
  })

  it('preserves supported options for method signature style parity', () => {
    const reporter = new CollectingReporter()

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
    const reporter = new CollectingReporter()

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
    const reporter = new CollectingReporter()

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
    const reporter = new CollectingReporter()

    const mappings: Record<string, string> = {
      noAutofocus: 'jsx-a11y/no-autofocus',
      noAwaitInLoops: 'no-await-in-loop',
      noBaseToString: 'typescript/no-base-to-string',
      noBitwiseOperators: 'no-bitwise',
      noContinue: 'no-continue',
      noDocumentCookie: 'unicorn/no-document-cookie',
      noDuplicateEnumValues: 'typescript/no-duplicate-enum-values',
      noImgElement: 'nextjs/no-img-element',
      noImportCycles: 'import/no-cycle',
      noMisusedPromises: 'typescript/no-misused-promises',
      noParametersOnlyUsedInRecursion: 'oxc/only-used-in-recursion',
      noRestrictedTypes: 'typescript/no-restricted-types',
      noStaticOnlyClass: 'unicorn/no-static-only-class',
      noUnusedExpressions: 'no-unused-expressions',
      noUnwantedPolyfillio: 'nextjs/no-unwanted-polyfillio',
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
    const reporter = new CollectingReporter()

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
    const reporter = new CollectingReporter()

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
    const reporter = new CollectingReporter()

    expect(mapBiomeRuleToOxlint('unknownRule', reporter)).toBeNull()
    expect(mapBiomeRuleToOxlint('unknownRule', reporter)).toBeNull()
    expect(mapBiomeRuleToOxlint('anotherUnknownRule', reporter)).toBeNull()

    expect(reporter.getWarnings()).toEqual([
      'No Oxlint equivalent found for Biome rule: unknownRule',
      'No Oxlint equivalent found for Biome rule: anotherUnknownRule',
    ])
  })

  it('does not map Biome noVoidTypeReturn to an unrelated void-type rule', () => {
    const reporter = new CollectingReporter()

    expect(mapBiomeRuleToOxlint('noVoidTypeReturn', reporter)).toBeNull()
    expect(reporter.getWarnings()).toEqual([
      'No Oxlint equivalent found for Biome rule: noVoidTypeReturn',
    ])
  })

  it('extracts mapped rules from Biome config without false unsupported warnings', () => {
    const reporter = new CollectingReporter()

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

describe('rule-mapper coverage for rules added by Oxlint 1.66-1.79', () => {
  it('maps the Biome rules whose Oxlint equivalents now exist', () => {
    const reporter = new CollectingReporter()

    const mappings: Record<string, string> = {
      noBlankTarget: 'react/jsx-no-target-blank',
      noExcessiveLinesPerFile: 'max-lines',
      noExcessiveLinesPerFunction: 'max-lines-per-function',
      noExportsInTest: 'jest/no-export',
      noGlobalDirnameFilename: 'unicorn/prefer-module',
      noGlobalIsFinite: 'unicorn/prefer-number-properties',
      noGlobalIsNan: 'unicorn/prefer-number-properties',
      noJsRestrictedProperties: 'no-restricted-properties',
      noNegationInEqualityCheck: 'unicorn/no-negation-in-equality-check',
      noUnsafeTypeAssertion: 'typescript/no-unsafe-type-assertion',
      noUselessContinue: 'no-continue',
      noUselessElse: 'no-else-return',
      noUselessUndefinedInitialization: 'unicorn/no-useless-undefined',
      useConsistentObjectDefinitions: 'object-shorthand',
      useExplicitReturnType: 'typescript/explicit-function-return-type',
      useImportExtensions: 'import/extensions',
      useSingleVarDeclarator: 'one-var',
    }

    for (const [biomeRule, oxlintRule] of Object.entries(mappings)) {
      expect(mapBiomeRuleToOxlint(biomeRule, reporter)).toBe(oxlintRule)
    }

    expect(reporter.getWarnings()).toEqual([])
  })

  it('replaces Biome useReactCompiler with every React Compiler rule Oxlint implements', () => {
    const reporter = new CollectingReporter()
    const linterRules: BiomeLinterRules = {
      nursery: {
        useReactCompiler: 'error',
      },
    }

    const { rules, sourceRulesConverted } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toEqual({
      'react/capitalized-calls': 'error',
      'react/error-boundaries': 'error',
      'react/exhaustive-effect-dependencies': 'error',
      'react/globals': 'error',
      'react/hooks': 'error',
      'react/immutability': 'error',
      'react/incompatible-library': 'error',
      'react/invariant': 'error',
      'react/memo-dependencies': 'error',
      'react/no-deriving-state-in-effects': 'error',
      'react/preserve-manual-memoization': 'error',
      'react/purity': 'error',
      'react/refs': 'error',
      'react/rule-suppression': 'error',
      'react/set-state-in-effect': 'error',
      'react/set-state-in-render': 'error',
      'react/static-components': 'error',
      'react/syntax': 'error',
      'react/todo': 'error',
      'react/unsupported-syntax': 'error',
      'react/use-memo': 'error',
      'react/void-use-memo': 'error',
    })
    expect(sourceRulesConverted).toEqual(new Set(['useReactCompiler']))
    // Biome runs the whole compiler, so enabling every implemented rule is not a narrowing
    // and must not be reported as one.
    expect(reporter.getLosses()).toEqual([])
  })

  it.each([
    ['annotation', 'analyses every component and hook'],
    ['all', 'analyses components and hooks only'],
  ])(
    'reports useReactCompiler compilationMode %s as a semantic loss',
    (compilationMode, expectedNote) => {
      const reporter = new CollectingReporter()
      const linterRules: BiomeLinterRules = {
        nursery: {
          useReactCompiler: { level: 'error', options: { compilationMode } },
        },
      }

      const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

      // The option cannot be carried over, but the rules themselves still migrate.
      expect(Object.keys(rules)).toHaveLength(22)
      expect(rules['react/purity']).toBe('error')
      expect(reporter.getLosses()).toHaveLength(1)
      expect(reporter.getLosses()[0]).toContain(`"compilationMode": "${compilationMode}"`)
      expect(reporter.getLosses()[0]).toContain(expectedNote)
    },
  )

  it('reports no loss for useReactCompiler compilationMode infer, which Oxlint matches', () => {
    const reporter = new CollectingReporter()
    const linterRules: BiomeLinterRules = {
      nursery: {
        useReactCompiler: { level: 'error', options: { compilationMode: 'infer' } },
      },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(Object.keys(rules)).toHaveLength(22)
    expect(reporter.getLosses()).toEqual([])
  })

  it('reports partially covered mappings once per migration', () => {
    const reporter = new CollectingReporter()
    const linterRules: BiomeLinterRules = {
      correctness: {
        noReactPropAssignments: 'error',
      },
      suspicious: {
        useStaticResponseMethods: 'error',
      },
      nursery: {
        noComponentHookFactories: 'warn',
        useExplicitType: 'warn',
      },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toMatchObject({
      'react/immutability': 'error',
      'react/no-unstable-nested-components': 'warn',
      'typescript/explicit-function-return-type': 'warn',
      'unicorn/prefer-response-static-json': 'error',
    })
    expect(reporter.getLosses()).toHaveLength(4)
  })

  it('maps the Biome rules whose Oxlint counterparts were verified against both binaries', () => {
    const reporter = new CollectingReporter()
    const linterRules: BiomeLinterRules = {
      performance: {
        noJsxPropsBind: 'error',
      },
      nursery: {
        useControlLabel: 'warn',
      },
    }

    const { rules, sourceRulesConverted, sourceRulesSkipped } = extractRulesFromBiomeConfig(
      linterRules,
      reporter,
    )

    expect(rules).toMatchObject({
      'react-perf/jsx-no-new-function-as-prop': 'error',
      'jsx-a11y/control-has-associated-label': 'warn',
    })
    expect(sourceRulesConverted).toEqual(new Set(['noJsxPropsBind', 'useControlLabel']))
    expect(sourceRulesSkipped).toEqual(new Set())
    // Both Oxlint rules report exactly what the Biome rule reports, so neither is a narrowing.
    expect(reporter.getLosses()).toEqual([])
  })

  it('translates the options of the newly mapped rules', () => {
    const reporter = new CollectingReporter()
    const linterRules: BiomeLinterRules = {
      complexity: {
        noExcessiveLinesPerFunction: {
          level: 'warn',
          options: { maxLines: 20, skipBlankLines: true, skipIifes: true },
        },
      },
      style: {
        noExcessiveLinesPerFile: {
          level: 'error',
          options: { maxLines: 400 },
        },
        useConsistentObjectDefinitions: {
          level: 'warn',
          options: { syntax: 'explicit' },
        },
        useSingleVarDeclarator: 'error',
      },
      nursery: {
        noJsRestrictedProperties: {
          level: 'error',
          options: { entries: [{ object: 'require', property: 'ensure' }] },
        },
        useExplicitReturnType: {
          level: 'warn',
          options: { allowExpressions: true, allowIifes: true, allowedNames: ['setup'] },
        },
      },
      correctness: {
        useImportExtensions: 'error',
      },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toMatchObject({
      // Biome's `skipIifes` excludes IIFEs; Oxlint's `IIFEs` includes them.
      'max-lines-per-function': ['warn', { max: 20, skipBlankLines: true, IIFEs: false }],
      'max-lines': ['error', { max: 400, skipBlankLines: false }],
      'object-shorthand': ['warn', 'never'],
      'one-var': ['error', 'never'],
      'no-restricted-properties': ['error', { object: 'require', property: 'ensure' }],
      'typescript/explicit-function-return-type': [
        'warn',
        { allowExpressions: true, allowIIFEs: true, allowedNames: ['setup'] },
      ],
      'import/extensions': ['error', 'ignorePackages'],
    })
    expect(reporter.getWarnings()).toEqual([])
  })

  it('falls back to the Biome defaults when the line-limit rules carry no options', () => {
    const reporter = new CollectingReporter()
    const linterRules: BiomeLinterRules = {
      complexity: { noExcessiveLinesPerFunction: 'warn' },
      style: { noExcessiveLinesPerFile: 'warn' },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toMatchObject({
      'max-lines-per-function': ['warn', { max: 50, skipBlankLines: false, IIFEs: true }],
      'max-lines': ['warn', { max: 300, skipBlankLines: false }],
    })
  })

  it('reports the useImportExtensions options Oxlint cannot express', () => {
    const reporter = new CollectingReporter()
    const linterRules: BiomeLinterRules = {
      correctness: {
        useImportExtensions: {
          level: 'error',
          options: { forceJsExtensions: true },
        },
      },
    }

    const { rules } = extractRulesFromBiomeConfig(linterRules, reporter)

    expect(rules).toMatchObject({ 'import/extensions': ['error', 'ignorePackages'] })
    expect(reporter.getLosses()).toHaveLength(1)
    expect(reporter.getLosses()[0]).toContain('forceJsExtensions')
  })
})
