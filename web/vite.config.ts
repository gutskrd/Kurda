/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The web app talks to the existing Render API cross-origin via VITE_API_URL
// (see src/lib/config.ts). For local dev against a locally-running API you can
// point VITE_API_URL at http://localhost:3000; there's no build-time secret.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  build: { outDir: 'dist', sourcemap: false },
  // In this monorepo mobile pins a different React patch, so tests can otherwise
  // load two React copies (null hook dispatcher). Force a single instance.
  resolve: { dedupe: ['react', 'react-dom', 'react-router-dom'] },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
