export type AppEnv = 'development' | 'staging' | 'production';

const BASE_URLS: Record<AppEnv, string> = {
  // Android emulator reaches the host machine via 10.0.2.2; devs on iOS
  // simulator or a real device override via EXPO_PUBLIC_API_URL
  development: 'http://localhost:3000',
  staging: 'https://staging-api.kurda.app',
  production: 'https://api.kurda.app',
};

export function apiBaseUrl(env: AppEnv, override?: string): string {
  return override && override.length > 0 ? override : BASE_URLS[env];
}
