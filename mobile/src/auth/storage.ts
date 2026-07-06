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
