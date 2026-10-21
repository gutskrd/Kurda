/**
 * This install's device id, for the `X-Device-Id` header.
 *
 * The server keeps a separate budget of failed sign-ins for a device that has
 * signed in to an account before, so somebody typing the owner's address with
 * wrong passwords from elsewhere cannot lock the owner out of their own phone;
 * and it emails the owner when an account is signed in to from a device it
 * has not seen. Both need the phone to say which device it is, the same way
 * every time.
 *
 * The id is a random UUID made once and kept beside the tokens, so it says
 * nothing about the phone or the person. It is not cleared on sign-out: the
 * point is that the next sign-in from here is recognised. It is never logged.
 *
 * No React Native in here, so the tests can run it under Node; the stores are
 * in `storage.ts`.
 */

/** The longest id the server accepts (api/src/auth/routes.ts). */
export const DEVICE_ID_MAX = 200;

export interface DeviceIdStore {
  get(): Promise<string | null>;
  set(id: string): Promise<void>;
}

interface RandomSource {
  crypto?: { randomUUID?: () => string; getRandomValues?: (array: Uint8Array) => Uint8Array };
  /** Expo's own native generator, which every Expo app installs at start-up */
  expo?: { uuidv4?: () => string };
}

/**
 * A stored value the server would take: 1–200 characters. Printable ASCII
 * only, too, since it travels as a header and a corrupt value would otherwise
 * make every request fail before it left the phone.
 */
export function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= DEVICE_ID_MAX && /^[!-~]+$/.test(value);
}

/** A version 4 UUID from sixteen random bytes. */
export function uuidFromBytes(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A new id, from the best source the runtime has.
 *
 * Hermes has no global `crypto`, so on a phone the native generator is the
 * one that answers; a browser and Node have `crypto.randomUUID`, and an older
 * browser at least `getRandomValues`. Math.random is the last resort only, so
 * that a runtime with none of these still gets an id rather than none.
 */
export function newDeviceId(source: RandomSource = globalThis as RandomSource): string {
  const attempts: Array<() => string | undefined> = [
    () => source.expo?.uuidv4?.(),
    () => source.crypto?.randomUUID?.(),
    () => {
      const fill = source.crypto?.getRandomValues;
      return fill ? uuidFromBytes(fill.call(source.crypto, new Uint8Array(16))) : undefined;
    },
  ];
  for (const attempt of attempts) {
    try {
      const id = attempt();
      if (isDeviceId(id)) return id;
    } catch {
      // that source is missing or broken here; the next one answers
    }
  }
  return uuidFromBytes(Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)));
}

let pending: Promise<string> | null = null;

/**
 * The id, read once and then held in memory for every request after.
 *
 * A first launch makes one and stores it. If the store cannot be read or
 * written (a locked keychain, a broken keystore) the id made here is used for
 * as long as the app is open rather than sending none, and the store is
 * tried again next launch.
 */
export function loadDeviceId(store: DeviceIdStore, make: () => string = newDeviceId): Promise<string> {
  pending ??= (async () => {
    let stored: string | null = null;
    try {
      stored = await store.get();
    } catch {
      return make();
    }
    if (isDeviceId(stored)) return stored;
    const id = make();
    try {
      await store.set(id);
    } catch {
      // kept in memory for this session only
    }
    return id;
  })();
  return pending;
}

/** Forget the id held in memory, so a test can start from a fresh launch. */
export function forgetDeviceId(): void {
  pending = null;
}
