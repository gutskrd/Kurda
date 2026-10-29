import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../i18n/I18nProvider';
import { preloadCatalogue } from '../i18n/catalogues';
import { StreakFlame, StreakWeek, streakCheer } from './StreakMoment';
import type { Streak } from './types';

/*
 * The streak kept today: the flame that rolls the day on, and the week it
 * sits in — each day's state, the week starting where the reader's calendar
 * starts it, right to left in Soranî — and Hevalo's word for the day.
 */

const week: Streak = {
  current: 4,
  longest: 30,
  lastActiveOn: '2026-10-29',
  freezeProgress: 3,
  sessionsPerFreeze: 5,
  // Thursday 29 October: Monday and Wednesday learned, Tuesday kept by a freeze, Saturday the 24th too
  today: '2026-10-29',
  recent: [
    { date: '2026-10-24', kind: 'learned' },
    { date: '2026-10-26', kind: 'learned' },
    { date: '2026-10-27', kind: 'frozen' },
    { date: '2026-10-29', kind: 'learned' },
  ],
};

function inLanguage(ui: React.ReactNode): void {
  render(<I18nProvider>{ui}</I18nProvider>);
}

async function speak(locale: string): Promise<void> {
  localStorage.setItem('hevalo_locale', locale);
  await preloadCatalogue();
}

/** Each day of the week as a screen reader hears it, in order. */
const days = (): string[] => screen.getAllByRole('listitem').map((li) => li.getAttribute('aria-label') ?? '');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('the week', () => {
  it('starts on Monday in English, with each day learned, kept by a freeze, missed or still to come', () => {
    inLanguage(<StreakWeek streak={week} />);
    expect(screen.getByRole('list', { name: 'This week' })).toBeInTheDocument();
    expect(days()).toEqual([
      'Monday: learned',
      'Tuesday: kept by a freeze',
      'Wednesday: no lesson',
      'Thursday: learned today',
      'Friday: still to come',
      'Saturday: still to come',
      'Sunday: still to come',
    ]);
    // today is marked as well as named
    expect(screen.getAllByRole('listitem')[3]).toHaveClass('is-today', 'is-learned');
  });

  it('rings today without a check while it is still to learn', () => {
    inLanguage(<StreakWeek streak={{ ...week, recent: week.recent!.filter((d) => d.date !== '2026-10-29') }} />);
    expect(days()[3]).toBe('Thursday: today');
    expect(screen.getAllByRole('listitem')[3]).toHaveClass('is-today');
  });

  it('starts on Saturday in a Kurdish interface, the days named as the course teaches them', async () => {
    await speak('ku');
    inLanguage(<StreakWeek streak={week} />);
    expect(days()).toEqual([
      'Şemî: fêr bûyî',
      'Yekşem: ders tune bû',
      'Duşem: fêr bûyî',
      'Sêşem: bi cemidandinê hat parastin',
      'Çarşem: ders tune bû',
      'Pêncşem: îro fêr bûyî',
      'În: hê nehatiye',
    ]);
    expect(screen.getByText('Ş')).toBeInTheDocument();
  });

  it('runs right to left in Sorani, Saturday first in reading order', async () => {
    await speak('ckb');
    inLanguage(<StreakWeek streak={week} />);
    expect(document.documentElement.dir).toBe('rtl');
    expect(days()[0]).toBe('شەممە: فێربوویت');
    expect(days()[6]).toBe('هەینی: هێشتا نەهاتووە');
  });

  it('leaves the week out rather than guess it when the server does not say what today is', () => {
    inLanguage(<StreakWeek streak={{ ...week, today: undefined, recent: undefined }} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    // the rest is all there
    expect(screen.getByRole('heading', { name: '4-day streak' })).toBeInTheDocument();
    expect(screen.getByText('3 of 5 sessions to your next freeze')).toBeInTheDocument();
  });

  it('has Hevalo say a word for the day it is', () => {
    inLanguage(<StreakWeek streak={week} />);
    expect(screen.getByText('Another day learned. See you again tomorrow!')).toBeInTheDocument();
    // and the heading takes it along, for whoever lands on it
    expect(screen.getByRole('heading', { name: '4-day streak' })).toHaveAccessibleDescription('Another day learned. See you again tomorrow!');
  });
});

describe('the word for the day', () => {
  it('greets a first day, a comeback, a new best and any other day each in its own way', () => {
    expect(streakCheer({ current: 1, longest: 1, daysLearned: 1 })).toBe('first');
    expect(streakCheer({ current: 1, longest: 1 })).toBe('first');
    expect(streakCheer({ current: 1, longest: 6 })).toBe('back');
    expect(streakCheer({ current: 1, longest: 1, daysLearned: 9 })).toBe('back');
    expect(streakCheer({ current: 12, longest: 12 })).toBe('best');
    expect(streakCheer({ current: 4, longest: 30 })).toBe('steady');
  });
});

describe('the flame', () => {
  it('rolls the day on from yesterday, says the day it is, and moves on by itself', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    inLanguage(<StreakFlame streak={week} onDone={onDone} />);
    const day = screen.getByRole('heading', { name: '4-day streak' });
    expect(day).toHaveFocus();
    // the digit that changes turns from 3 to 4 in its own column
    expect(day.querySelector('.roll-column')).toHaveTextContent('34');
    act(() => vi.advanceTimersByTime(1500));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('turns only the digits that change', () => {
    inLanguage(<StreakFlame streak={{ ...week, current: 10 }} onDone={vi.fn()} />);
    const columns = [...document.querySelectorAll('.roll-column')].map((c) => c.textContent);
    // 9 → 10: a digit appears in front, and the last turns from 9 to 0
    expect(columns).toEqual([' 1', '90']);
    inLanguage(<StreakFlame streak={{ ...week, current: 12 }} onDone={vi.fn()} />);
    expect([...document.querySelectorAll('.roll')].at(-1)!.querySelectorAll('.roll-column')).toHaveLength(1);
  });

  it('moves on at once on a click, Enter or Escape', () => {
    const onDone = vi.fn();
    inLanguage(<StreakFlame streak={week} onDone={onDone} />);
    fireEvent.click(screen.getByRole('heading', { name: '4-day streak' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onDone).toHaveBeenCalledTimes(3);
  });

  it('simply shows the day under Reduce Motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener: () => undefined, removeEventListener: () => undefined }));
    inLanguage(<StreakFlame streak={week} onDone={vi.fn()} />);
    expect(document.querySelector('.roll-column')).toBeNull();
    expect(document.querySelector('.roll')).toHaveTextContent('4');
  });
});
