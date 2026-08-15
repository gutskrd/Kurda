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
