import { describe, it, expect } from 'vitest';
import { groupByTime, noteKind, splitAtName } from './rows';

describe('groupByTime', () => {
  // a fixed afternoon, so the day's start is well inside the window
  const now = new Date(2026, 9, 21, 15, 0, 0).getTime();
  const at = (h: number) => ({ createdAt: new Date(now - h * 3_600_000).toISOString() });

  it('files by the reader’s own calendar day, then the last seven days, then the rest', () => {
    const items = [at(1), at(14), at(16), at(24 * 6), at(24 * 8)];
    const groups = groupByTime(items, now);
    expect(groups.map((g) => [g.key, g.items.length])).toEqual([
      ['today', 2],
      ['week', 2],
      ['earlier', 1],
    ]);
  });

  it('leaves out a group with nothing in it, and keeps the order it was given', () => {
    const items = [at(30), at(40)];
    const groups = groupByTime(items, now);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('week');
    expect(groups[0]!.items).toEqual(items);
  });

  it('puts a date it cannot read with the oldest, rather than losing it', () => {
    expect(groupByTime([{ createdAt: 'not a date' }], now)[0]!.key).toBe('earlier');
  });
});

describe('noteKind', () => {
  it('reads the kind from the data first, then from the category', () => {
    expect(noteKind({ category: 'games', data: { kind: 'play_invite' } })).toBe('game');
    expect(noteKind({ category: 'friends', data: { kind: 'gift' } })).toBe('gift');
    expect(noteKind({ category: 'progress', data: { kind: 'league_promotion' } })).toBe('league');
    expect(noteKind({ category: 'safety', data: { kind: 'caring_message' } })).toBe('care');
    expect(noteKind({ category: 'streak', data: {} })).toBe('streak');
    expect(noteKind({ category: 'events', data: null })).toBe('notice');
  });
});

describe('splitAtName', () => {
  it('cuts a sentence around the name wherever the language put it', () => {
    expect(splitAtName('Rojda invited you to play Peyvok Battle', 'Rojda')).toEqual(['', 'Rojda', ' invited you to play Peyvok Battle']);
    expect(splitAtName('دیارییەک لە Berfinەوە', 'Berfin')).toEqual(['دیارییەک لە ', 'Berfin', 'ەوە']);
  });

  it('leaves a sentence without the name as it is', () => {
    expect(splitAtName('You have a gift', 'Berfin')).toBeNull();
    expect(splitAtName('You have a gift', null)).toBeNull();
  });
});
