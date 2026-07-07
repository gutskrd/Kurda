import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { TokenPair, TokenStorage } from '../api/types';

const KEY = 'kurda_tokens_v1';

/**
 * Persists the token pair in the platform keystore (iOS Keychain /
 * Android Keystore via expo-secure-store) so sessions survive app
 * restarts without ever touching plain AsyncStorage.
 */
export class SecureTokenStorage implements TokenStorage {
  async get(): Promise<TokenPair | null> {
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
    await SecureStore.setItemAsync(KEY, JSON.stringify(tokens));
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY);
  }
}

/**
 * Web fallback: browsers have no Keychain, and expo-secure-store throws
 * on web. localStorage is acceptable for the secondary web target (same
 * threat model as any web app's session token); mobile remains the
 * primary, keystore-backed platform.
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
