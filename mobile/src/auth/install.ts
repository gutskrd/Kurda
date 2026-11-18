/**
 * Whether the session kept on this phone belongs to this install. The iPhone Keychain, where the session is kept,
 * outlives an uninstall while the app's own storage does not, so a reinstall on a passed-on phone could open the
 * previous owner's account. Each install writes an id to both, compared on start: the same id means the same install;
 * an id in the Keychain only means an earlier install, whose session and device id are forgotten; an id in neither
 * means a first start or a new install, and the session is kept (an update must not sign out a guest, who has no way
 * back in). Anything unreadable changes nothing. No React Native here, so tests run it under Node.
 */

/** Where this install's id is kept, under the same name in both stores. */
export const INSTALL_KEY = 'kurda_install_v1';

/** The app's own storage, which an uninstall clears. */
export interface InstallLocalStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** The Keychain (or the Android keystore), which an uninstall may leave behind. */
export interface InstallKeychain {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * What the check found: the same install, a first start that kept the session, an earlier install's session forgotten,
 * or nothing readable.
 */
export type InstallCheck = 'same' | 'first' | 'reinstalled' | 'unknown';

export async function checkInstall(
  stores: { local: InstallLocalStore; keychain: InstallKeychain },
  /** The Keychain entries that belong to one install: the session, and its device id. */
  sessionKeys: readonly string[],
  makeId: () => string,
): Promise<InstallCheck> {
  let local: string | null;
  let kept: string | null;
  try {
    local = await stores.local.getItem(INSTALL_KEY);
    kept = await stores.keychain.get(INSTALL_KEY);
  } catch {
    return 'unknown';
  }
  if (local) {
    // The Keychain lost its copy, or never had one: it is this install's.
    if (kept !== local) await stores.keychain.set(INSTALL_KEY, local).catch(() => undefined);
    return 'same';
  }
  const reinstalled = kept !== null;
  if (reinstalled) {
    for (const key of sessionKeys) await stores.keychain.remove(key).catch(() => undefined);
  }
  const id = makeId();
  try {
    await stores.local.setItem(INSTALL_KEY, id);
  } catch {
    // The Keychain keeps no id either, or the next start would find its copy alone, take it for an earlier install's
    // and sign out again every start.
    await stores.keychain.remove(INSTALL_KEY).catch(() => undefined);
    return reinstalled ? 'reinstalled' : 'first';
  }
  await stores.keychain.set(INSTALL_KEY, id).catch(() => undefined);
  return reinstalled ? 'reinstalled' : 'first';
}
