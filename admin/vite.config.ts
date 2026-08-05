import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** API paths the SPA calls — proxied to the api dev server so the browser stays same-origin. */
const API_PREFIXES = ['/auth', '/admin', '/users', '/me', '/tags', '/library', '/images', '/shop'];
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

const proxy: Record<string, { target: string; changeOrigin: boolean }> = {};
for (const p of API_PREFIXES) proxy[p] = { target: API_TARGET, changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
});
