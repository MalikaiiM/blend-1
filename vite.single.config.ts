import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Single-file build: everything (JS, CSS, fonts as data: URIs) is emitted as one bundle that scripts/build-single.mjs then
// inlines into one HTML file. That file needs no server, no network and no relative paths — it opens from disk and can be
// hosted anywhere (it is also what gets published as a hosted preview).
export default defineConfig({
  base: './',
  build: {
    outDir: process.env.SINGLE_TMP ?? 'dist-single',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 100_000_000, // fonts → data: URIs
    sourcemap: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'index.html'),
      output: { codeSplitting: false },
    },
  },
});
