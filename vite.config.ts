import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Two entry pages: the public site (index.html) and the art lab (lab.html),
// a bare harness used to develop and audit the generator.
export default defineConfig({
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        lab: resolve(import.meta.dirname, 'lab.html'),
      },
    },
  },
  server: { host: '0.0.0.0', port: 5173, strictPort: false },
});
