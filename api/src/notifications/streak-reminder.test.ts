import { describe, expect, it } from 'vitest';
import { APP_LOCALE_CODES } from '@kurda/shared';
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
  // deliberately changed: the copy used to be "Don't lose your streak!" and
  // "Last chance!", and then "You have learned N days in a row", which a
  // streak kept by Wordle or a freeze made untrue
  it('varies copy by kind and includes the streak length', () => {
    expect(reminderMessage('primary', 5).body).toContain('Your streak is 5 days.');
    expect(reminderMessage('primary', 1).body).toContain('Your streak is 1 day.');
    expect(reminderMessage('last_chance', 9)).not.toEqual(reminderMessage('primary', 9));
  });

  it('never claims every day of the streak was a day of learning', () => {
    for (const locale of APP_LOCALE_CODES) {
      expect(reminderMessage('primary', 12, locale).body, locale).not.toMatch(
        /learned|in a row|gelernt|appris|aprendiendo|geleerd|öğreniyorsun|xwend|خوێندووە|التعلّم/i,
      );
    }
  });

  it('never frames a day off as a loss', () => {
    for (const kind of ['primary', 'last_chance'] as const) {
      const { title, body } = reminderMessage(kind, 12);
      expect(`${title} ${body}`).not.toMatch(/lose|lost|last chance|save it|ends|alive|don't/i);
    }
  });

  it('is written in every language the app speaks, with the number in it', () => {
    for (const locale of APP_LOCALE_CODES) {
      const primary = reminderMessage('primary', 12, locale);
      const late = reminderMessage('last_chance', 12, locale);
      expect(primary.title.trim(), locale).not.toBe('');
      expect(primary.body, locale).toContain('12');
      expect(late.title.trim(), locale).not.toBe('');
      expect(late, locale).not.toEqual(primary);
      if (locale !== 'en') expect(primary, locale).not.toEqual(reminderMessage('primary', 12, 'en'));
    }
    expect(reminderMessage('primary', 3, 'de').body).toContain('3 Tagen');
    expect(reminderMessage('primary', 1, 'de').body).toContain('1 Tag.');
    expect(reminderMessage('primary', 1, 'es').body).toContain('1 día.');
  });

  it('falls back to English for a language the app does not speak', () => {
    expect(reminderMessage('primary', 4, 'xx')).toEqual(reminderMessage('primary', 4, 'en'));
    expect(reminderMessage('primary', 4, null)).toEqual(reminderMessage('primary', 4));
  });
});
