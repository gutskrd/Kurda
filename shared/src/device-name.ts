/**
 * A name its owner will recognise in Settings → signed-in devices: the browser's family and the kind of system, without
 * versions or models. The website and the admin console send it on sign-in, and the server derives one from the request
 * when an app sent none. Read from the user agent by a short pattern list in which order matters, since several browsers
 * also claim to be more common ones.
 */
const BROWSERS: Array<[RegExp, string]> = [
  [/\bEdg(e|A|iOS)?\//, 'Edge'],
  [/\b(OPR|OPT|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(Firefox|FxiOS)\//, 'Firefox'],
  [/\b(Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'Mac'],
  [/\bLinux\b/, 'Linux'],
];

/** The longest name the API keeps (api/src/auth/routes.ts, `deviceName`). */
export const DEVICE_NAME_MAX = 80;

/** The name, or null when the user agent says too little. `touchPoints` tells an iPad from a Mac, whose user agents are the same. */
export function deviceNameFrom(userAgent: string, touchPoints = 0): string | null {
  const ua = userAgent.slice(0, 512);
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null;
  let system = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? null;
  if (system === 'Mac' && touchPoints > 1) system = 'iPad';
  const name = browser && system ? `${browser} on ${system}` : (browser ?? system);
  return name ? name.slice(0, DEVICE_NAME_MAX) : null;
}
