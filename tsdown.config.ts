import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['bin/biome-to-oxc.ts', 'src/index.ts'],
  format: ['esm'],
  // Generate .d.ts by invoking the native compiler binary, resolved from the installed
  // typescript package (@typescript/native-preview is only a fallback for pre-7.0 setups).
  // The classic Compiler API path is unusable here: typescript@7 does not expose the
  // programmatic API (planned for 7.1), so rolldown-plugin-dts's default TS-based mode
  // fails with `No "exports" main defined`.
  dts: { tsgo: true },
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
