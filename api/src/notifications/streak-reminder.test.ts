import { describe, expect, it } from 'vitest';
import {
  dueReminder,
  FALLBACK_HOUR,
  preferredHour,
  reminderMessage,
  type ReminderContext,
} from './streak-reminder.js';

function ctx(over: Partial<ReminderContext> = {}): ReminderContext {
  return { currentStreak: 3, practicedToday: false, localHour: FALLBACK_HOUR, historicalHour: null, ...over };
}

describe('preferredHour', () => {
  it('uses the historical hour, falling back to 19:00', () => {
    expect(preferredHour(8)).toBe(8);
    expect(preferredHour(null)).toBe(FALLBACK_HOUR);
    expect(preferredHour(99)).toBe(FALLBACK_HOUR); // out of range
  });
});

describe('dueReminder', () => {
  it('never fires if the user already practiced today', () => {
    expect(dueReminder(ctx({ practicedToday: true, localHour: FALLBACK_HOUR }))).toBeNull();
  });

  it('never fires without a live streak', () => {
    expect(dueReminder(ctx({ currentStreak: 0 }))).toBeNull();
  });

  it('fires the primary reminder at the historical practice hour', () => {
    expect(dueReminder(ctx({ historicalHour: 8, localHour: 8 }))).toBe('primary');
    expect(dueReminder(ctx({ historicalHour: 8, localHour: 9 }))).toBeNull();
  });

  it('falls back to 19:00 when there is no history', () => {
    expect(dueReminder(ctx({ historicalHour: null, localHour: 19 }))).toBe('primary');
  });

  it('sends a last-chance reminder at 22:00 only for streaks >= 7', () => {
    expect(dueReminder(ctx({ currentStreak: 7, localHour: 22 }))).toBe('last_chance');
    expect(dueReminder(ctx({ currentStreak: 6, localHour: 22 }))).toBeNull();
  });

  it('last-chance takes precedence when it coincides with the primary hour', () => {
    // historical hour is 22 and streak long → last_chance wins over primary
    expect(dueReminder(ctx({ currentStreak: 10, historicalHour: 22, localHour: 22 }))).toBe('last_chance');
  });
});

describe('reminderMessage', () => {
  it('varies copy by kind and includes the streak length', () => {
    expect(reminderMessage('primary', 5).body).toContain('5-day');
    expect(reminderMessage('last_chance', 9).title).toContain('Last chance');
  });
});
