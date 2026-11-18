/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pressStyles } from './src/lib/pressStyles';

// The app talks to the API cross-origin via VITE_API_URL (src/lib/config.ts); point it at http://localhost:3000 for a
// local API. There is no build-time secret.
export default defineConfig({
  plugins: [react()],
  // Pressed looks only for real presses, hover looks only where something can hover (src/lib/pressStyles.ts).
  css: { postcss: { plugins: [pressStyles()] } },
  server: { port: 5174 },
  build: { outDir: 'dist', sourcemap: false },
  // Mobile pins a different React patch, so tests could load two copies (null hook dispatcher); force one.
  resolve: { dedupe: ['react', 'react-dom', 'react-router-dom'] },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
