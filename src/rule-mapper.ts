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
  noAssignInExpressions:
    'Biome rule noAssignInExpressions was mapped to no-cond-assign in `always` mode, which reports assignments inside conditions but not assignments nested in other expressions, such as `const a = (b = 1)` or a call argument.',
  noComponentHookFactories:
    'Biome rule noComponentHookFactories was mapped to react/no-unstable-nested-components, which reports nested component definitions but not nested custom hook definitions.',
  noBarrelFile:
    'Biome rule noBarrelFile was mapped to oxc/no-barrel-file, which only counts `export *` re-exports and reports a file once it re-exports more modules than its threshold (100 by default); Biome reports any file that re-exports, including through named `export { ... } from`.',
  noExcessiveCognitiveComplexity:
    'Biome rule noExcessiveCognitiveComplexity was mapped to complexity, which scores cyclomatic complexity rather than cognitive complexity; the threshold carries over, but the two scores differ, so a different set of functions is reported.',
  noMeaninglessVoidOperator:
    'Biome rule noMeaninglessVoidOperator was mapped to typescript/no-meaningless-void-operator, which reports `void` applied to a value whose type is `void` or `undefined` but not `void` applied to any other non-call operand, such as `void 1` or `void value`.',
  noInvalidBuiltinInstantiation:
    'Biome rule noInvalidBuiltinInstantiation was mapped to no-new-native-nonconstructor, which reports `new BigInt()` and `new Symbol()` but not constructors that require `new` called without it, such as `Map()`, `Set()`, `Promise()`, `WeakMap()`, `Proxy()` or a typed array; unicorn/new-for-builtins reports those, together with the calls useConsistentBuiltinInstantiation reports.',
  noInlineStyles:
    'Biome rule noInlineStyles was mapped to react/forbid-dom-props, which reports the `style` prop on JSX DOM elements but not `style` passed through React.createElement() or written in HTML, Vue, Svelte or Astro templates.',
  noStaticOnlyClass:
    'Biome rule noStaticOnlyClass was mapped to typescript/no-extraneous-class, which reports classes with only static members but not a class whose only member is a static initialization block.',
  noSelfImport:
    'Biome rule noSelfImport was mapped to import/no-self-import, which reports static `import` and `export ... from` statements that resolve to their own file but not `require()` calls or dynamic `import()` expressions that do.',
  noReactObjectTypeAsDefaultProp:
    'Biome rule noReactObjectTypeAsDefaultProp was mapped to react/no-object-type-as-default-prop, which reports array, object, function, class, regex, `new` and JSX default prop values but not a `Symbol()` default.',
  noReactPropAssignments:
    'Biome rule noReactPropAssignments was mapped to the React Compiler rule react/immutability, which reports prop mutation alongside other mutations of values React treats as immutable.',
  noUnresolvedImports:
    'Biome rule noUnresolvedImports was mapped to import/named, which reports named imports a JavaScript module does not export but skips TypeScript files entirely and does not report import paths that cannot be resolved.',
  noUnsafeIframeSandbox:
    'Biome rule noUnsafeIframeSandbox was mapped to react/iframe-missing-sandbox, which reports `allow-scripts` combined with `allow-same-origin` only when the sandbox value is a plain string attribute, not a `{"..."}` or template-literal expression; it also reports iframes with no or an invalid sandbox attribute, which Biome leaves to useIframeSandbox.',
  useConsistentCurlyBraces:
    'Biome rule useConsistentCurlyBraces was mapped to react/jsx-curly-brace-presence, which reports unnecessary braces around string literals in JSX props and children but not a JSX element passed as a prop value without braces (`foo=<Bar />`).',
  useConsistentBuiltinInstantiation:
    'Biome rule useConsistentBuiltinInstantiation was mapped to unicorn/new-for-builtins, which does not report `AggregateError()`, `EvalError()`, `RangeError()`, `ReferenceError()`, `SyntaxError()`, `TypeError()` or `URIError()` called without `new`.',
  useArrowFunction:
    'Biome rule useArrowFunction was mapped to prefer-arrow-callback, which reports function expressions passed as callbacks but not ones assigned to variables or properties, such as `const f = function () {}`.',
  useExplicitType:
    'Biome rule useExplicitType was mapped to typescript/explicit-function-return-type, which requires return types on functions and methods but not types on variables or parameters.',
  noUselessSwitchCase:
    'Biome rule noUselessSwitchCase was mapped to unicorn/no-useless-switch-case, which reports a case that falls through into a trailing `default` but not one next to a `default` placed earlier in the switch.',
  useStaticResponseMethods:
    'Biome rule useStaticResponseMethods was mapped to unicorn/prefer-response-static-json, which reports `new Response(JSON.stringify(...))` but not the `new Response(null, { status, headers: { Location } })` form Biome rewrites to Response.redirect().',
  noUselessUndefinedInitialization:
    'Biome rule noUselessUndefinedInitialization was mapped to unicorn/no-useless-undefined, which reports `let` declarations initialised to `undefined` but not `var` ones, such as `var a = undefined`.',
  noAwaitInPromiseMethods:
    'Biome rule noAwaitInPromiseMethods was mapped to unicorn/no-await-in-promise-methods, which reports an array element that is an `await` expression but not an `await` nested inside one, such as `cond ? await p : q` or `(await fetch(url)).json()`.',
  noBufferConstructor:
    'Biome rule noBufferConstructor was mapped to unicorn/no-new-buffer, which reports `new Buffer()` on the global Buffer but not `Buffer()` called without `new`, a Buffer imported from `node:buffer`, or `new buffer.Buffer()`.',
  noChainedComparison:
    'Biome rule noChainedComparison was mapped to oxc/bad-comparison-sequence, which reports `a == b != c` but not the same chain with the first comparison in parentheses, such as `(a == b) != c`.',
  noDoubleComparison:
    'Biome rule noDoubleComparison was mapped to oxc/double-comparisons, which reports pairs such as `x === y || x < y` and `x <= y && x >= y` but not a comparison joined with an inequality, such as `x <= y && x !== y`.',
  noExcessiveNestedBlocks:
    'Biome rule noExcessiveNestedBlocks was mapped to max-depth, which reports deeply nested blocks in JavaScript and TypeScript; Biome also reports deeply nested CSS rules, which Oxlint does not lint.',
  noMissingThrow:
    'Biome rule noMissingThrow was mapped to oxc/missing-throw, which reports an unthrown `new Error()` statement in a function declaration but not one in an arrow function body.',
  noNumberArgumentOutOfRange:
    'Biome rule noNumberArgumentOutOfRange was mapped to oxc/number-arg-out-of-range, which reports radix and precision arguments outside the allowed range, such as `toString(1)` or `toPrecision(0)`, but not a negative toFixed() argument, such as `value.toFixed(-1)`.',
  noPathConcat:
    'Biome rule noPathConcat was mapped to node/no-path-concat, which reports string concatenation with `__dirname` and `__filename` but not with `import.meta.dirname`, `import.meta.filename` or `import.meta.url`.',
  noUninvokedArrayCallback:
    'Biome rule noUninvokedArrayCallback was mapped to oxc/uninvoked-array-callback, which reports callbacks on `new Array(n)` but not on `Array(n)` called without `new`.',
  noUselessAwait:
    'Biome rule noUselessAwait was mapped to unicorn/no-unnecessary-await, which reports `await` on literals and other non-promise expressions but not on an array literal, such as `await [a(), b()]`.',
  noUselessLengthCheck:
    'Biome rule noUselessLengthCheck was mapped to unicorn/no-useless-length-check, which reports length checks joined to some() and every() calls but not a length check that only guards a `for...of` loop over the same array.',
  noUselessSpread:
    'Biome rule noUselessSpread was mapped to unicorn/no-useless-spread, which reports spreading array and object literals but not an object literal spread as an Object.assign() source, such as `Object.assign(target, { ...source })`, or arguments spread into the Set constructor, such as `new Set(...items)`.',
  noVueAsyncComputed:
    'Biome rule noVueAsyncComputed was mapped to vue/no-async-in-computed-properties, which reports `await`, promises and async functions in computed properties but not timer calls such as setTimeout().',
  noVueDeprecatedDeleteSet:
    'Biome rule noVueDeprecatedDeleteSet was mapped to vue/no-deprecated-delete-set, which reports `this.$set()` and `this.$delete()` but not `Vue.set()`, `Vue.delete()`, or `set` and `del` imported from `vue`.',
  useBigintLiterals:
    'Biome rule useBigintLiterals was mapped to unicorn/prefer-bigint-literals, which reports BigInt() called with a non-negative literal but not with a negative one, such as `BigInt(-1)`.',
  useCalledWith:
    'Biome rule useCalledWith was mapped to prefer-called-with, which reports `toHaveBeenCalled()` and `toBeCalled()` but not `toHaveBeenCalledOnce()`.',
  useCapitalizedConstructors:
    'Biome rule useCapitalizedConstructors was mapped to new-cap, which exempts the names of built-in constructors such as `String` even when a local function shadows them.',
  useConsistentUnicodeBom:
    'Biome rule useConsistentUnicodeBom was mapped to unicode-bom, which checks JavaScript and TypeScript files; Biome also checks CSS, JSON, GraphQL, HTML and Markdown files, which Oxlint does not lint.',
  useObjectFromEntries:
    'Biome rule useObjectFromEntries was mapped to unicorn/prefer-object-from-entries, which reports reduce() calls that build an object from pairs but not a `for...of` loop that does.',
  useSetSize:
    'Biome rule useSetSize was mapped to unicorn/prefer-set-size, which reports the spread of a Set it sees constructed, such as `[...new Set(x)].length`, but not the spread of a parameter typed as a Set.',
  useVueValidNextTick:
    'Biome rule useVueValidNextTick was mapped to vue/valid-next-tick, which reports nextTick misuse inside a Vue component options object but not in `<script setup>` or other module-level code.',
}

/**
 * Biome rules whose only Oxlint counterpart is a type-aware rule, even though the Biome rule
 * itself needs no type information. Without type-aware linting the type-aware rule never runs,
 * so the migration would silently drop diagnostics the source config did produce. These
 * non-type-aware Oxlint rules take its place whenever the migration is not enabling type-aware
 * linting; they replace rather than accompany it, so switching the profile on later can never
 * report the same line twice.
 *
 * Every pair was checked by running both binaries over the same fixture.
 */
const TYPE_AWARE_RULE_FALLBACKS: Record<string, string> = {
  useArrayFind: 'unicorn/prefer-array-find',
  useFind: 'unicorn/prefer-array-find',
  useIncludes: 'unicorn/prefer-includes',
  useStringStartsEndsWith: 'unicorn/prefer-string-starts-ends-with',
  useThrowOnlyError: 'no-throw-literal',
}

/**
 * Oxlint rules implemented by tsgolint, which only run when type-aware linting is on. A Biome
 * rule that maps onto one of them with no fallback above loses its diagnostics in a migration
 * that leaves type-aware linting off, so that is reported rather than emitted silently.
 * `rule-inventory.test.ts` keeps this list equal to `docs/tsgolint-rules.tsv`.
 */
const TYPE_AWARE_OXLINT_RULES = new Set([
  'typescript/await-thenable',
  'typescript/consistent-return',
  'typescript/consistent-type-exports',
  'typescript/dot-notation',
  'typescript/no-array-delete',
  'typescript/no-base-to-string',
  'typescript/no-confusing-void-expression',
  'typescript/no-deprecated',
  'typescript/no-duplicate-type-constituents',
  'typescript/no-floating-promises',
  'typescript/no-for-in-array',
  'typescript/no-generated-empty-object-type',
  'typescript/no-implied-eval',
  'typescript/no-meaningless-void-operator',
  'typescript/no-misused-promises',
  'typescript/no-misused-spread',
  'typescript/no-mixed-enums',
  'typescript/no-redundant-type-constituents',
  'typescript/no-unnecessary-boolean-literal-compare',
  'typescript/no-unnecessary-condition',
  'typescript/no-unnecessary-qualifier',
  'typescript/no-unnecessary-template-expression',
  'typescript/no-unnecessary-type-arguments',
  'typescript/no-unnecessary-type-assertion',
  'typescript/no-unnecessary-type-conversion',
  'typescript/no-unnecessary-type-parameters',
  'typescript/no-unsafe-argument',
  'typescript/no-unsafe-assignment',
  'typescript/no-unsafe-call',
  'typescript/no-unsafe-class-instance-assignment',
  'typescript/no-unsafe-enum-assignment',
  'typescript/no-unsafe-enum-comparison',
  'typescript/no-unsafe-member-access',
  'typescript/no-unsafe-return',
  'typescript/no-unsafe-type-assertion',
  'typescript/no-unsafe-unary-minus',
  'typescript/no-useless-default-assignment',
  'typescript/non-nullable-type-assertion-style',
  'typescript/only-throw-error',
  'typescript/prefer-find',
  'typescript/prefer-includes',
  'typescript/prefer-nullish-coalescing',
  'typescript/prefer-optional-chain',
  'typescript/prefer-promise-reject-errors',
  'typescript/prefer-readonly',
  'typescript/prefer-readonly-parameter-types',
  'typescript/prefer-reduce-type-parameter',
  'typescript/prefer-regexp-exec',
  'typescript/prefer-return-this-type',
  'typescript/prefer-string-starts-ends-with',
  'typescript/promise-function-async',
  'typescript/related-getter-setter-pairs',
  'typescript/require-array-sort-compare',
  'typescript/require-await',
  'typescript/restrict-plus-operands',
  'typescript/restrict-template-expressions',
  'typescript/return-await',
  'typescript/strict-boolean-expressions',
  'typescript/strict-void-return',
  'typescript/switch-exhaustiveness-check',
  'typescript/unbound-method',
  'typescript/use-unknown-in-catch-callback-variable',
])

/** Fallbacks that cover less than the type-aware rule they stand in for. */
const TYPE_AWARE_FALLBACK_NOTES: Record<string, string> = {
  useStringStartsEndsWith:
    'Biome rule useStringStartsEndsWith was mapped to unicorn/prefer-string-starts-ends-with because type-aware linting is off; it reports anchored RegExp#test() prefix checks but not the indexOf(), slice() and charAt() comparisons Biome also reports. Enabling type-aware linting maps it to typescript/prefer-string-starts-ends-with instead, which covers all four.',
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

/** Every type-aware Oxlint rule the mapper knows of, for inventory conformance checks. */
export function getTypeAwareOxlintRuleNames(): string[] {
  return [...TYPE_AWARE_OXLINT_RULES]
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

  for (const name of Object.values(TYPE_AWARE_RULE_FALLBACKS)) {
    names.add(name)
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
  noAccidentalBitwiseOperators: 'oxc/bad-bitwise-operator',
  noAdjacentSpacesInRegex: 'no-regex-spaces',
  noAmbiguousAnchorText: 'jsx-a11y/anchor-ambiguous-text',
  noArguments: 'prefer-rest-params',
  noArgumentsCallerOrCallee: 'no-caller',
  noAriaHiddenOnFocusable: 'jsx-a11y/no-aria-hidden-on-focusable',
  noAriaUnsupportedElements: 'jsx-a11y/aria-unsupported-elements',
  noAccumulatingSpread: 'oxc/no-accumulating-spread',
  noAlert: 'no-alert',
  noArrayMethodsOnArguments: 'oxc/bad-array-method-on-arguments',
  noAwaitInPromiseMethods: 'unicorn/no-await-in-promise-methods',
  noBufferConstructor: 'unicorn/no-new-buffer',
  noChainedComparison: 'oxc/bad-comparison-sequence',
  // Superset: no-console-spaces also reports an argument padded with more than one space or a
  // tab, and an argument that is only a space, which Biome allows.
  noConsoleSpaces: 'unicorn/no-console-spaces',
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
  noConstantComparisons: 'oxc/const-comparisons',
  noConstAssign: 'no-const-assign',
  noConstEnum: 'oxc/no-const-enum',
  noConstantCondition: 'no-constant-condition',
  noConstantMathMinMaxClamp: 'oxc/bad-min-max-func',
  noConstructorReturn: 'no-constructor-return',
  noContinue: 'no-continue',
  noControlCharactersInRegex: 'no-control-regex',
  noDangerouslySetInnerHtml: 'react/no-danger',
  noDangerouslySetInnerHtmlWithChildren: 'react/no-danger-with-children',
  noDanglingUnderscore: 'no-underscore-dangle',
  noDebugger: 'no-debugger',
  noDefaultExport: 'import/no-default-export',
  noDistractingElements: 'jsx-a11y/no-distracting-elements',
  noDoubleComparison: 'oxc/double-comparisons',
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
  noDuplicateTypeConstituents: 'typescript/no-duplicate-type-constituents',
  noDynamicDelete: 'typescript/no-dynamic-delete',
  noDynamicRequire: 'import/no-dynamic-require',
  noEmptyBlockStatements: ['no-empty', 'no-empty-function', 'no-empty-static-block'],
  noEmptyCharacterClassInRegex: 'no-empty-character-class',
  noEmptyInterface: 'typescript/no-empty-interface',
  noEmptyPattern: 'no-empty-pattern',
  noEmptySource: 'unicorn/no-empty-file',
  noEqualsToNull: 'no-eq-null',
  noErasingOperation: 'oxc/erasing-op',
  noExcessiveClassesPerFile: 'max-classes-per-file',
  noExcessiveCognitiveComplexity: 'complexity',
  noExcessiveLinesPerFile: 'max-lines',
  noExcessiveLinesPerFunction: 'max-lines-per-function',
  noExcessiveNestedBlocks: 'max-depth',
  noExcessiveNestedCallbacks: 'max-nested-callbacks',
  noExcessiveStatementsPerFunction: 'max-statements',
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
  noInlineStyles: 'react/forbid-dom-props',
  noImplicitBoolean: 'react/jsx-boolean-value',
  noImpliedEval: 'no-implied-eval',
  noIncrementDecrement: 'no-plusplus',
  noInferrableTypes: 'typescript/no-inferrable-types',
  noInvalidBuiltinInstantiation: 'no-new-native-nonconstructor',
  noInvalidFetchOptions: 'unicorn/no-invalid-fetch-options',
  noInvalidRemoveEventListener: 'unicorn/no-invalid-remove-event-listener',
  noInvalidUseBeforeDeclaration: 'no-use-before-define',
  // Superset: constructor-super also reports a missing or conditional super() call, which Biome
  // leaves to noUnreachableSuper.
  noInvalidConstructorSuper: 'constructor-super',
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
  noMagicArrayFlatDepth: 'unicorn/no-magic-array-flat-depth',
  noMagicNumbers: 'no-magic-numbers',
  noMapSpread: 'oxc/no-map-spread',
  noMeaninglessVoidOperator: 'typescript/no-meaningless-void-operator',
  noMisleadingCharacterClass: 'no-misleading-character-class',
  noMisleadingInstantiator: 'typescript/no-misused-new',
  noMisrefactoredShorthandAssign: 'oxc/misrefactored-assign-op',
  noMissingThrow: 'oxc/missing-throw',
  noMisusedPromises: 'typescript/no-misused-promises',
  noMisusedSpread: 'typescript/no-misused-spread',
  noMultiAssign: 'no-multi-assign',
  noMultilineString: 'no-multi-str',
  noMultiStr: 'no-multi-str',
  noNegationElse: 'no-negated-condition',
  noNegationInEqualityCheck: 'unicorn/no-negation-in-equality-check',
  noNewArray: 'unicorn/no-new-array',
  noNewRequire: 'node/no-new-require',
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
  noNull: 'unicorn/no-null',
  // Superset: number-arg-out-of-range also reports toExponential() arguments above 20, which
  // ES2018 raised to 100 and Biome allows.
  noNumberArgumentOutOfRange: 'oxc/number-arg-out-of-range',
  noObjectConstructor: 'no-object-constructor',
  noObjectLiteralComparison: 'oxc/bad-object-literal-comparison',
  noParametersOnlyUsedInRecursion: 'oxc/only-used-in-recursion',
  noParameterAssign: 'no-param-reassign',
  noParameterProperties: 'typescript/parameter-properties',
  noPathConcat: 'node/no-path-concat',
  noPrecisionLoss: 'no-loss-of-precision',
  noPositiveTabindex: 'jsx-a11y/tabindex-no-positive',
  noProcessEnv: 'node/no-process-env',
  noProcessExit: 'unicorn/no-process-exit',
  noPromiseExecutorReturn: 'no-promise-executor-return',
  noProto: 'no-proto',
  // prefer-object-has-own covers the `Object.prototype.hasOwnProperty.call()` form Biome also
  // reports.
  noPrototypeBuiltins: ['no-prototype-builtins', 'prefer-object-has-own'],
  noReactDirectStateMutation: 'react/no-direct-mutation-state',
  // Superset: no-redeclare also reports a type alias and a value that share a name, such as
  // `type G = 1; const G = 1`, which TypeScript allows.
  noRedeclare: 'no-redeclare',
  noReactObjectTypeAsDefaultProp: 'react/no-object-type-as-default-prop',
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
  noRedundantTypeConstituents: 'typescript/no-redundant-type-constituents',
  noRenderReturnValue: 'react/no-render-return-value',
  noRestrictedGlobals: 'no-restricted-globals',
  noRestrictedElements: 'react/forbid-elements',
  noRestrictedImports: 'no-restricted-imports',
  noRestrictedTypes: 'typescript/no-restricted-types',
  noReturnAssign: 'no-return-assign',
  noReturnInFinally: 'promise/no-return-in-finally',
  // Superset: no-script-url also reports `javascript:` strings outside JSX props and
  // React.createElement() calls, such as `location.href = 'javascript:void(0)'`.
  noScriptUrl: 'no-script-url',
  noSelfCompare: 'no-self-compare',
  noSelfAssign: 'no-self-assign',
  noSelfImport: 'import/no-self-import',
  noSetterReturn: 'no-setter-return',
  noShadow: 'no-shadow',
  noShadowRestrictedNames: 'no-shadow-restricted-names',
  // Superset: branches-sharing-code also reports identical trailing statements that use a
  // declaration local to each branch, which Biome leaves alone because they cannot be moved out.
  noSharedBranchCode: 'oxc/branches-sharing-code',
  noSinglePromiseInPromiseMethods: 'unicorn/no-single-promise-in-promise-methods',
  noSkippedTests: ['jest/no-disabled-tests', 'vitest/no-disabled-tests'],
  noSparseArray: 'no-sparse-arrays',
  noStaticOnlyClass: 'typescript/no-extraneous-class',
  noSyncMethods: 'node/no-sync',
  noSyncScripts: 'nextjs/no-sync-scripts',
  noSwitchDeclarations: 'no-case-declarations',
  noStaticElementInteractions: 'jsx-a11y/no-static-element-interactions',
  noSubstr: 'unicorn/prefer-string-slice',
  noTemplateCurlyInString: 'no-template-curly-in-string',
  noTernary: 'no-ternary',
  noThenProperty: 'unicorn/no-thenable',
  noTripleSlashReference: 'typescript/triple-slash-reference',
  noUndeclaredVariables: 'no-undef',
  // Superset: uninvoked-array-callback also reports findIndex() on `new Array(n)`, which Biome
  // allows because findIndex() visits the holes.
  noUninvokedArrayCallback: 'oxc/uninvoked-array-callback',
  noUnknownAttribute: 'react/no-unknown-property',
  noUnassignedVariables: 'no-unassigned-vars',
  noUnreadableIife: 'unicorn/no-unreadable-iife',
  noUnresolvedDefaultImport: 'import/default',
  noUnsafeReturn: 'typescript/no-unsafe-return',
  noUnsafeUnaryMinus: 'typescript/no-unsafe-unary-minus',
  noUselessAssignment: 'no-useless-assignment',
  noUselessAwait: 'unicorn/no-unnecessary-await',
  noUselessCall: 'no-useless-call',
  noUselessDateGetTime: 'unicorn/consistent-date-clone',
  noUselessFallbackInSpread: 'unicorn/no-useless-fallback-in-spread',
  noUselessLengthCheck: 'unicorn/no-useless-length-check',
  noUselessParameterPropertyAssignment: 'typescript/no-unnecessary-parameter-property-assignment',
  noUselessQualifier: 'typescript/no-unnecessary-qualifier',
  noUselessSpread: 'unicorn/no-useless-spread',
  noUselessThisAlias: 'typescript/no-this-alias',
  noUnusedExpressions: 'no-unused-expressions',
  noUnusedFunctionParameters: 'no-unused-vars',
  noUnusedImports: 'no-unused-vars',
  noUnmodifiedLoopCondition: 'no-unmodified-loop-condition',
  noUnnecessaryConditions: 'typescript/no-unnecessary-condition',
  noUnnecessaryTemplateExpression: 'typescript/no-unnecessary-template-expression',
  noUnreachable: 'no-unreachable',
  // Superset: constructor-super also reports super() calls in a class that extends a value that
  // is not a constructor, which Biome leaves to noInvalidConstructorSuper.
  noUnreachableSuper: ['constructor-super', 'no-this-before-super'],
  noUnresolvedImports: 'import/named',
  noUnsafeDeclarationMerging: 'typescript/no-unsafe-declaration-merging',
  noUnsafeTypeAssertion: 'typescript/no-unsafe-type-assertion',
  noUnsafeFinally: 'no-unsafe-finally',
  noUnsafeIframeSandbox: 'react/iframe-missing-sandbox',
  noUnsafeNegation: 'no-unsafe-negation',
  noUnsafeOptionalChaining: 'no-unsafe-optional-chaining',
  noUnsafePlusOperands: 'typescript/restrict-plus-operands',
  noUnusedInstantiation: 'no-new',
  noUnusedLabels: 'no-unused-labels',
  noUnusedPrivateClassMembers: 'no-unused-private-class-members',
  noUnusedVariables: 'no-unused-vars',
  noUnwantedPolyfillio: 'nextjs/no-unwanted-polyfillio',
  noUselessCatch: 'no-useless-catch',
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
  noUselessTypeAssertion: 'typescript/no-unnecessary-type-assertion',
  noUselessTypeConstraint: 'typescript/no-unnecessary-type-constraint',
  noUselessTypeConversion: 'typescript/no-unnecessary-type-conversion',
  noUselessUndefined: 'unicorn/no-useless-undefined',
  noUselessUndefinedInitialization: 'unicorn/no-useless-undefined',
  noVoid: 'no-void',
  noVar: 'no-var',
  noVoidElementsWithChildren: 'react/void-dom-elements-no-children',
  noVueAsyncComputed: 'vue/no-async-in-computed-properties',
  noVueComputedPropertiesInData: 'vue/no-computed-properties-in-data',
  noVueDataObjectDeclaration: [
    'vue/no-deprecated-data-object-declaration',
    'vue/no-shared-component-data',
  ],
  noVueArrowFuncInWatch: 'vue/no-arrow-functions-in-watch',
  noVueDeprecatedConfigKeyCodes: 'vue/no-deprecated-vue-config-keycodes',
  noVueDeprecatedDeleteSet: 'vue/no-deprecated-delete-set',
  noVueDeprecatedDestroyedLifecycle: 'vue/no-deprecated-destroyed-lifecycle',
  noVueDeprecatedEventsApi: 'vue/no-deprecated-events-api',
  noVueDeprecatedModelDefinition: 'vue/no-deprecated-model-definition',
  noVueDeprecatedPropsDefaultThis: 'vue/no-deprecated-props-default-this',
  noVueDuplicateKeys: 'vue/no-dupe-keys',
  noVueExcessiveProps: 'vue/max-props',
  noVueExportInScriptSetup: 'vue/no-export-in-script-setup',
  noVueExposeAfterAwait: 'vue/no-expose-after-await',
  noVueImportCompilerMacros: 'vue/no-import-compiler-macros',
  noVueLifecycleAfterAwait: 'vue/no-lifecycle-after-await',
  noVueMultipleSlotArgs: 'vue/no-multiple-slot-args',
  noVueRequiredPropWithDefault: 'vue/no-required-prop-with-default',
  noVueReservedKeys: 'vue/no-reserved-keys',
  noVueReservedProps: 'vue/no-reserved-props',
  noVueSideEffectsInComputed: 'vue/no-side-effects-in-computed-properties',
  noVueThisInBeforeRouteEnter: 'vue/no-this-in-before-route-enter',
  noVueWatchAfterAwait: 'vue/no-watch-after-await',
  noWith: 'no-with',
  noYodaExpression: 'yoda',
  noZeroFractions: 'unicorn/no-zero-fractions',
  useAccessorPairs: 'accessor-pairs',
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
  useBigintLiterals: 'unicorn/prefer-bigint-literals',
  useButtonType: 'react/button-has-type',
  useAriaPropTypes: 'jsx-a11y/aria-proptypes',
  useAriaPropsForRole: 'jsx-a11y/role-has-required-aria-props',
  useAriaPropsSupportedByRole: 'jsx-a11y/role-supports-aria-props',
  useAsConstAssertion: 'typescript/prefer-as-const',
  useAtIndex: 'unicorn/prefer-at',
  useAwait: 'require-await',
  useBlockStatements: 'curly',
  useCalledWith: ['jest/prefer-called-with', 'vitest/prefer-called-with'],
  useCapitalizedConstructors: 'new-cap',
  useCatchErrorName: 'unicorn/catch-error-name',
  useComponentExportOnlyModules: 'react/only-export-components',
  useCollapsedElseIf: 'no-lonely-if',
  useCollapsedIf: 'unicorn/no-lonely-if',
  useConsistentArrayType: 'typescript/array-type',
  useConsistentArrowReturn: 'arrow-body-style',
  // Superset: new-for-builtins also reports `Function()`, and the calls without `new` that
  // noInvalidBuiltinInstantiation reports, such as `Map()`.
  useConsistentBuiltinInstantiation: 'unicorn/new-for-builtins',
  useConsistentCurlyBraces: 'react/jsx-curly-brace-presence',
  useConsistentEnumValueType: 'typescript/no-mixed-enums',
  useConsistentFunctionStyle: 'func-style',
  useConsistentMethodSignatures: 'typescript/method-signature-style',
  useConsistentTypeDefinitions: 'typescript/consistent-type-definitions',
  useConsistentMemberAccessibility: 'typescript/explicit-member-accessibility',
  useConsistentObjectDefinitions: 'object-shorthand',
  useConsistentTestIt: ['jest/consistent-test-it', 'vitest/consistent-test-it'],
  useConsistentUnicodeBom: 'unicode-bom',
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
  useExpectToContain: ['jest/prefer-to-contain', 'vitest/prefer-to-contain'],
  useExpectToHaveBeenCalled: 'jest/prefer-to-have-been-called',
  useExpectToHaveBeenCalledTimes: [
    'jest/prefer-to-have-been-called-times',
    'vitest/prefer-to-have-been-called-times',
  ],
  useExplicitLengthCheck: 'unicorn/explicit-length-check',
  useExplicitReturnType: 'typescript/explicit-function-return-type',
  // Superset: explicit-function-return-type also reports an untyped function inside an object
  // that a function with a declared return type returns, which Biome treats as typed.
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
  useGlobalRegexInMatchAll: 'oxc/bad-match-all-arg',
  useGlobalRegexInReplaceAll: 'oxc/bad-replace-all-arg',
  // Superset: prefer-global-this also reports Web Worker APIs read through `self`, such as
  // `self.postMessage()`, which Biome allows.
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
  // dot-notation covers `a["b"]` member access and no-useless-computed-key `{ ["b"]: 1 }` keys;
  // only the second runs without type-aware linting.
  useLiteralKeys: ['typescript/dot-notation', 'no-useless-computed-key'],
  useLowercaseTestTitle: ['jest/prefer-lowercase-title', 'vitest/prefer-lowercase-title'],
  useMatchingFunctionName: 'func-name-matching',
  useMathMinMax: 'unicorn/prefer-math-min-max',
  useMathTrunc: 'unicorn/prefer-math-trunc',
  useMaxParams: 'max-params',
  useMediaCaption: 'jsx-a11y/media-has-caption',
  useModernMathApis: 'unicorn/prefer-modern-math-apis',
  useNamedCaptureGroup: 'prefer-named-capture-group',
  useNamedFunction: 'func-names',
  useNamespaceKeyword: 'typescript/prefer-namespace-keyword',
  useNextScriptForGoogleAnalytics: 'nextjs/next-script-for-ga',
  useNodejsImportProtocol: 'unicorn/prefer-node-protocol',
  useNullishCoalescing: 'typescript/prefer-nullish-coalescing',
  useNumberNamespace: 'unicorn/prefer-number-properties',
  useNumberToFixedDigitsArgument: 'unicorn/require-number-to-fixed-digits-argument',
  useNumericLiterals: 'prefer-numeric-literals',
  useNumericSeparators: 'unicorn/numeric-separators-style',
  // Superset: prefer-object-from-entries also reports a reduce() seeded with
  // `Object.create(null)`, whose prototype Object.fromEntries() cannot reproduce.
  useObjectFromEntries: 'unicorn/prefer-object-from-entries',
  useObjectSpread: 'prefer-object-spread',
  useOptionalChain: 'typescript/prefer-optional-chain',
  useParseIntRadix: 'radix',
  usePromiseRejectErrors: 'prefer-promise-reject-errors',
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
  useSetSize: 'unicorn/prefer-set-size',
  useShorthandAssign: 'operator-assignment',
  useShorthandFunctionType: 'typescript/prefer-function-type',
  useSingleVarDeclarator: 'one-var',
  useSpread: 'prefer-spread',
  useSpreadOverApply: 'prefer-spread',
  useSpyOn: ['jest/prefer-spy-on', 'vitest/prefer-spy-on'],
  useStaticResponseMethods: 'unicorn/prefer-response-static-json',
  // Superset: strict-boolean-expressions also reports nullable enums, values typed `null` or
  // implicitly `any`, and array predicate callbacks that return a nullable value. The one case
  // seen the other way round is a conditional type over an unconstrained type parameter.
  useStrictBooleanExpressions: 'typescript/strict-boolean-expressions',
  useStringStartsEndsWith: 'typescript/prefer-string-starts-ends-with',
  useSymbolDescription: 'symbol-description',
  useTemplate: 'prefer-template',
  useTestHooksInOrder: ['jest/prefer-hooks-in-order', 'vitest/prefer-hooks-in-order'],
  useTestHooksOnTop: ['jest/prefer-hooks-on-top', 'vitest/prefer-hooks-on-top'],
  useThisInClassMethods: 'class-methods-use-this',
  useThrowNewError: 'unicorn/throw-new-error',
  useThrowOnlyError: 'typescript/only-throw-error',
  useTopLevelRequire: 'node/global-require',
  useTrimStartEnd: 'unicorn/prefer-string-trim-start-end',
  useUnicodeRegex: 'require-unicode-regexp',
  useUnifiedTypeSignatures: 'typescript/unified-signatures',
  useValidAriaRole: 'jsx-a11y/aria-role',
  useValidAnchor: 'jsx-a11y/anchor-is-valid',
  useValidAriaProps: 'jsx-a11y/aria-props',
  useValidAriaValues: 'jsx-a11y/aria-proptypes',
  useValidAutocomplete: 'jsx-a11y/autocomplete-valid',
  useValidCharacterComparison: 'oxc/bad-char-at-comparison',
  useValidForDirection: 'for-direction',
  useValidLang: 'jsx-a11y/lang',
  // Superset: namespace also reports computed string member access, such as `ns['missing']`.
  useValidNamespaceImports: 'import/namespace',
  // Superset: valid-title also reports titles that repeat the test function's name as a
  // prefix (`it('it should ...')`), which Biome does not.
  useValidTestTitle: ['jest/valid-title', 'vitest/valid-title'],
  useValidTypeof: 'valid-typeof',
  useVarsOnTop: 'vars-on-top',
  // Superset: prefer-import-from-vue reports every named import from `@vue/shared`, while Biome
  // skips the names `vue` does not re-export.
  useVueBaseImport: 'vue/prefer-import-from-vue',
  useVueComputedPropertyReturn: 'vue/return-in-computed-property',
  useVueConsistentDefineEmitsDeclaration: 'vue/define-emits-declaration',
  useVueConsistentDefinePropsDeclaration: 'vue/define-props-declaration',
  useVueConsistentPropNameCasing: 'vue/prop-name-casing',
  // Biome reports nothing for this rule unless `html.experimentalFullSupportEnabled` is on;
  // Oxlint always checks.
  useVueDefaultExport: 'vue/require-default-export',
  useVueDefaultProp: 'vue/require-default-prop',
  useVueDefinePropsDestructuring: 'vue/define-props-destructuring',
  useVueEmitsValidatorReturn: 'vue/return-in-emits-validator',
  useVueNextTickPromise: 'vue/next-tick-style',
  useVuePropTypeConstructor: 'vue/require-prop-type-constructor',
  useVueRenderReturn: 'vue/require-render-return',
  useVueSlotsAsFunctions: 'vue/require-slots-as-functions',
  useVueTypedProps: 'vue/require-prop-types',
  // Superset: require-typed-ref also reports an untyped `ref()` that is asserted with
  // `as Ref<...>` or passed straight to a typed parameter.
  useVueTypedRef: 'vue/require-typed-ref',
  useVueValidDefineEmits: 'vue/valid-define-emits',
  useVueValidDefineOptions: 'vue/valid-define-options',
  // Biome reports nothing for this rule unless `html.experimentalFullSupportEnabled` is on;
  // Oxlint always checks.
  useVueValidDefineProps: 'vue/valid-define-props',
  useVueValidNextTick: 'vue/valid-next-tick',
  useYield: 'require-yield',
}

/**
 * Rule options that carry over with at most a new name, keyed by Biome rule and then by Biome
 * option. Each pair was checked against the Oxlint rule's schema, and the defaults on both
 * sides match, so an option the Biome config leaves out needs no counterpart either.
 * noExcessiveNestedBlocks' `ignoreAtRules` only applies to CSS, which Oxlint does not lint.
 */
const RENAMED_RULE_OPTIONS: Record<string, Record<string, string>> = {
  noDuplicateTypeConstituents: {
    ignoreIntersections: 'ignoreIntersections',
    ignoreUnions: 'ignoreUnions',
  },
  noDynamicRequire: { checkDynamicImports: 'esmodule' },
  noExcessiveNestedBlocks: { max: 'max' },
  noExcessiveStatementsPerFunction: {
    ignoreTopLevelFunctions: 'ignoreTopLevelFunctions',
    max: 'max',
  },
  noMapSpread: { ignoreArgs: 'ignoreArgs', ignoreRereads: 'ignoreRereads' },
  noSyncMethods: { allowAtRootLevel: 'allowAtRootLevel', ignore: 'ignores' },
  noVueAsyncComputed: { ignoreObjects: 'ignoredObjectNames' },
  useCatchErrorName: { ignore: 'ignore', name: 'name' },
  useLowercaseTestTitle: { allowedPrefixes: 'allowedPrefixes' },
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
  // An off rule reports nothing, so its options neither need carrying over nor count as lost.
  if (typeof severity !== 'string' || severity === 'off') {
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

  if (biomeName === 'noExcessiveCognitiveComplexity') {
    // Biome's default threshold is 15; Oxlint complexity defaults to 20.
    const max =
      options && isNonNegativeInteger(options.maxAllowedComplexity)
        ? options.maxAllowedComplexity
        : 15
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

  if (biomeName === 'noAssignInExpressions') {
    // Biome reports assignments in conditions even when wrapped in extra parentheses, which
    // no-cond-assign's default `except-parens` mode allows.
    return [severity, 'always']
  }

  if (biomeName === 'noConfusingLabels') {
    // Biome allows labels on loops only; Oxlint's no-labels forbids every label by default.
    if (options?.allowedLabels !== undefined) {
      reporter.loss(
        'Biome rule noConfusingLabels option "allowedLabels" is not supported by Oxlint no-labels; those labels are reported again unless they label a loop.',
      )
    }
    return [severity, { allowLoop: true }]
  }

  if (biomeName === 'noDoubleEquals') {
    // Biome's `ignoreNull` defaults to true, which is Oxlint eqeqeq's `null: "ignore"`.
    return options?.ignoreNull === false
      ? [severity, 'always']
      : [severity, 'always', { null: 'ignore' }]
  }

  if (biomeName === 'noRestrictedGlobals') {
    // Biome always denies the globals `event` and `error`; Oxlint restricts nothing until
    // told to. Restricted names follow the severity positionally, so the second 'error' below
    // is the global's name, not a severity.
    const denied = options?.deniedGlobals
    const extra = Array.isArray(denied)
      ? denied.filter((name): name is string => typeof name === 'string')
      : isRecord(denied)
        ? Object.entries(denied).map(([name, message]) =>
            typeof message === 'string' ? { name, message } : name,
          )
        : []
    return [severity, 'event', 'error', ...extra]
  }

  if (biomeName === 'useConsistentMemberAccessibility') {
    // Biome defaults to `noPublic`; Oxlint explicit-member-accessibility defaults to
    // `explicit`, which demands the modifiers Biome forbids.
    if (options?.accessibility === 'explicit') {
      return [severity, { accessibility: 'explicit' }]
    }
    if (options?.accessibility === 'none') {
      reporter.loss(
        'Biome rule useConsistentMemberAccessibility option "accessibility": "none" is not supported by Oxlint explicit-member-accessibility, which can forbid `public` but not `protected` or `private`; it was migrated as `no-public`.',
      )
    }
    return [severity, { accessibility: 'no-public' }]
  }

  if (biomeName === 'noImplicitBoolean') {
    // Biome requires an explicit value on boolean JSX attributes; `always` is that mode.
    return [severity, 'always']
  }

  if (biomeName === 'noStaticOnlyClass') {
    // no-extraneous-class also reports empty and constructor-only classes, which Biome allows.
    return [severity, { allowConstructorOnly: true, allowEmpty: true }]
  }

  if (biomeName === 'noInlineStyles') {
    // Oxlint's `forbid-dom-props` forbids nothing until it is told which props to forbid.
    return [severity, { forbid: ['style'] }]
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

  if (biomeName === 'noMisusedPromises') {
    // Biome reports any union that contains a promise when it is used as a condition, such as
    // `Promise<void> | undefined`; Oxlint only does so with `flagUnions: "all"`.
    return [severity, { checksConditionals: { flagUnions: 'all' } }]
  }

  if (biomeName === 'noVueExcessiveProps') {
    // Biome allows 10 props by default; Oxlint vue/max-props allows 1.
    const maxProps = options && isNonNegativeInteger(options.maxProps) ? options.maxProps : 10
    return [severity, { maxProps }]
  }

  if (!options) {
    return severity
  }

  const renamedOptions = RENAMED_RULE_OPTIONS[biomeName]
  if (renamedOptions) {
    const oxlintOptions: Record<string, unknown> = {}

    for (const [biomeKey, oxlintKey] of Object.entries(renamedOptions)) {
      const value = options[biomeKey]
      if (
        typeof value === 'boolean' ||
        isNonNegativeInteger(value) ||
        typeof value === 'string' ||
        (Array.isArray(value) && value.every((item) => typeof item === 'string'))
      ) {
        oxlintOptions[oxlintKey] = value
      }
    }

    return Object.keys(oxlintOptions).length > 0 ? [severity, oxlintOptions] : severity
  }

  if (biomeName === 'noTripleSlashReference') {
    const oxlintOptions: Record<string, unknown> = {}

    for (const key of ['lib', 'path', 'types'] as const) {
      const value = options[key]
      if (value === 'always' || value === 'never') {
        oxlintOptions[key] = value
      } else if (key === 'types' && value === 'preferImport') {
        oxlintOptions[key] = 'prefer-import'
      }
    }

    return Object.keys(oxlintOptions).length > 0 ? [severity, oxlintOptions] : severity
  }

  if (biomeName === 'useConsistentUnicodeBom') {
    const { bom } = options
    return bom === 'always' || bom === 'never' ? [severity, bom] : severity
  }

  if (biomeName === 'useObjectFromEntries') {
    // Biome's `functions` adds to the lodash functions it always reports; Oxlint's replaces them.
    const { functions } = options
    return Array.isArray(functions) &&
      functions.length > 0 &&
      functions.every((value) => typeof value === 'string')
      ? [severity, { functions: ['_.fromPairs', 'lodash.fromPairs', ...functions] }]
      : severity
  }

  if (biomeName === 'useVueConsistentDefineEmitsDeclaration') {
    const style =
      options.style === 'type'
        ? 'type-based'
        : options.style === 'typeLiteral'
          ? 'type-literal'
          : options.style === 'runtime'
            ? 'runtime'
            : null
    return style ? [severity, style] : severity
  }

  if (biomeName === 'useVueConsistentPropNameCasing') {
    const casing = options.casing === 'snake_case' ? 'snake_case' : 'camelCase'
    const { ignore } = options

    if (!Array.isArray(ignore) || !ignore.every((value) => typeof value === 'string')) {
      return casing === 'camelCase' ? severity : [severity, casing]
    }

    // Biome ignores exact prop names; Oxlint's `ignoreProps` takes regular expressions.
    return [
      severity,
      casing,
      { ignoreProps: ignore.map((name) => `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) },
    ]
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

  if (biomeName === 'useConsistentFunctionStyle') {
    if (options.style !== 'declaration') {
      // `expression` is the default on both sides.
      return severity
    }

    // Biome's declaration mode exempts variables with a type annotation, which Oxlint's
    // `func-style` reports unless `allowTypeAnnotation` is set.
    return [
      severity,
      'declaration',
      { allowArrowFunctions: options.allowArrowFunctions === true, allowTypeAnnotation: true },
    ]
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

  if (biomeName === 'useValidTestTitle') {
    const { disallowedWords } = options
    if (
      !Array.isArray(disallowedWords) ||
      disallowedWords.length === 0 ||
      !disallowedWords.every((value) => typeof value === 'string')
    ) {
      return severity
    }

    reporter.loss(
      'Biome rule useValidTestTitle option "disallowedWords" was migrated, but Oxlint valid-title stops reporting titles with leading or trailing whitespace once disallowedWords is set.',
    )
    return [severity, { disallowedWords }]
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

/** The rule's canonical mapping, before any non-type-aware fallback is substituted. */
export function mapBiomeRuleToOxlint(biomeName: string, reporter: Reporter): string | null {
  return mapBiomeRuleToOxlintRules(biomeName, reporter, true)[0] ?? null
}

/**
 * Maps a Biome rule to its Oxlint rules. Coverage gaps are only reported for an `enabled`
 * rule: a rule the Biome config turns off produced no diagnostics, so nothing is lost when
 * the Oxlint side covers less of it, or none of it.
 */
function mapBiomeRuleToOxlintRules(
  biomeName: string,
  reporter: Reporter,
  typeAware: boolean,
  enabled = true,
): string[] {
  const fallback = typeAware ? undefined : TYPE_AWARE_RULE_FALLBACKS[biomeName]

  if (fallback) {
    const fallbackNote = TYPE_AWARE_FALLBACK_NOTES[biomeName]
    if (fallbackNote && enabled) {
      warnPartialMappingOnce(biomeName, fallbackNote, reporter)
    }

    return [normalizeOxlintRuleName(fallback)]
  }

  const mapped = BIOME_TO_OXLINT_RULE_MAP[biomeName]
  if (mapped) {
    const partialMappingNote = PARTIAL_RULE_MAPPING_NOTES[biomeName]
    if (partialMappingNote && enabled) {
      warnPartialMappingOnce(biomeName, partialMappingNote, reporter)
    }

    const ruleNames = [
      ...new Set((Array.isArray(mapped) ? mapped : [mapped]).map(normalizeOxlintRuleName)),
    ]

    if (!typeAware && enabled) {
      for (const ruleName of ruleNames.filter((name) => TYPE_AWARE_OXLINT_RULES.has(name))) {
        warnPartialMappingOnce(
          `${biomeName}::${ruleName}`,
          `Biome rule ${biomeName} was mapped to ${ruleName}, a type-aware Oxlint rule that only runs with type-aware linting, so its diagnostics are not reported. Re-run the migration with --type-aware to keep them.`,
          reporter,
        )
      }
    }

    return ruleNames
  }

  if (enabled) {
    warnUnmappedRuleOnce(biomeName, reporter)
  }
  return []
}

function warnPartialMappingOnce(key: string, note: string, reporter: Reporter): void {
  let warnedRules = WARNED_PARTIAL_MAPPINGS_BY_REPORTER.get(reporter)

  if (!warnedRules) {
    warnedRules = new Set<string>()
    WARNED_PARTIAL_MAPPINGS_BY_REPORTER.set(reporter, warnedRules)
  }

  if (warnedRules.has(key)) {
    return
  }

  warnedRules.add(key)
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

export interface RuleExtractionOptions {
  /** Applies Biome's implicit `recommended` preset, which only the top-level rules carry. */
  applyImplicitRecommended?: boolean
  /**
   * Whether the migration is enabling type-aware linting. When it is not, Biome rules whose
   * only counterpart is a type-aware Oxlint rule fall back to a non-type-aware equivalent.
   */
  typeAware?: boolean
}

export function extractRulesFromBiomeConfig(
  linterRules: BiomeLinterRules | undefined,
  reporter: Reporter,
  options: RuleExtractionOptions = {},
): RuleExtractionResult {
  const { applyImplicitRecommended = false, typeAware = false } = options
  const rules: Record<string, OxlintRuleSeverity> = {}
  const categories: Record<string, 'off' | 'warn' | 'error'> = {}
  const sourceRulesConverted = new Set<string>()
  const sourceRulesSkipped = new Set<string>()

  if (!linterRules) {
    return { rules, categories, sourceRulesConverted, sourceRulesSkipped }
  }

  applyTopLevelPreset(linterRules, categories, reporter, applyImplicitRecommended)

  const sourcesByOxlintRule = new Map<string, SharedRuleSource[]>()

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

        const enabled =
          (typeof ruleSeverity === 'string' ? ruleSeverity : ruleSeverity.level) !== 'off'
        const oxlintRuleNames = mapBiomeRuleToOxlintRules(ruleName, reporter, typeAware, enabled)
        if (oxlintRuleNames.length > 0) {
          sourceRulesConverted.add(ruleName)
          const oxlintSeverity = mapBiomeRuleOptionsToOxlintSeverity(
            ruleName,
            mapBiomeRuleSeverity(ruleSeverity, reporter, ruleName),
            ruleSeverity,
            reporter,
          )
          for (const oxlintRuleName of oxlintRuleNames) {
            const sources = sourcesByOxlintRule.get(oxlintRuleName) ?? []
            sources.push({ biomeRule: ruleName, severity: oxlintSeverity })
            sourcesByOxlintRule.set(oxlintRuleName, sources)
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

  for (const [oxlintRuleName, sources] of sourcesByOxlintRule) {
    rules[oxlintRuleName] = resolveSharedRuleSeverity(oxlintRuleName, sources, reporter)
  }

  return { rules, categories, sourceRulesConverted, sourceRulesSkipped }
}

interface SharedRuleSource {
  biomeRule: string
  severity: OxlintRuleSeverity
}

const SEVERITY_RANK = { off: 0, warn: 1, error: 2 } as const

function severityLevel(severity: OxlintRuleSeverity): 'off' | 'warn' | 'error' {
  return typeof severity === 'string' ? severity : severity[0]
}

/**
 * Resolves one Oxlint rule that several configured Biome rules map onto.
 *
 * Writing each source in turn would let whichever Biome rule the config lists last decide,
 * so `noUnusedFunctionParameters: "off"` listed after `noUnusedVariables: "error"` would turn
 * off `no-unused-vars` and drop every unused-variable diagnostic. Instead the strongest
 * severity wins, because an enabled Biome rule's diagnostics are behaviour to keep, while a
 * disabled one only means that Biome rule stayed quiet. What the shared rule then reports
 * beyond the enabled sources is surfaced rather than hidden.
 */
function resolveSharedRuleSeverity(
  oxlintRuleName: string,
  sources: SharedRuleSource[],
  reporter: Reporter,
): OxlintRuleSeverity {
  const [first] = sources
  const enabled = sources.filter(({ severity }) => severityLevel(severity) !== 'off')

  if (!first || sources.length === 1 || enabled.length === 0) {
    return first?.severity ?? 'off'
  }

  const strongest = enabled.reduce((current, candidate) =>
    SEVERITY_RANK[severityLevel(candidate.severity)] >
    SEVERITY_RANK[severityLevel(current.severity)]
      ? candidate
      : current,
  )
  const optionSets = new Map<string, unknown[]>()

  for (const { severity } of enabled) {
    if (typeof severity !== 'string') {
      optionSets.set(JSON.stringify(severity.slice(1)), severity.slice(1))
    }
  }

  if (optionSets.size > 1) {
    reporter.loss(
      `Biome rules ${formatRuleList(enabled)} all map to Oxlint ${oxlintRuleName} with different options; Oxlint accepts one set, so the options of ${strongest.biomeRule} were kept and the others were not migrated.`,
    )
  }

  const level = severityLevel(strongest.severity)
  const options =
    typeof strongest.severity === 'string'
      ? ([...optionSets.values()][0] ?? [])
      : strongest.severity.slice(1)
  const disabled = sources.filter(({ severity }) => severityLevel(severity) === 'off')

  // Oxlint's no-unused-vars can stop checking parameters, which is exactly what turning
  // off Biome's noUnusedFunctionParameters alongside noUnusedVariables asks for.
  if (
    oxlintRuleName === 'no-unused-vars' &&
    disabled.length === 1 &&
    disabled[0]?.biomeRule === 'noUnusedFunctionParameters'
  ) {
    const [currentOptions] = options
    return [level, { ...(isRecord(currentOptions) ? currentOptions : {}), args: 'none' }]
  }

  if (disabled.length > 0) {
    reporter.warn(
      `Biome ${formatRuleList(disabled)} ${disabled.length === 1 ? 'is' : 'are'} off, but Oxlint ${oxlintRuleName} also implements ${formatRuleList(enabled)}, which ${enabled.length === 1 ? 'is' : 'are'} on; Oxlint will also report what ${disabled.length === 1 ? 'that rule' : 'those rules'} would have reported.`,
    )
  }

  return options.length > 0 ? [level, ...options] : level
}

function formatRuleList(sources: SharedRuleSource[]): string {
  return sources.map(({ biomeRule }) => biomeRule).join(', ')
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
