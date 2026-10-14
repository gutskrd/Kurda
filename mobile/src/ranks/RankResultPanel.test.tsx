// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RankResult } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { RankResultPanel } from './RankResultPanel';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

const REF = 'g0000000-0000-4000-8000-000000000001';
const PATH = `GET /ranks/results/wordle-battle/${REF}`;

const counted = (over: Partial<Extract<RankResult, { counted: true }>> = {}): RankResult => ({
  game: 'wordle-battle',
  gameRef: REF,
  counted: true,
  pointsBefore: 418,
  pointsAfter: 412,
  delta: -6,
  reason: 'lost-to-stronger',
  tierBefore: 'gir',
  tierAfter: 'gir',
  divisionBefore: 2,
  divisionAfter: 2,
  tierUp: false,
  divisionUp: false,
  placement: null,
  shieldGames: 0,
  weight: 1,
  damping: 1,
  newAccountLimit: 1,
  progress: { next: { tier: 'gir', division: 1 }, from: 400, to: 500, fraction: 0.12, pointsToGo: 88 },
  ...over,
});

describe('RankResultPanel', () => {
  afterEach(cleanup);

  it('shows a loss as one quiet line and where you still are — never as a defeat', async () => {
    testAuth.client = fakeClient({ [PATH]: ok(counted()) });
    renderWithProviders(<RankResultPanel game="wordle-battle" gameRef={REF} />);
    expect(await screen.findByText('−6')).toBeTruthy();
    expect(screen.getByText('close game against a stronger player')).toBeTruthy();
    expect(screen.getByText('You’re Gir II. Every game moves the climb along.')).toBeTruthy();
    expect(screen.queryByText(/lost|defeat/i)).toBeNull();
  });

  it('says why a game played as friendly, unless the host simply chose it', async () => {
    testAuth.client = fakeClient({ [PATH]: ok({ game: 'wordle-battle', gameRef: REF, counted: false, friendlyReason: 'repeat-opponent' }) });
    renderWithProviders(<RankResultPanel game="wordle-battle" gameRef={REF} />);
    expect(await screen.findByText(/This one played as friendly: you’ve played a lot of rated games together today/)).toBeTruthy();
    cleanup();
    testAuth.client = fakeClient({ [PATH]: ok({ game: 'wordle-battle', gameRef: REF, counted: false, friendlyReason: 'chosen' }) });
    renderWithProviders(<RankResultPanel game="wordle-battle" gameRef={REF} />);
    expect(await screen.findByText('A friendly game: ranks stay as they were.')).toBeTruthy();
  });

  it('asks again while the result is on its way, then shows it', async () => {
    let calls = 0;
    testAuth.client = fakeClient({
      [PATH]: () => {
        calls += 1;
        return Promise.resolve(
          calls < 2 ? ok({ game: 'wordle-battle', gameRef: REF, counted: false, friendlyReason: null, pending: true }) : ok(counted({ delta: 24, pointsBefore: 388, pointsAfter: 412, reason: 'beat-stronger' })),
        );
      },
    });
    renderWithProviders(<RankResultPanel game="wordle-battle" gameRef={REF} />);
    expect(await screen.findByText('Counting your game…')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('+24')).toBeTruthy(), { timeout: 4000 });
    expect(screen.getByText('you beat a higher-ranked player')).toBeTruthy();
  });

  it('celebrates a new division on its own stage, with the game’s line', async () => {
    testAuth.client = fakeClient({
      [PATH]: ok(counted({ delta: 26, pointsBefore: 386, pointsAfter: 412, reason: 'beat-stronger', divisionBefore: 3, divisionUp: true })),
    });
    renderWithProviders(<RankResultPanel game="wordle-battle" gameRef={REF} />);
    expect(await screen.findByText('New division', {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText('+26 · you beat a higher-ranked player')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('says which part of the weight applied: repeat play, someone new, both, or nothing for a full game', async () => {
    const cases: Array<[Partial<Extract<RankResult, { counted: true }>>, string | null]> = [
      [{ weight: 1, damping: 1, newAccountLimit: 1 }, null],
      [{ weight: 0.5, damping: 0.5, newAccountLimit: 1 }, 'Counted with less weight: you’ve played a lot of rated games together today.'],
      // a first game against a new player is not "a lot of rated games together today"
      [{ weight: 0.5, damping: 1, newAccountLimit: 0.5 }, 'Counted with less weight: someone here is new to Hevalo.'],
      [
        { weight: 0.125, damping: 0.25, newAccountLimit: 0.5 },
        'Counted with less weight: you’ve played a lot of rated games together today, and someone here is new to Hevalo.',
      ],
    ];
    for (const [over, note] of cases) {
      testAuth.client = fakeClient({ [PATH]: ok(counted(over)) });
      renderWithProviders(<RankResultPanel game="wordle-battle" gameRef={REF} />);
      await screen.findByText('−6');
      if (note) expect(screen.getByText(note)).toBeTruthy();
      else expect(screen.queryByText(/Counted with less weight/)).toBeNull();
      cleanup();
    }
  });
});
