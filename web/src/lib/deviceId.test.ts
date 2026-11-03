import { describe, it, expect, vi, afterEach } from 'vitest';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A fresh copy of the module, as a new page load would have. */
async function fresh(): Promise<typeof import('./deviceId')> {
  vi.resetModules();
  return import('./deviceId');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.cookie = 'hevalo_device_id=; Max-Age=0; Path=/';
});

describe('deviceId', () => {
  it('is a random UUID, kept for the next visit', async () => {
    const first = (await fresh()).deviceId();
    expect(first).toMatch(V4);
    expect(localStorage.getItem('hevalo_device_id')).toBe(first);
    // a new page load reads the same one back
    expect((await fresh()).deviceId()).toBe(first);
  });

  it('answers the same for the life of the page', async () => {
    const { deviceId } = await fresh();
    expect(deviceId()).toBe(deviceId());
  });

  it('keeps one that is already there', async () => {
    localStorage.setItem('hevalo_device_id', 'an-earlier-id');
    expect((await fresh()).deviceId()).toBe('an-earlier-id');
  });

  it('replaces a stored value too long to send', async () => {
    localStorage.setItem('hevalo_device_id', 'x'.repeat(201));
    expect((await fresh()).deviceId()).toMatch(V4);
  });

  /** Safari drops script-written storage it thinks idle; the cookie copy keeps the device recognised. */
  it('keeps a cookie copy, and falls back to it when localStorage is purged', async () => {
    const first = (await fresh()).deviceId();
    expect(document.cookie).toContain(`hevalo_device_id=${first}`);
    localStorage.clear(); // the browser purged it; the cookie survived
    expect((await fresh()).deviceId()).toBe(first);
    // and the id is put back for next time
    expect(localStorage.getItem('hevalo_device_id')).toBe(first);
  });

  it('prefers the localStorage id and repairs the cookie copy from it', async () => {
    localStorage.setItem('hevalo_device_id', 'an-earlier-id');
    document.cookie = 'hevalo_device_id=a-stale-cookie; Path=/';
    expect((await fresh()).deviceId()).toBe('an-earlier-id');
    expect(document.cookie).toContain('hevalo_device_id=an-earlier-id');
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

  it('is still a v4 UUID outside a secure context, where randomUUID is missing', async () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    expect((await fresh()).deviceId()).toMatch(V4);
  });
});
