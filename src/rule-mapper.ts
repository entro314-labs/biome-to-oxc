import type {
  BiomeLinterRules,
  BiomeRuleGroup,
  BiomeRuleSeverity,
  OxlintRuleSeverity,
  Reporter,
} from './types.js'

const BIOME_TO_OXLINT_CATEGORY_MAP: Record<string, string> = {
  correctness: 'correctness',
  suspicious: 'suspicious',
  style: 'style',
  complexity: 'pedantic',
  performance: 'perf',
  security: 'restriction',
  a11y: 'restriction',
  nursery: 'nursery',
}

const OXLINT_CATEGORIES = [
  'correctness',
  'nursery',
  'pedantic',
  'perf',
  'restriction',
  'style',
  'suspicious',
] as const

type OxlintRuleMapping = string | readonly string[]

/**
 * Every React Compiler rule Oxlint implements.
 *
 * Oxlint 1.79 replaced the single `react/react-compiler` rule with 22 per-diagnostic rules,
 * spread across the `correctness`, `perf`, `restriction`, and `suspicious` categories. Biome's
 * `useReactCompiler` runs the compiler and reports every bailout it finds, so the whole set is
 * the equivalent: mapping only the rules Oxlint enables by default would drop diagnostics the
 * Biome rule did produce. Oxlint does not implement `gating` or `memoized-effect-dependencies`,
 * so there is nothing to enable for those two.
 *
 * @see https://oxc.rs/blog/2026-08-18-react-compiler-support
 */
const REACT_COMPILER_RULES = [
  'react/capitalized-calls',
  'react/error-boundaries',
  'react/exhaustive-effect-dependencies',
  'react/globals',
  'react/hooks',
  'react/immutability',
  'react/incompatible-library',
  'react/invariant',
  'react/memo-dependencies',
  'react/no-deriving-state-in-effects',
  'react/preserve-manual-memoization',
  'react/purity',
  'react/refs',
  'react/rule-suppression',
  'react/set-state-in-effect',
  'react/set-state-in-render',
  'react/static-components',
  'react/syntax',
  'react/todo',
  'react/unsupported-syntax',
  'react/use-memo',
  'react/void-use-memo',
] as const

/**
 * Mappings where the Oxlint rule covers only part of what the Biome rule checked. The note
 * is reported once per migration so the narrowing is visible rather than silent.
 */
const PARTIAL_RULE_MAPPING_NOTES: Record<string, string> = {
  noComponentHookFactories:
    'Biome rule noComponentHookFactories was mapped to react/no-unstable-nested-components, which reports nested component definitions but not nested custom hook definitions.',
  noReactPropAssignments:
    'Biome rule noReactPropAssignments was mapped to the React Compiler rule react/immutability, which reports prop mutation alongside other mutations of values React treats as immutable.',
  useExplicitType:
    'Biome rule useExplicitType was mapped to typescript/explicit-function-return-type, which requires return types on functions and methods but not types on variables or parameters.',
  useStaticResponseMethods:
    'Biome rule useStaticResponseMethods was mapped to unicorn/prefer-response-static-json, which reports `new Response(JSON.stringify(...))` but not the `new Response(null, { status, headers })` forms Biome rewrites to Response.redirect() and Response.error().',
}

/**
 * Biome rule names the mapper accepts that the currently supported Biome release does not
 * define. They are kept so configs written against other Biome versions still migrate, and
 * listed explicitly so the inventory check can tell them apart from a typo in a new mapping.
 */
export const UNVERIFIED_BIOME_RULE_NAMES = [
  // Removed in Biome 2.x; every one of them has a current replacement that is mapped too.
  'noConsoleLog', // -> noConsole
  'noInvalidNewBuiltin', // -> noInvalidBuiltinInstantiation
  'noNewSymbol', // -> noInvalidBuiltinInstantiation
  'noUnnecessaryContinue', // -> noUselessContinue
  // Still in Biome's nursery upstream, so not in the released schema yet.
  'useFind', // duplicates useArrayFind
  // Not found in any Biome release; retained because each duplicates a mapped current rule.
  'noMultiStr', // duplicates noMultilineString
  'useAriaPropTypes', // duplicates useValidAriaValues
  'useSpread', // duplicates useSpreadOverApply
] as const

/** Every Biome rule name this mapper recognises, for inventory conformance checks. */
export function getMappedBiomeRuleNames(): string[] {
  return Object.keys(BIOME_TO_OXLINT_RULE_MAP)
}

/** Every Oxlint rule name this mapper can emit, for inventory conformance checks. */
export function getMappedOxlintRuleNames(): string[] {
  const names = new Set<string>()

  for (const mapping of Object.values(BIOME_TO_OXLINT_RULE_MAP)) {
    if (typeof mapping === 'string') {
      names.add(mapping)
      continue
    }

    for (const name of mapping) {
      names.add(name)
    }
  }

  return [...names]
}

export interface RuleExtractionResult {
  rules: Record<string, OxlintRuleSeverity>
  categories: Record<string, 'off' | 'warn' | 'error'>
  /** Distinct Biome rule names that produced at least one Oxlint rule. */
  sourceRulesConverted: Set<string>
  /** Distinct Biome rule names with no Oxlint equivalent. */
  sourceRulesSkipped: Set<string>
}

const BIOME_TO_OXLINT_RULE_MAP: Record<string, OxlintRuleMapping> = {
  noAccessKey: 'jsx-a11y/no-access-key',
  noAdjacentSpacesInRegex: 'no-regex-spaces',
  noAmbiguousAnchorText: 'jsx-a11y/anchor-ambiguous-text',
  noArguments: 'prefer-rest-params',
  noAriaHiddenOnFocusable: 'jsx-a11y/no-aria-hidden-on-focusable',
  noAriaUnsupportedElements: 'jsx-a11y/aria-unsupported-elements',
  noAccumulatingSpread: 'oxc/no-accumulating-spread',
  noAlert: 'no-alert',
  noConstantBinaryExpressions: 'no-constant-binary-expression',
  noApproximativeNumericConstant: 'oxc/approx-constant',
  noBarrelFile: 'oxc/no-barrel-file',
  noArrayIndexKey: 'react/no-array-index-key',
  noAssignInExpressions: 'no-cond-assign',
  noAsyncPromiseExecutor: 'no-async-promise-executor',
  noAutofocus: 'jsx-a11y/no-autofocus',
  noAwaitInLoops: 'no-await-in-loop',
  noBannedTypes: 'typescript/ban-types',
  noBaseToString: 'typescript/no-base-to-string',
  noBeforeInteractiveScriptOutsideDocument: 'nextjs/no-before-interactive-script-outside-document',
  noBitwiseOperators: 'no-bitwise',
  noBlankTarget: 'react/jsx-no-target-blank',
  noCatchAssign: 'no-ex-assign',
  noChildrenProp: 'react/no-children-prop',
  noClassAssign: 'no-class-assign',
  noCommaOperator: 'no-sequences',
  noCommentText: 'react/jsx-no-comment-textnodes',
  noCommonJs: ['import/no-commonjs', 'typescript/no-require-imports', 'typescript/no-var-requires'],
  noComponentHookFactories: 'react/no-unstable-nested-components',
  noCompareNegZero: 'no-compare-neg-zero',
  noConfusingLabels: 'no-labels',
  noConfusingVoidType: 'typescript/no-invalid-void-type',
  noConsole: 'no-console',
  noConsoleLog: 'no-console',
  noConstAssign: 'no-const-assign',
  noConstEnum: 'oxc/no-const-enum',
  noConstantCondition: 'no-constant-condition',
  noConstantMathMinMaxClamp: 'oxc/bad-min-max-func',
  noConstructorReturn: 'no-constructor-return',
  noContinue: 'no-continue',
  noControlCharactersInRegex: 'no-control-regex',
  noDangerouslySetInnerHtml: 'react/no-danger',
  noDangerouslySetInnerHtmlWithChildren: 'react/no-danger-with-children',
  noDebugger: 'no-debugger',
  noDefaultExport: 'import/no-default-export',
  noDistractingElements: 'jsx-a11y/no-distracting-elements',
  noDoubleEquals: 'eqeqeq',
  noDuplicateCase: 'no-duplicate-case',
  noDuplicateElseIf: 'no-dupe-else-if',
  noDuplicateClassMembers: 'no-dupe-class-members',
  noDuplicateEnumValues: 'typescript/no-duplicate-enum-values',
  noDuplicateJsxProps: 'react/jsx-no-duplicate-props',
  noDuplicateObjectKeys: 'no-dupe-keys',
  noDuplicatedSpreadProps: 'react/jsx-props-no-spread-multi',
  noDocumentCookie: 'unicorn/no-document-cookie',
  noDocumentImportInPage: 'nextjs/no-document-import-in-page',
  noDoneCallback: 'jest/no-done-callback',
  noDivRegex: 'no-div-regex',
  noEmptyBlockStatements: 'no-empty',
  noEmptyCharacterClassInRegex: 'no-empty-character-class',
  noEmptyInterface: 'typescript/no-empty-interface',
  noEmptyPattern: 'no-empty-pattern',
  noEmptySource: 'unicorn/no-empty-file',
  noEqualsToNull: 'no-eq-null',
  noExcessiveClassesPerFile: 'max-classes-per-file',
  noExcessiveCognitiveComplexity: 'complexity',
  noExcessiveLinesPerFile: 'max-lines',
  noExcessiveLinesPerFunction: 'max-lines-per-function',
  noExcessiveNestedCallbacks: 'max-nested-callbacks',
  noExplicitAny: 'typescript/no-explicit-any',
  noExtendNative: 'no-extend-native',
  noExtraBooleanCast: 'no-extra-boolean-cast',
  noExtraNonNullAssertion: 'typescript/no-extra-non-null-assertion',
  noFallthroughSwitchClause: 'no-fallthrough',
  // Superset: prefer-array-flat also flags other flatten idioms beyond flatMap(x => x).
  noFlatMapIdentity: 'unicorn/prefer-array-flat',
  noFloatingPromises: 'typescript/no-floating-promises',
  noFocusedTests: ['jest/no-focused-tests', 'vitest/no-focused-tests'],
  noForEach: 'unicorn/no-array-for-each',
  noFunctionAssign: 'no-func-assign',
  noGlobalAssign: 'no-global-assign',
  noGlobalDirnameFilename: 'unicorn/prefer-module',
  noGlobalEval: 'no-eval',
  noGlobalIsFinite: 'unicorn/prefer-number-properties',
  noGlobalIsNan: 'unicorn/prefer-number-properties',
  noGlobalObjectCalls: 'no-obj-calls',
  noHeaderScope: 'jsx-a11y/scope',
  noHeadElement: 'nextjs/no-head-element',
  noHeadImportInDocument: 'nextjs/no-head-import-in-document',
  noImgElement: 'nextjs/no-img-element',
  noImportAssign: 'no-import-assign',
  noImportCycles: 'import/no-cycle',
  noImplicitCoercions: 'no-implicit-coercion',
  noInnerDeclarations: 'no-inner-declarations',
  noImplicitBoolean: 'no-implicit-coercion',
  noImpliedEval: 'no-implied-eval',
  noIncrementDecrement: 'no-plusplus',
  noInferrableTypes: 'typescript/no-inferrable-types',
  noInvalidBuiltinInstantiation: 'no-new-native-nonconstructor',
  noInvalidUseBeforeDeclaration: 'no-use-before-define',
  noInvalidConstructorSuper: 'no-this-before-super',
  noIrregularWhitespace: 'no-irregular-whitespace',
  noInteractiveElementToNoninteractiveRole:
    'jsx-a11y/no-interactive-element-to-noninteractive-role',
  noInvalidNewBuiltin: 'no-new-native-nonconstructor',
  noJsRestrictedProperties: 'no-restricted-properties',
  noJsxLiterals: 'react/jsx-no-literals',
  noJsxNamespace: 'react/no-namespace',
  noJsxPropsBind: 'react-perf/jsx-no-new-function-as-prop',
  noLabelWithoutControl: 'jsx-a11y/label-has-associated-control',
  noLabelVar: 'no-label-var',
  noLoopFunc: 'no-loop-func',
  noMagicNumbers: 'no-magic-numbers',
  noMisleadingCharacterClass: 'no-misleading-character-class',
  noMisleadingInstantiator: 'typescript/no-misused-new',
  noMisrefactoredShorthandAssign: 'oxc/misrefactored-assign-op',
  noMisusedPromises: 'typescript/no-misused-promises',
  noMultiAssign: 'no-multi-assign',
  noMultilineString: 'no-multi-str',
  noMultiStr: 'no-multi-str',
  noNegationElse: 'no-negated-condition',
  noNegationInEqualityCheck: 'unicorn/no-negation-in-equality-check',
  noNewSymbol: 'no-new-native-nonconstructor',
  noNodejsModules: 'import/no-nodejs-modules',
  noNamespace: 'typescript/no-namespace',
  noNamespaceImport: 'import/no-namespace',
  noNestedComponentDefinitions: 'react/no-unstable-nested-components',
  noNestedPromises: 'promise/no-nesting',
  noNestedTernary: 'no-nested-ternary',
  noNextAsyncClientComponent: 'nextjs/no-async-client-component',
  noNoninteractiveElementInteractions: 'jsx-a11y/no-noninteractive-element-interactions',
  noNoninteractiveElementToInteractiveRole:
    'jsx-a11y/no-noninteractive-element-to-interactive-role',
  noNoninteractiveTabindex: 'jsx-a11y/no-noninteractive-tabindex',
  noNonNullAssertedOptionalChain: 'typescript/no-non-null-asserted-optional-chain',
  noNonNullAssertion: 'typescript/no-non-null-assertion',
  noNonoctalDecimalEscape: 'no-nonoctal-decimal-escape',
  noParametersOnlyUsedInRecursion: 'oxc/only-used-in-recursion',
  noParameterAssign: 'no-param-reassign',
  noParameterProperties: 'typescript/parameter-properties',
  noPrecisionLoss: 'no-loss-of-precision',
  noPositiveTabindex: 'jsx-a11y/tabindex-no-positive',
  noProcessEnv: 'node/no-process-env',
  noProto: 'no-proto',
  noPrototypeBuiltins: 'no-prototype-builtins',
  noRedeclare: 'no-redeclare',
  noReactPropAssignments: 'react/immutability',
  noRedundantAlt: 'jsx-a11y/img-redundant-alt',
  noRedundantRoles: 'jsx-a11y/no-redundant-roles',
  noReactStringRefs: 'react/no-string-refs',
  noDuplicateTestHooks: ['jest/no-duplicate-hooks', 'vitest/no-duplicate-hooks'],
  noConditionalExpect: ['jest/no-conditional-expect', 'vitest/no-conditional-expect'],
  noExcessiveNestedTestSuites: ['jest/max-nested-describe', 'vitest/max-nested-describe'],
  noExportsInTest: 'jest/no-export',
  noIdenticalTestTitle: ['jest/no-identical-title', 'vitest/no-identical-title'],
  noMisplacedAssertion: ['jest/no-standalone-expect', 'vitest/no-standalone-expect'],
  noRenderReturnValue: 'react/no-render-return-value',
  noRestrictedGlobals: 'no-restricted-globals',
  noRestrictedElements: 'react/forbid-elements',
  noRestrictedImports: 'no-restricted-imports',
  noRestrictedTypes: 'typescript/no-restricted-types',
  noReturnAssign: 'no-return-assign',
  noScriptUrl: 'no-script-url',
  noSelfCompare: 'no-self-compare',
  noSelfAssign: 'no-self-assign',
  noSetterReturn: 'no-setter-return',
  noShadow: 'no-shadow',
  noShadowRestrictedNames: 'no-shadow-restricted-names',
  noSkippedTests: ['jest/no-disabled-tests', 'vitest/no-disabled-tests'],
  noSparseArray: 'no-sparse-arrays',
  noStaticOnlyClass: 'unicorn/no-static-only-class',
  noSyncScripts: 'nextjs/no-sync-scripts',
  noSwitchDeclarations: 'no-case-declarations',
  noStaticElementInteractions: 'jsx-a11y/no-static-element-interactions',
  noSubstr: 'unicorn/prefer-string-slice',
  noTemplateCurlyInString: 'no-template-curly-in-string',
  noTernary: 'no-ternary',
  noThenProperty: 'unicorn/no-thenable',
  noUndeclaredVariables: 'no-undef',
  noUnknownAttribute: 'react/no-unknown-property',
  noUnassignedVariables: 'no-unassigned-vars',
  noUselessThisAlias: 'typescript/no-this-alias',
  noUnusedExpressions: 'no-unused-expressions',
  noUnusedFunctionParameters: 'no-unused-vars',
  noUnusedImports: 'no-unused-vars',
  noUnnecessaryContinue: 'no-continue',
  noUnnecessaryConditions: 'typescript/no-unnecessary-condition',
  noUnnecessaryTemplateExpression: 'typescript/no-unnecessary-template-expression',
  noUnreachable: 'no-unreachable',
  noUnreachableSuper: 'constructor-super',
  noUnsafeDeclarationMerging: 'typescript/no-unsafe-declaration-merging',
  noUnsafeTypeAssertion: 'typescript/no-unsafe-type-assertion',
  noUnsafeFinally: 'no-unsafe-finally',
  noUnsafeNegation: 'no-unsafe-negation',
  noUnsafeOptionalChaining: 'no-unsafe-optional-chaining',
  noUnsafePlusOperands: 'typescript/restrict-plus-operands',
  noUnusedInstantiation: 'no-new',
  noUnusedLabels: 'no-unused-labels',
  noUnusedPrivateClassMembers: 'no-unused-private-class-members',
  noUnusedVariables: 'no-unused-vars',
  noUnwantedPolyfillio: 'nextjs/no-unwanted-polyfillio',
  noUselessCatch: 'no-useless-catch',
  noUselessContinue: 'no-continue',
  noUselessCatchBinding: 'unicorn/prefer-optional-catch-binding',
  noUselessConstructor: 'no-useless-constructor',
  noUselessElse: 'no-else-return',
  noUselessEmptyExport: 'typescript/no-useless-empty-export',
  noUselessEscapeInRegex: 'no-useless-escape',
  noUselessEscapeInString: 'no-useless-escape',
  noUselessFragments: 'react/jsx-no-useless-fragment',
  noUselessLabel: 'no-extra-label',
  noUselessLoneBlockStatements: 'no-lone-blocks',
  noUselessRegexBackrefs: 'no-useless-backreference',
  noUselessRename: 'no-useless-rename',
  noUselessReturn: 'no-useless-return',
  noUselessStringConcat: 'no-useless-concat',
  noUselessTernary: 'no-unneeded-ternary',
  noTsIgnore: 'typescript/ban-ts-comment',
  noUselessSwitchCase: 'unicorn/no-useless-switch-case',
  noUselessTypeConstraint: 'typescript/no-unnecessary-type-constraint',
  noUselessTypeConversion: 'typescript/no-unnecessary-type-conversion',
  noUselessUndefined: 'unicorn/no-useless-undefined',
  noUselessUndefinedInitialization: 'unicorn/no-useless-undefined',
  noVoid: 'no-void',
  noVar: 'no-var',
  noVoidElementsWithChildren: 'react/void-dom-elements-no-children',
  noVueDataObjectDeclaration: [
    'vue/no-deprecated-data-object-declaration',
    'vue/no-shared-component-data',
  ],
  noVueArrowFuncInWatch: 'vue/no-arrow-functions-in-watch',
  noVueDuplicateKeys: 'vue/no-dupe-keys',
  noVueImportCompilerMacros: 'vue/no-import-compiler-macros',
  noVueReservedKeys: 'vue/no-reserved-keys',
  noVueReservedProps: 'vue/no-reserved-props',
  noWith: 'no-with',
  noYodaExpression: 'yoda',
  useAltText: 'jsx-a11y/alt-text',
  useAdjacentOverloadSignatures: 'typescript/adjacent-overload-signatures',
  useAnchorContent: 'jsx-a11y/anchor-has-content',
  useArrowFunction: 'prefer-arrow-callback',
  useArrayFind: 'typescript/prefer-find',
  useArrayLiterals: 'no-array-constructor',
  useArraySome: 'unicorn/prefer-array-some',
  useArraySortCompare: 'typescript/require-array-sort-compare',
  useAriaActivedescendantWithTabindex: 'jsx-a11y/aria-activedescendant-has-tabindex',
  useAwaitThenable: 'typescript/await-thenable',
  useButtonType: 'react/button-has-type',
  useAriaPropTypes: 'jsx-a11y/aria-proptypes',
  useAriaPropsForRole: 'jsx-a11y/role-has-required-aria-props',
  useAriaPropsSupportedByRole: 'jsx-a11y/role-supports-aria-props',
  useAsConstAssertion: 'typescript/prefer-as-const',
  useAtIndex: 'unicorn/prefer-at',
  useAwait: 'require-await',
  useBlockStatements: 'curly',
  useComponentExportOnlyModules: 'react/only-export-components',
  useCollapsedElseIf: 'no-lonely-if',
  useCollapsedIf: 'unicorn/no-lonely-if',
  useConsistentArrayType: 'typescript/array-type',
  useConsistentArrowReturn: 'arrow-body-style',
  useConsistentBuiltinInstantiation: 'no-new-wrappers',
  useConsistentCurlyBraces: 'curly',
  useConsistentEnumValueType: 'typescript/no-mixed-enums',
  useConsistentMethodSignatures: 'typescript/method-signature-style',
  useConsistentTypeDefinitions: 'typescript/consistent-type-definitions',
  useConsistentMemberAccessibility: 'typescript/explicit-member-accessibility',
  useConsistentObjectDefinitions: 'object-shorthand',
  useConsistentTestIt: ['jest/consistent-test-it', 'vitest/consistent-test-it'],
  useConst: 'prefer-const',
  useControlLabel: 'jsx-a11y/control-has-associated-label',
  useDateNow: 'unicorn/prefer-date-now',
  useDefaultParameterLast: 'default-param-last',
  useDefaultSwitchClause: 'default-case',
  useDefaultSwitchClauseLast: 'default-case-last',
  useDestructuring: 'prefer-destructuring',
  useDomNodeTextContent: 'unicorn/prefer-dom-node-text-content',
  useDomQuerySelector: 'unicorn/prefer-query-selector',
  useEnumInitializers: 'typescript/prefer-enum-initializers',
  useErrorCause: 'preserve-caught-error',
  useErrorMessage: 'unicorn/error-message',
  useExpect: ['jest/expect-expect', 'vitest/expect-expect'],
  useExplicitLengthCheck: 'unicorn/explicit-length-check',
  useExplicitReturnType: 'typescript/explicit-function-return-type',
  useExplicitType: 'typescript/explicit-function-return-type',
  useExponentiationOperator: 'prefer-exponentiation-operator',
  useExportsLast: 'import/exports-last',
  useExportType: 'typescript/consistent-type-exports',
  useExhaustiveSwitchCases: 'typescript/switch-exhaustiveness-check',
  useExhaustiveDependencies: 'react/exhaustive-deps',
  useFilenamingConvention: 'unicorn/filename-case',
  useFind: 'typescript/prefer-find',
  useFlatMap: 'unicorn/prefer-array-flat-map',
  useFragmentSyntax: 'react/jsx-fragments',
  useFocusableInteractive: 'jsx-a11y/interactive-supports-focus',
  useForOf: 'typescript/prefer-for-of',
  useGetterReturn: 'getter-return',
  useGlobalThis: 'unicorn/prefer-global-this',
  useGoogleFontDisplay: 'nextjs/google-font-display',
  useGoogleFontPreconnect: 'nextjs/google-font-preconnect',
  useGuardForIn: 'guard-for-in',
  useGroupedAccessorPairs: 'grouped-accessor-pairs',
  useHeadingContent: 'jsx-a11y/heading-has-content',
  useHtmlLang: 'jsx-a11y/html-has-lang',
  useHookAtTopLevel: 'react/rules-of-hooks',
  useIframeSandbox: 'react/iframe-missing-sandbox',
  useIframeTitle: 'jsx-a11y/iframe-has-title',
  useImportExtensions: 'import/extensions',
  useImportsFirst: 'import/first',
  useImportType: 'typescript/consistent-type-imports',
  useIncludes: 'typescript/prefer-includes',
  useIndexOf: 'unicorn/prefer-array-index-of',
  useInlineScriptId: 'nextjs/inline-script-id',
  useIterableCallbackReturn: 'array-callback-return',
  useIsNan: 'use-isnan',
  useIsArray: 'unicorn/no-instanceof-array',
  useJsxKeyInIterable: 'react/jsx-key',
  useKeyWithClickEvents: 'jsx-a11y/click-events-have-key-events',
  useKeyWithMouseEvents: 'jsx-a11y/mouse-events-have-key-events',
  useLiteralEnumMembers: 'typescript/prefer-literal-enum-member',
  useLiteralKeys: 'typescript/dot-notation',
  useMathMinMax: 'unicorn/prefer-math-min-max',
  useMaxParams: 'max-params',
  useMediaCaption: 'jsx-a11y/media-has-caption',
  useNamedCaptureGroup: 'prefer-named-capture-group',
  useNamespaceKeyword: 'typescript/prefer-namespace-keyword',
  useNodejsImportProtocol: 'unicorn/prefer-node-protocol',
  useNullishCoalescing: 'typescript/prefer-nullish-coalescing',
  useNumberNamespace: 'unicorn/prefer-number-properties',
  useNumberToFixedDigitsArgument: 'unicorn/require-number-to-fixed-digits-argument',
  useNumericLiterals: 'prefer-numeric-literals',
  useNumericSeparators: 'unicorn/numeric-separators-style',
  useObjectSpread: 'prefer-object-spread',
  useOptionalChain: 'typescript/prefer-optional-chain',
  useParseIntRadix: 'radix',
  useReadonlyClassProperties: 'typescript/prefer-readonly',
  useReactFunctionComponentDefinition: 'react/function-component-definition',
  useReactCompiler: REACT_COMPILER_RULES,
  useReactFunctionComponents: 'react/prefer-function-component',
  useReduceTypeParameter: 'typescript/prefer-reduce-type-parameter',
  useRegexLiterals: 'prefer-regex-literals',
  useRegexpExec: 'typescript/prefer-regexp-exec',
  useRegexpTest: 'unicorn/prefer-regexp-test',
  useSemanticElements: 'jsx-a11y/prefer-tag-over-role',
  useSelfClosingElements: 'react/self-closing-comp',
  useShorthandAssign: 'operator-assignment',
  useShorthandFunctionType: 'typescript/prefer-function-type',
  useSingleVarDeclarator: 'one-var',
  useSimplifiedLogicExpression: 'unicorn/prefer-logical-operator-over-ternary',
  useSpread: 'prefer-spread',
  useSpreadOverApply: 'prefer-spread',
  useStaticResponseMethods: 'unicorn/prefer-response-static-json',
  useStringStartsEndsWith: 'typescript/prefer-string-starts-ends-with',
  useSymbolDescription: 'symbol-description',
  useTemplate: 'prefer-template',
  useTestHooksInOrder: ['jest/prefer-hooks-in-order', 'vitest/prefer-hooks-in-order'],
  useTestHooksOnTop: ['jest/prefer-hooks-on-top', 'vitest/prefer-hooks-on-top'],
  useThisInClassMethods: 'class-methods-use-this',
  useThrowNewError: 'unicorn/throw-new-error',
  useThrowOnlyError: 'typescript/only-throw-error',
  useTrimStartEnd: 'unicorn/prefer-string-trim-start-end',
  useUnicodeRegex: 'require-unicode-regexp',
  useUnifiedTypeSignatures: 'typescript/unified-signatures',
  useValidAriaRole: 'jsx-a11y/aria-role',
  useValidAnchor: 'jsx-a11y/anchor-is-valid',
  useValidAriaProps: 'jsx-a11y/aria-props',
  useValidAriaValues: 'jsx-a11y/aria-proptypes',
  useValidAutocomplete: 'jsx-a11y/autocomplete-valid',
  useValidForDirection: 'for-direction',
  useValidLang: 'jsx-a11y/lang',
  useValidTypeof: 'valid-typeof',
  useVarsOnTop: 'vars-on-top',
  useVueConsistentDefinePropsDeclaration: 'vue/define-props-declaration',
  useVueNextTickPromise: 'vue/next-tick-style',
  useYield: 'require-yield',
}

const WARNED_UNMAPPED_RULES_BY_REPORTER = new WeakMap<Reporter, Set<string>>()
const WARNED_PARTIAL_MAPPINGS_BY_REPORTER = new WeakMap<Reporter, Set<string>>()
const WARNED_UNSUPPORTED_SEVERITIES_BY_REPORTER = new WeakMap<Reporter, Set<string>>()
const OXLINT_SEVERITY_NORMALIZATION: Record<string, 'off' | 'warn' | 'error'> = {
  allow: 'off',
  off: 'off',
  on: 'warn',
  warn: 'warn',
  warning: 'warn',
  info: 'warn',
  deny: 'error',
  error: 'error',
}

function normalizeOxlintRuleName(ruleName: string): string {
  // Keep compatibility with older mapping values and normalize to current keys.
  if (ruleName.startsWith('react-hooks/')) {
    return ruleName.replace('react-hooks/', 'react/')
  }
  if (ruleName.startsWith('jsx_a11y/')) {
    return ruleName.replace('jsx_a11y/', 'jsx-a11y/')
  }
  if (ruleName.startsWith('react_perf/')) {
    return ruleName.replace('react_perf/', 'react-perf/')
  }
  return ruleName
}

function mapBiomeRuleOptionsToOxlintSeverity(
  biomeName: string,
  severity: OxlintRuleSeverity,
  biomeSeverity: BiomeRuleSeverity,
  reporter: Reporter,
): OxlintRuleSeverity {
  if (typeof severity !== 'string') {
    return severity
  }

  if (biomeName === 'useVueNextTickPromise') {
    return [severity, 'promise']
  }

  const options = getBiomeRuleOptions(biomeSeverity)

  if (biomeName === 'noExcessiveNestedCallbacks') {
    const max = options && isNonNegativeInteger(options.max) ? options.max : 5
    return [severity, { max }]
  }

  if (biomeName === 'useErrorCause') {
    const requireCatchParameter =
      options && typeof options.requireCatchParameter === 'boolean'
        ? options.requireCatchParameter
        : true
    return [severity, { requireCatchParameter }]
  }

  if (biomeName === 'useMaxParams') {
    const max = options && isNonNegativeInteger(options.max) ? options.max : 4
    return [severity, { max }]
  }

  if (biomeName === 'noExcessiveLinesPerFile') {
    return [
      severity,
      {
        max: options && isNonNegativeInteger(options.maxLines) ? options.maxLines : 300,
        skipBlankLines: options?.skipBlankLines === true,
      },
    ]
  }

  if (biomeName === 'noExcessiveLinesPerFunction') {
    return [
      severity,
      {
        max: options && isNonNegativeInteger(options.maxLines) ? options.maxLines : 50,
        skipBlankLines: options?.skipBlankLines === true,
        // Biome's `skipIifes` excludes IIFEs from the check; Oxlint's `IIFEs` includes them.
        IIFEs: options?.skipIifes !== true,
      },
    ]
  }

  if (biomeName === 'useSingleVarDeclarator') {
    // Biome always requires one declarator per statement; Oxlint's `one-var` needs the mode.
    return [severity, 'never']
  }

  if (biomeName === 'useImportExtensions') {
    if (options?.extensionMappings !== undefined || options?.forceJsExtensions !== undefined) {
      reporter.loss(
        'Biome rule useImportExtensions options "extensionMappings" and "forceJsExtensions" are not supported by Oxlint import/extensions; the rule requires an extension without rewriting it.',
      )
    }
    // Biome only checks relative imports, which is what `ignorePackages` selects.
    return [severity, 'ignorePackages']
  }

  if (biomeName === 'noTsIgnore') {
    // Biome's noTsIgnore forbids `@ts-ignore` only. Oxlint's ban-ts-comment defaults to
    // banning several directives, so it has to be narrowed to match.
    return [
      severity,
      {
        'ts-ignore': true,
        'ts-expect-error': false,
        'ts-nocheck': false,
        'ts-check': false,
      },
    ]
  }

  if (biomeName === 'useReactCompiler') {
    // Oxlint exposes no React Compiler configuration; it runs the compiler with fixed options
    // equivalent to Biome's default `compilationMode: "infer"`, so the other two modes change
    // which functions are analysed and cannot be carried over.
    if (options?.compilationMode === 'annotation') {
      reporter.loss(
        'Biome rule useReactCompiler option "compilationMode": "annotation" is not supported by Oxlint, which analyses every component and hook rather than only the functions carrying a "use memo" directive.',
      )
    } else if (options?.compilationMode === 'all') {
      reporter.loss(
        'Biome rule useReactCompiler option "compilationMode": "all" is not supported by Oxlint, which analyses components and hooks only; React Compiler diagnostics in other functions are no longer reported.',
      )
    }
    return severity
  }

  if (!options) {
    return severity
  }

  if (biomeName === 'noAmbiguousAnchorText') {
    const { words } = options
    return Array.isArray(words) && words.every((value) => typeof value === 'string')
      ? [severity, { words }]
      : severity
  }

  if (biomeName === 'noConsole') {
    const { allow } = options
    return Array.isArray(allow) && allow.every((value) => typeof value === 'string')
      ? [severity, { allow }]
      : severity
  }

  if (biomeName === 'noEmptySource') {
    if (options.allowComments === true) {
      reporter.loss(
        'Biome rule noEmptySource option "allowComments" is not supported by Oxlint unicorn/no-empty-file and was not migrated.',
      )
    }
    return severity
  }

  if (biomeName === 'noExcessiveClassesPerFile') {
    return isNonNegativeInteger(options.maxClasses)
      ? [severity, { max: options.maxClasses }]
      : severity
  }

  if (biomeName === 'noIncrementDecrement') {
    return typeof options.allowForLoopAfterthoughts === 'boolean'
      ? [severity, { allowForLoopAfterthoughts: options.allowForLoopAfterthoughts }]
      : severity
  }

  if (biomeName === 'noRestrictedElements') {
    const { elements } = options
    if (!isRecord(elements)) {
      return severity
    }

    const entries = Object.entries(elements)
    if (entries.length === 0 || !entries.every(([, message]) => typeof message === 'string')) {
      return severity
    }

    return [
      severity,
      {
        forbid: entries.map(([element, message]) => ({ element, message })),
      },
    ]
  }

  if (biomeName === 'noUnknownAttribute') {
    const { ignore } = options
    return Array.isArray(ignore) && ignore.every((value) => typeof value === 'string')
      ? [severity, { ignore }]
      : severity
  }

  if (biomeName === 'noJsxLiterals') {
    const { allowedStrings, ignoreProps, noStrings } = options
    const oxlintOptions: Record<string, unknown> = {}

    if (
      Array.isArray(allowedStrings) &&
      allowedStrings.every((value) => typeof value === 'string')
    ) {
      oxlintOptions.allowedStrings = allowedStrings
    }
    if (typeof ignoreProps === 'boolean') {
      oxlintOptions.ignoreProps = ignoreProps
    }
    if (typeof noStrings === 'boolean') {
      oxlintOptions.noStrings = noStrings
      oxlintOptions.noAttributeStrings = noStrings
    }

    return Object.keys(oxlintOptions).length > 0 ? [severity, oxlintOptions] : severity
  }

  if (biomeName === 'useConsistentArrowReturn') {
    const mode =
      options.style === 'always' || options.style === 'never'
        ? options.style
        : options.style === 'asNeeded' || options.requireForObjectLiteral !== undefined
          ? 'as-needed'
          : null

    if (!mode) {
      return severity
    }

    return typeof options.requireForObjectLiteral === 'boolean'
      ? [severity, mode, { requireReturnForObjectLiteral: options.requireForObjectLiteral }]
      : [severity, mode]
  }

  if (biomeName === 'noJsRestrictedProperties') {
    const { entries } = options
    if (!Array.isArray(entries) || !entries.every(isRecord)) {
      return severity
    }

    // Oxlint's no-restricted-properties takes the restrictions as variadic arguments, and
    // its entry fields carry the same names as Biome's.
    return [severity, ...entries]
  }

  if (biomeName === 'useConsistentObjectDefinitions') {
    const { syntax } = options
    return syntax === 'shorthand'
      ? [severity, 'always']
      : syntax === 'explicit'
        ? [severity, 'never']
        : severity
  }

  if (biomeName === 'useExplicitReturnType') {
    const oxlintOptions: Record<string, unknown> = {}

    if (typeof options.allowExpressions === 'boolean') {
      oxlintOptions.allowExpressions = options.allowExpressions
    }
    if (typeof options.allowIifes === 'boolean') {
      oxlintOptions.allowIIFEs = options.allowIifes
    }
    if (
      Array.isArray(options.allowedNames) &&
      options.allowedNames.every((value) => typeof value === 'string')
    ) {
      oxlintOptions.allowedNames = options.allowedNames
    }

    return Object.keys(oxlintOptions).length > 0 ? [severity, oxlintOptions] : severity
  }

  if (biomeName === 'useConsistentMethodSignatures') {
    const { style } = options
    return style === 'method' || style === 'property' ? [severity, style] : severity
  }

  if (biomeName === 'useConsistentTypeDefinitions') {
    const { style } = options
    return style === 'interface' || style === 'type' ? [severity, style] : severity
  }

  if (biomeName === 'useNumericSeparators') {
    const oxlintOptions: Record<string, unknown> = {}
    const optionKeys = [
      ['binary', 'binary'],
      ['decimal', 'number'],
      ['hexadecimal', 'hexadecimal'],
      ['octal', 'octal'],
    ] as const

    for (const [biomeKey, oxlintKey] of optionKeys) {
      const numericOptions = mapNumericSeparatorOptions(options[biomeKey])
      if (numericOptions) {
        oxlintOptions[oxlintKey] = numericOptions
      }
    }

    return Object.keys(oxlintOptions).length > 0 ? [severity, oxlintOptions] : severity
  }

  if (biomeName === 'useReactFunctionComponentDefinition') {
    const namedComponents =
      options.namedComponents === 'functionDeclaration'
        ? 'function-declaration'
        : options.namedComponents === 'functionExpression'
          ? 'function-expression'
          : options.namedComponents === 'arrowFunction'
            ? 'arrow-function'
            : null

    return namedComponents ? [severity, { namedComponents }] : severity
  }

  if (biomeName === 'useThisInClassMethods') {
    const oxlintOptions: Record<string, unknown> = {}

    if (
      options.ignoreClassesWithImplements === 'all' ||
      options.ignoreClassesWithImplements === 'public-fields'
    ) {
      oxlintOptions.ignoreClassesWithImplements = options.ignoreClassesWithImplements
    }
    if (
      Array.isArray(options.ignoreMethods) &&
      options.ignoreMethods.every((value) => typeof value === 'string')
    ) {
      oxlintOptions.exceptMethods = options.ignoreMethods
    }
    if (typeof options.ignoreOverrideMethods === 'boolean') {
      oxlintOptions.ignoreOverrideMethods = options.ignoreOverrideMethods
    }

    return Object.keys(oxlintOptions).length > 0 ? [severity, oxlintOptions] : severity
  }

  reporter.loss(
    `Biome rule ${biomeName} options do not have a verified Oxlint mapping and were not migrated; the rule runs with Oxlint defaults instead.`,
  )
  return severity
}

function getBiomeRuleOptions(biomeSeverity: BiomeRuleSeverity): Record<string, unknown> | null {
  if (typeof biomeSeverity !== 'object' || biomeSeverity === null) {
    return null
  }

  const { options } = biomeSeverity
  return isRecord(options) ? options : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function mapNumericSeparatorOptions(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) {
    return null
  }

  const mapped: Record<string, number> = {}
  if (isNonNegativeInteger(value.groupLength) && value.groupLength > 0) {
    mapped.groupLength = value.groupLength
  }
  if (isNonNegativeInteger(value.minimumDigits)) {
    mapped.minimumDigits = value.minimumDigits
  }

  if (Object.keys(mapped).length === 0) {
    return null
  }

  return mapped
}

export function mapBiomeRuleSeverity(
  severity: BiomeRuleSeverity,
  reporter?: Reporter,
  biomeRuleName?: string,
): OxlintRuleSeverity {
  const rawSeverity =
    typeof severity === 'string'
      ? severity
      : typeof severity === 'object' && severity !== null && 'level' in severity
        ? String(severity.level)
        : ''

  const normalized = OXLINT_SEVERITY_NORMALIZATION[rawSeverity.trim().toLowerCase()]
  if (normalized) {
    if (rawSeverity === 'info' || rawSeverity === 'on') {
      warnUnsupportedSeverityOnce(rawSeverity, reporter, biomeRuleName)
    }
    return normalized
  }

  warnUnsupportedSeverityOnce(rawSeverity, reporter, biomeRuleName)
  return 'warn'
}

export function mapBiomeRuleToOxlint(biomeName: string, reporter: Reporter): string | null {
  return mapBiomeRuleToOxlintRules(biomeName, reporter)[0] ?? null
}

function mapBiomeRuleToOxlintRules(biomeName: string, reporter: Reporter): string[] {
  const mapped = BIOME_TO_OXLINT_RULE_MAP[biomeName]
  if (mapped) {
    const partialMappingNote = PARTIAL_RULE_MAPPING_NOTES[biomeName]
    if (partialMappingNote) {
      warnPartialMappingOnce(biomeName, partialMappingNote, reporter)
    }

    const ruleNames = Array.isArray(mapped) ? mapped : [mapped]
    return [...new Set(ruleNames.map((ruleName) => normalizeOxlintRuleName(ruleName)))]
  }

  warnUnmappedRuleOnce(biomeName, reporter)
  return []
}

function warnPartialMappingOnce(biomeName: string, note: string, reporter: Reporter): void {
  let warnedRules = WARNED_PARTIAL_MAPPINGS_BY_REPORTER.get(reporter)

  if (!warnedRules) {
    warnedRules = new Set<string>()
    WARNED_PARTIAL_MAPPINGS_BY_REPORTER.set(reporter, warnedRules)
  }

  if (warnedRules.has(biomeName)) {
    return
  }

  warnedRules.add(biomeName)
  reporter.loss(note)
}

function warnUnmappedRuleOnce(biomeName: string, reporter: Reporter): void {
  let warnedRules = WARNED_UNMAPPED_RULES_BY_REPORTER.get(reporter)

  if (!warnedRules) {
    warnedRules = new Set<string>()
    WARNED_UNMAPPED_RULES_BY_REPORTER.set(reporter, warnedRules)
  }

  if (warnedRules.has(biomeName)) {
    return
  }

  warnedRules.add(biomeName)
  reporter.loss(`No Oxlint equivalent found for Biome rule: ${biomeName}`)
}

function warnUnsupportedSeverityOnce(
  rawSeverity: string,
  reporter: Reporter | undefined,
  biomeRuleName?: string,
): void {
  if (!reporter) {
    return
  }

  let warnedSeverities = WARNED_UNSUPPORTED_SEVERITIES_BY_REPORTER.get(reporter)

  if (!warnedSeverities) {
    warnedSeverities = new Set<string>()
    WARNED_UNSUPPORTED_SEVERITIES_BY_REPORTER.set(reporter, warnedSeverities)
  }

  const normalizedRawSeverity = rawSeverity.trim().toLowerCase() || '<empty>'
  const cacheKey = `${biomeRuleName ?? '*'}::${normalizedRawSeverity}`

  if (warnedSeverities.has(cacheKey)) {
    return
  }

  warnedSeverities.add(cacheKey)
  if (biomeRuleName) {
    reporter.warn(
      `Unsupported Biome severity "${rawSeverity}" for rule ${biomeRuleName}. Normalized to "warn" for Oxlint compatibility.`,
    )
    return
  }

  reporter.warn(
    `Unsupported Biome severity "${rawSeverity}". Normalized to "warn" for Oxlint compatibility.`,
  )
}

export function mapBiomeCategoryToOxlint(biomeCategory: string): string | null {
  return BIOME_TO_OXLINT_CATEGORY_MAP[biomeCategory] || null
}

export function extractRulesFromBiomeConfig(
  linterRules: BiomeLinterRules | undefined,
  reporter: Reporter,
  applyImplicitRecommended = false,
): RuleExtractionResult {
  const rules: Record<string, OxlintRuleSeverity> = {}
  const categories: Record<string, 'off' | 'warn' | 'error'> = {}
  const sourceRulesConverted = new Set<string>()
  const sourceRulesSkipped = new Set<string>()

  if (!linterRules) {
    return { rules, categories, sourceRulesConverted, sourceRulesSkipped }
  }

  applyTopLevelPreset(linterRules, categories, reporter, applyImplicitRecommended)

  for (const [key, value] of Object.entries(linterRules)) {
    if (key === 'recommended' || key === 'all' || key === 'preset') {
      continue
    }

    if (typeof value === 'boolean') {
      continue
    }

    if (typeof value === 'string') {
      if (!isBiomeRuleSeverity(value)) {
        continue
      }
      const oxlintCategory = mapBiomeCategoryToOxlint(key)
      if (oxlintCategory) {
        const severity = mapBiomeRuleSeverity(value, reporter, `${key} group`)
        categories[oxlintCategory] = typeof severity === 'string' ? severity : severity[0]
      }
      continue
    }

    if (isRuleGroup(value)) {
      const oxlintCategory = mapBiomeCategoryToOxlint(key)

      for (const [ruleName, ruleSeverity] of Object.entries(value)) {
        if (ruleName === 'recommended' || ruleName === 'all' || ruleName === 'preset') {
          continue
        }

        if (typeof ruleSeverity === 'boolean' || ruleSeverity === undefined) {
          continue
        }

        if (!isBiomeRuleSeverity(ruleSeverity)) {
          continue
        }

        const oxlintRuleNames = mapBiomeRuleToOxlintRules(ruleName, reporter)
        if (oxlintRuleNames.length > 0) {
          sourceRulesConverted.add(ruleName)
          const oxlintSeverity = mapBiomeRuleOptionsToOxlintSeverity(
            ruleName,
            mapBiomeRuleSeverity(ruleSeverity, reporter, ruleName),
            ruleSeverity,
            reporter,
          )
          for (const oxlintRuleName of oxlintRuleNames) {
            rules[oxlintRuleName] = oxlintSeverity
          }
        } else {
          sourceRulesSkipped.add(ruleName)
        }
      }

      const groupPreset = value.preset
      const groupEnabled =
        groupPreset === 'none'
          ? false
          : groupPreset === 'all' || groupPreset === 'recommended'
            ? true
            : (value.all ?? value.recommended)

      if (oxlintCategory && groupEnabled !== undefined) {
        categories[oxlintCategory] = groupEnabled ? 'warn' : 'off'
      }
    }
  }

  return { rules, categories, sourceRulesConverted, sourceRulesSkipped }
}

function applyTopLevelPreset(
  linterRules: BiomeLinterRules,
  categories: Record<string, 'off' | 'warn' | 'error'>,
  reporter: Reporter,
  applyImplicitRecommended: boolean,
): void {
  const preset =
    linterRules.preset ??
    (linterRules.all === true
      ? 'all'
      : linterRules.all === false || linterRules.recommended === false
        ? 'none'
        : linterRules.recommended === true
          ? 'recommended'
          : applyImplicitRecommended
            ? 'recommended'
            : undefined)

  if (!preset) {
    return
  }

  for (const category of OXLINT_CATEGORIES) {
    categories[category] = 'off'
  }

  if (preset === 'all') {
    for (const category of OXLINT_CATEGORIES) {
      if (category !== 'nursery') {
        categories[category] = 'warn'
      }
    }
  } else if (preset === 'recommended') {
    categories.correctness = 'warn'
    categories.suspicious = 'warn'
  }

  reporter.warn(
    `Biome linter preset "${preset}" was approximated with Oxlint categories; review the generated rule set because the tools' preset membership is not identical.`,
  )
}

function isRuleGroup(value: unknown): value is BiomeRuleGroup {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBiomeRuleSeverity(value: unknown): value is BiomeRuleSeverity {
  if (typeof value === 'string') {
    return ['off', 'on', 'info', 'warn', 'error'].includes(value)
  }

  return (
    typeof value === 'object' &&
    value !== null &&
    'level' in value &&
    typeof value.level === 'string' &&
    ['off', 'on', 'info', 'warn', 'error'].includes(value.level)
  )
}
