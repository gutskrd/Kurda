import { describe, expect, it } from 'vitest';
import { FILTER_LABEL, MESSAGE_FILTERS, listTime, messageRows, messagesUnread, newestFirst, type DirectConversation, type GroupConversation } from './list';
import { LOCALES, TRANSLATIONS } from '../i18n/translations';

const chat = (userId: string, lastAt: string | null, unread = 0, lastMessage = 'silav'): DirectConversation => ({
  userId,
  username: userId,
  lastMessage,
  lastAt,
  lastFromMe: false,
  unread,
});
const group = (id: string, name: string, unread = 0): GroupConversation => ({ id, name, memberCount: 3, unread });

const CHATS = [chat('azad', '2026-10-20T09:00:00Z', 2), chat('rojhat', '2026-10-19T09:00:00Z'), chat('berfin', '2026-10-20T10:00:00Z', 1)];
const GROUPS = [group('g1', 'Zozan', 0), group('g2', 'Ava', 4), group('g3', 'Berf', 0)];

const keys = (rows: ReturnType<typeof messageRows>) => rows.map((r) => r.key);

describe('the Messages list', () => {
  /*
   * A group sends no time, so it cannot be slotted between chats by when it
   * last spoke. One with something unread is recent by definition and goes
   * first; the quiet ones follow the chats, by name.
   */
  it('puts busy groups first, then chats newest first, then the quiet groups by name', () => {
    expect(keys(messageRows({ chats: CHATS, groups: GROUPS, filter: 'all' }))).toEqual([
      'group:g2',
      'dm:berfin',
      'dm:azad',
      'dm:rojhat',
      'group:g3',
      'group:g1',
    ]);
  });

  it('narrows to what is unread, groups included', () => {
    expect(keys(messageRows({ chats: CHATS, groups: GROUPS, filter: 'unread' }))).toEqual(['group:g2', 'dm:berfin', 'dm:azad']);
  });

  it('narrows to groups', () => {
    expect(keys(messageRows({ chats: CHATS, groups: GROUPS, filter: 'groups' }))).toEqual(['group:g2', 'group:g3', 'group:g1']);
  });

  it('filters by name and by the last line, without minding case or diacritics', () => {
    const chats = [chat('Rojhat', '2026-10-20T09:00:00Z', 0, 'Sibê em lîstikekê bikin?'), chat('azad', '2026-10-19T09:00:00Z')];
    expect(keys(messageRows({ chats, groups: [], filter: 'all', query: 'roj' }))).toEqual(['dm:Rojhat']);
    expect(keys(messageRows({ chats, groups: [], filter: 'all', query: 'listik' }))).toEqual(['dm:Rojhat']);
    expect(keys(messageRows({ chats, groups: GROUPS, filter: 'all', query: 'zoz' }))).toEqual(['group:g1']);
    expect(messageRows({ chats, groups: [], filter: 'all', query: 'nobody' })).toEqual([]);
  });

  it('searches the line the reader sees, when a gift has its own words', () => {
    const chats = [{ ...chat('azad', null), lastMessage: 'Sent a gift', lastKind: 'gift' as const }];
    const preview = () => 'Diyariyek';
    expect(messageRows({ chats, groups: [], filter: 'all', query: 'diyari', preview })).toHaveLength(1);
  });

  it('labels every chip in every language', () => {
    expect(MESSAGE_FILTERS).toEqual(['all', 'unread', 'groups']);
    for (const locale of LOCALES) {
      for (const f of MESSAGE_FILTERS) expect(TRANSLATIONS[locale][FILTER_LABEL[f]], `${locale} ${f}`).toBeTruthy();
    }
  });
});

describe('the number on the Messages tab', () => {
  /* three messages from one person is three things not read, not one conversation */
  it('counts messages, not conversations, and every waiting request', () => {
    expect(messagesUnread({ chats: [3, 2], groups: [4], requests: 1 })).toBe(10);
    expect(messagesUnread({ chats: [], groups: [], requests: 0 })).toBe(0);
  });

  it('never goes below zero on a count the server got wrong', () => {
    expect(messagesUnread({ chats: [-1, 2], groups: [], requests: -3 })).toBe(2);
  });
});

describe('newestFirst', () => {
  it('sorts newest first and puts anything undated last', () => {
    const rows = [{ t: '2026-01-01T00:00:00Z' }, { t: null }, { t: '2026-03-01T00:00:00Z' }];
    expect(newestFirst(rows, (r) => r.t).map((r) => r.t)).toEqual(['2026-03-01T00:00:00Z', '2026-01-01T00:00:00Z', null]);
  });
});

describe('when a message arrived', () => {
  const now = Date.parse('2026-10-20T15:00:00Z');
  it('says nothing for a conversation with no time', () => {
    expect(listTime(null, 'en', now)).toBe('');
    expect(listTime('not a date', 'en', now)).toBe('');
  });

  it('gives a time today, a weekday this week and a date before that', () => {
    expect(listTime('2026-10-20T14:00:00Z', 'en', now)).toMatch(/\d/);
    expect(listTime('2026-10-18T14:00:00Z', 'en', now)).toMatch(/^[A-Za-z]{3}/);
    expect(listTime('2026-09-01T14:00:00Z', 'en', now)).toMatch(/Sep/);
  });

  it('writes the hour as the locale does, with no zero in front of a morning hour in English', () => {
    const morning = new Date(now);
    morning.setHours(9, 5, 0, 0);
    expect(listTime(morning.toISOString(), 'en', now)).toMatch(/^9:05/);
  });
});
