import { describe, expect, it } from 'vitest';
import { FILTERS, FILTER_LABEL, SECTION_LABEL, newestFirst, sectionsFor, unreadTotal } from './sections';

describe('sectionsFor', () => {
  /* Requests first: they are the only one of the three waiting on you. */
  it('puts requests above chats and alerts', () => {
    expect(sectionsFor('all')).toEqual(['requests', 'chats', 'alerts']);
  });

  it('shows one section on its own', () => {
    expect(sectionsFor('chats')).toEqual(['chats']);
  });

  it('reaches every section through some filter', () => {
    const reached = new Set(FILTERS.flatMap((f) => sectionsFor(f)));
    expect([...reached].sort()).toEqual(['alerts', 'chats', 'requests']);
  });
});

describe('unreadTotal', () => {
  /*
   * Three messages from one person is three things you have not read, not one
   * conversation you have not opened. Counting conversations would say "1" to
   * somebody with a morning of backlog.
   */
  it('counts messages, not conversations', () => {
    expect(unreadTotal({ requests: 0, chatUnread: [3, 2], alertsUnread: 0 })).toBe(5);
  });

  /* A request has no read state; one waiting on you is the point of the badge. */
  it('counts every pending request', () => {
    expect(unreadTotal({ requests: 2, chatUnread: [], alertsUnread: 0 })).toBe(2);
  });

  it('adds the three together', () => {
    expect(unreadTotal({ requests: 1, chatUnread: [1, 1], alertsUnread: 4 })).toBe(7);
  });

  it('is zero on an empty inbox', () => {
    expect(unreadTotal({ requests: 0, chatUnread: [], alertsUnread: 0 })).toBe(0);
  });
});

describe('newestFirst', () => {
  const at = (r: { t?: string | null }) => r.t;

  it('sorts ISO timestamps newest first', () => {
    const rows = [{ t: '2026-01-01T00:00:00Z' }, { t: '2026-03-01T00:00:00Z' }, { t: '2026-02-01T00:00:00Z' }];
    expect(newestFirst(rows, at).map((r) => r.t)).toEqual([
      '2026-03-01T00:00:00Z',
      '2026-02-01T00:00:00Z',
      '2026-01-01T00:00:00Z',
    ]);
  });

  /*
   * The one that a plain comparator gets wrong.
   *
   * `undefined < '2026-…'` is false and so is `>`, so a row with no timestamp
   * lands wherever the sort happened to leave it — which on a descending sort
   * is usually the top, putting the one row that knows nothing about when it
   * happened above everything that does.
   */
  it('puts an undated row last, not first', () => {
    const rows = [{ t: undefined }, { t: '2026-01-01T00:00:00Z' }, { t: null }];
    expect(newestFirst(rows, at).map((r) => r.t)).toEqual(['2026-01-01T00:00:00Z', undefined, null]);
  });

  it('does not touch the input', () => {
    const rows = [{ t: '2026-01-01T00:00:00Z' }, { t: '2026-03-01T00:00:00Z' }];
    newestFirst(rows, at);
    expect(rows.map((r) => r.t)).toEqual(['2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z']);
  });
});

describe('the labels', () => {
  it('labels every filter and every section', () => {
    for (const f of FILTERS) expect(FILTER_LABEL[f]).toBeTruthy();
    for (const s of sectionsFor('all')) expect(SECTION_LABEL[s]).toBeTruthy();
  });

  /* Where the chip and the heading say the same word, they say it from one key. */
  it('shares a key wherever the two agree', () => {
    expect(FILTER_LABEL.requests).toBe(SECTION_LABEL.requests);
    expect(FILTER_LABEL.chats).toBe(SECTION_LABEL.chats);
  });

  /*
   * And the one place they do not.
   *
   * Four chips get 92 points each at 375pt and "Notifications" needs 96, so it
   * lands on screen as "Notificatio…" — and that is English, the shortest of
   * the nine. The chip gets a short word, the heading keeps the real one.
   */
  it('gives the alerts chip a shorter word than its heading', () => {
    expect(SECTION_LABEL.alerts).toBe('notifications.title');
    expect(FILTER_LABEL.alerts).toBe('inbox.filter.alerts');
    expect(FILTER_LABEL.alerts).not.toBe(SECTION_LABEL.alerts);
  });
});
