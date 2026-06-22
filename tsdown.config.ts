import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['bin/biome-to-oxc.ts', 'src/index.ts'],
  format: ['esm'],
  // Generate .d.ts via tsgo (the native TypeScript port) from @typescript/native-preview.
  // The classic Compiler API path is unusable here: typescript@7 (the tsgo RC) exposes no
  // `.` main export, so rolldown-plugin-dts's default TS-based mode fails with
  // `No "exports" main defined`. tsgo mode gives full type-inference declarations without
  // the legacy compiler. [Experimental]
  dts: { tsgo: true },
  sourcemap: false,
  clean: true,
})
