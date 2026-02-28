import  {
  type BiomeLinterRules,
  type BiomeRuleGroup,
  type BiomeRuleSeverity,
  type OxlintRuleSeverity,
  type Reporter,
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

const BIOME_TO_OXLINT_RULE_MAP: Record<string, string> = {
  noAccumulatingSpread: 'oxc/no-accumulating-spread',
  noApproximativeNumericConstant: 'oxc/approx-constant',
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
  noConfusingVoidType: 'typescript/no-confusing-void-expression',
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
  noDoubleEquals: 'eqeqeq',
  noDuplicateCase: 'no-duplicate-case',
  noDuplicateClassMembers: 'no-dupe-class-members',
  noDuplicateJsxProps: 'react/jsx-no-duplicate-props',
  noDuplicateObjectKeys: 'no-dupe-keys',
  noEmptyCharacterClassInRegex: 'no-empty-character-class',
  noEmptyPattern: 'no-empty-pattern',
  noExplicitAny: 'typescript/no-explicit-any',
  noExtraBooleanCast: 'no-extra-boolean-cast',
  noFallthroughSwitchClause: 'no-fallthrough',
  noFunctionAssign: 'no-func-assign',
  noGlobalObjectCalls: 'no-obj-calls',
  noImportAssign: 'no-import-assign',
  noInnerDeclarations: 'no-inner-declarations',
  noInvalidConstructorSuper: 'no-this-before-super',
  noInvalidNewBuiltin: 'no-new-native-nonconstructor',
  noLabelVar: 'no-label-var',
  noMisleadingCharacterClass: 'no-misleading-character-class',
  noMisleadingInstantiator: 'typescript/no-misused-new',
  noNewSymbol: 'no-new-native-nonconstructor',
  noNonoctalDecimalEscape: 'no-nonoctal-decimal-escape',
  noPrototypeBuiltins: 'no-prototype-builtins',
  noRedeclare: 'no-redeclare',
  noRenderReturnValue: 'react/no-render-return-value',
  noRestrictedGlobals: 'no-restricted-globals',
  noSelfAssign: 'no-self-assign',
  noSetterReturn: 'no-setter-return',
  noShadowRestrictedNames: 'no-shadow-restricted-names',
  noSparseArray: 'no-sparse-arrays',
  noUndeclaredVariables: 'no-undef',
  noUnnecessaryContinue: 'no-continue',
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
  noUselessSwitchCase: 'unicorn/no-useless-switch-case',
  noUselessTypeConstraint: 'typescript/no-unnecessary-type-constraint',
  noVar: 'no-var',
  noVoidElementsWithChildren: 'react/void-dom-elements-no-children',
  noVoidTypeReturn: 'typescript/no-invalid-void-type',
  noWith: 'no-with',
  useAriaPropTypes: 'jsx_a11y/aria-proptypes',
  useAriaPropsForRole: 'jsx_a11y/role-has-required-aria-props',
  useConst: 'prefer-const',
  useDefaultParameterLast: 'default-param-last',
  useExhaustiveDependencies: 'react/exhaustive-deps',
  useHookAtTopLevel: 'react/rules-of-hooks',
  useIsNan: 'use-isnan',
  useValidForDirection: 'for-direction',
  useValidTypeof: 'valid-typeof',
  useYield: 'require-yield',
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

export function mapBiomeRuleSeverity(severity: BiomeRuleSeverity): OxlintRuleSeverity {
  if (typeof severity === 'string') {
    return severity
  }

  if (typeof severity === 'object' && severity.level) {
    return severity.level
  }

  return 'warn'
}

export function mapBiomeRuleToOxlint(biomeName: string, reporter: Reporter): string | null {
  const mapped = BIOME_TO_OXLINT_RULE_MAP[biomeName]
  if (mapped) {
    return normalizeOxlintRuleName(mapped)
  }

  reporter.warn(`No Oxlint equivalent found for Biome rule: ${biomeName}`)
  return null
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

        const oxlintRuleName = mapBiomeRuleToOxlint(ruleName, reporter)
        if (oxlintRuleName) {
          rules[oxlintRuleName] = mapBiomeRuleSeverity(ruleSeverity)
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
