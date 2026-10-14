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
