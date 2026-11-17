import { describe, expect, it } from 'vitest';
import { INSTALL_KEY, checkInstall, type InstallKeychain, type InstallLocalStore } from './install';

const SESSION = 'kurda_tokens_v1';
const DEVICE = 'kurda_device_id_v1';

/** The app's own storage and the Keychain, in memory; `failWrites`/`failReads` make them refuse as a broken store would. */
function phone(seed: { local?: Record<string, string>; keychain?: Record<string, string> } = {}) {
  const local = new Map(Object.entries(seed.local ?? {}));
  const kept = new Map(Object.entries(seed.keychain ?? {}));
  const faults = { localWrites: false, localReads: false };
  const localStore: InstallLocalStore = {
    getItem: async (k) => {
      if (faults.localReads) throw new Error('unreadable');
      return local.get(k) ?? null;
    },
    setItem: async (k, v) => {
      if (faults.localWrites) throw new Error('disk full');
      local.set(k, v);
    },
  };
  const keychain: InstallKeychain = {
    get: async (k) => kept.get(k) ?? null,
    set: async (k, v) => void kept.set(k, v),
    remove: async (k) => void kept.delete(k),
  };
  /** Uninstalling clears the app's own storage and leaves the Keychain, as an iPhone does. */
  const uninstall = () => local.clear();
  return { local, kept, faults, stores: { local: localStore, keychain }, uninstall };
}

let n = 0;
const makeId = () => `install-${++n}`;
const check = (p: ReturnType<typeof phone>) => checkInstall(p.stores, [SESSION, DEVICE], makeId);

describe('the session kept across an uninstall', () => {
  it('keeps the session on the first start of the version that checks, so an update signs nobody out', async () => {
    // a phone signed in by an earlier version: a session and a device id, and no install id anywhere
    const p = phone({ local: { kurda_onboarding_v1: '{}' }, keychain: { [SESSION]: 'tokens', [DEVICE]: 'device' } });
    expect(await check(p)).toBe('first');
    expect(p.kept.get(SESSION)).toBe('tokens');
    expect(p.kept.get(DEVICE)).toBe('device');
    // the same id in both places from now on, and every later start is the same install
    expect(p.local.get(INSTALL_KEY)).toBeTruthy();
    expect(p.kept.get(INSTALL_KEY)).toBe(p.local.get(INSTALL_KEY));
    expect(await check(p)).toBe('same');
    expect(p.kept.get(SESSION)).toBe('tokens');
  });

  it('forgets the session and the device id an earlier install left in the Keychain', async () => {
    const p = phone({ keychain: { [SESSION]: 'tokens', [DEVICE]: 'device' } });
    await check(p);
    const before = p.kept.get(INSTALL_KEY);
    p.uninstall();
    expect(await check(p)).toBe('reinstalled');
    expect(p.kept.has(SESSION)).toBe(false);
    expect(p.kept.has(DEVICE)).toBe(false);
    // the new install has an id of its own, and keeps what it signs in to from then on
    expect(p.kept.get(INSTALL_KEY)).not.toBe(before);
    p.kept.set(SESSION, 'new tokens');
    expect(await check(p)).toBe('same');
    expect(p.kept.get(SESSION)).toBe('new tokens');
  });

  it('gives a Keychain that lost its copy this install’s id again, and forgets nothing', async () => {
    const p = phone({ local: { [INSTALL_KEY]: 'mine' }, keychain: { [SESSION]: 'tokens' } });
    expect(await check(p)).toBe('same');
    expect(p.kept.get(INSTALL_KEY)).toBe('mine');
    expect(p.kept.get(SESSION)).toBe('tokens');
  });

  it('signs nobody out when the app’s storage cannot be read', async () => {
    const p = phone({ keychain: { [INSTALL_KEY]: 'earlier', [SESSION]: 'tokens' } });
    p.faults.localReads = true;
    expect(await check(p)).toBe('unknown');
    expect(p.kept.get(SESSION)).toBe('tokens');
    expect(p.kept.get(INSTALL_KEY)).toBe('earlier');
  });

  it('does not sign out at every start when the app’s storage takes no writes', async () => {
    const p = phone({ keychain: { [SESSION]: 'tokens' } });
    p.faults.localWrites = true;
    expect(await check(p)).toBe('first');
    // nothing is left in the Keychain that a later start could take for an earlier install's
    expect(p.kept.has(INSTALL_KEY)).toBe(false);
    expect(await check(p)).toBe('first');
    expect(p.kept.get(SESSION)).toBe('tokens');
  });
});
