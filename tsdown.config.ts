import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['bin/biome-to-oxc.ts', 'src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: false,
  clean: true,
})
