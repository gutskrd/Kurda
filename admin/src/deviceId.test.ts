// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A fresh copy of the module, as a new page load would have. */
async function fresh(): Promise<typeof import('./deviceId')> {
  vi.resetModules();
  return import('./deviceId');
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.cookie = 'kurda_admin_device_id=; Max-Age=0; Path=/';
});

describe('deviceId', () => {
  it('is a random UUID, kept in localStorage and a cookie for the next visit', async () => {
    const first = (await fresh()).deviceId();
    expect(first).toMatch(V4);
    expect(localStorage.getItem('kurda_admin_device_id')).toBe(first);
    expect(document.cookie).toContain(`kurda_admin_device_id=${first}`);
    // a new page load reads the same one back
    expect((await fresh()).deviceId()).toBe(first);
  });

  it('keeps one that is already there', async () => {
    localStorage.setItem('kurda_admin_device_id', 'an-earlier-id');
    expect((await fresh()).deviceId()).toBe('an-earlier-id');
  });

  /** Safari drops script-written storage it thinks idle; the cookie copy keeps the device recognised. */
  it('falls back to the cookie copy when localStorage is purged, and puts the id back', async () => {
    const first = (await fresh()).deviceId();
    localStorage.clear(); // the browser purged it; the cookie survived
    expect((await fresh()).deviceId()).toBe(first);
    expect(localStorage.getItem('kurda_admin_device_id')).toBe(first);
  });

  /** A private window, or a browser that refuses storage: an id for this tab only. */
  it('lives in memory where storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'QuotaExceededError');
    });
    const { deviceId } = await fresh();
    const id = deviceId();
    expect(id).toMatch(V4);
    expect(deviceId()).toBe(id);
  });
});
