import { DEVICE_NAME_MAX, deviceNameFrom } from '@kurda/shared';

/**
 * The name a session is listed under when the app sent none, read from the User-Agent ("Chrome on Windows" for a
 * browser; the phone app's networking only names the system). Undefined when the agent says nothing useful.
 */
export function sessionNameFromAgent(userAgent: unknown): string | undefined {
  if (typeof userAgent !== 'string' || userAgent.length === 0) return undefined;
  const ua = userAgent.slice(0, 512);
  const browser = deviceNameFrom(ua);
  if (browser) return browser;
  // React Native's fetch: OkHttp on Android, CFNetwork on iOS
  if (/\bokhttp\//i.test(ua)) return 'Hevalo app on Android';
  if (/\bCFNetwork\//.test(ua)) return 'Hevalo app on iOS';
  return undefined;
}

/** What the app said it is, or else what its User-Agent says: never longer than the API keeps. */
export function sessionName(sent: string | undefined, userAgent: unknown): string | undefined {
  const named = sent?.trim();
  return (named || sessionNameFromAgent(userAgent))?.slice(0, DEVICE_NAME_MAX);
}
