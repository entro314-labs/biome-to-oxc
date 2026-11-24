import { describe, expect, it } from 'vitest'

import {
  alignOxfmtLanguageScope,
  biomeFormatsYamlAndMarkdown,
  generateOxfmtConfig,
  reportUnformattedFrameworkFiles,
} from './formatter-mapper.js'
import { CollectingReporter } from './reporter.js'
import { normalizeBiomeConfig } from './schema-normalizer.js'
import type { BiomeConfig } from './types.js'

describe('generateOxfmtConfig', () => {
  it('does not enable package sorting by default for an empty biome config', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig({}, reporter)

    expect(config.sortPackageJson).toBe(false)
    expect(config.sortImports).toBeUndefined()
    expect(config.sortTailwindcss).toBeUndefined()
    expect(config.jsdoc).toBeUndefined()
  })

  it('passes through explicitly configured experimental formatter options', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      {
        formatter: {
          sortPackageJson: {
            sortScripts: true,
          },
          experimentalSortImports: {
            order: 'asc',
            newlinesBetween: true,
          },
        },
      },
      reporter,
    )

    expect(config.sortPackageJson).toEqual({
      sortScripts: true,
    })
    expect(config.sortImports).toEqual({
      order: 'asc',
      newlinesBetween: true,
    })
  })

  it('maps the assist actions Oxfmt implements', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      {
        assist: {
          actions: {
            source: {
              organizeImports: 'on',
              useSortedPackageJson: 'on',
            },
          },
        },
      },
      reporter,
    )

    expect(config.sortImports).toEqual({})
    expect(config.sortPackageJson).toBe(true)
    expect(reporter.getLosses()).toEqual([])
    // Both tools sort, but not into the same order, so the first Oxfmt run reorders once.
    const warnings = reporter.getWarnings().join('\n')
    expect(warnings).toContain('different key orders')
    expect(warnings).toContain('group and order imports differently')
  })

  it('warns that Biome sorted imports by default when no assist config enables it', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig({}, reporter)

    expect(config.sortImports).toBeUndefined()
    expect(reporter.getWarnings().join('\n')).toContain('Biome sorts imports by default')
    expect(reporter.getLosses()).toEqual([])
  })

  it('does not warn about default import sorting when the config settles the question', () => {
    for (const assist of [
      { enabled: false },
      { actions: { source: { organizeImports: 'off' as const } } },
      { actions: { source: { organizeImports: 'on' as const } } },
    ]) {
      const reporter = new CollectingReporter()

      generateOxfmtConfig({ assist }, reporter)

      expect(reporter.getWarnings().join('\n')).not.toContain('Biome sorts imports by default')
    }
  })

  it('maps organizeImports sortBareImports onto Oxfmt sortSideEffects', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      {
        assist: {
          actions: {
            source: {
              organizeImports: {
                level: 'on',
                options: { sortBareImports: true, groups: [[':NODE:']] },
              },
            },
          },
        },
      },
      reporter,
    )

    expect(config.sortImports).toEqual({ sortSideEffects: true })
    expect(reporter.getLosses()).toHaveLength(1)
    expect(reporter.getLosses()[0]).toContain('organizeImports option "groups"')
  })

  it('leaves the Oxfmt sorting options off for assist actions that are off or disabled', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      {
        assist: {
          enabled: false,
          actions: { source: { organizeImports: 'on', useSortedPackageJson: 'on' } },
        },
      },
      reporter,
    )

    expect(config.sortImports).toBeUndefined()
    expect(config.sortPackageJson).toBe(false)

    const offReporter = new CollectingReporter()
    const offConfig = generateOxfmtConfig(
      { assist: { actions: { source: { organizeImports: 'off' } } } },
      offReporter,
    )

    expect(offConfig.sortImports).toBeUndefined()
    expect(offReporter.getLosses()).toEqual([])
  })

  it('reports assist actions Oxfmt cannot represent', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      {
        assist: {
          includes: ['src/**'],
          actions: {
            source: {
              recommended: true,
              useSortedKeys: 'on',
              useSortedAttributes: 'on',
            },
          },
        },
      },
      reporter,
    )

    expect(config.sortImports).toBeUndefined()
    const losses = reporter.getLosses().join('\n')
    expect(losses).toContain('assist.includes')
    expect(losses).toContain('enabled through a preset')
    expect(losses).toContain('"useSortedKeys"')
    expect(losses).toContain('"useSortedAttributes"')
  })

  it('lets an explicit Oxfmt sorting option win over the assist action it overlaps', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      {
        assist: { actions: { source: { organizeImports: 'on' } } },
        formatter: { sortImports: { order: 'desc' } },
      },
      reporter,
    )

    expect(config.sortImports).toEqual({ order: 'desc' })
  })

  it('rejects objectWrap values that are invalid in the current Oxfmt schema', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      {
        formatter: {
          objectWrap: true,
        },
      },
      reporter,
    )

    expect(config.objectWrap).toBeUndefined()
    expect(reporter.getWarnings()).toContain(
      'Ignoring invalid Oxfmt objectWrap value true; expected "preserve" or "collapse".',
    )
  })

  it('disables Oxfmt when Biome formatting is globally disabled', () => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig({ formatter: { enabled: false } }, reporter)

    expect(config.ignorePatterns).toEqual(['**/*'])
  })

  it('keeps a disabled formatter disabled for a file the config re-includes', () => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig(
      { formatter: { enabled: false }, files: { exclude: ['build/**', '!build/keep.ts'] } },
      reporter,
    )

    // `**/*` has to come last: a `!` entry lifts every earlier pattern it matches.
    expect(config.ignorePatterns).toEqual(['build/**', '!build/keep.ts', '**/*'])
  })

  it('keeps language-specific shared options scoped to language overrides', () => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig(
      {
        formatter: { lineWidth: 80 },
        javascript: { formatter: { lineWidth: 120, indentWidth: 4 } },
        json: { formatter: { lineWidth: 90, trailingCommas: 'none' } },
        css: { formatter: { quoteStyle: 'single' } },
      },
      reporter,
    )

    expect(config.printWidth).toBe(80)
    expect(config.overrides).toEqual([
      {
        files: ['**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}'],
        options: { printWidth: 120, tabWidth: 4 },
      },
      {
        files: ['**/*.{json,jsonc,json5}'],
        options: { printWidth: 90, trailingComma: 'none' },
      },
      {
        files: ['**/*.{css,scss,sass,less}'],
        options: { singleQuote: true },
      },
    ])
  })

  it('maps Biome graphql.formatter options onto a GraphQL-scoped Oxfmt override', () => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig(
      {
        graphql: {
          formatter: {
            indentStyle: 'space',
            indentWidth: 4,
            lineWidth: 60,
            bracketSpacing: false,
            quoteStyle: 'single',
            trailingNewline: false,
          },
        },
      },
      reporter,
    )

    expect(config.overrides).toEqual([
      {
        files: ['**/*.{graphql,gql}'],
        options: {
          useTabs: false,
          tabWidth: 4,
          printWidth: 60,
          bracketSpacing: false,
          insertFinalNewline: false,
        },
      },
    ])
    // GraphQL strings are always double-quoted, so neither tool acts on quoteStyle.
    expect(reporter.getLosses()).toEqual([])
  })

  it('stops Oxfmt formatting GraphQL when Biome disables the GraphQL formatter', () => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig({ graphql: { formatter: { enabled: false } } }, reporter)

    expect(config.ignorePatterns).toContain('**/*.{graphql,gql}')
  })

  it('reports that a re-enabled GraphQL formatter under a disabled global one cannot be expressed', () => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig(
      { formatter: { enabled: false }, graphql: { formatter: { enabled: true } } },
      reporter,
    )

    expect(config.ignorePatterns ?? []).not.toContain('**/*')
    expect(reporter.getLosses()).toHaveLength(1)
  })

  it('passes through explicitly configured Svelte formatter options', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      {
        formatter: {
          svelte: {
            allowShorthand: false,
            indentScriptAndStyle: false,
            sortOrder: 'scripts-markup-styles-options',
          },
        },
      },
      reporter,
    )

    expect(config.svelte).toEqual({
      allowShorthand: false,
      indentScriptAndStyle: false,
      sortOrder: 'scripts-markup-styles-options',
    })
  })

  it('passes through explicitly configured Astro formatter options', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      { formatter: { astro: { compressHTML: 'html', skipFrontmatter: true } } },
      reporter,
    )

    expect(config.astro).toEqual({ compressHTML: 'html', skipFrontmatter: true })
  })

  it('passes through explicitly configured JSDoc formatter options', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      {
        formatter: {
          jsdoc: {
            bracketSpacing: true,
            commentLineStrategy: 'multiline',
            lineWrappingStyle: 'balance',
          },
        },
      },
      reporter,
    )

    expect(config.jsdoc).toEqual({
      bracketSpacing: true,
      commentLineStrategy: 'multiline',
      lineWrappingStyle: 'balance',
    })
  })
})

describe('generateOxfmtConfig for Biome formatter options with new Oxfmt equivalents', () => {
  it('maps javascript.formatter.operatorLinebreak onto experimentalOperatorPosition', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      { javascript: { formatter: { operatorLinebreak: 'before' } } },
      reporter,
    )

    expect(config.overrides?.[0]?.options).toMatchObject({
      experimentalOperatorPosition: 'start',
    })
    expect(reporter.getLosses()).toEqual([])
  })

  it('maps Biome expand onto objectWrap and reports the mode Oxfmt lacks', () => {
    const reporter = new CollectingReporter()

    expect(generateOxfmtConfig({ formatter: { expand: 'auto' } }, reporter).objectWrap).toBe(
      'preserve',
    )
    expect(generateOxfmtConfig({ formatter: { expand: 'never' } }, reporter).objectWrap).toBe(
      'collapse',
    )
    expect(reporter.getLosses()).toEqual([])

    const alwaysReporter = new CollectingReporter()
    const config = generateOxfmtConfig({ formatter: { expand: 'always' } }, alwaysReporter)

    expect(config.objectWrap).toBeUndefined()
    expect(alwaysReporter.getLosses()).toHaveLength(1)
    expect(alwaysReporter.getLosses()[0]).toContain('expand "always"')
  })

  it('maps trailingNewline and bracketSameLine, which Oxfmt supports directly', () => {
    const reporter = new CollectingReporter()

    const config = generateOxfmtConfig(
      { formatter: { trailingNewline: false, bracketSameLine: true } },
      reporter,
    )

    expect(config.insertFinalNewline).toBe(false)
    expect(config.bracketSameLine).toBe(true)
    expect(reporter.getLosses()).toEqual([])
  })

  it('still reports the Biome formatter options Oxfmt has no equivalent for', () => {
    const reporter = new CollectingReporter()

    generateOxfmtConfig({ formatter: { delimiterSpacing: true, useEditorconfig: true } }, reporter)

    expect(reporter.getLosses()).toEqual([
      'Biome formatter option "delimiterSpacing" has no Oxfmt equivalent and was not migrated.',
      'Biome formatter option "useEditorconfig" has no Oxfmt equivalent and was not migrated.',
    ])
  })
})

describe('reportUnformattedFrameworkFiles', () => {
  it('reports .astro and .svelte files Biome formats but the generated config leaves alone', () => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig({}, reporter)

    reportUnformattedFrameworkFiles({}, config, new Set(['astro', 'svelte']), reporter)

    expect(reporter.getLosses()).toEqual([
      'Biome formats the frontmatter of .astro files, but Oxfmt leaves .astro files unformatted unless the Oxfmt config sets "astro": true and @astrojs/compiler-rs is a direct dependency of the project; Oxfmt then formats the whole file, markup included.',
      'Biome formats the <script> blocks of .svelte files, but Oxfmt leaves .svelte files unformatted unless the Oxfmt config sets "svelte": true and svelte is installed; Oxfmt then formats the whole file, markup included.',
    ])
  })

  it('detects the framework from formatter includes when the dependency is not declared', () => {
    const reporter = new CollectingReporter()
    const biomeConfig = { files: { includes: ['src/**/*.svelte'] } }
    const config = generateOxfmtConfig(biomeConfig, reporter)

    reportUnformattedFrameworkFiles(biomeConfig, config, new Set(), reporter)

    expect(reporter.getLosses()).toHaveLength(1)
    expect(reporter.getLosses()[0]).toContain('.svelte files')
  })

  it('reports nothing when the project uses neither framework', () => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig({}, reporter)

    reportUnformattedFrameworkFiles({}, config, new Set(['react', 'vue']), reporter)

    expect(reporter.getLosses()).toEqual([])
  })

  it('reports nothing when the formatter option is already passed through', () => {
    const reporter = new CollectingReporter()
    const biomeConfig = { formatter: { astro: true, svelte: { indentScriptAndStyle: false } } }
    const config = generateOxfmtConfig(biomeConfig, reporter)

    reportUnformattedFrameworkFiles(biomeConfig, config, new Set(['astro', 'svelte']), reporter)

    expect(reporter.getLosses()).toEqual([])
  })

  it.each([
    ['the formatter is disabled', { formatter: { enabled: false } }],
    ['the JavaScript formatter is disabled', { javascript: { formatter: { enabled: false } } }],
    ['the files are excluded', { files: { includes: ['**', '!**/*.astro', '!**/*.svelte'] } }],
  ])('reports nothing when %s, since Biome formatted none of those files', (_, biomeConfig) => {
    const reporter = new CollectingReporter()
    const normalized = normalizeBiomeConfig(biomeConfig, reporter)
    const config = generateOxfmtConfig(normalized, reporter)

    reportUnformattedFrameworkFiles(normalized, config, new Set(['astro', 'svelte']), reporter)

    expect(reporter.getLosses()).toEqual([])
  })
})

describe('language-level line endings', () => {
  // Oxfmt rejects the whole config when any `endOfLine` is "auto", so every run would fail.
  it.each<[string, BiomeConfig]>([
    ['javascript', { javascript: { formatter: { lineEnding: 'auto' } } }],
    ['json', { json: { formatter: { lineEnding: 'auto' } } }],
    ['css', { css: { formatter: { lineEnding: 'auto' } } }],
    ['graphql', { graphql: { formatter: { lineEnding: 'auto' } } }],
  ])('reports a %s lineEnding of "auto" instead of emitting it', (_, biomeConfig) => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig(normalizeBiomeConfig(biomeConfig, reporter), reporter)

    expect(JSON.stringify(config)).not.toContain('"endOfLine"')
    expect(reporter.getLosses()).toEqual([expect.stringContaining('lineEnding "auto"')])
  })

  it('keeps an explicit language-level line ending', () => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig({ json: { formatter: { lineEnding: 'crlf' } } }, reporter)

    expect(config.overrides).toEqual([
      { files: ['**/*.{json,jsonc,json5}'], options: { endOfLine: 'crlf' } },
    ])
  })
})

describe('YAML and Markdown formatting', () => {
  it('keeps YAML and Markdown in scope and associates the YAML files Oxfmt does not recognise', () => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig({}, reporter)

    alignOxfmtLanguageScope(config, {}, '2.6.8')

    expect(config.ignorePatterns?.join()).not.toMatch(/\b(yaml|yml|md|markdown)\b/)
    expect(config.associations).toEqual([
      {
        files: ['**/*.{cff,eyaml,eyml,yaml-tmpreferences,yaml-tmtheme,yaml.sed,yml.mysql}'],
        language: 'yaml',
      },
    ])
  })

  it('associates SVG files with HTML when Biome formats HTML', () => {
    const biomeConfig = { html: { formatter: { enabled: true } } }
    const config = generateOxfmtConfig(biomeConfig, new CollectingReporter())

    alignOxfmtLanguageScope(config, biomeConfig, '2.6.8')

    expect(config.associations).toContainEqual({ files: ['**/*.svg'], language: 'html' })
    expect(config.ignorePatterns).not.toContain('**/*.{html,htm}')
  })

  it.each([
    [
      'yaml',
      { yaml: { formatter: { enabled: false } } },
      [
        '**/*.{yaml,yml,cff,eyaml,eyml,mir,reek,rviz,sublime-syntax,syntax,yaml-tmlanguage,yaml-tmpreferences,yaml-tmtheme,yaml.sed,yml.mysql}',
        '**/{.clang-format,.clang-tidy,.gemrc}',
      ],
    ],
    ['markdown', { markdown: { formatter: { enabled: false } } }, ['**/*.{md,markdown}']],
  ] as const)(
    'ignores the files Biome formats as %s when its formatter is off',
    (language, biomeConfig, patterns) => {
      const config = generateOxfmtConfig(biomeConfig, new CollectingReporter())

      alignOxfmtLanguageScope(config, biomeConfig, '2.6.8')

      expect(config.ignorePatterns).toEqual(expect.arrayContaining([...patterns]))
      expect(
        config.associations?.some((association) => association.language === language),
      ).not.toBe(true)
    },
  )

  it('maps the yaml and markdown formatter options onto language overrides', () => {
    const reporter = new CollectingReporter()
    const config = generateOxfmtConfig(
      {
        yaml: {
          formatter: {
            quoteStyle: 'single',
            indentWidth: 4,
            lineWidth: 100,
            bracketSpacing: false,
            trailingNewline: false,
            lineEnding: 'crlf',
          },
        },
        markdown: {
          formatter: { proseWrap: 'always', lineWidth: 60, formatEmbeds: false, indentWidth: 4 },
        },
      },
      reporter,
    )

    expect(config.overrides).toEqual([
      {
        files: expect.arrayContaining(['**/{.clang-format,.clang-tidy,.gemrc}']),
        options: {
          singleQuote: true,
          tabWidth: 4,
          printWidth: 100,
          bracketSpacing: false,
          insertFinalNewline: false,
          endOfLine: 'crlf',
        },
      },
      {
        files: ['**/*.{md,markdown}'],
        options: { proseWrap: 'always', printWidth: 60, embeddedLanguageFormatting: 'off' },
      },
    ])
    expect(reporter.getLosses()).toEqual([])
  })

  it('keeps Markdown at an indent width of 2, which Biome uses whatever the global width', () => {
    const config = generateOxfmtConfig(
      { formatter: { indentStyle: 'space', indentWidth: 4 } },
      new CollectingReporter(),
    )

    expect(config.tabWidth).toBe(4)
    expect(config.overrides).toEqual([{ files: ['**/*.{md,markdown}'], options: { tabWidth: 2 } }])
  })

  it.each(['2.5.15', '1.9.4'])(
    'excludes YAML and Markdown for Biome %s, which formats neither',
    (version) => {
      const config = generateOxfmtConfig({}, new CollectingReporter())

      alignOxfmtLanguageScope(config, {}, version)

      expect(config.ignorePatterns).toEqual(
        expect.arrayContaining(['**/*.{md,markdown}', '**/{.clang-format,.clang-tidy,.gemrc}']),
      )
      expect(config.associations).toBeUndefined()
    },
  )

  it.each([
    [undefined, true],
    ['2.6.0', true],
    ['3.0.0', true],
    ['2.5.15', false],
  ])('treats Biome %s as formatting YAML and Markdown: %s', (version, expected) => {
    expect(biomeFormatsYamlAndMarkdown(version)).toBe(expected)
  })
})
