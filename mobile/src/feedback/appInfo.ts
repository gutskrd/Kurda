import type { AppPlatform } from '@kurda/shared';
import appJson from '../../app.json';

/**
 * What the feedback inbox and the store prompt need to know about this app.
 *
 * Read from app.json, which is what the build was made from: the phone has no
 * over-the-air updates (expo-updates is not installed), so the version there is
 * the version running — and "once per app version" for the store prompt means
 * once per store release.
 */
interface AppJson {
  expo: { version?: string; ios?: { appStoreUrl?: string }; android?: { playStoreUrl?: string } };
}

const config = (appJson as AppJson).expo;

export const APP_VERSION: string = config.version ?? '0.0.0';

/**
 * The build number of the binary that is running (CFBundleVersion on iOS, the
 * version code on Android), or null where there is none to read.
 *
 * It is not in app.json: the store builds number themselves remotely, so only
 * the binary knows it. It is read from the Application native module, which
 * every build already carries because the notifications package depends on
 * it, straight from where Expo installs its native modules rather than through
 * the package's JavaScript, which this app does not list. Where the module is
 * missing (a test, the web preview) the answer is null, and whoever shows the
 * version shows it without the build.
 */
export function nativeBuildNumber(
  modules: Record<string, unknown> | undefined = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules,
): string | null {
  try {
    const build = (modules?.ExpoApplication as { nativeBuildVersion?: unknown } | undefined)?.nativeBuildVersion;
    return typeof build === 'string' && build.trim() ? build.trim() : typeof build === 'number' ? String(build) : null;
  } catch {
    return null;
  }
}

export function appPlatform(os: string): AppPlatform {
  return os === 'ios' ? 'ios' : os === 'android' ? 'android' : 'web';
}

/**
 * Where "Rate Hevalo" in Settings goes: the store page, opened at the place to
 * write a review (`action=write-review` on the App Store, the reviews on
 * Google Play). Null until the owner puts the store addresses in app.json
 * (`expo.ios.appStoreUrl`, `expo.android.playStoreUrl`, empty until the app is
 * listed) — and then the row is simply not there, rather than a row that goes
 * nowhere.
 */
export function rateUrl(
  os: string,
  urls: { ios?: string; android?: string } = { ios: config.ios?.appStoreUrl, android: config.android?.playStoreUrl },
): string | null {
  const add = (url: string, param: string) => `${url}${url.includes('?') ? '&' : '?'}${param}`;
  if (os === 'ios' && urls.ios?.startsWith('https://')) return add(urls.ios, 'action=write-review');
  if (os === 'android' && urls.android?.startsWith('https://')) return add(urls.android, 'showAllReviews=true');
  return null;
}
