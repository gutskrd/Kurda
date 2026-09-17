export type AppEnv = 'development' | 'staging' | 'production';

const BASE_URLS: Record<AppEnv, string> = {
  // Android emulator reaches the host machine via 10.0.2.2; devs on iOS
  // simulator or a real device override via EXPO_PUBLIC_API_URL
  development: 'http://localhost:3000',
  staging: 'https://staging-api.kurda.app',
  // The live API (KUR-008). Update to a custom domain once one points at it.
  production: 'https://kurda-api.onrender.com',
};

export function apiBaseUrl(env: AppEnv, override?: string): string {
  return override && override.length > 0 ? override : BASE_URLS[env];
}

/**
 * The API base URL to use when no explicit override (EXPO_PUBLIC_API_URL) is
 * baked into the build. A release build (preview / production, where __DEV__ is
 * false) must reach the live API — never localhost, which a real device can't
 * reach. Only an actual dev build (dev client / Metro) uses the local server.
 */
export function defaultApiBaseUrl(): string {
  return apiBaseUrl(__DEV__ ? 'development' : 'production');
}

/**
 * Where the site's static art lives.
 *
 * Cosmetic assets — default avatars, profile backgrounds, icons — are files
 * shipped with the website, not things the API serves. The API therefore hands
 * out site-relative paths like `/cosmetics/avatars/default-01.png`, which a
 * browser resolves against its own origin and a phone cannot resolve at all.
 */
const SITE_URL = 'https://mykurda.com';

/**
 * Make a URL the phone can actually load.
 *
 * Absolute URLs (an uploaded photo in object storage) are handed back
 * untouched; a site-relative path is resolved against the website, which is the
 * origin that serves it. The production site is used even in development
 * because these are public, immutable files — a local web server would only
 * make dev differ from release for no gain.
 */
export function assetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//')) return url;
  return `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}
