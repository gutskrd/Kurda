import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { progressToNext, type RankResult as RankResultData } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';
import { RankResult } from './RankResult';
import { useCelebrationsHeld } from './Celebration';

function reduceMotion(on: boolean): void {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => reduceMotion(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function counted(over: Partial<Extract<RankResultData, { counted: true }>> = {}): RankResultData {
  const pointsAfter = over.pointsAfter ?? 472;
  return {
    game: 'wordle-battle',
    gameRef: 'g1',
    counted: true,
    pointsBefore: 448,
    pointsAfter,
    delta: 24,
    reason: 'beat-stronger',
    tierBefore: 'gir',
    tierAfter: 'gir',
    divisionBefore: 2,
    divisionAfter: 2,
    tierUp: false,
    divisionUp: false,
    placement: null,
    shieldGames: 0,
    weight: 1,
    progress: progressToNext(pointsAfter),
    ...over,
  };
}

function Held(): React.JSX.Element {
  return <p data-testid="held">{useCelebrationsHeld() ? 'held' : 'free'}</p>;
}

describe('RankResult', () => {
  it('shows the change and its one plain reason, and where it leaves you', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, counted())));
    renderApp(<RankResult game="wordle-battle" gameRef="g1" />);

    expect(await screen.findByText('+24')).toBeInTheDocument();
    expect(screen.getByText('you beat a higher-ranked player')).toBeInTheDocument();
    expect(screen.getByText('28 points to Gir I')).toBeInTheDocument();
    // a screen reader hears it once, in a sentence
    expect(screen.getByRole('status')).toHaveTextContent('+24 points: you beat a higher-ranked player. You have 472 points.');
  });

  it('says a loss as plainly, without a sad word', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, counted({ delta: -6, pointsAfter: 442, pointsBefore: 448, reason: 'lost-to-stronger' }))));
    renderApp(<RankResult game="wordle-battle" gameRef="g1" />);

    expect(await screen.findByText('−6')).toBeInTheDocument();
    expect(screen.getByText('close game against a stronger player')).toBeInTheDocument();
    expect(document.querySelector('.rank-result.is-down')).not.toBeNull();
  });

  it('celebrates a new tier with its emblem, and lets the badges through only afterwards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, counted({ pointsBefore: 590, pointsAfter: 612, delta: 22, tierBefore: 'gir', tierAfter: 'zozan', divisionBefore: 1, divisionAfter: 3, tierUp: true, divisionUp: true, shieldGames: 3 })),
      ),
    );
    renderApp(
      <>
        <Held />
        <RankResult game="wordle-battle" gameRef="g1" />
      </>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Zozan III' });
    expect(dialog).toHaveTextContent(en['rankResult.tierUpKicker']);
    expect(dialog).toHaveTextContent('Welcome to Zozan — High pasture.');
    expect(dialog).toHaveTextContent('Your next 3 rated games can’t take you below Zozan.');
    expect(screen.getByTestId('held')).toHaveTextContent('held');

    await userEvent.click(screen.getByRole('button', { name: en['rankResult.continue'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('held')).toHaveTextContent('free');
  });

  it('counts a placement game towards the five, with no tier yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, counted({ reason: 'placement', delta: 31, tierBefore: null, tierAfter: null, divisionBefore: null, divisionAfter: null, placement: { played: 3, of: 5 }, progress: null }))),
    );
    renderApp(<RankResult game="wordle-battle" gameRef="g1" />);

    expect(await screen.findByText('placement game')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Placing 3/5' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says a friendly game was friendly, and why when the host had chosen Rated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { game: 'wordle-battle', gameRef: 'g1', counted: false, friendlyReason: 'repeat-opponent' })));
    renderApp(<RankResult game="wordle-battle" gameRef="g1" />);
    expect(await screen.findByText('This game was friendly: you’ve played a lot of rated games together today.')).toBeInTheDocument();
  });

  it('asks again while the result is still being worked out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let asked = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        asked += 1;
        return jsonResponse(200, asked < 2 ? { game: 'wordle-battle', gameRef: 'g1', counted: false, friendlyReason: null, pending: true } : counted());
      }),
    );
    renderApp(<RankResult game="wordle-battle" gameRef="g1" />);
    expect(await screen.findByText(en['rankResult.pending'])).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(1600);
    expect(await screen.findByText('+24')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('draws nothing for a game the viewer was not in, or an API without ranks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { code: 'NOT_FOUND', message: 'not found' })));
    const { container } = renderApp(<RankResult game="wordle-battle" gameRef="g1" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('counts up with motion when motion is welcome, landing on the same numbers', async () => {
    reduceMotion(false);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, counted())));
    renderApp(<RankResult game="wordle-battle" gameRef="g1" />);
    expect(await screen.findByText('+24', undefined, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('You have 472 points.'), { timeout: 3000 });
  });
});
