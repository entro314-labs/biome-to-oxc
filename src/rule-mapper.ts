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

type OxlintRuleMapping = string | readonly string[]

const BIOME_TO_OXLINT_RULE_MAP: Record<string, OxlintRuleMapping> = {
  noAccessKey: 'jsx_a11y/no-access-key',
  noArguments: 'prefer-rest-params',
  noAriaHiddenOnFocusable: 'jsx_a11y/no-aria-hidden-on-focusable',
  noAccumulatingSpread: 'oxc/no-accumulating-spread',
  noConstantBinaryExpressions: 'no-constant-binary-expression',
  noApproximativeNumericConstant: 'oxc/approx-constant',
  noBarrelFile: 'oxc/no-barrel-file',
  noArrayIndexKey: 'react/no-array-index-key',
  noAssignInExpressions: 'no-cond-assign',
  noAsyncPromiseExecutor: 'no-async-promise-executor',
  noCatchAssign: 'no-ex-assign',
  noChildrenProp: 'react/no-children-prop',
  noClassAssign: 'no-class-assign',
  noCommaOperator: 'no-sequences',
  noCommentText: 'react/jsx-no-comment-textnodes',
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
  noControlCharactersInRegex: 'no-control-regex',
  noDangerouslySetInnerHtml: 'react/no-danger',
  noDangerouslySetInnerHtmlWithChildren: 'react/no-danger-with-children',
  noDebugger: 'no-debugger',
  noDefaultExport: 'import/no-default-export',
  noDoubleEquals: 'eqeqeq',
  noDuplicateCase: 'no-duplicate-case',
  noDuplicateElseIf: 'no-dupe-else-if',
  noDuplicateClassMembers: 'no-dupe-class-members',
  noDuplicateJsxProps: 'react/jsx-no-duplicate-props',
  noDuplicateObjectKeys: 'no-dupe-keys',
  noEmptyBlockStatements: 'no-empty',
  noEmptyCharacterClassInRegex: 'no-empty-character-class',
  noEmptyPattern: 'no-empty-pattern',
  noExcessiveCognitiveComplexity: 'complexity',
  noExplicitAny: 'typescript/no-explicit-any',
  noExtraBooleanCast: 'no-extra-boolean-cast',
  noExtraNonNullAssertion: 'typescript/no-extra-non-null-assertion',
  noFallthroughSwitchClause: 'no-fallthrough',
  noFloatingPromises: 'typescript/no-floating-promises',
  noFocusedTests: ['jest/no-focused-tests', 'vitest/no-focused-tests'],
  noForEach: 'unicorn/no-array-for-each',
  noFunctionAssign: 'no-func-assign',
  noGlobalEval: 'no-eval',
  noGlobalObjectCalls: 'no-obj-calls',
  noImportAssign: 'no-import-assign',
  noInnerDeclarations: 'no-inner-declarations',
  noImplicitBoolean: 'no-implicit-coercion',
  noInvalidBuiltinInstantiation: 'no-new-native-nonconstructor',
  noInvalidUseBeforeDeclaration: 'no-use-before-define',
  noInvalidConstructorSuper: 'no-this-before-super',
  noInvalidNewBuiltin: 'no-new-native-nonconstructor',
  noLabelWithoutControl: 'jsx_a11y/label-has-associated-control',
  noLabelVar: 'no-label-var',
  noMisleadingCharacterClass: 'no-misleading-character-class',
  noMisleadingInstantiator: 'typescript/no-misused-new',
  noNewSymbol: 'no-new-native-nonconstructor',
  noNodejsModules: 'import/no-nodejs-modules',
  noNonNullAssertion: 'typescript/no-non-null-assertion',
  noNonoctalDecimalEscape: 'no-nonoctal-decimal-escape',
  noParameterAssign: 'no-param-reassign',
  noParameterProperties: 'typescript/parameter-properties',
  noPrototypeBuiltins: 'no-prototype-builtins',
  noRedeclare: 'no-redeclare',
  noDuplicateTestHooks: ['jest/no-duplicate-hooks', 'vitest/no-duplicate-hooks'],
  noConditionalExpect: ['jest/no-conditional-expect', 'vitest/no-conditional-expect'],
  noExcessiveNestedTestSuites: ['jest/max-nested-describe', 'vitest/max-nested-describe'],
  noIdenticalTestTitle: ['jest/no-identical-title', 'vitest/no-identical-title'],
  noMisplacedAssertion: ['jest/no-standalone-expect', 'vitest/no-standalone-expect'],
  noRenderReturnValue: 'react/no-render-return-value',
  noRestrictedGlobals: 'no-restricted-globals',
  noSelfCompare: 'no-self-compare',
  noSelfAssign: 'no-self-assign',
  noSetterReturn: 'no-setter-return',
  noShadow: 'no-shadow',
  noShadowRestrictedNames: 'no-shadow-restricted-names',
  noSkippedTests: ['jest/no-disabled-tests', 'vitest/no-disabled-tests'],
  noSparseArray: 'no-sparse-arrays',
  noSwitchDeclarations: 'no-case-declarations',
  noStaticElementInteractions: 'jsx_a11y/no-static-element-interactions',
  noUndeclaredVariables: 'no-undef',
  noUnknownProperty: 'react/no-unknown-property',
  noUselessThisAlias: 'typescript/no-this-alias',
  noUnusedFunctionParameters: 'no-unused-vars',
  noUnusedImports: 'no-unused-vars',
  noUnnecessaryContinue: 'no-continue',
  noUnnecessaryConditions: 'typescript/no-unnecessary-condition',
  noUnreachable: 'no-unreachable',
  noUnreachableSuper: 'constructor-super',
  noUnsafeDeclarationMerging: 'typescript/no-unsafe-declaration-merging',
  noUnsafeFinally: 'no-unsafe-finally',
  noUnsafeNegation: 'no-unsafe-negation',
  noUnsafeOptionalChaining: 'no-unsafe-optional-chaining',
  noUnusedLabels: 'no-unused-labels',
  noUnusedPrivateClassMembers: 'no-unused-private-class-members',
  noUnusedVariables: 'no-unused-vars',
  noUselessCatch: 'no-useless-catch',
  noUselessConstructor: 'no-useless-constructor',
  noUselessEmptyExport: 'typescript/no-useless-empty-export',
  noUselessFragments: 'react/jsx-no-useless-fragment',
  noUselessLabel: 'no-extra-label',
  noUselessRename: 'no-useless-rename',
  noUselessTernary: 'no-unneeded-ternary',
  noUselessSwitchCase: 'unicorn/no-useless-switch-case',
  noUselessTypeConstraint: 'typescript/no-unnecessary-type-constraint',
  noVar: 'no-var',
  noVoidElementsWithChildren: 'react/void-dom-elements-no-children',
  noVoidTypeReturn: 'typescript/no-invalid-void-type',
  noWith: 'no-with',
  useAltText: 'jsx_a11y/alt-text',
  useAwaitThenable: 'typescript/await-thenable',
  useButtonType: 'react/button-has-type',
  useAriaPropTypes: 'jsx_a11y/aria-proptypes',
  useAriaPropsForRole: 'jsx_a11y/role-has-required-aria-props',
  useAsConstAssertion: 'typescript/prefer-as-const',
  useAwait: 'require-await',
  useConsistentMemberAccessibility: 'typescript/explicit-member-accessibility',
  useConsistentTestIt: ['jest/consistent-test-it', 'vitest/consistent-test-it'],
  useConst: 'prefer-const',
  useDefaultParameterLast: 'default-param-last',
  useExpect: ['jest/expect-expect', 'vitest/expect-expect'],
  useExportType: 'typescript/consistent-type-exports',
  useExhaustiveSwitchCases: 'typescript/switch-exhaustiveness-check',
  useExhaustiveDependencies: 'react/exhaustive-deps',
  useFilenamingConvention: 'unicorn/filename-case',
  useFocusableInteractive: 'jsx_a11y/interactive-supports-focus',
  useHtmlLang: 'jsx_a11y/html-has-lang',
  useHookAtTopLevel: 'react/rules-of-hooks',
  useImportType: 'typescript/consistent-type-imports',
  useIsNan: 'use-isnan',
  useJsxKeyInIterable: 'react/jsx-key',
  useKeyWithClickEvents: 'jsx_a11y/click-events-have-key-events',
  useLiteralKeys: 'typescript/dot-notation',
  useNodejsImportProtocol: 'unicorn/prefer-node-protocol',
  useOptionalChain: 'typescript/prefer-optional-chain',
  useReactFunctionComponents: 'react/prefer-function-component',
  useSemanticElements: 'jsx_a11y/prefer-tag-over-role',
  useSimplifiedLogicExpression: 'unicorn/prefer-logical-operator-over-ternary',
  useTemplate: 'prefer-template',
  useTestHooksOnTop: ['jest/prefer-hooks-on-top', 'vitest/prefer-hooks-on-top'],
  useUnicodeRegex: 'require-unicode-regexp',
  useValidAriaRole: 'jsx_a11y/aria-role',
  useValidForDirection: 'for-direction',
  useValidLang: 'jsx_a11y/lang',
  useValidTypeof: 'valid-typeof',
  useYield: 'require-yield',
}

const WARNED_UNMAPPED_RULES_BY_REPORTER = new WeakMap<Reporter, Set<string>>()
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
  if (ruleName.startsWith('jsx-a11y/')) {
    return ruleName.replace('jsx-a11y/', 'jsx_a11y/')
  }
  if (ruleName.startsWith('react-perf/')) {
    return ruleName.replace('react-perf/', 'react_perf/')
  }
  return ruleName
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
    const ruleNames = Array.isArray(mapped) ? mapped : [mapped]
    return [...new Set(ruleNames.map((ruleName) => normalizeOxlintRuleName(ruleName)))]
  }

  warnUnmappedRuleOnce(biomeName, reporter)
  return []
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
  reporter.warn(`No Oxlint equivalent found for Biome rule: ${biomeName}`)
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
): {
  rules: Record<string, OxlintRuleSeverity>
  categories: Record<string, 'off' | 'warn' | 'error'>
} {
  const rules: Record<string, OxlintRuleSeverity> = {}
  const categories: Record<string, 'off' | 'warn' | 'error'> = {}

  if (!linterRules) {
    return { rules, categories }
  }

  for (const [key, value] of Object.entries(linterRules)) {
    if (key === 'recommended' || key === 'all') {
      continue
    }

    if (typeof value === 'boolean') {
      continue
    }

    if (isRuleGroup(value)) {
      const oxlintCategory = mapBiomeCategoryToOxlint(key)

      for (const [ruleName, ruleSeverity] of Object.entries(value)) {
        if (ruleName === 'recommended' || ruleName === 'all') {
          continue
        }

        if (typeof ruleSeverity === 'boolean' || ruleSeverity === undefined) {
          continue
        }

        const oxlintRuleNames = mapBiomeRuleToOxlintRules(ruleName, reporter)
        if (oxlintRuleNames.length > 0) {
          const oxlintSeverity = mapBiomeRuleSeverity(ruleSeverity, reporter, ruleName)
          for (const oxlintRuleName of oxlintRuleNames) {
            rules[oxlintRuleName] = oxlintSeverity
          }
        }
      }

      if (oxlintCategory && value.recommended !== undefined) {
        categories[oxlintCategory] = value.recommended ? 'warn' : 'off'
      }
    }
  }

  if (linterRules.recommended) {
    categories.correctness = 'warn'
    categories.suspicious = 'warn'
  }

  return { rules, categories }
}

function isRuleGroup(value: unknown): value is BiomeRuleGroup {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
