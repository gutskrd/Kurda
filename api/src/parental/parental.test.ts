import { describe, expect, it } from 'vitest';
import { OPEN_CONTROLS, PARENT_CODE_ALPHABET, PARENT_CODE_LENGTH, PARENTAL_BEDTIMES, PARENTAL_DAILY_LIMITS, normalizeParentCode } from '@kurda/shared';
import { setModerationKey } from '../moderation/pseudonym.js';
import { DEV_JWT_SECRET } from '../config/env.js';
import { controlsPatchSchema } from './routes.js';
import { hashParentCode, loosens, makeParentCode, mayBeParent, mayBeTeen, roleOf, type AccountRow } from './service.js';
import { controlsOf, noticeSwitch, requireParental, routeParentalSwitch, stateOf } from './supervision.js';
import {
  barredNotice,
  changedNotice,
  connectedNotice,
  disconnectedNotice,
  grownUpParentNotice,
  grownUpTeenNotice,
  parentAddedNotice,
  stoppedNotice,
  zoneNotice,
} from './notices.js';

const NOW = new Date(Date.UTC(2026, 10, 24, 12));

/** An account `years` old in NOW's month, born in May (null: no birth month), confirmed and in good standing unless told otherwise. */
function account(years: number | null, over: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'u1',
    username: 'rojda',
    display_name: 'Rojda',
    profile_photo_key: null,
    selected_avatar_key: null,
    email: 'someone@example.org',
    locale: 'en',
    timezone: 'UTC',
    guest: false,
    birth_year: years === null ? null : 2026 - years,
    birth_month: years === null ? null : 5,
    email_verified: true,
    leaving: false,
    limited: false,
    supervised: false,
    ...over,
  };
}

describe('who may take which part', () => {
  it('makes a known 13 to 17 a teen and a confirmed adult in good standing a parent', () => {
    expect(roleOf(account(13), NOW)).toEqual({ role: 'teen' });
    expect(roleOf(account(17), NOW)).toEqual({ role: 'teen' });
    expect(roleOf(account(18), NOW)).toEqual({ role: 'parent' });
    expect(roleOf(account(70), NOW)).toEqual({ role: 'parent' });
  });

  it('says why anyone else has no part', () => {
    expect(roleOf(account(30, { guest: true }), NOW)).toEqual({ role: 'none', reason: 'guest' });
    expect(roleOf(account(null), NOW)).toEqual({ role: 'none', reason: 'birth_month' });
    expect(roleOf(account(30, { email_verified: false }), NOW)).toEqual({ role: 'none', reason: 'email' });
    expect(roleOf(account(30, { limited: true }), NOW)).toEqual({ role: 'none', reason: 'standing' });
    // a guest is asked to make an account before anything else, whatever their age
    expect(roleOf(account(15, { guest: true }), NOW).reason).toBe('guest');
  });

  it('keeps a closing account from taking either part, and never holds a link from before 18 against an adult', () => {
    expect(mayBeParent(account(40), NOW)).toBe(true);
    expect(mayBeParent(account(40, { leaving: true }), NOW)).toBe(false);
    expect(mayBeParent(account(18, { supervised: true }), NOW)).toBe(true);
    expect(mayBeParent(account(16), NOW)).toBe(false);
    expect(mayBeTeen(account(16), NOW)).toBe(true);
    expect(mayBeTeen(account(16, { leaving: true }), NOW)).toBe(false);
    expect(mayBeTeen(account(40), NOW)).toBe(false);
    expect(mayBeTeen(account(null), NOW)).toBe(false);
  });
});

describe('codes', () => {
  it('draws eight letters from the alphabet, each a code the apps can type back', () => {
    const codes = Array.from({ length: 500 }, makeParentCode);
    for (const code of codes) {
      expect(code).toHaveLength(PARENT_CODE_LENGTH);
      expect(normalizeParentCode(code)).toBe(code);
    }
    // every letter turns up, so none is left out of the draw
    expect(new Set(codes.join('')).size).toBe(PARENT_CODE_ALPHABET.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('keeps a code as a hash keyed with the server’s secret, never the code itself', () => {
    setModerationKey(DEV_JWT_SECRET);
    const hash = hashParentCode('ABCDEFGH');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashParentCode('ABCDEFGH')).toBe(hash);
    expect(hashParentCode('ABCDEFGJ')).not.toBe(hash);
    setModerationKey('another secret');
    expect(hashParentCode('ABCDEFGH')).not.toBe(hash);
    setModerationKey(DEV_JWT_SECRET);
  });
});

describe('what a parent may set', () => {
  it('takes the offered limits and bedtimes, or none, and the switches', () => {
    for (const limit of [...PARENTAL_DAILY_LIMITS, null]) expect(controlsPatchSchema.safeParse({ dailyLimitMinutes: limit }).success).toBe(true);
    for (const bedtime of [...PARENTAL_BEDTIMES, null]) expect(controlsPatchSchema.safeParse({ bedtime }).success).toBe(true);
    expect(controlsPatchSchema.safeParse({ chat: false, purchases: true }).success).toBe(true);
  });

  it('refuses anything else', () => {
    for (const body of [{}, { dailyLimitMinutes: 20 }, { dailyLimitMinutes: '30' }, { bedtime: { from: '20:00', to: '06:00' } }, { bedtime: '21:00' }, { games: 1 }, { minutesToday: 0 }]) {
      expect(controlsPatchSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});

describe('which changes loosen, and only the first parent may make', () => {
  const set = (over: Partial<typeof OPEN_CONTROLS>) => ({ ...OPEN_CONTROLS, ...over });
  const at = (from: string) => ({ from, to: '07:00' });

  it('takes tightening as tightening: a switch off, a limit set or lowered, a bedtime set or started earlier', () => {
    expect(loosens(OPEN_CONTROLS, set({ chat: false, purchases: false }))).toBe(false);
    expect(loosens(OPEN_CONTROLS, set({ dailyLimitMinutes: 120 }))).toBe(false);
    expect(loosens(set({ dailyLimitMinutes: 60 }), set({ dailyLimitMinutes: 30 }))).toBe(false);
    expect(loosens(OPEN_CONTROLS, set({ bedtime: at('23:00') }))).toBe(false);
    expect(loosens(set({ bedtime: at('22:00') }), set({ bedtime: at('20:00') }))).toBe(false);
  });

  it('takes anything that opens something as loosening, even beside a change that tightens', () => {
    expect(loosens(set({ games: false }), OPEN_CONTROLS)).toBe(true);
    expect(loosens(set({ dailyLimitMinutes: 30 }), set({ dailyLimitMinutes: 45 }))).toBe(true);
    expect(loosens(set({ dailyLimitMinutes: 30 }), OPEN_CONTROLS)).toBe(true);
    expect(loosens(set({ bedtime: at('20:00') }), set({ bedtime: at('21:00') }))).toBe(true);
    expect(loosens(set({ bedtime: at('20:00') }), OPEN_CONTROLS)).toBe(true);
    expect(loosens(set({ chat: false }), set({ chat: true, letters: false }))).toBe(true);
  });
});

describe('the state a teen is told', () => {
  const row = {
    daily_limit_minutes: 30,
    bedtime_from: '21:00',
    bedtime_to: '07:00',
    chat: false,
    letters: true,
    posts: true,
    games: false,
    friends: true,
    purchases: true,
    time_zone: 'Europe/Istanbul',
  };

  it('reads the controls from their row', () => {
    expect(controlsOf(row)).toEqual({ ...OPEN_CONTROLS, dailyLimitMinutes: 30, bedtime: { from: '21:00', to: '07:00' }, chat: false, games: false });
    expect(controlsOf({ ...row, bedtime_from: null, bedtime_to: null }).bedtime).toBeNull();
  });

  it('pauses for bedtime before the limit, and for the limit once the minutes are used', () => {
    const controls = controlsOf(row);
    // 22:00 in Istanbul (UTC+3)
    expect(stateOf(controls, 0, 'Europe/Istanbul', new Date(Date.UTC(2026, 10, 24, 19)))).toEqual({
      controls,
      minutesToday: 0,
      timeZone: 'Europe/Istanbul',
      paused: 'bedtime',
      resumesAt: new Date(Date.UTC(2026, 10, 25, 4)).toISOString(),
    });
    expect(stateOf(controls, 30, 'Europe/Istanbul', NOW)).toMatchObject({ paused: 'limit', resumesAt: new Date(Date.UTC(2026, 10, 24, 21)).toISOString() });
    expect(stateOf(controls, 29, 'Europe/Istanbul', NOW)).toMatchObject({ paused: null, resumesAt: null });
  });
});

describe('the guard', () => {
  it('marks the switch it checks, for the route table’s test', () => {
    expect(routeParentalSwitch([async () => undefined, requireParental('letters')])).toBe('letters');
    expect(routeParentalSwitch(requireParental('games'))).toBe('games');
    expect(routeParentalSwitch([async () => undefined])).toBeNull();
    expect(routeParentalSwitch(undefined)).toBeNull();
  });
});

describe('notices', () => {
  const teen = { id: 't1', username: 'dilan', display_name: null };
  const parent = { id: 'p1', username: 'rojda', display_name: 'Rojda' };
  const second = { id: 'p2', username: 'berfin', display_name: null };
  const all = [
    connectedNotice(teen),
    parentAddedNotice(teen, second),
    disconnectedNotice(teen),
    stoppedNotice(parent),
    barredNotice(parent),
    grownUpTeenNotice(teen),
    grownUpParentNotice(teen),
    changedNotice(teen, parent, 'teen'),
    changedNotice(teen, parent, 'parent'),
    zoneNotice(teen, 'Asia/Baghdad'),
  ];

  it('files each under people with its kind, and names the other side by display name or username', () => {
    expect(connectedNotice(teen)).toMatchObject({ category: 'friends', data: { kind: 'parental_connected', teenId: 't1', teenName: 'dilan' } });
    expect(parentAddedNotice(teen, second)).toMatchObject({ data: { kind: 'parental_parent_added', teenId: 't1', parentId: 'p2', parentUsername: 'berfin' } });
    expect(disconnectedNotice(teen)).toMatchObject({ data: { kind: 'parental_ended', by: 'teen', teenId: 't1' } });
    expect(stoppedNotice(parent)).toMatchObject({ data: { kind: 'parental_ended', by: 'parent', parentId: 'p1', parentName: 'Rojda' } });
    expect(barredNotice(parent)).toMatchObject({ data: { kind: 'parental_ended', by: 'account', parentId: 'p1' } });
    expect(grownUpTeenNotice(teen)).toMatchObject({ data: { kind: 'parental_ended', by: 'age', teenId: 't1' } });
    expect(grownUpParentNotice(teen)).toMatchObject({ data: { kind: 'parental_ended', by: 'age', teenId: 't1' } });
    expect(changedNotice(teen, parent, 'parent')).toMatchObject({ data: { kind: 'parental_changed', to: 'parent', teenId: 't1', parentId: 'p1' } });
    expect(zoneNotice(teen, 'Asia/Baghdad')).toMatchObject({ data: { kind: 'parental_zone', teenId: 't1', timeZone: 'Asia/Baghdad' } });
    expect(stoppedNotice(parent).body).toContain('Rojda');
    expect(changedNotice(teen, parent, 'parent').body).toContain('dilan');
  });

  it('never says why a parent’s account was barred', () => {
    expect(barredNotice(parent).body).not.toMatch(/ban|suspend|safety/i);
  });

  it('carries nothing but strings, as a push does', () => {
    for (const notice of all) {
      expect(Object.values(notice.data ?? {}).every((v) => typeof v === 'string')).toBe(true);
      expect(notice.title.length).toBeLessThanOrEqual(120);
    }
  });

  it('keeps a push from a teen by what it is about, and never parental news', () => {
    expect(noticeSwitch({ category: 'letters', data: { kind: 'letter' } })).toBe('letters');
    expect(noticeSwitch({ category: 'friends', data: { kind: 'gift' } })).toBe('chat');
    expect(noticeSwitch({ category: 'friends', data: { kind: 'group_removed' } })).toBe('chat');
    expect(noticeSwitch({ category: 'games', data: { kind: 'play_invite' } })).toBe('games');
    expect(noticeSwitch({ category: 'friends', data: { kind: 'friend_request' } })).toBe('friends');
    for (const notice of all) expect(noticeSwitch(notice), notice.data?.kind).toBeNull();
    expect(noticeSwitch({ category: 'streak', data: {} })).toBeNull();
  });
});
