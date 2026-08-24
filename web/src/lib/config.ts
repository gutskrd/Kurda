/**
 * Runtime configuration. The only environment-specific value is the API base
 * URL, injected at build time via VITE_API_URL. Never put secrets here — this
 * bundle ships to the browser. The production default points at the live
 * Render API so a plain `vite build` with no env still works.
 */
const DEFAULT_API_URL = 'https://kurda-api.onrender.com';

function readApiUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  const url = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_API_URL;
  // normalise: no trailing slash, so `${API_URL}${path}` is always clean
  return url.replace(/\/+$/, '');
}

export const API_URL = readApiUrl();
