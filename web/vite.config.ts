/// <reference types="vitest/config" />
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pressStyles } from './src/lib/pressStyles';

const require = createRequire(import.meta.url);

// The router's package points every import at its build with development warnings; the build ships the other one.
const ROUTER_BUILD = join(dirname(require.resolve('react-router/package.json')), 'dist', 'production');

// React, its renderer and the router change with a dependency update, not with a deploy, so they get a chunk of their
// own that a returning browser still has after the app's code changes.
const VENDOR = /\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//;

// The app talks to the API cross-origin via VITE_API_URL (src/lib/config.ts); point it at http://localhost:3000 for a
// local API. There is no build-time secret.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Pressed looks only for real presses, hover looks only where something can hover (src/lib/pressStyles.ts).
  css: { postcss: { plugins: [pressStyles()] } },
  server: { port: 5174 },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: { output: { manualChunks: (id: string) => (VENDOR.test(id) ? 'vendor' : undefined) } },
  },
  resolve: {
    // Mobile pins a different React patch, so tests could load two copies (null hook dispatcher); force one.
    dedupe: ['react', 'react-dom', 'react-router-dom'],
    alias:
      command === 'build'
        ? [
            { find: /^react-router$/, replacement: join(ROUTER_BUILD, 'index.mjs') },
            { find: /^react-router\/dom$/, replacement: join(ROUTER_BUILD, 'dom-export.mjs') },
          ]
        : [],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}));
