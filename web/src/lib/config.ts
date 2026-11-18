/**
 * Runtime configuration: only the API base URL, from VITE_API_URL at build time. Never put secrets here; this bundle
 * ships to the browser. The default is the production API, so a plain `vite build` works.
 */
const DEFAULT_API_URL = 'https://kurda-api.onrender.com';

function readApiUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  const url = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_API_URL;
  // No trailing slash, so `${API_URL}${path}` is always clean.
  return url.replace(/\/+$/, '');
}

export const API_URL = readApiUrl();
