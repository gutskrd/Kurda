import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { normalizePreference, type ThemePreference } from './appearance';

const KEY = 'kurda_theme_pref_v1';

/**
 * Persists the light/dark/system preference (KUR-268). Mirrors the onboarding/
 * token storage pattern: keystore on device, localStorage on web.
 */
export interface ThemeModeStore {
  get(): Promise<ThemePreference>;
  set(value: ThemePreference): Promise<void>;
}

export function createThemeModeStore(): ThemeModeStore {
  if (Platform.OS === 'web') {
    return {
      async get() {
        try {
          return normalizePreference(globalThis.localStorage?.getItem(KEY));
        } catch {
          return 'system';
        }
      },
      async set(value) {
        try {
          globalThis.localStorage?.setItem(KEY, value);
        } catch {
          /* preference is a nicety; ignore persistence failures */
        }
      },
    };
  }
  return {
    async get() {
      return normalizePreference(await SecureStore.getItemAsync(KEY));
    },
    async set(value) {
      await SecureStore.setItemAsync(KEY, value);
    },
  };
}
