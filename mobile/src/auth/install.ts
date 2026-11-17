/**
 * Whether the session kept on this phone belongs to this install of the app.
 *
 * On an iPhone the Keychain, where the session is kept (storage.ts), outlives
 * the app: uninstalled and installed again — on a phone handed on, sold or
 * given back — the new install found the previous owner's session and opened
 * their account. The app's own storage (AsyncStorage) goes with an uninstall.
 * So each install writes an id of its own in both places, and on start the
 * two are compared before the session is read:
 *
 *   - the same id in both: the same install as before; nothing to do.
 *   - an id in the Keychain but none in the app's storage: the Keychain was
 *     written by an earlier install, since removed. Its session and its
 *     device id are forgotten, and the person signs in as on a new phone.
 *   - an id in neither: the first start of a version that keeps the id, or a
 *     new install on a phone that never had one. The session is kept. An
 *     update must not sign anybody out: a guest (auth/guest.ts) has no email
 *     or password to come back with, and would lose everything learned.
 *
 * Anything that cannot be read is no reason to sign anybody out: then nothing
 * is changed, and the next start asks again. No React Native in here, so the
 * tests can run it under Node; the stores are in storage.ts.
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

/** What the check found: the same install, a first start that kept the session, an earlier install's session forgotten, or nothing readable. */
export type InstallCheck = 'same' | 'first' | 'reinstalled' | 'unknown';

export async function checkInstall(
  stores: { local: InstallLocalStore; keychain: InstallKeychain },
  /** the Keychain entries that belong to one install: the session, and the device id that goes with it */
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
    // the Keychain lost its copy, or never had one: it is this install's
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
    // Without it in the app's storage, the next start would find the Keychain's
    // copy alone and take it for an earlier install's, and sign out again, every
    // start. So the Keychain keeps none either: the next start is a first one.
    await stores.keychain.remove(INSTALL_KEY).catch(() => undefined);
    return reinstalled ? 'reinstalled' : 'first';
  }
  await stores.keychain.set(INSTALL_KEY, id).catch(() => undefined);
  return reinstalled ? 'reinstalled' : 'first';
}
