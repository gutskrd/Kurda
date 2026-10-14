import { Platform } from 'react-native';

/**
 * A few small values kept on this device: keyboard settings, a composer
 * draft, whether the keyboard guide has been shown.
 *
 * AsyncStorage on a phone (it lives in the app's own container, so it goes
 * with an uninstall, which is right for preferences about this device), the
 * browser's localStorage on the web build. Every read and write is allowed to
 * fail — a private window, a full disk, the native module missing in a test —
 * and failing means "nothing saved", never an error on screen: these are
 * conveniences, and the app works the same without them.
 */
export interface DeviceStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// Loaded lazily, as onboarding/storage.ts does: the web bundle must never
// evaluate the native module, whose web entry throws when it is imported.
let native: AsyncStorageLike | null = null;
function asyncStorage(): AsyncStorageLike {
  if (!native) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    native = require('@react-native-async-storage/async-storage').default as AsyncStorageLike;
  }
  return native;
}

function backend(): AsyncStorageLike | null {
  if (Platform.OS === 'web') {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return null;
    return {
      getItem: async (k) => ls.getItem(k),
      setItem: async (k, v) => ls.setItem(k, v),
      removeItem: async (k) => ls.removeItem(k),
    };
  }
  return asyncStorage();
}

export const deviceStore: DeviceStore = {
  async get(key) {
    try {
      return (await backend()?.getItem(key)) ?? null;
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      await backend()?.setItem(key, value);
    } catch {
      // a preference that could not be saved is used for this session only
    }
  },
  async remove(key) {
    try {
      await backend()?.removeItem(key);
    } catch {
      // nothing to do: it was either never there or cannot be reached
    }
  },
};

/** A store that forgets, for tests and for code that wants one. */
export function memoryStore(seed: Record<string, string> = {}): DeviceStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => {
      data.set(k, v);
    },
    remove: async (k) => {
      data.delete(k);
    },
  };
}
