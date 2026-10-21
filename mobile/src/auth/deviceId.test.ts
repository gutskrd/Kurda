import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_ID_MAX, forgetDeviceId, isDeviceId, loadDeviceId, newDeviceId, uuidFromBytes, type DeviceIdStore } from './deviceId';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A keystore that remembers, and counts how often it was asked. */
function memoryStore(initial: string | null = null) {
  let value = initial;
  const store = {
    get: vi.fn(async () => value),
    set: vi.fn(async (id: string) => {
      value = id;
    }),
  };
  return store satisfies DeviceIdStore;
}

afterEach(() => forgetDeviceId());

describe('a new device id', () => {
  it('is a version 4 UUID built from sixteen random bytes', () => {
    expect(uuidFromBytes(new Uint8Array(16).fill(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(uuidFromBytes(new Uint8Array(16))).toMatch(V4);
  });

  it('comes from the native generator first, then randomUUID, then getRandomValues', () => {
    const randomUUID = () => 'from-random-uuid';
    const getRandomValues = (a: Uint8Array) => a.fill(7);
    expect(newDeviceId({ expo: { uuidv4: () => 'from-expo' }, crypto: { randomUUID, getRandomValues } })).toBe('from-expo');
    expect(newDeviceId({ crypto: { randomUUID, getRandomValues } })).toBe('from-random-uuid');
    expect(newDeviceId({ crypto: { getRandomValues } })).toBe(uuidFromBytes(new Uint8Array(16).fill(7)));
  });

  /*
   * Hermes has no global crypto at all. Whatever is missing or throws, an id
   * still comes back, because a request with none is a device the server
   * cannot recognise next time.
   */
  it('still makes one when every source is missing or throws', () => {
    const broken = {
      expo: { uuidv4: () => { throw new Error('no native module'); } },
      crypto: { randomUUID: () => { throw new Error('insecure context'); } },
    };
    expect(newDeviceId(broken)).toMatch(V4);
    expect(newDeviceId({})).toMatch(V4);
    expect(newDeviceId({})).not.toBe(newDeviceId({}));
  });

  it('is 1–200 printable characters, as the server and a header ask', () => {
    expect(isDeviceId(newDeviceId())).toBe(true);
    expect(isDeviceId('')).toBe(false);
    expect(isDeviceId('   ')).toBe(false);
    expect(isDeviceId('x'.repeat(DEVICE_ID_MAX))).toBe(true);
    expect(isDeviceId('x'.repeat(DEVICE_ID_MAX + 1))).toBe(false);
    expect(isDeviceId(null)).toBe(false);
    // it travels as a header
    expect(isDeviceId('café-phone')).toBe(false);
    expect(isDeviceId('two words')).toBe(false);
  });
});

describe('the stored device id', () => {
  it('is made once on a first launch and stored', async () => {
    const store = memoryStore();
    const id = await loadDeviceId(store, () => 'first-launch');
    expect(id).toBe('first-launch');
    expect(store.set).toHaveBeenCalledWith('first-launch');
  });

  it('is the same one on every launch after', async () => {
    const store = memoryStore();
    const first = await loadDeviceId(store);
    forgetDeviceId(); // the app is closed and opened again
    const second = await loadDeviceId(store, () => 'a-different-one');
    expect(second).toBe(first);
    expect(store.set).toHaveBeenCalledTimes(1);
  });

  it('is read from the keystore once, then held in memory', async () => {
    const store = memoryStore('kept-id');
    const ids = await Promise.all([loadDeviceId(store), loadDeviceId(store), loadDeviceId(store)]);
    await loadDeviceId(store);
    expect(ids).toEqual(['kept-id', 'kept-id', 'kept-id']);
    expect(store.get).toHaveBeenCalledTimes(1);
  });

  it('uses an id held in memory for the session when the keystore cannot be read', async () => {
    const store: DeviceIdStore = { get: () => Promise.reject(new Error('keychain locked')), set: vi.fn(async () => undefined) };
    const id = await loadDeviceId(store, () => 'in-memory');
    expect(id).toBe('in-memory');
    expect(await loadDeviceId(store, () => 'another')).toBe('in-memory');
  });

  it('keeps the new id for the session when it cannot be written', async () => {
    const store: DeviceIdStore = { get: async () => null, set: () => Promise.reject(new Error('keystore full')) };
    const id = await loadDeviceId(store, () => 'unsaved');
    expect(id).toBe('unsaved');
    expect(await loadDeviceId(store)).toBe('unsaved');
  });

  it('replaces a stored value the server would refuse', async () => {
    const store = memoryStore('x'.repeat(DEVICE_ID_MAX + 1));
    expect(await loadDeviceId(store, () => 'fresh')).toBe('fresh');
    expect(store.set).toHaveBeenCalledWith('fresh');
  });
});
