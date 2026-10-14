import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RANK_TIER_KEYS, SEASON_REWARD_GEMS, seasonById, seasonFrameSku, type SeasonOverview } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';
import { SeasonPage } from './SeasonPage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const overview = (over: Partial<SeasonOverview> = {}): SeasonOverview => ({
  season: { ...seasonById('2026-Q4'), daysLeft: 78 },
  rewards: RANK_TIER_KEYS.map((tier) => ({ tier, gems: SEASON_REWARD_GEMS[tier], frameSku: seasonFrameSku(tier) })),
  minGames: 10,
  lastSeason: {
    id: '2026-Q3',
    emblems: [],
    reward: { tier: 'ciya', gems: 50, frameSku: 'frame_rank_ciya', title: null },
  },
  ...over,
});

function mount(body: SeasonOverview, worn: string | null = null, played = true) {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/ranks/seasons/current')) return jsonResponse(200, body);
    if (url.includes('/ranks/seasons/me'))
      return jsonResponse(200, { emblems: played ? [{ seasonId: '2026-Q3', game: 'wordle-battle', peakTier: 'ciya', peakPoints: 1010, ratedGames: 22 }] : [] });
    if (url.includes('/ranks/me')) return jsonResponse(404, {});
    if (url.includes('/me/cosmetics/frame')) return jsonResponse(200, { frameSku: JSON.parse(String(init!.body)).sku });
    if (url.includes('/users/me')) return jsonResponse(200, { frameSku: worn });
    return jsonResponse(200, { user: { id: 'me', username: 'rojda', emailVerified: true } });
  });
  vi.stubGlobal('fetch', fetchMock);
  renderApp(<SeasonPage />);
  return fetchMock;
}

describe('SeasonPage', () => {
  it('names the season and its days left calmly, with when it ends', async () => {
    mount(overview());
    expect(await screen.findByRole('heading', { name: 'Payîz 2026' })).toBeInTheDocument();
    expect(screen.getByText('Autumn')).toBeInTheDocument();
    expect(screen.getByText('78 days left')).toBeInTheDocument();
    expect(screen.getByText(/^Ends /)).toBeInTheDocument();
  });

  it('shows what every tier earns, with its frame and Gems', async () => {
    mount(overview());
    const rewards = (await screen.findByRole('heading', { name: en['seasons.rewards'] })).closest('section')!;
    expect(within(rewards).getAllByRole('listitem')).toHaveLength(6);
    expect(within(rewards).getByText('100 Gems')).toBeInTheDocument();
    expect(within(rewards).getByText(en['seasons.animated'])).toBeInTheDocument();
    expect(within(rewards).getByRole('img', { name: 'Stêrk season frame' })).toBeInTheDocument();
  });

  it('keeps past seasons’ emblems, labelled with their season', async () => {
    mount(overview());
    expect(await screen.findByRole('img', { name: 'Çiya (Mountain), Havîn 2026' })).toBeInTheDocument();
  });

  it('wears last season’s frame, and takes it off again', async () => {
    const fetchMock = mount(overview());
    await userEvent.click(await screen.findByRole('button', { name: en['seasons.wearFrame'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: en['seasons.removeFrame'] })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: en['seasons.removeFrame'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: en['seasons.wearFrame'] })).toBeInTheDocument());
    const puts = fetchMock.mock.calls.filter(([url]) => url.includes('/me/cosmetics/frame')).map(([, init]) => JSON.parse(String(init!.body)));
    expect(puts).toEqual([{ sku: 'frame_rank_ciya' }, { sku: null }]);
  });

  it('knows the frame is already worn, from the profile everyone else sees', async () => {
    mount(overview(), 'frame_rank_ciya');
    expect(await screen.findByRole('button', { name: en['seasons.removeFrame'] })).toBeInTheDocument();
  });

  it('says so when no season has been played yet', async () => {
    mount(overview({ lastSeason: null }), null, false);
    expect(await screen.findByText(en['seasons.pastNone'])).toBeInTheDocument();
  });
});
