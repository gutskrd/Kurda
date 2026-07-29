import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { LOCALES, type Locale } from './translations.js';

const KEY = 'kurda_locale_v1';

function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/**
 * Best-effort device locale mapped to a supported one, else English. Uses Intl
 * (no extra native dep); only the primary subtag matters ("de-DE" → "de").
 */
export function deviceLocale(): Locale {
  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions().locale;
    const primary = resolved.split('-')[0]?.toLowerCase();
    return isLocale(primary) ? primary : 'en';
  } catch {
    return 'en';
  }
}

export async function getSavedLocale(): Promise<Locale | null> {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function setSavedLocale(locale: Locale): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, locale);
    else await SecureStore.setItemAsync(KEY, locale);
  } catch {
    // preference persistence is a nicety; ignore failures
  }
}
