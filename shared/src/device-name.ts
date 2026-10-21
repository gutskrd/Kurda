/**
 * A name for a browser that its owner will recognise in Settings → signed-in
 * devices: "Chrome on Windows", "Safari on iPhone". The website and the admin
 * console name themselves with it when they sign in, and the server names a
 * session with it from the request when an app sent no name of its own.
 *
 * Read from the user agent, by a short list of patterns and nothing cleverer.
 * Only the browser's family and the kind of system are kept — no versions, no
 * models — because the name is for recognising a device, not for describing it.
 * Order matters: Edge, Opera and Samsung Internet all say "Chrome" too, and
 * every browser on an iPhone says "Safari".
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

/**
 * The name, or null when the user agent says too little to be worth sending.
 * `touchPoints` tells an iPad from a Mac: iPadOS asks for desktop pages, so
 * its user agent says "Macintosh", and only a touch screen gives it away.
 */
export function deviceNameFrom(userAgent: string, touchPoints = 0): string | null {
  const ua = userAgent.slice(0, 512);
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null;
  let system = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? null;
  if (system === 'Mac' && touchPoints > 1) system = 'iPad';
  const name = browser && system ? `${browser} on ${system}` : (browser ?? system);
  return name ? name.slice(0, DEVICE_NAME_MAX) : null;
}
