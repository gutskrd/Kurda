import { describe, expect, it } from 'vitest';
import type { IncomingInvite } from '@kurda/shared';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';
import { groupNotices, noticeActor, noticeGroup, noticeKind, noticeTime, resolveDeepLink, splitName, unreadBadge } from './inbox.js';
import { NOTICE, NOTICE_ROW_HEIGHT } from './rowMetrics';

describe('resolveDeepLink', () => {
  it('resolves known targets with required params', () => {
    expect(resolveDeepLink({ screen: 'EventQuests' })).toEqual({ screen: 'EventQuests' });
    expect(resolveDeepLink({ screen: 'Chat', userId: 'u1', username: 'ada' })).toEqual({
      screen: 'Chat',
      params: { userId: 'u1', username: 'ada' },
    });
  });

  it('opens an invite to play, and a gift in the chat it came in, from what the server writes', () => {
    expect(resolveDeepLink({ kind: 'play_invite', inviteId: 'i1', game: 'stories', lobbyId: 'g1' })).toEqual({
      screen: 'PlayInvite',
      params: { inviteId: 'i1', game: 'stories', lobbyId: 'g1' },
    });
    // a gift opens its chat with the gift to unwrap (reports/deepLinks.ts, ahead of everything else)
    const dm = '2b7c4a10-0000-4000-8000-000000000001';
    const group = '3c8d5b20-0000-4000-8000-000000000007';
    expect(resolveDeepLink({ kind: 'gift', giftId: 'x', batchId: 'b', chat: `dm:${dm}` })).toEqual({
      screen: 'Chat',
      params: { userId: dm, username: '', openGift: 'x' },
    });
    expect(resolveDeepLink({ kind: 'gift', chat: `group:${group}` })).toEqual({
      screen: 'GroupThread',
      params: { groupId: group, name: '', openGift: undefined },
    });
  });

  it('opens nothing for an invite or a gift it cannot place', () => {
    expect(resolveDeepLink({ kind: 'play_invite', inviteId: 'i1', game: 'chess', lobbyId: 'g1' })).toBeNull();
    expect(resolveDeepLink({ kind: 'play_invite', game: 'stories' })).toBeNull();
    expect(resolveDeepLink({ kind: 'gift', chat: 'somewhere' })).toBeNull();
    expect(resolveDeepLink({ kind: 'gift' })).toBeNull();
  });

  it('returns null for missing params or unknown screens (friendly fallback)', () => {
    // the quiz's game rooms are gone, and with them the screen they opened
    expect(resolveDeepLink({ screen: 'Game', roomId: 'r1' })).toBeNull();
    expect(resolveDeepLink({ screen: 'Profile' })).toBeNull();
    expect(resolveDeepLink({ screen: 'Nope' })).toBeNull();
    expect(resolveDeepLink({})).toBeNull();
  });
});

describe('unreadBadge', () => {
  it('caps and hides at zero', () => {
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(3)).toBe('3');
    expect(unreadBadge(12)).toBe('9+');
  });
});

describe('progress notifications (contract 4)', () => {
  it('opens the badges for a badge, one or the day’s bundle', () => {
    expect(resolveDeepLink({ kind: 'badge', key: 'agir', tier: '2' })).toEqual({ screen: 'Badges' });
    expect(resolveDeepLink({ kind: 'badge', day: '2026-10-14' })).toEqual({ screen: 'Badges' });
  });

  it('opens the league for safe, a promotion and a Pêla week', () => {
    for (const kind of ['league_safe', 'league_promotion', 'league_trophy']) {
      expect(resolveDeepLink({ kind, weekKey: '2026-10-05', tier: 'cem' })).toEqual({ screen: 'League' });
    }
  });
});

describe('the notification list, cut into stretches of time', () => {
  // a Tuesday afternoon, local time
  const now = new Date(2026, 9, 20, 15, 0).getTime();
  const at = (days: number, hours = 0) => new Date(now - days * 86_400_000 - hours * 3_600_000).toISOString();

  it('puts this morning under Today, last night under This week, and last month under Earlier', () => {
    expect(noticeGroup(at(0, 6), now)).toBe('today');
    // the evening before is yesterday by the calendar, even though it is under 24 hours ago
    expect(noticeGroup(new Date(2026, 9, 19, 22, 0).toISOString(), now)).toBe('week');
    expect(noticeGroup(at(6), now)).toBe('week');
    expect(noticeGroup(at(8), now)).toBe('earlier');
    expect(noticeGroup('not a date', now)).toBe('earlier');
  });

  it('keeps each stretch newest first and leaves out an empty one', () => {
    const items = [{ createdAt: at(10) }, { createdAt: at(0, 1) }, { createdAt: at(0, 3) }, { createdAt: at(12) }];
    const groups = groupNotices(items, now);
    expect(groups.map((g) => g.key)).toEqual(['today', 'earlier']);
    expect(groups[0]!.items).toEqual([{ createdAt: at(0, 1) }, { createdAt: at(0, 3) }]);
    expect(groups[1]!.items).toEqual([{ createdAt: at(10) }, { createdAt: at(12) }]);
  });
});

describe('when a notification came, in the reader\'s words', () => {
  const now = Date.parse('2026-10-20T15:00:00.000Z');
  const say = (locale: 'en' | 'ku') => (key: TranslationKey, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS[locale][key], vars);

  it('counts minutes, hours and days, and gives a date past a week', () => {
    expect(noticeTime('2026-10-20T14:59:40.000Z', say('en'), 'en', now)).toBe('just now');
    expect(noticeTime('2026-10-20T14:48:00.000Z', say('en'), 'en', now)).toBe('12m ago');
    expect(noticeTime('2026-10-20T12:00:00.000Z', say('en'), 'en', now)).toBe('3h ago');
    expect(noticeTime('2026-10-17T15:00:00.000Z', say('en'), 'en', now)).toBe('3d ago');
    expect(noticeTime('2026-10-01T15:00:00.000Z', say('en'), 'en', now)).toBe('Oct 1');
  });

  it('says it in Kurmancî for a Kurmancî reader, not in English letters', () => {
    expect(noticeTime('2026-10-20T14:48:00.000Z', say('ku'), 'ku', now)).toBe(interpolate(TRANSLATIONS.ku['time.minutesAgo'], { count: 12 }));
  });
});

describe('what a notification is, and who it is from', () => {
  it('draws each kind the server sends with its own glyph, a reward in gold', () => {
    expect(noticeKind({ category: 'games', data: { kind: 'play_invite' } })).toEqual({ icon: 'play', reward: false });
    expect(noticeKind({ category: 'friends', data: { kind: 'gift' } })).toEqual({ icon: 'gift', reward: true });
    expect(noticeKind({ category: 'progress', data: { kind: 'badge' } })).toEqual({ icon: 'medal', reward: true });
    expect(noticeKind({ category: 'moderation', data: { kind: 'caring_message' } })).toEqual({ icon: 'lifebuoy', reward: false });
    expect(noticeKind({ category: 'friends', data: { screen: 'Chat' } }).icon).toBe('chat');
    // a kind the app has not met yet still gets its category's picture
    expect(noticeKind({ category: 'streak', data: { kind: 'something_new' } })).toEqual({ icon: 'flame', reward: true });
    expect(noticeKind({ category: 'unheard_of', data: {} }).icon).toBe('bell');
  });

  it('names the host of an invite only while it can still be answered', () => {
    const invite = { id: 'i1', from: { name: 'Azad', avatarUrl: '/a.png' } } as IncomingInvite;
    const item = { data: { kind: 'play_invite', inviteId: 'i1' } };
    expect(noticeActor(item, [invite])).toEqual({ name: 'Azad', id: 'Azad', photoUrl: '/a.png' });
    expect(noticeActor(item, [])).toBeNull();
  });

  it('names the sender of a message, and nobody for a notice from Hevalo', () => {
    expect(noticeActor({ data: { screen: 'Chat', userId: 'u3', username: 'rojhat' } })).toEqual({ name: 'rojhat', id: 'u3', photoUrl: null });
    expect(noticeActor({ data: { kind: 'badge' } })).toBeNull();
  });

  it('cuts a line round the name, so the name alone can be bold', () => {
    expect(splitName('Azad invited you to Peyvok', 'Azad')).toEqual({ before: '', name: 'Azad', after: ' invited you to Peyvok' });
    expect(splitName('بانگهێشتی کردیت Azad', 'Azad')).toEqual({ before: 'بانگهێشتی کردیت ', name: 'Azad', after: '' });
    expect(splitName('A new badge', 'Azad')).toEqual({ before: 'A new badge', name: '', after: '' });
    expect(splitName('A new badge', null)).toEqual({ before: 'A new badge', name: '', after: '' });
  });
});

describe('a notification row and its skeleton', () => {
  /*
   * The skeleton promises the row's height: a picture with its padding. That
   * only holds while the two lines of text beside the picture are exactly as
   * tall as it — change one and the rows jump when they arrive.
   */
  it('has text as tall as its picture, so the grey rows are the real rows\' height', () => {
    expect(NOTICE.titleLine + NOTICE.lineGap + NOTICE.bodyLine).toBe(NOTICE.avatar);
    expect(NOTICE_ROW_HEIGHT).toBe(NOTICE.avatar + 2 * NOTICE.padV);
    // on the 4/8 rhythm, with a heading a fingertip tall
    expect(NOTICE_ROW_HEIGHT % 4).toBe(0);
    expect(NOTICE.heading).toBeGreaterThanOrEqual(44);
  });
});
