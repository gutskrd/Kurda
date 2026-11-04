// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeagueView, LeagueWeekResult } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import type { DeviceStore } from '../keyboard/deviceStore';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { LeagueMoment } from './LeagueMoment';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

/** A store that remembers, as the phone's does, so a second opening can be checked. */
function memoryStore(initial: Record<string, string> = {}): DeviceStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => {
      data[k] = v;
    },
    remove: async (k) => {
      delete data[k];
    },
  };
}

const closed = (over: Partial<LeagueWeekResult> = {}): LeagueWeekResult => ({
  weekKey: '2026-10-26',
  mode: 'league',
  tier: 'kani',
  tierAfter: 'cem',
  outcome: 'promoted',
  rank: 3,
  groupSize: 18,
  weeklyXp: 410,
  goalXp: 150,
  goalMet: true,
  trophy: false,
  gems: 10,
  ...over,
});

const view = (lastWeek: LeagueWeekResult | null, over: Partial<LeagueView> = {}): LeagueView => ({
  mode: 'league',
  optedOut: false,
  joined: false,
  tier: lastWeek?.tierAfter ?? 'cem',
  weekKey: '2026-11-02',
  endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  weeklyXp: 0,
  goalXp: 150,
  goalMet: false,
  safe: false,
  rank: 0,
  groupSize: 0,
  promoteCount: 5,
  demoteCount: 2,
  standings: [],
  lastWeek,
  recentWeeks: [],
  ...over,
});

afterEach(() => {
  cleanup();
  resetHaptics();
});

describe('the league week’s ceremony', () => {
  it('stages a week that moved the learner up: the place, the new league, the rule for moving on, and once only', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    const store = memoryStore();
    renderWithProviders(<LeagueMoment league={view(closed())} store={store} />);
    expect(await screen.findByRole('heading', { name: 'You finished #3 last week and moved up to Çem.' })).toBeTruthy();
    expect(screen.getByText('Moved up')).toBeTruthy();
    expect(screen.getByText('410 XP · +10 Gems')).toBeTruthy();
    // the league they are in now stands in the middle, named; the ones beside it are decoration
    expect(screen.getByRole('img', { name: 'Çem League (River)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'You’re in the Çem League' })).toBeTruthy();
    expect(screen.getByText('River')).toBeTruthy();
    expect(screen.getByText('The top 5 with 150 XP or more move up.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(store.data.hevalo_league_celebrated).toBe('2026-10-26'));
    expect(screen.queryByText('You’re in the Çem League')).toBeNull();

    // the same week opened again: already seen on this phone
    cleanup();
    renderWithProviders(<LeagueMoment league={view(closed())} store={store} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('says a week that stayed as it was, and a week that moved down as a fresh start', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    renderWithProviders(<LeagueMoment league={view(closed({ tier: 'cem', tierAfter: 'cem', outcome: 'stayed', rank: 9, gems: 0 }))} store={memoryStore()} />);
    expect(await screen.findByRole('heading', { name: 'You finished #9 last week and stay in Çem.' })).toBeTruthy();
    expect(screen.getByText('Last week')).toBeTruthy();
    expect(screen.getByText('410 XP')).toBeTruthy();
    cleanup();

    renderWithProviders(
      <LeagueMoment league={view(closed({ tier: 'gol', tierAfter: 'cem', outcome: 'demoted', rank: 17, goalMet: false, gems: 0 }))} store={memoryStore()} />,
    );
    expect(await screen.findByRole('heading', { name: 'You finished #17 last week. This week is a fresh start in Çem.' })).toBeTruthy();
    expect(screen.getByText('A fresh start')).toBeTruthy();
    expect(screen.queryByText(/down/)).toBeNull();
  });

  it('names the trophy at the top, where the rule is the trophy’s', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    const league = view(closed({ tier: 'okyanus', tierAfter: 'okyanus', outcome: 'stayed', trophy: true, rank: 2, gems: 0 }), { promoteCount: 0 });
    renderWithProviders(<LeagueMoment league={league} store={memoryStore()} />);
    expect(await screen.findByRole('heading', { name: 'You finished #2 last week: top three in Okyanûs, a Pêla week.' })).toBeTruthy();
    expect(screen.getByText('Pêla week')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('The top three who meet the goal earn a Pêla week.')).toBeTruthy();
  });

  it('falls back to last week’s plain line when no place is known', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    renderWithProviders(<LeagueMoment league={view(closed({ rank: null, groupSize: null }))} store={memoryStore()} />);
    expect(await screen.findByRole('heading', { name: 'You moved up to Çem.' })).toBeTruthy();
  });

  it('has no stage for a personal week, a week not raced, or a week already seen', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    const seen = memoryStore({ hevalo_league_celebrated: '2026-10-26' });
    renderWithProviders(<LeagueMoment league={view(closed())} store={seen} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    cleanup();
    renderWithProviders(<LeagueMoment league={view(closed({ mode: 'personal', tier: null, tierAfter: null, outcome: null }))} store={memoryStore()} />);
    renderWithProviders(<LeagueMoment league={view(closed({ outcome: null }))} store={memoryStore()} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('knocks lightly as the emblem lands, and only when it travelled', async () => {
    const felt: HapticEvent[] = [];
    const stop = onHaptic((e) => felt.push(e));
    try {
      patchReactNativeWeb({ reduceMotion: false });
      renderWithProviders(<LeagueMoment league={view(closed())} store={memoryStore()} />);
      expect(await screen.findByTestId('league-strip')).toBeTruthy();
      // a promotion keeps the burst
      expect(await screen.findByTestId('league-burst')).toBeTruthy();
      await waitFor(() => expect(felt).toEqual(['tap']), { timeout: 2000 });
      cleanup();

      patchReactNativeWeb({ reduceMotion: true });
      renderWithProviders(<LeagueMoment league={view(closed())} store={memoryStore()} />);
      expect(await screen.findByTestId('league-strip')).toBeTruthy();
      await waitFor(() => expect(screen.queryByTestId('league-burst')).toBeNull());
      await new Promise((r) => setTimeout(r, 500));
      expect(felt).toEqual(['tap']);
    } finally {
      stop();
    }
  });
});
