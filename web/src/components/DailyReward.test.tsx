import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DailyReward } from './DailyReward';
import { renderApp, routedFetch, jsonResponse } from '../test/utils';

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

  it('renders nothing if the reward status cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, {})));
    const { container } = renderApp(<DailyReward />);
    // allow the effect to settle
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('.zer-card')).toBeNull();
  });
});
