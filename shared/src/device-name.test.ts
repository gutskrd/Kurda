import { describe, it, expect } from 'vitest';
import { DEVICE_NAME_MAX, deviceNameFrom } from './device-name.js';

/** Real user agents, as each browser sends them. */
const AGENTS: Array<[string, string, string | null]> = [
  ['Chrome on Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 'Chrome on Windows'],
  ['Edge on Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.2792.79', 'Edge on Windows'],
  ['Firefox on Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox on Windows'],
  ['Opera on Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/114.0.0.0', 'Opera on Windows'],
  ['Safari on a Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'Safari on Mac'],
  ['Chrome on a Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 'Chrome on Mac'],
  ['Safari on an iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari on iPhone'],
  ['Chrome on an iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1', 'Chrome on iPhone'],
  ['Firefox on an iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15', 'Firefox on iPhone'],
  ['Safari on an older iPad', 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1', 'Safari on iPad'],
  ['Chrome on Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.81 Mobile Safari/537.36', 'Chrome on Android'],
  ['Samsung Internet', 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36', 'Samsung Internet on Android'],
  ['Firefox on Android', 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0', 'Firefox on Android'],
  ['Chrome on a Chromebook', 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 'Chrome on ChromeOS'],
  ['Firefox on Linux', 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox on Linux'],
  ['a system with no browser named', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)', 'Linux'],
  ['nothing to go on', 'curl/8.4.0', null],
  ['an empty string', '', null],
];

describe('deviceNameFrom', () => {
  for (const [what, ua, expected] of AGENTS) {
    it(`names ${what}`, () => {
      expect(deviceNameFrom(ua)).toBe(expected);
    });
  }

  /** iPadOS asks for desktop pages, so its user agent is a Mac's; only touch tells them apart. */
  it('tells an iPad from a Mac by its touch screen', () => {
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    expect(deviceNameFrom(ipad, 5)).toBe('Safari on iPad');
    expect(deviceNameFrom(ipad, 0)).toBe('Safari on Mac');
  });

  it('keeps no versions or models, and stays inside what the server stores', () => {
    for (const [, ua] of AGENTS) {
      const name = deviceNameFrom(ua);
      if (name === null) continue;
      expect(name.length).toBeLessThanOrEqual(DEVICE_NAME_MAX);
      expect(name).not.toMatch(/\d/);
    }
    // a hostile, enormous user agent is read only as far as it needs to be
    expect(deviceNameFrom(`${'x'.repeat(100_000)} Firefox/1`)).toBeNull();
  });
});
