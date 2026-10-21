import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../api/client';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';
import { changePassword, deviceIcon, lastActive, orderSessions, sessionsEnded, type DeviceSession } from './api';
import { MONTH_KEYS } from '../auth/birthMonth';

const translator =
  (locale: 'en' | 'ku' | 'ckb') =>
  (key: TranslationKey, vars?: Record<string, string | number>): string =>
    interpolate(TRANSLATIONS[locale][key], vars);
const t = translator('en');

const NOW = Date.parse('2026-10-20T15:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('when a device was last used', () => {
  it('says it the way a person would', () => {
    expect(lastActive(ago(20_000), t, 'en', NOW)).toBe('Active now');
    expect(lastActive(ago(MIN), t, 'en', NOW)).toBe('Last active a minute ago');
    expect(lastActive(ago(12 * MIN), t, 'en', NOW)).toBe('Last active 12 minutes ago');
    expect(lastActive(ago(HOUR + 5 * MIN), t, 'en', NOW)).toBe('Last active an hour ago');
    expect(lastActive(ago(2 * HOUR), t, 'en', NOW)).toBe('Last active 2 hours ago');
    expect(lastActive(ago(DAY + HOUR), t, 'en', NOW)).toBe('Last active a day ago');
    expect(lastActive(ago(6 * DAY), t, 'en', NOW)).toBe('Last active 6 days ago');
  });

  it('gives the date once it is a month back', () => {
    const said = lastActive(ago(45 * DAY), t, 'en', NOW);
    expect(said).toMatch(/^Last active on /);
    expect(said).toContain('September');
  });

  it('says it in the reader’s own language', () => {
    expect(lastActive(ago(2 * HOUR), translator('ku'), 'ku', NOW)).toBe('Cara dawî 2 saet berê çalak bû');
    expect(lastActive(ago(2 * HOUR), translator('ckb'), 'ckb', NOW)).toBe('دوایین جار 2 کاتژمێر لەمەوپێش چالاک بوو');
  });

  it('names the month in Kurdish, not in English', () => {
    const at = new Date(ago(45 * DAY));
    const ku = lastActive(at.toISOString(), translator('ku'), 'ku', NOW);
    expect(ku).toContain(translator('ku')(MONTH_KEYS[at.getMonth()]!));
    expect(ku).toContain(String(at.getFullYear()));
    expect(ku).not.toMatch(/[A-Z][a-z]+ \d/);
    const ckb = lastActive(at.toISOString(), translator('ckb'), 'ckb', NOW);
    expect(ckb).toContain(translator('ckb')(MONTH_KEYS[at.getMonth()]!));
  });

  it('a clock running ahead is still now, and a broken date says nothing', () => {
    expect(lastActive(new Date(NOW + 5 * MIN).toISOString(), t, 'en', NOW)).toBe('Active now');
    expect(lastActive('not a date', t, 'en', NOW)).toBe('');
  });
});

describe('the picture beside a device', () => {
  it('is a phone, a tablet or a computer, read from its name', () => {
    expect(deviceIcon('iPhone')).toBe('device-phone');
    expect(deviceIcon('Android phone (Google Pixel 8)')).toBe('device-phone');
    expect(deviceIcon('iPad')).toBe('device-tablet');
    expect(deviceIcon('Android tablet (Samsung SM-X710)')).toBe('device-tablet');
    expect(deviceIcon('Firefox on Windows')).toBe('device-computer');
    expect(deviceIcon(null)).toBe('devices');
    expect(deviceIcon('  ')).toBe('devices');
  });
});

describe('the order of the list', () => {
  const session = (id: string, lastSeen: number, current = false): DeviceSession => ({
    id,
    deviceName: id,
    startedAt: ago(10 * DAY),
    lastSeenAt: ago(lastSeen),
    current,
  });

  it('puts this device first, then the most recently used', () => {
    const ordered = orderSessions([session('old', 5 * DAY), session('here', 3 * HOUR, true), session('recent', HOUR)]);
    expect(ordered.map((s) => s.id)).toEqual(['here', 'recent', 'old']);
  });
});

describe('after signing the others out', () => {
  it('says how many', () => {
    expect(sessionsEnded(1, t)).toBe('Signed out of 1 other device.');
    expect(sessionsEnded(3, t)).toBe('Signed out of 3 other devices.');
    // they had gone already by the time it landed
    expect(sessionsEnded(0, t)).toBe('You’re not signed in anywhere else.');
  });
});

describe('changing the password', () => {
  function client(answer: unknown) {
    return {
      post: vi.fn(async () => answer),
      replaceAccessToken: vi.fn(async () => undefined),
    } as unknown as ApiClient & { post: ReturnType<typeof vi.fn>; replaceAccessToken: ReturnType<typeof vi.fn> };
  }

  it('sends the current password and the new one, and keeps this session with the token it gets back', async () => {
    const api = client({ ok: true, data: { changed: true, accessToken: 'acc-new', accessExpiresInSeconds: 900 } });
    const res = await changePassword(api, 'old-pass-1', 'new-pass-2');
    expect(res.ok).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/me/password', { currentPassword: 'old-pass-1', newPassword: 'new-pass-2' });
    expect(api.replaceAccessToken).toHaveBeenCalledWith('acc-new');
  });

  it('leaves the tokens alone when there is no new one, or the change was refused', async () => {
    const none = client({ ok: true, data: { changed: true, accessToken: null, accessExpiresInSeconds: 900 } });
    await changePassword(none, 'a', 'b');
    expect(none.replaceAccessToken).not.toHaveBeenCalled();
    const refused = client({ ok: false, error: { kind: 'client', code: 'WRONG_PASSWORD', message: 'the current password is not correct', status: 400 } });
    await changePassword(refused, 'a', 'b');
    expect(refused.replaceAccessToken).not.toHaveBeenCalled();
  });
});
