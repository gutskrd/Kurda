// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('../../auth/AuthContext', () => import('../../reports/testing/auth'));
// a badge earned meanwhile waits on the moment (badges/BadgeCelebrationHost.tsx)
vi.mock('@react-navigation/native', () => import('../../play/testing/navigation'));
// the fire as its props: how big it burns and what it grows from, whoever draws it
vi.mock('../../theme/Fire', () => import('../../theme/testing/fireProbe'));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AccessibilityInfo, Animated } from 'react-native';
import { FIRE_GREW_READ_MS, FIRE_GROW, FLAME_IGNITE, STREAK_LEAVE_MS, flameMoment, streakReveal } from '@kurda/shared';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { onHaptic, resetHaptics } from '../../feedback/haptics';
import { onSound, resetSounds } from '../../feedback/sounds';
import type { Streak } from '../types';
import { StreakMoment } from './StreakMoment';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => {
  resetHaptics();
  resetSounds();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.removeItem('kurda_locale_v1');
});

// 2026-10-29 is a Thursday
const streak: Streak = {
  current: 6,
  longest: 9,
  freezes: 0,
  lastActiveOn: '2026-10-29',
  freezeProgress: 2,
  sessionsPerFreeze: 5,
  today: '2026-10-29',
  recent: [
    { date: '2026-10-24', kind: 'learned' },
    { date: '2026-10-26', kind: 'learned' },
    { date: '2026-10-27', kind: 'frozen' },
  ],
};

const show = (over: Partial<Streak> = {}, goalDone = false, onContinue = () => undefined) =>
  renderWithProviders(<StreakMoment streak={{ ...streak, ...over }} goalDone={goalDone} onContinue={onContinue} />);

/** the week's circles in the order they are laid out, by what each day was */
const days = () => within(screen.getByTestId('streak-week')).getAllByTestId(/^day-/).map((d) => d.getAttribute('data-testid'));

/** The streak's card, past the flame where the day has one (the day the fire grew). */
async function card(): Promise<HTMLElement> {
  await waitFor(() => expect(screen.queryByTestId('lesson-streak-flame') ?? screen.queryByTestId('lesson-streak-day')).toBeTruthy());
  const flame = screen.queryByTestId('lesson-streak-flame');
  if (flame) fireEvent.click(flame);
  return screen.findByTestId('lesson-streak-day');
}

describe('the kept streak', () => {
  it('opens straight on the streak itself on a day the fire did not grow, felt and heard once', async () => {
    const said = listen();
    const felt: string[] = [];
    const heard: string[] = [];
    const stopFeel = onHaptic((e) => felt.push(e));
    const stopHear = onSound((f) => heard.push(String(f)));
    try {
      show();
      expect(await screen.findByRole('heading', { name: '6 day streak' })).toBeTruthy();
      expect(screen.queryByTestId('lesson-streak-flame')).toBeNull();
      expect(said).toEqual(['6 day streak']);
      await waitFor(() => expect(felt).toEqual(['celebrate']));
      expect(heard).toHaveLength(1);
      // a tap on the card afterwards is not a second one
      fireEvent.click(screen.getByTestId('streak-card'));
      expect(felt).toEqual(['celebrate']);
      expect(heard).toHaveLength(1);
    } finally {
      stopFeel();
      stopHear();
    }
  });

  it('opens on the flame on the day the fire grew, and a tap moves on to the streak itself, felt once', async () => {
    const felt: string[] = [];
    const heard: string[] = [];
    const stopFeel = onHaptic((e) => felt.push(e));
    const stopHear = onSound((f) => heard.push(String(f)));
    try {
      listen();
      show({ current: 7 });
      const flame = await screen.findByTestId('lesson-streak-flame');
      expect(flame.getAttribute('aria-label')).toBe('7 day streak');
      fireEvent.click(flame);
      expect(await screen.findByRole('heading', { name: '7 day streak' })).toBeTruthy();
      // the flame was the moment: the card after it is not felt or heard again
      await act(async () => new Promise((r) => setTimeout(r, streakReveal(true).overMs + 200)));
      expect(felt).toEqual(['celebrate']);
      expect(heard).toHaveLength(1);
    } finally {
      stopFeel();
      stopHear();
    }
  });

  it('lays out the week: learned, kept by a freeze, missed, today and the days ahead', async () => {
    show({ recent: [{ date: '2026-10-26', kind: 'learned' }, { date: '2026-10-27', kind: 'frozen' }] });
    await screen.findByTestId('streak-week');
    // a Monday week in English; today not learned yet is a ring of its own
    expect(days()).toEqual(['day-learned', 'day-frozen', 'day-missed', 'day-today', 'day-ahead', 'day-ahead', 'day-ahead']);
    expect(screen.getByLabelText('This week: 1 of 7 days learned, 1 kept by a freeze')).toBeTruthy();
    expect(within(screen.getByTestId('week-2026-10-26')).getByText('Mo')).toBeTruthy();
    expect(screen.getByLabelText('2 of 5 sessions to your next freeze')).toBeTruthy();
  });

  it('leaves the week out when an older server did not say what today is', async () => {
    show({ today: undefined, recent: undefined });
    expect(await screen.findByRole('heading', { name: '6 day streak' })).toBeTruthy();
    expect(screen.queryByTestId('streak-week')).toBeNull();
  });

  it('starts the week on Saturday in Kurdish', async () => {
    localStorage.setItem('kurda_locale_v1', 'ku');
    show({ recent: [...streak.recent!, { date: '2026-10-29', kind: 'learned' }] });
    await screen.findByText('Ş');
    const columns = within(screen.getByTestId('streak-week')).getAllByTestId(/^week-/);
    expect(columns.map((c) => c.getAttribute('data-testid'))).toEqual([
      'week-2026-10-24',
      'week-2026-10-25',
      'week-2026-10-26',
      'week-2026-10-27',
      'week-2026-10-28',
      'week-2026-10-29',
      'week-2026-10-30',
    ]);
    expect(within(columns[0]!).getByText('Ş')).toBeTruthy();
    expect(days()).toEqual(['day-learned', 'day-missed', 'day-learned', 'day-frozen', 'day-missed', 'day-learned', 'day-ahead']);
  });

  it('reads the week from the right in Soranî, starting on Saturday', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    show();
    await screen.findByText('ش');
    const week = screen.getByTestId('streak-week');
    expect(getComputedStyle(week).flexDirection).toBe('row-reverse');
    expect(within(week).getAllByTestId(/^week-/)[0]!.getAttribute('data-testid')).toBe('week-2026-10-24');
  });

  it('has Hevalo welcome back somebody who missed days, and cheer a longest run', async () => {
    show({ current: 1, longest: 9 });
    await card();
    expect(await screen.findByText('Welcome back! A fresh start is still a great start.')).toBeTruthy();
    cleanup();

    show({ current: 9, longest: 9 });
    expect(await screen.findByText('9 days, a new record! Let’s see how far it goes.')).toBeTruthy();
  });

  it('says see you tomorrow once today’s goal is done, and goes on with it', async () => {
    const onContinue = vi.fn();
    show({}, true, onContinue);
    fireEvent.click(await screen.findByRole('button', { name: 'See you tomorrow' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

/** What a screen reader is told, in order. */
function listen(): string[] {
  const said: string[] = [];
  (AccessibilityInfo as unknown as { announceForAccessibility: (words: string) => void }).announceForAccessibility = (words) => said.push(words);
  return said;
}

describe('the day the fire grew', () => {
  const lands = FIRE_GROW.delayMs + FIRE_GROW.ms;

  it('grows the fire from yesterday, says what it grew into as it lands, felt then and only then, and stays to be read', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const said = listen();
    const felt: string[] = [];
    const heard: string[] = [];
    const stopFeel = onHaptic((e) => felt.push(e));
    const stopHear = onSound((f) => heard.push(String(f)));
    try {
      show({ current: 7, longest: 9 });
      const flame = await screen.findByTestId('lesson-streak-flame');
      const fire = within(flame).getByTestId('fire');
      expect(fire.dataset.stage).toBe('campfire');
      expect(fire.dataset.from).toBe('kindling');
      expect(said).toEqual(['7 day streak']);
      // its place is kept from the start, the words not said before the growth lands
      expect(screen.getByTestId('lesson-streak-grew').textContent).toBe('A week in, your fire is a campfire now.');
      await act(() => vi.advanceTimersByTimeAsync(lands - 50));
      expect(felt).toEqual([]);
      expect(heard).toEqual([]);
      await act(() => vi.advanceTimersByTimeAsync(50));
      expect(said).toEqual(['7 day streak', 'A week in, your fire is a campfire now.']);
      expect(felt).toEqual(['celebrate']);
      expect(heard).toHaveLength(1);
      // still there when another day would have moved on, until the line has been read
      await act(() => vi.advanceTimersByTimeAsync(FIRE_GREW_READ_MS - 100));
      expect(screen.getByTestId('lesson-streak-flame')).toBeTruthy();
      await act(() => vi.advanceTimersByTimeAsync(200));
      expect(screen.queryByTestId('lesson-streak-flame')).toBeNull();
      expect(screen.getByRole('heading', { name: '7 day streak' })).toBeTruthy();
      expect(felt).toEqual(['celebrate']);
    } finally {
      stopFeel();
      stopHear();
    }
  });

  it('says you lit your fire on the first day, grown from cold logs', async () => {
    listen();
    show({ current: 1, longest: 1, daysLearned: 1 });
    const flame = await screen.findByTestId('lesson-streak-flame');
    expect(within(flame).getByTestId('fire').dataset.from).toBe('cold');
    expect(screen.getByTestId('lesson-streak-grew').textContent).toBe('You lit your fire!');
  });

  it('is still felt once when tapped away before the growth lands', async () => {
    const felt: string[] = [];
    const stop = onHaptic((e) => felt.push(e));
    try {
      listen();
      show({ current: 30, longest: 30 });
      fireEvent.click(await screen.findByTestId('lesson-streak-flame'));
      expect(await screen.findByRole('heading', { name: '30 day streak' })).toBeTruthy();
      expect(felt).toEqual(['celebrate']);
    } finally {
      stop();
    }
  });

  it('keeps the flame for the days the fire grew: the 1st, the 3rd, the 7th, and no day between', async () => {
    const opensOn = async (current: number): Promise<string> => {
      listen();
      show({ current, longest: Math.max(current, 9) });
      await waitFor(() => expect(screen.queryByTestId('lesson-streak-flame') ?? screen.queryByTestId('lesson-streak-day')).toBeTruthy());
      const first = screen.queryByTestId('lesson-streak-flame') ? 'flame' : 'card';
      cleanup();
      return first;
    };
    for (const day of [1, 3, 7, 14]) expect(await opensOn(day)).toBe('flame');
    for (const day of [2, 4, 6, 12, 400]) expect(await opensOn(day)).toBe('card');
  });
});

describe('the streak’s card', () => {
  const stage = async (current: number): Promise<string | null> => {
    show({ current, longest: Math.max(current, 9) });
    await card();
    const line = screen.queryByTestId('streak-stage')?.textContent ?? null;
    cleanup();
    return line;
  };

  it('names the fire’s stage under the card, with the next as a near goal', async () => {
    expect(await stage(1)).toBe('Spark · a little flame at 3 days');
    expect(await stage(5)).toBe('Little flame · a campfire at 7 days');
    expect(await stage(12)).toBe('Campfire · a big fire at 14 days');
    expect(await stage(45)).toBe('Bonfire · a blaze at 100 days');
    // at the biggest there is, simply its name
    expect(await stage(400)).toBe('Newroz fire');
  });

  it('hands over the streak’s medal on the card, a picture beside the words that say it', async () => {
    show({ current: 12 });
    const shown = within(await card());
    // drawn; the heading under it is the streak in words
    expect(shown.getByTestId('streak-medal').querySelector('svg')).toBeTruthy();
    expect(shown.getByRole('heading', { name: '12 day streak' })).toBeTruthy();
    expect(shown.getByText('Streak')).toBeTruthy();
  });

  it('gives a day learned and a day a freeze kept a medal each, and every other day its date', async () => {
    show({ recent: [{ date: '2026-10-26', kind: 'learned' }, { date: '2026-10-27', kind: 'frozen' }] });
    const week = within(await screen.findByTestId('streak-week'));
    const mark = (date: string): HTMLElement => within(week.getByTestId(`week-${date}`)).getByTestId(/^day-/);
    expect(mark('2026-10-26').querySelector('svg')).toBeTruthy();
    expect(mark('2026-10-27').querySelector('svg')).toBeTruthy();
    // the two medals are told apart by their sign, not only their colour
    expect(mark('2026-10-26').innerHTML).not.toBe(mark('2026-10-27').innerHTML);
    // Wednesday went by, today is still to learn, and the rest are to come: each its date
    expect(['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].map((d) => mark(d).textContent)).toEqual(['28', '29', '30', '31', '1']);
    expect(mark('2026-10-28').querySelector('svg')).toBeNull();
  });

  it('names the stage in Sorani too', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    show({ current: 12 });
    expect((await screen.findByTestId('streak-stage')).textContent).toMatch(/^ئاگری کەمپ · ئاگرێکی گەورە لە ڕۆژی .+دا$/);
  });
});


/** What the device asks for, read once before the screen under test opens (the setting is asked once, and kept). */
async function device(reduceMotion: boolean): Promise<void> {
  patchReactNativeWeb({ reduceMotion });
  show().unmount();
  await act(async () => undefined);
}

describe('the card coming alive', () => {
  const plan = streakReveal(false);
  afterEach(async () => {
    vi.restoreAllMocks();
    await device(true);
  });

  /** The card as it opens, its clock held at the start (a test's animations otherwise run on by themselves). */
  async function opened(over: Partial<Streak> = {}, onContinue = () => undefined): Promise<HTMLElement> {
    const real = Animated.timing;
    vi.spyOn(Animated, 'timing').mockImplementation((value, config) => {
      const run = real(value, config);
      return config.duration === plan.overMs && config.toValue === plan.overMs ? { ...run, start: () => undefined } : run;
    });
    show(over, false, onContinue);
    return card();
  }
  const opacity = (el: HTMLElement): number => Number(el.style.opacity === '' ? 1 : el.style.opacity);

  it('opens on yesterday: the medal grey and standing, the number as it was and quiet, and the rest still to come', async () => {
    await device(false);
    const shown = within(await opened());
    // one medal changing colour: the gold one is over the grey one, not seen yet
    expect(opacity(shown.getByTestId('streak-medal-lit'))).toBe(0);
    expect(shown.getByTestId('streak-medal').querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
    const turn = shown.getByTestId('streak-medal-turn');
    expect(turn.style.transform).toContain('translateY(0px)');
    expect(turn.style.transform).toContain('scaleX(1)');
    expect(turn.style.transform).toContain('scaleY(1)');
    // yesterday's number is there to roll away, and today's to roll in
    const title = shown.getByRole('heading', { name: '6 day streak' });
    expect(within(title).getByText('5')).toBeTruthy();
    expect(within(title).getByText('6')).toBeTruthy();
    expect(opacity(title)).toBeLessThan(0.6);
    // the word for the day, the week and the way on have not arrived
    expect(opacity(shown.getByTestId('streak-cheer'))).toBe(0);
    expect(opacity(within(shown.getByTestId('streak-week')).getAllByTestId(/^day-/)[0]!)).toBe(0);
    expect(opacity(screen.getByTestId('streak-onward'))).toBe(0);
    // though it answers from the first frame
    expect(within(screen.getByTestId('streak-onward')).getByRole('button', { name: 'Continue' })).toBeTruthy();
    // the app's one celebration waits in the medal
    expect(shown.getByTestId('streak-medal-ring')).toBeTruthy();
    expect(shown.getByTestId('streak-medal-flecks')).toBeTruthy();
  });

  it('is finished at once by a tap on the card: gold, today’s number in full ink, everything there, and felt once', async () => {
    await device(false);
    const felt: string[] = [];
    const stop = onHaptic((e) => felt.push(e));
    try {
      const shown = within(await opened());
      expect(felt).toEqual([]);
      fireEvent.click(shown.getByTestId('streak-card'));
      expect(opacity(shown.getByTestId('streak-medal-lit'))).toBe(1);
      expect(opacity(shown.getByRole('heading', { name: '6 day streak' }))).toBe(1);
      expect(opacity(shown.getByTestId('streak-cheer'))).toBe(1);
      for (const day of within(shown.getByTestId('streak-week')).getAllByTestId(/^day-/)) expect(opacity(day)).toBe(1);
      expect(opacity(screen.getByTestId('streak-onward'))).toBe(1);
      expect(shown.getByTestId('streak-medal-turn').style.transform).toContain('scaleY(1)');
      expect(felt).toEqual(['celebrate']);
      fireEvent.click(shown.getByTestId('streak-card'));
      expect(felt).toEqual(['celebrate']);
    } finally {
      stop();
    }
  });

  it('brings today’s day in after the whole week, wherever it stands in it', async () => {
    await device(false);
    const shown = within(await opened());
    const week = within(shown.getByTestId('streak-week'));
    // a Thursday: the fourth place, and still the last to arrive
    const marks = week.getAllByTestId(/^day-/);
    expect(marks[3]!.getAttribute('data-testid')).toBe('day-today');
    // it pops from smaller than the others grow from
    const scale = (el: HTMLElement): number => Number(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1]);
    expect(scale(marks[3]!)).toBeLessThan(scale(marks[0]!));
  });

  it('does not roll the number again after the flame: the day it grew was counted there', async () => {
    await device(false);
    listen();
    const shown = within(await opened({ current: 7, longest: 9 }));
    const title = shown.getByRole('heading', { name: '7 day streak' });
    expect(within(title).getByText('7')).toBeTruthy();
    expect(within(title).queryByText('6')).toBeNull();
    // and its medal still takes its turn, from grey
    expect(opacity(shown.getByTestId('streak-medal-lit'))).toBe(0);
  });

  it('leaves the way it came, fast: the way on is taken once the medal has gathered itself and gone', async () => {
    await device(false);
    const onContinue = vi.fn();
    await opened({}, onContinue);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // pressed again while it leaves: still one way on
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(STREAK_LEAVE_MS + 20));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('only cross-fades under Reduce Motion: no turn, ring, flecks or sparks, everything else simply there, and on at once', async () => {
    await device(true);
    const onContinue = vi.fn();
    const shown = within(await opened({}, onContinue));
    expect(shown.getByTestId('streak-medal-turn').style.transform).toBe('');
    expect(shown.queryByTestId('streak-medal-ring')).toBeNull();
    expect(shown.queryByTestId('streak-medal-flecks')).toBeNull();
    expect(opacity(shown.getByTestId('streak-cheer'))).toBe(1);
    for (const day of within(shown.getByTestId('streak-week')).getAllByTestId(/^day-/)) expect(opacity(day)).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe('the flame lighting up', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await device(true);
  });

  /**
   * The flame's screen as it opens, its lighting held where it starts (a
   * test's animations otherwise end as they begin), and what the lighting was
   * asked to do.
   */
  async function opened(): Promise<{ flame: HTMLElement; lighting: Animated.TimingAnimationConfig[] }> {
    const lighting: Animated.TimingAnimationConfig[] = [];
    const real = Animated.timing;
    vi.spyOn(Animated, 'timing').mockImplementation((value, config) => {
      const run = real(value, config);
      if (config.delay !== FLAME_IGNITE.atMs) return run;
      lighting.push(config);
      return { ...run, start: () => undefined };
    });
    show({ current: 14, longest: 14 });
    return { flame: await screen.findByTestId('lesson-streak-flame'), lighting };
  }

  it('opens dim on yesterday, then the fire squashes and pops, a ring bursts out of it, sparks fly and the warm light floods out from it', async () => {
    await device(false);
    const { flame, lighting } = await opened();
    // it lights a moment after it opens: the pop, and the warm light flooding out
    expect(lighting.map((run) => run.duration)).toEqual(expect.arrayContaining([FLAME_IGNITE.popMs, FLAME_IGNITE.floodMs]));
    // faint, and yesterday's number, until it lights
    const fire = within(flame).getByTestId('lesson-streak-fire');
    expect(Number(fire.style.opacity)).toBeCloseTo(FLAME_IGNITE.dim, 6);
    expect(fire.style.transform).toContain('scaleY(1)');
    expect(within(flame).getByTestId('fire').dataset.framed).toBe('true');
    // the warm light a speck at the fire, to flood out over the screen as it lights
    const flood = within(flame).getByTestId('lesson-streak-flood');
    expect(flood.style.transform).toContain('scale(0.04)');
    expect(Number(flood.style.opacity)).toBe(0);
    expect(within(flame).getByTestId('lesson-streak-ring')).toBeTruthy();
    expect(within(flame).getByTestId('lesson-streak-sparks')).toBeTruthy();
    // and a tap still goes on at once
    fireEvent.click(flame);
    expect(await screen.findByRole('heading', { name: '14 day streak' })).toBeTruthy();
  });

  it('lights where it is under Reduce Motion: the dim screen cross-fades to the warm one, with no squash, ring or sparks', async () => {
    await device(true);
    const { flame, lighting } = await opened();
    // it still lights a moment after it opens, only fading
    expect(lighting.map((run) => run.duration)).toEqual(expect.arrayContaining([FLAME_IGNITE.popMs, FLAME_IGNITE.floodMs]));
    const fire = within(flame).getByTestId('lesson-streak-fire');
    expect(Number(fire.style.opacity)).toBeCloseTo(FLAME_IGNITE.dim, 6);
    expect(fire.style.transform).not.toContain('scale');
    const flood = within(flame).getByTestId('lesson-streak-flood');
    expect(flood.style.transform).not.toContain('scale(0.04)');
    expect(Number(flood.style.opacity)).toBe(0);
    expect(within(flame).queryByTestId('lesson-streak-ring')).toBeNull();
    expect(within(flame).queryByTestId('lesson-streak-sparks')).toBeNull();
    fireEvent.click(flame);
    expect(await screen.findByRole('heading', { name: '14 day streak' })).toBeTruthy();
  });

  it('draws the spark of the first day closer than the fire of a year', async () => {
    const size = async (current: number): Promise<number> => {
      listen();
      show({ current, longest: Math.max(current, 9) });
      const drawn = Number(within(await screen.findByTestId('lesson-streak-flame')).getByTestId('fire').dataset.size);
      cleanup();
      return drawn;
    };
    const year = await size(365);
    expect(await size(1)).toBeCloseTo(year * flameMoment(1).zoom, 6);
    expect(await size(14)).toBeCloseTo(year * flameMoment(14).zoom, 6);
    expect(flameMoment(1).zoom).toBeGreaterThan(flameMoment(365).zoom);
  });
});
