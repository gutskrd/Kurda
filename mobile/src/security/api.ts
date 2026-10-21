/**
 * Your password and the devices signed in to your account: the calls, and
 * the words a row of the device list is made of. No React Native in here, so
 * the tests can hold it to what the server sends.
 */
import type { ApiClient } from '../api/client';
import type { Translate } from '../api/errors';
import type { ApiResult } from '../api/types';
import type { IconName } from '../theme/icon-paths';
import { MONTH_KEYS } from '../auth/birthMonth';

/** One signed-in device: a live session, as GET /me/sessions lists it. */
export interface DeviceSession {
  id: string;
  /** what the app called the device when it signed in; null for one that said nothing */
  deviceName: string | null;
  startedAt: string;
  lastSeenAt: string;
  /** the session this request was made with */
  current: boolean;
}

export interface PasswordChanged {
  changed: true;
  /** for this session, which carries on; null when the request had no session to keep */
  accessToken: string | null;
  accessExpiresInSeconds: number;
}

/**
 * Change the password while signed in, the current one first.
 *
 * The server ends every other session, and ends this one's access token with
 * them (the version bump), so it hands back a fresh one: stored in place of
 * the old, with the refresh token kept, and this phone carries on signed in.
 */
export async function changePassword(client: ApiClient, currentPassword: string, newPassword: string): Promise<ApiResult<PasswordChanged>> {
  const res = await client.post<PasswordChanged>('/me/password', { currentPassword, newPassword });
  if (res.ok && res.data.accessToken) await client.replaceAccessToken(res.data.accessToken);
  return res;
}

export function listSessions(client: ApiClient): Promise<ApiResult<{ sessions: DeviceSession[] }>> {
  return client.get('/me/sessions');
}

/** Sign one device out. `current` says it was this one, which must then sign out here too. */
export function signOutSession(client: ApiClient, id: string): Promise<ApiResult<{ revoked: true; current: boolean }>> {
  return client.delete(`/me/sessions/${encodeURIComponent(id)}`);
}

/** Sign out every device but this one; this one stays signed in. */
export function signOutOtherSessions(client: ApiClient): Promise<ApiResult<{ revoked: true; everywhere: false; sessionsEnded: number }>> {
  return client.delete('/me/sessions?except=current');
}

/** This device first, then the rest by when each was last used. */
export function orderSessions(sessions: readonly DeviceSession[]): DeviceSession[] {
  const seen = (s: DeviceSession) => Date.parse(s.lastSeenAt) || 0;
  return [...sessions].sort((a, b) => Number(b.current) - Number(a.current) || seen(b) - seen(a));
}

/**
 * The picture beside a device, read from its name.
 *
 * The phone names itself "iPhone", "iPad", "Android phone (…)" or "Android
 * tablet (…)" (auth/deviceName.ts); the browser names itself after the browser
 * and the system it runs on. Anything that is neither a phone nor a tablet
 * is a computer, and a session that never said gets the pair of devices.
 */
export function deviceIcon(name: string | null): IconName {
  if (!name?.trim()) return 'devices';
  if (/ipad|tablet/i.test(name)) return 'device-tablet';
  if (/iphone|android|phone|mobile/i.test(name)) return 'device-phone';
  return 'device-computer';
}

/** "Last active 2 hours ago", in the reader's words; a month on, the date. */
export function lastActive(iso: string, t: Translate, locale: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return t('security.devices.activeNow');
  if (minutes < 60) return minutes === 1 ? t('security.devices.activeMinute') : t('security.devices.activeMinutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? t('security.devices.activeHour') : t('security.devices.activeHours', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? t('security.devices.activeDay') : t('security.devices.activeDays', { count: days });
  let date: string;
  const when = new Date(at);
  if (locale === 'ku' || locale === 'ckb') {
    // phones have no Kurdish date data and would name the month in English,
    // so the month comes from the catalogue, as on the birth-month picker
    date = `${when.getDate()} ${t(MONTH_KEYS[when.getMonth()]!)} ${when.getFullYear()}`;
  } else {
    try {
      date = when.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      // a locale the runtime does not know falls back to the device's own
      date = when.toLocaleDateString();
    }
  }
  return t('security.devices.activeOn', { date });
}

/** "Signed out of 3 other devices", after signing them out. */
export function sessionsEnded(count: number, t: Translate): string {
  // the others had already gone by the time the request landed
  if (count <= 0) return t('security.devices.onlyThis');
  return count === 1 ? t('security.devices.endedOne') : t('security.devices.endedMany', { count });
}
