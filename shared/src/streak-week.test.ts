import { describe, expect, it } from 'vitest';
import { streakWeek, weekStartsOn } from './streak-week.js';

describe('streakWeek', () => {
  // 2026-10-29 is a Thursday
  it('starts on the given day and holds the week today falls in', () => {
    const week = streakWeek({ today: '2026-10-29', recent: [], startsOn: 1 });
    expect(week.map((d) => d.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(week.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('starts on Saturday for a Saturday week, today included when it is the first day', () => {
    expect(streakWeek({ today: '2026-10-29', recent: [], startsOn: 6 })[0]!.date).toBe('2026-10-24');
    expect(streakWeek({ today: '2026-10-31', recent: [], startsOn: 6 })[0]!.date).toBe('2026-10-31');
  });

  it('marks learned, frozen, missed, today and the days ahead', () => {
    const week = streakWeek({
      today: '2026-10-29',
      recent: [
        { date: '2026-10-26', kind: 'learned' },
        { date: '2026-10-27', kind: 'frozen' },
        { date: '2026-10-20', kind: 'learned' },
      ],
      startsOn: 1,
    });
    expect(week.map((d) => d.state)).toEqual(['learned', 'frozen', 'missed', 'today', 'ahead', 'ahead', 'ahead']);
    expect(week.map((d) => d.isToday)).toEqual([false, false, false, true, false, false, false]);
  });

  it('shows today as learned once it is, and learned over frozen on the same day', () => {
    const week = streakWeek({
      today: '2026-10-29',
      recent: [
        { date: '2026-10-29', kind: 'learned' },
        { date: '2026-10-28', kind: 'frozen' },
        { date: '2026-10-28', kind: 'learned' },
      ],
      startsOn: 1,
    });
    expect(week[3]).toEqual({ date: '2026-10-29', weekday: 4, state: 'learned', isToday: true });
    expect(week[2]!.state).toBe('learned');
  });

  it('crosses a month and a year end', () => {
    const week = streakWeek({ today: '2026-12-31', recent: [], startsOn: 6 });
    expect(week.map((d) => d.date)).toEqual(['2026-12-26', '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01']);
  });
});

describe('weekStartsOn', () => {
  it('is Saturday in Kurdish, Arabic and Persian, Monday elsewhere', () => {
    expect(['ku', 'ckb', 'ar', 'fa', 'ar-IQ'].map(weekStartsOn)).toEqual([6, 6, 6, 6, 6]);
    expect(['en', 'de', 'tr', 'fr', 'es', 'nl', 'en-GB'].map(weekStartsOn)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});
