import type {
  BiomeOverride,
  BiomeFormatterConfig,
  BiomeJavaScriptConfig,
  OxfmtOverride,
  Reporter,
} from './types.js';

export function generateOxfmtOverrides(
  biomeOverrides: BiomeOverride[] | undefined,
  reporter: Reporter,
): OxfmtOverride[] {
  if (!biomeOverrides || biomeOverrides.length === 0) {
    return [];
  }

  const oxfmtOverrides: OxfmtOverride[] = [];

  for (const override of biomeOverrides) {
    const files = override.include;
    if (!files || files.length === 0) {
      continue;
    }

    const hasFormatterConfig = override.formatter || override.javascript?.formatter;
    if (!hasFormatterConfig) {
      continue;
    }

    const options = mapFormatterOptions(
      override.formatter,
      override.javascript?.formatter,
      reporter,
    );

    if (Object.keys(options).length === 0) {
      continue;
    }

    const oxfmtOverride: OxfmtOverride = {
      files,
      options,
    };

    if (override.ignore && override.ignore.length > 0) {
      oxfmtOverride.excludeFiles = override.ignore;
    }

    oxfmtOverrides.push(oxfmtOverride);
  }

  return oxfmtOverrides;
}

function mapFormatterOptions(
  formatter: BiomeFormatterConfig | undefined,
  jsFormatter: BiomeJavaScriptConfig['formatter'] | undefined,
  reporter: Reporter,
): Partial<Record<string, unknown>> {
  const options: Record<string, unknown> = {};

  const jsLineWidth = jsFormatter?.lineWidth;
  const globalLineWidth = formatter?.lineWidth;
  if (jsLineWidth !== undefined || globalLineWidth !== undefined) {
    options.printWidth = jsLineWidth ?? globalLineWidth;
  }

  const jsIndentStyle = jsFormatter?.indentStyle;
  const globalIndentStyle = formatter?.indentStyle;
  if (jsIndentStyle !== undefined || globalIndentStyle !== undefined) {
    options.useTabs = (jsIndentStyle ?? globalIndentStyle) === 'tab';
  }

  const jsIndentWidth = jsFormatter?.indentWidth;
  const globalIndentWidth = formatter?.indentWidth;
  if (jsIndentWidth !== undefined || globalIndentWidth !== undefined) {
    options.tabWidth = jsIndentWidth ?? globalIndentWidth;
  }

  const jsLineEnding = jsFormatter?.lineEnding;
  const globalLineEnding = formatter?.lineEnding;
  if (jsLineEnding !== undefined || globalLineEnding !== undefined) {
    options.endOfLine = jsLineEnding ?? globalLineEnding;
  }

  if (jsFormatter?.quoteStyle !== undefined) {
    options.singleQuote = jsFormatter.quoteStyle === 'single';
  }

  if (jsFormatter?.jsxQuoteStyle !== undefined) {
    options.jsxSingleQuote = jsFormatter.jsxQuoteStyle === 'single';
  }

  if (jsFormatter?.quoteProperties !== undefined) {
    options.quoteProps = jsFormatter.quoteProperties === 'preserve' ? 'preserve' : 'as-needed';
  }

  if (jsFormatter?.trailingCommas !== undefined) {
    const tc = jsFormatter.trailingCommas;
    options.trailingComma = tc === 'none' ? 'none' : tc === 'es5' ? 'es5' : 'all';
  }

  if (jsFormatter?.semicolons !== undefined) {
    options.semi = jsFormatter.semicolons === 'always';
  }

  if (jsFormatter?.arrowParentheses !== undefined) {
    options.arrowParens = jsFormatter.arrowParentheses === 'always' ? 'always' : 'avoid';
  }

  const jsBracketSpacing = jsFormatter?.bracketSpacing;
  const globalBracketSpacing = formatter?.bracketSpacing;
  if (jsBracketSpacing !== undefined || globalBracketSpacing !== undefined) {
    options.bracketSpacing = jsBracketSpacing ?? globalBracketSpacing;
  }

  if (jsFormatter?.bracketSameLine !== undefined) {
    options.bracketSameLine = jsFormatter.bracketSameLine;
  }

  const attributePosition = formatter?.attributePosition;
  if (attributePosition !== undefined) {
    options.singleAttributePerLine = attributePosition === 'multiline';
  }

  // Check for any additional experimental options that might be passed through
  // This allows forward compatibility with new Biome features
  if (jsFormatter && typeof jsFormatter === 'object') {
    for (const [key, value] of Object.entries(jsFormatter)) {
      // Skip already mapped options
      const mappedKeys = [
        'enabled',
        'quoteStyle',
        'jsxQuoteStyle',
        'quoteProperties',
        'trailingCommas',
        'semicolons',
        'arrowParentheses',
        'bracketSameLine',
        'bracketSpacing',
        'indentStyle',
        'indentWidth',
        'lineEnding',
        'lineWidth',
      ];

      if (!mappedKeys.includes(key) && value !== undefined) {
        // Pass through unknown options (might be experimental features)
        options[key] = value;
      }
    }
  }

  return options;
}
