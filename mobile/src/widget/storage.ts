import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { extensionStorage } from './appGroup';
import { APP_GROUP, WIDGET_KEYS, type WidgetConfig } from './contract';

/**
 * Where the app leaves the widget what it needs, and finds what the widget
 * left for it.
 *
 * On iPhone that is the App Group the app shares with its widget extension
 * (UserDefaults under `APP_GROUP`), the only place both can read: the
 * extension is another program, and the app's keychain is not its to open.
 * On Android the widget is drawn by this app's own code in the background,
 * so it is the app's own keystore, beside the session's tokens.
 *
 * The token is a credential, if a small one (it reads one letter and nothing
 * else of the account): it is never logged, and it leaves the phone only in
 * the header of the widget's own requests.
 */

/** Where things go on this phone: the App Group on iPhone (none there only in a build without the widget), else the keystore. */
function place(): 'group' | 'keystore' | 'none' {
  if (Platform.OS !== 'ios') return 'keystore';
  return extensionStorage() ? 'group' : 'none';
}

async function getItem(key: string): Promise<string | null> {
  try {
    switch (place()) {
      case 'group':
        return extensionStorage()?.get(key, APP_GROUP) ?? null;
      case 'keystore':
        return await SecureStore.getItemAsync(key);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  try {
    const where = place();
    if (where === 'group') extensionStorage()?.setString(key, value, APP_GROUP);
    else if (where === 'keystore') await SecureStore.setItemAsync(key, value);
  } catch {
    // the widget then reads as signed out, and the app tries again next time it is open
  }
}

async function removeItem(key: string): Promise<void> {
  try {
    const where = place();
    if (where === 'group') extensionStorage()?.remove(key, APP_GROUP);
    else if (where === 'keystore') await SecureStore.deleteItemAsync(key);
  } catch {
    // nothing there to take away
  }
}

/** What the widget reads now, or null when it has nothing to read with (signed out, or no token yet). */
export async function readWidgetConfig(): Promise<WidgetConfig | null> {
  const [token, apiBase, locale] = await Promise.all([getItem(WIDGET_KEYS.token), getItem(WIDGET_KEYS.apiBase), getItem(WIDGET_KEYS.locale)]);
  return token && apiBase ? { token, apiBase, locale: locale ?? 'en' } : null;
}

/** Leave the widget a token (a new one clears the widget's note that the last was refused). */
export async function writeWidgetConfig(config: WidgetConfig): Promise<void> {
  await setItem(WIDGET_KEYS.apiBase, config.apiBase);
  await setItem(WIDGET_KEYS.locale, config.locale);
  await setItem(WIDGET_KEYS.token, config.token);
  await removeItem(WIDGET_KEYS.rejected);
}

/** The language the widget's own few words are in: the app's, which need not be the phone's. */
export async function writeWidgetLocale(locale: string): Promise<void> {
  await setItem(WIDGET_KEYS.locale, locale);
}

/** Take everything away: the widget then says to open Hevalo. */
export async function clearWidgetConfig(): Promise<void> {
  await Promise.all([removeItem(WIDGET_KEYS.token), removeItem(WIDGET_KEYS.apiBase), removeItem(WIDGET_KEYS.rejected)]);
}

/** Whether the widget found its token refused by the server since the app last made one. */
export async function widgetTokenRejected(): Promise<boolean> {
  return (await getItem(WIDGET_KEYS.rejected)) === '1';
}

/** The widget's note that its token was refused (Android: the widget is this app's own code, and says so here). */
export async function markWidgetTokenRejected(): Promise<void> {
  await setItem(WIDGET_KEYS.rejected, '1');
}
