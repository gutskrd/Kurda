import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { PersistedOnboarding } from './flow';

const KEY = 'kurda_onboarding_v1';

/**
 * Persists the first-launch onboarding record (KUR-271): the completed flag so
 * onboarding never shows again, plus the chosen preferred language (#184).
 * Mirrors the token-storage pattern (auth/storage.ts): keystore on device, a
 * localStorage fallback on web. `clear()` powers Settings → Reset onboarding
 * (#270), which makes the flow reappear on next launch.
 */
export interface OnboardingStorage {
  get(): Promise<PersistedOnboarding | null>;
  set(value: PersistedOnboarding): Promise<void>;
  clear(): Promise<void>;
}

/** Device storage via expo-secure-store (iOS Keychain / Android Keystore). */
export class SecureOnboardingStorage implements OnboardingStorage {
  async get(): Promise<PersistedOnboarding | null> {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PersistedOnboarding;
    } catch {
      await SecureStore.deleteItemAsync(KEY);
      return null;
    }
  }

  async set(value: PersistedOnboarding): Promise<void> {
    await SecureStore.setItemAsync(KEY, JSON.stringify(value));
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY);
  }
}

/** Web fallback — expo-secure-store throws on web; a first-launch flag is fine in localStorage. */
export class WebOnboardingStorage implements OnboardingStorage {
  async get(): Promise<PersistedOnboarding | null> {
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      return raw ? (JSON.parse(raw) as PersistedOnboarding) : null;
    } catch {
      return null;
    }
  }

  async set(value: PersistedOnboarding): Promise<void> {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(value));
  }

  async clear(): Promise<void> {
    globalThis.localStorage?.removeItem(KEY);
  }
}

export function createOnboardingStorage(): OnboardingStorage {
  return Platform.OS === 'web' ? new WebOnboardingStorage() : new SecureOnboardingStorage();
}
