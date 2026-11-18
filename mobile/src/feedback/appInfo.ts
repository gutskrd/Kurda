import type { AppPlatform } from '@kurda/shared';
import appJson from '../../app.json';

/**
 * What the feedback inbox and store prompt need to know about the app, read from app.json. The phone has no
 * over-the-air updates (expo-updates is not installed), so that version is the one running, and "once per app
 * version" means once per store release.
 */
interface AppJson {
  expo: { version?: string; ios?: { appStoreUrl?: string }; android?: { playStoreUrl?: string } };
}

const config = (appJson as AppJson).expo;

export const APP_VERSION: string = config.version ?? '0.0.0';

/**
 * The running binary's build number (CFBundleVersion on iOS, the version code on Android), or null. It is not in
 * app.json because store builds are numbered remotely. It is read from the Application native module, which every
 * build carries as a dependency of the notifications package, directly from the native module registry rather
 * than the package's JavaScript, which this app does not list. Where the module is missing (tests, the web
 * preview) it is null.
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
 * Where "Rate Hevalo" goes: the store page at its review section (`action=write-review` on the App Store, the
 * reviews on Google Play). Null until the store addresses are set in app.json (`expo.ios.appStoreUrl`,
 * `expo.android.playStoreUrl`), and the row is hidden until then.
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
