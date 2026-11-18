import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_PREFERENCE, normalizePreference, type ThemePreference } from './appearance';

const KEY = 'kurda_theme_pref_v1';

/** Stores the light/dark/system preference: keystore on device, localStorage on web. */
interface ThemeModeStore {
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
          return DEFAULT_PREFERENCE;
        }
      },
      async set(value) {
        try {
          globalThis.localStorage?.setItem(KEY, value);
        } catch {
          /* A preference is a nicety; storage failures are ignored. */
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
