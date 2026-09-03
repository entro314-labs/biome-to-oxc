import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { defineConfig } from 'tsdown'

// rolldown-plugin-dts only recognises TypeScript 7 when the installed `typescript`
// version starts with `7.0`; on 7.1+ it neither selects the `tsgo` generator (it
// falls back to `tsc`, which crashes on the missing classic Compiler API) nor finds
// the compiler binary (it looks for `@typescript/native-preview`, not a dependency
// here). TypeScript 7 ships the native compiler as its own `tsc`, so select the
// generator explicitly and resolve the binary the way the compiler package does.
const require = createRequire(import.meta.url)
const typescriptLib = path.join(path.dirname(require.resolve('typescript/package.json')), 'lib')
const { default: getExePath }: { default: () => string } = await import(
  pathToFileURL(path.join(typescriptLib, 'getExePath.js')).href
)

export default defineConfig({
  entry: ['bin/biome-to-oxc.ts', 'src/index.ts'],
  format: ['esm'],
  // Generate .d.ts by invoking the native compiler binary resolved above. The
  // classic Compiler API path is unusable here: typescript@7 does not expose the
  // programmatic API, so rolldown-plugin-dts's TS-based generator fails.
  dts: { generator: 'tsgo', tsgo: { path: getExePath() } },
  sourcemap: false,
  clean: true,
  // Package-manifest lint. Runs on every build so a broken `exports` map, a missing file,
  // or a bad bin path fails here rather than after publishing.
  publint: true,
  // Type-resolution check. `esm-only` is the correct profile: the package is `type: module`
  // with a single ESM export and no CJS entry, so Node10/CJS resolution failures are
  // expected rather than defects.
  attw: { profile: 'esm-only' },
})
