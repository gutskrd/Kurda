import { Platform } from 'react-native';
import type { PersistedOnboarding } from './flow';

const KEY = 'kurda_onboarding_v1';

// Loaded lazily so the web bundle never evaluates the native module, whose web entry throws at import; only the
// native DeviceOnboardingStorage touches it.
type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
let cachedAsyncStorage: AsyncStorageLike | null = null;
function asyncStorage(): AsyncStorageLike {
  if (!cachedAsyncStorage) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedAsyncStorage = require('@react-native-async-storage/async-storage').default as AsyncStorageLike;
  }
  return cachedAsyncStorage;
}

/**
 * Stores the onboarding record: the completed flag and the preferred language. It uses AsyncStorage, not the
 * Keychain, because the flag must clear on uninstall so a reinstall shows onboarding again; the Keychain survives
 * uninstalls. Web falls back to localStorage. `clear()` backs Settings → Reset onboarding.
 */
export interface OnboardingStorage {
  get(): Promise<PersistedOnboarding | null>;
  set(value: PersistedOnboarding): Promise<void>;
  clear(): Promise<void>;
}

/** Device storage via AsyncStorage — cleared on uninstall (iOS plist / Android). */
export class DeviceOnboardingStorage implements OnboardingStorage {
  async get(): Promise<PersistedOnboarding | null> {
    const raw = await asyncStorage().getItem(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PersistedOnboarding;
    } catch {
      await asyncStorage().removeItem(KEY);
      return null;
    }
  }

  async set(value: PersistedOnboarding): Promise<void> {
    await asyncStorage().setItem(KEY, JSON.stringify(value));
  }

  async clear(): Promise<void> {
    await asyncStorage().removeItem(KEY);
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
  return Platform.OS === 'web' ? new WebOnboardingStorage() : new DeviceOnboardingStorage();
}
