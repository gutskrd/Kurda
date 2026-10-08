import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DailyReward } from './DailyReward';
import { renderApp, routedFetch, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('DailyReward', () => {
  it('shows the Zêr balance and a claim button when claimable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/rewards/daily': { canClaim: true, claimableDay: 3, reward: 20, schedule: [], alreadyClaimedToday: false, cycleDay: 2 },
          '/me/wallet': { balances: { zer: 100, gems: 0 }, history: [] },
        }),
      ),
    );
    renderApp(<DailyReward />);
    expect(await screen.findByText('100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /claim daily zêr/i })).toBeInTheDocument();
  });

  it('claims the reward and reflects the new balance', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/rewards/daily/claim')) return jsonResponse(200, { claimed: true, cycleDay: 3, reward: 20, balance: 120 });
      if (url.includes('/rewards/daily')) return jsonResponse(200, { canClaim: true, claimableDay: 3, reward: 20, schedule: [], alreadyClaimedToday: false, cycleDay: 2 });
      if (url.includes('/me/wallet')) return jsonResponse(200, { balances: { zer: 100, gems: 0 }, history: [] });
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<DailyReward />);

    await userEvent.click(await screen.findByRole('button', { name: /claim daily zêr/i }));
    expect(await screen.findByText(/\+20 zêr claimed/i)).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText(/claimed today/i)).toBeInTheDocument();
  });

  /**
   * The reward is paid for learning. Before a lesson or practice session has
   * been finished today the server refuses a claim, so the tile says what to
   * do instead of offering a button that would fail.
   */
  it('says what today’s reward needs instead of offering a claim that would fail', async () => {
    const fetchMock = vi.fn(
      routedFetch({
        '/rewards/daily': {
          canClaim: false,
          claimableDay: 4,
          reward: 25,
          schedule: [],
          alreadyClaimedToday: false,
          learnedToday: false,
          cycleDay: 3,
        },
        '/me/wallet': { balances: { zer: 100, gems: 0 }, history: [] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<DailyReward />);

    expect(await screen.findByText(en['daily.learnFirst'].replace('{amount}', '25'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en['daily.goLearn'] })).toHaveAttribute('href', '/app/learn');
    expect(screen.queryByRole('button', { name: /claim daily zêr/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/claimed today/i)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/rewards/daily/claim'))).toBe(false);
  });

  it('says it was claimed once today’s reward is in, whatever was learned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/rewards/daily': {
            canClaim: false,
            claimableDay: 3,
            reward: 20,
            schedule: [],
            alreadyClaimedToday: true,
            learnedToday: true,
            cycleDay: 3,
          },
          '/me/wallet': { balances: { zer: 100, gems: 0 }, history: [] },
        }),
      ),
    );
    renderApp(<DailyReward />);
    expect(await screen.findByText(/claimed today/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: en['daily.goLearn'] })).not.toBeInTheDocument();
  });

  it('renders nothing if the reward status cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, {})));
    const { container } = renderApp(<DailyReward />);
    // allow the effect to settle
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('.zer-card')).toBeNull();
  });
});
