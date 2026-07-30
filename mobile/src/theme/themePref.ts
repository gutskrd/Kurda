import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'kurda_event_theme_optout_v1';

/**
 * Local persistence for the "opt out of event theming" preference (KUR-092).
 * Mirrors the token-storage split: keystore on device, localStorage on web.
 * Best-effort — any failure reads as "not opted out" so theming still works.
 */
export async function getThemeOptOut(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) === '1';
    return (await SecureStore.getItemAsync(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setThemeOptOut(optedOut: boolean): Promise<void> {
  const value = optedOut ? '1' : '0';
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, value);
    else await SecureStore.setItemAsync(KEY, value);
  } catch {
    // preference is a nicety; ignore persistence failures
  }
}
