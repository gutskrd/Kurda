export type AppEnv = 'development' | 'staging' | 'production';

const BASE_URLS: Record<AppEnv, string> = {
  // The Android emulator reaches the host machine via 10.0.2.2; iOS simulators and real devices override with
  // EXPO_PUBLIC_API_URL.
  development: 'http://localhost:3000',
  staging: 'https://staging-api.kurda.app',
  // The live API.
  production: 'https://kurda-api.onrender.com',
};

export function apiBaseUrl(env: AppEnv, override?: string): string {
  return override && override.length > 0 ? override : BASE_URLS[env];
}

/**
 * The API base URL when no EXPO_PUBLIC_API_URL override is set: the live API in every kind of build. On a phone,
 * localhost is the phone itself, so a development build defaulting to it could not sign in. Anyone running the
 * API locally sets EXPO_PUBLIC_API_URL.
 */
export function defaultApiBaseUrl(): string {
  return apiBaseUrl('production');
}

/**
 * Where the site's static art lives. Cosmetic assets (default avatars, profile backgrounds, icons) ship with the
 * website, so the API returns site-relative paths like `/cosmetics/avatars/default-01.png` that a phone cannot
 * resolve on its own.
 */
const SITE_URL = 'https://hevalo.app';

/**
 * Make a URL the phone can load. Absolute URLs (an uploaded photo) are returned as they are; a site-relative path
 * is resolved against the website. Production is used in development too, since these are public, immutable
 * files.
 */
export function assetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//')) return url;
  return `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}
