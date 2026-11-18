import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { TokenPair, TokenStorage } from '../api/types';
import { newDeviceId, type DeviceIdStore } from './deviceId';
import { checkInstall, type InstallKeychain, type InstallLocalStore } from './install';

const KEY = 'kurda_tokens_v1';
const DEVICE_KEY = 'kurda_device_id_v1';

// Loaded lazily, as onboarding/storage.ts does: the web bundle must never evaluate the native module, whose web entry
// throws on import.
let localStore: InstallLocalStore | null = null;
function appStorage(): InstallLocalStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  localStore ??= require('@react-native-async-storage/async-storage').default as InstallLocalStore;
  return localStore;
}

const keychain: InstallKeychain = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
};

let installChecked: Promise<unknown> | null = null;

/**
 * Once per start, before the session or device id is first read or written on a phone: those an earlier install left in
 * the Keychain are forgotten (install.ts).
 */
function afterInstallCheck(): Promise<unknown> {
  // A missing native module is a check that could not be made, not a session that cannot be read.
  installChecked ??= Promise.resolve()
    .then(() => checkInstall({ local: appStorage(), keychain }, [KEY, DEVICE_KEY], newDeviceId))
    .catch(() => 'unknown');
  return installChecked;
}

/**
 * Keeps the token pair in the platform keystore (iOS Keychain, Android Keystore via expo-secure-store), never in plain
 * AsyncStorage.
 */
export class SecureTokenStorage implements TokenStorage {
  async get(): Promise<TokenPair | null> {
    await afterInstallCheck();
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TokenPair;
    } catch {
      await SecureStore.deleteItemAsync(KEY);
      return null;
    }
  }

  async set(tokens: TokenPair): Promise<void> {
    await afterInstallCheck();
    await SecureStore.setItemAsync(KEY, JSON.stringify(tokens));
  }

  async clear(): Promise<void> {
    await afterInstallCheck();
    await SecureStore.deleteItemAsync(KEY);
  }
}

/**
 * Web fallback: browsers have no Keychain and expo-secure-store throws on web; localStorage carries the usual web
 * session-token threat model for this secondary target.
 */
export class WebTokenStorage implements TokenStorage {
  async get(): Promise<TokenPair | null> {
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      return raw ? (JSON.parse(raw) as TokenPair) : null;
    } catch {
      return null;
    }
  }

  async set(tokens: TokenPair): Promise<void> {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(tokens));
  }

  async clear(): Promise<void> {
    globalThis.localStorage?.removeItem(KEY);
  }
}

export function createTokenStorage(): TokenStorage {
  return Platform.OS === 'web' ? new WebTokenStorage() : new SecureTokenStorage();
}

/**
 * Where this install's device id is kept (auth/deviceId.ts): the keystore on a phone, localStorage on the web. Either
 * may throw; the caller falls back to an id held in memory.
 */
export function createDeviceIdStore(): DeviceIdStore {
  if (Platform.OS === 'web') {
    return {
      get: async () => globalThis.localStorage?.getItem(DEVICE_KEY) ?? null,
      set: async (id) => globalThis.localStorage?.setItem(DEVICE_KEY, id),
    };
  }
  return {
    get: () => afterInstallCheck().then(() => SecureStore.getItemAsync(DEVICE_KEY)),
    set: (id) => afterInstallCheck().then(() => SecureStore.setItemAsync(DEVICE_KEY, id)),
  };
}
