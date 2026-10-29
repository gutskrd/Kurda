import { afterEach, describe, expect, it, vi } from 'vitest';
// the fire as its props: how big it burns and what it grows from, whoever draws it
vi.mock('../components/Fire', () => import('../test/fireProbe'));
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FIRE_GREW_READ_MS, FIRE_GROW } from '@kurda/shared';
import { I18nProvider } from '../i18n/I18nProvider';
import { onLessonSound } from '../lib/sounds';
import { preloadCatalogue } from '../i18n/catalogues';
import { StreakFlame, StreakWeek } from './StreakMoment';
import type { Streak } from './types';

/*
 * The streak kept today: the flame that rolls the day on, and grows on the
 * day the fire grew, and the week it sits in — each day's state, the week
 * starting where the reader's calendar starts it, right to left in Soranî —
 * Hevalo's word for the day, and the fire's stage with the next one.
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

  it('names the fire stage under the streak, and the next one as a near goal', () => {
    const stage = (current: number): string | null => {
      inLanguage(<StreakWeek streak={{ ...week, current }} />);
      const line = document.querySelector('.end-week-stage')?.textContent ?? null;
      document.body.innerHTML = '';
      return line;
    };
    expect(stage(1)).toBe('Spark · a little flame at 3 days');
    expect(stage(5)).toBe('Little flame · a campfire at 7 days');
    expect(stage(12)).toBe('Campfire · a big fire at 14 days');
    expect(stage(45)).toBe('Bonfire · a blaze at 100 days');
    // at the biggest there is, simply its name
    expect(stage(400)).toBe('Newroz fire');
  });

  it('names the stage in Sorani too', async () => {
    await speak('ckb');
    inLanguage(<StreakWeek streak={{ ...week, current: 12 }} />);
    expect(document.querySelector('.end-week-stage')).toHaveTextContent('ئاگری کەمپ · ئاگرێکی گەورە لە ڕۆژی ١٤دا');
  });

  it('leaves the week out rather than guess it when the server does not say what today is', () => {
    inLanguage(<StreakWeek streak={{ ...week, today: undefined, recent: undefined }} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    // the rest is all there
    expect(screen.getByRole('heading', { name: '4-day streak' })).toBeInTheDocument();
    expect(screen.getByText('3 of 5 sessions to your next freeze')).toBeInTheDocument();
  });

  it('has Hevalo say a word for the day it is, his head in at the window', () => {
    inLanguage(<StreakWeek streak={week} />);
    expect(screen.getByText('Another day learned. See you again tomorrow!')).toBeInTheDocument();
    expect(document.querySelector('.end-week-hevalo .hevalo-window [data-crop="head"]')).toHaveAttribute('data-speaker', 'hevalo');
    // the fire burning on the ground beside it, as big as four days have grown it
    expect(document.querySelector('.end-week-scene .end-week-fire')).toHaveAttribute('data-stage', 'kindling');
    expect(document.querySelector('.end-week-scene .end-week-fire')).not.toHaveAttribute('data-from');
    expect(document.querySelector('.end-week-scene .hevalo-window')).toBeInTheDocument();
    // and the heading takes it along, for whoever lands on it
    expect(screen.getByRole('heading', { name: '4-day streak' })).toHaveAccessibleDescription('Another day learned. See you again tomorrow!');
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

  it('grows the fire from yesterday on the day it grew, says what it grew into as it lands, and stays to be read', () => {
    vi.useFakeTimers();
    const heard: string[] = [];
    const stop = onLessonSound((s) => heard.push(s));
    const onDone = vi.fn();
    inLanguage(<StreakFlame streak={{ ...week, current: 7 }} onDone={onDone} />);
    const fire = screen.getByTestId('fire');
    expect(fire).toHaveAttribute('data-stage', 'campfire');
    expect(fire).toHaveAttribute('data-from', 'kindling');
    // the line keeps its place, empty until the growth lands
    const line = screen.getByRole('status');
    expect(line).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(FIRE_GROW.delayMs + FIRE_GROW.ms - 10));
    expect(line).toBeEmptyDOMElement();
    expect(heard).toEqual([]);
    act(() => vi.advanceTimersByTime(10));
    expect(line).toHaveTextContent('A week in, your fire is a campfire now.');
    // heard as it lands, once
    expect(heard).toHaveLength(1);
    // the moment that is over in a second and a half on another day waits for the words
    act(() => vi.advanceTimersByTime(FIRE_GREW_READ_MS - 10));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(10));
    expect(onDone).toHaveBeenCalledTimes(1);
    stop();
  });

  it('says you lit your fire on the first day, grown from cold logs', () => {
    vi.useFakeTimers();
    inLanguage(<StreakFlame streak={{ ...week, current: 1 }} onDone={vi.fn()} />);
    expect(screen.getByTestId('fire')).toHaveAttribute('data-from', 'cold');
    act(() => vi.advanceTimersByTime(FIRE_GROW.delayMs + FIRE_GROW.ms));
    expect(screen.getByRole('status')).toHaveTextContent('You lit your fire!');
  });

  it('is still skipped by a click, Enter, Space or Escape on the day the fire grew', () => {
    const onDone = vi.fn();
    inLanguage(<StreakFlame streak={{ ...week, current: 30 }} onDone={onDone} />);
    fireEvent.click(screen.getByRole('heading', { name: '30-day streak' }));
    for (const key of ['Enter', ' ', 'Escape']) fireEvent.keyDown(window, { key });
    expect(onDone).toHaveBeenCalledTimes(4);
  });

  it('burns at the fire of today on any other day, growing from nothing and saying nothing more', () => {
    inLanguage(<StreakFlame streak={{ ...week, current: 12 }} onDone={vi.fn()} />);
    expect(screen.getByTestId('fire')).toHaveAttribute('data-stage', 'campfire');
    expect(screen.getByTestId('fire')).not.toHaveAttribute('data-from');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('simply shows the day under Reduce Motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener: () => undefined, removeEventListener: () => undefined }));
    inLanguage(<StreakFlame streak={week} onDone={vi.fn()} />);
    expect(document.querySelector('.roll-column')).toBeNull();
    expect(document.querySelector('.roll')).toHaveTextContent('4');
  });
});
