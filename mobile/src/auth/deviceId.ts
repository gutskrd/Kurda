/**
 * This install's device id, for the `X-Device-Id` header. The server keeps a separate failed-sign-in budget for a
 * device that has signed in before, so wrong passwords from elsewhere cannot lock the owner out, and emails the owner
 * about sign-ins from unseen devices; both need a stable id.
 *
 * The id is a random UUID made once and kept beside the tokens, so it says nothing about the phone or the person. It
 * survives sign-out so the next sign-in is recognised; a reinstall forgets it with the session (install.ts). It is
 * never logged. No React Native here, so tests run it under Node; the stores are in `storage.ts`.
 */

/** The longest id the server accepts (api/src/auth/routes.ts). */
export const DEVICE_ID_MAX = 200;

export interface DeviceIdStore {
  get(): Promise<string | null>;
  set(id: string): Promise<void>;
}

interface RandomSource {
  crypto?: { randomUUID?: () => string; getRandomValues?: (array: Uint8Array) => Uint8Array };
  /** Expo's own native generator, which every Expo app installs at start-up. */
  expo?: { uuidv4?: () => string };
}

/**
 * A stored value the server would take: 1–200 characters of printable ASCII, since it travels as a header and a corrupt
 * value would make every request fail.
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
 * A new id from the best source the runtime has: Hermes has no global `crypto`, so on a phone the native generator
 * answers; browsers and Node have `crypto.randomUUID` or `getRandomValues`. Math.random is only the last resort.
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
      // That source is missing or broken here; the next one answers.
    }
  }
  return uuidFromBytes(Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)));
}

let pending: Promise<string> | null = null;

/**
 * The id, read once and then held in memory. A first launch makes and stores one. If the store cannot be read (a locked
 * keychain, an entry that no longer decrypts) a fresh id is made and still written, since an unreadable entry can often
 * be overwritten; without that every launch would be a new device. Only if the write fails too does the id live just
 * for this session.
 */
export function loadDeviceId(store: DeviceIdStore, make: () => string = newDeviceId): Promise<string> {
  pending ??= (async () => {
    let stored: string | null = null;
    try {
      stored = await store.get();
    } catch {
      // Fall through: a fresh id, offered to the store below.
    }
    if (isDeviceId(stored)) return stored;
    const id = make();
    try {
      await store.set(id);
    } catch {
      // Kept in memory for this session only.
    }
    return id;
  })();
  return pending;
}

/** Forget the id held in memory, so a test can start from a fresh launch. */
export function forgetDeviceId(): void {
  pending = null;
}
