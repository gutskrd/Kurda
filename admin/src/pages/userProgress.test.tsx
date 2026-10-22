// @vitest-environment jsdom
/**
 * A person's Ranks and Badges tabs, against a fake API: who sees them (the
 * legacy admin role and superadmin their routes are guarded by), each game's card and its
 * reset, a rated game voided from the list, and a badge awarded or revoked
 * with exactly the body the API takes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { BADGES, type AdminPlayerRanks, type RankCard } from '@kurda/shared';
import { setToken } from '../api';
import { AuthProvider } from '../auth';
import { SessionProvider, type AdminSession } from '../session';
import { fakeApi, json, on, type Call, type Route } from '../test/fetch';
import { ME_ID, SUBJECT_ID } from '../test/moderation';
import { renderUi } from '../test/render';
import type { BadgeCatalogue, UserBadges } from '../progress';
import type { UserDetail } from './UserPage';
import { Users } from './Users';

const ADMIN: AdminSession = { roles: ['superadmin'], staffRoles: ['admin', 'superadmin'], capabilities: ['users.view', 'moderation.act'], needsEnrollment: false, needsVerification: false };
const MODERATOR: AdminSession = { roles: ['moderator'], staffRoles: ['moderator'], capabilities: ['users.view', 'users.moderate', 'moderation.act'], needsEnrollment: false, needsVerification: false };
const REF = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '44444444-4444-4444-8444-444444444444';
const posts = (calls: Call[], path: string): Call[] => calls.filter((c) => c.method === 'POST' && c.path === path);

const person: UserDetail = {
  id: SUBJECT_ID,
  username: 'baran',
  email: 'baran@example.org',
  displayName: null,
  roles: ['user'],
  createdAt: new Date().toISOString(),
  ban: 'active',
  bannedUntil: null,
  mutedUntil: null,
  balances: { zer: 0, gems: 0 },
  ledger: [],
  sessions: [],
  actions: [],
};

const card = (over: Partial<RankCard>): RankCard => ({
  game: 'wordle-battle',
  points: 0,
  tier: null,
  division: null,
  placement: { played: 0, of: 5 },
  provisional: false,
  shieldGames: 0,
  progress: null,
  ratedGames: 0,
  wins: 0,
  season: { id: '2026-Q4', ratedGames: 0, wins: 0, peakPoints: 0, peakTier: null },
  bestPoints: 0,
  resting: false,
  lastRatedAt: null,
  ...over,
});
const RANKS: AdminPlayerRanks = {
  ranks: [
    card({
      points: 353,
      tier: 'gir',
      division: 3,
      placement: null,
      provisional: true,
      shieldGames: 2,
      progress: { next: { tier: 'gir', division: 2 }, from: 300, to: 400, fraction: 0.53, pointsToGo: 47 },
      ratedGames: 6,
      wins: 5,
      season: { id: '2026-Q4', ratedGames: 6, wins: 5, peakPoints: 353, peakTier: 'gir' },
      bestPoints: 353,
      lastRatedAt: new Date().toISOString(),
    }),
    card({ game: 'rhyme-match', placement: { played: 2, of: 5 }, ratedGames: 2, resting: true }),
    card({ game: 'stories' }),
  ],
  games: [
    { game: 'wordle-battle', gameRef: REF, at: new Date().toISOString(), players: 2, weight: 1, voided: false, voidReason: null, place: 1, left: false, pointsBefore: 247, pointsAfter: 353, reason: 'expected-win' },
    { game: 'wordle-battle', gameRef: 'r-2', at: new Date().toISOString(), players: 3, weight: 0.5, voided: true, voidReason: 'alt', place: 3, left: true, pointsBefore: 300, pointsAfter: 280, reason: 'left' },
  ],
};
const CATALOGUE: BadgeCatalogue = {
  families: ['learning', 'habit', 'games', 'ranked', 'friends', 'events', 'secret'],
  badges: BADGES.map((def) => ({ ...def, holders: def.tiers.map(() => 0), rarity: null })),
  rarityComputedAt: null,
  activeUsers: null,
};
const MINE: UserBadges = {
  badges: [
    { key: 'agir', tier: 2, progress: 41, floorTier: 0, capTier: null, earnedAt: new Date().toISOString() },
    { key: 'vegera', tier: 1, progress: 1, floorTier: 1, capTier: null, earnedAt: new Date().toISOString() },
    { key: 'tournament-win', tier: 1, progress: 1, floorTier: 0, capTier: null, earnedAt: new Date().toISOString() },
    { key: 'peyvzan', tier: 0, progress: 3, floorTier: 0, capTier: 0, earnedAt: null },
  ],
  actions: [{ key: 'vegera', action: 'award', tier: 1, reason: 'came back after the outage', adminId: ADMIN_ID, at: new Date().toISOString() }],
};

function show(hash: string, session: AdminSession, ...routes: Route[]): ReturnType<typeof fakeApi> {
  setToken('tok');
  location.hash = hash;
  const api = fakeApi(
    on('GET', '/me', json({ user: { id: ME_ID, username: 'rojda', roles: ['admin'] } })),
    on('GET', `/admin/users/${SUBJECT_ID}`, json(person)),
    ...routes,
  );
  renderUi(
    <AuthProvider>
      <SessionProvider value={session}>
        <Users />
      </SessionProvider>
    </AuthProvider>,
  );
  return api;
}

afterEach(() => {
  setToken(null);
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('who sees the tabs', () => {
  it('shows Ranks and Badges to the admin role, and not to a moderator the routes would refuse', async () => {
    show(`#/users/${SUBJECT_ID}`, ADMIN);
    expect(await screen.findByRole('tab', { name: 'Ranks' })).toHaveAttribute('href', `#/users/${SUBJECT_ID}/ranks`);
    expect(screen.getByRole('tab', { name: 'Badges' })).toHaveAttribute('href', `#/users/${SUBJECT_ID}/badges`);
  });

  it('shows them to a superadmin who does not hold the legacy admin role', async () => {
    show(`#/users/${SUBJECT_ID}`, { ...ADMIN, staffRoles: ['superadmin'] });
    expect(await screen.findByRole('tab', { name: 'Ranks' })).toHaveAttribute('href', `#/users/${SUBJECT_ID}/ranks`);
    expect(screen.getByRole('tab', { name: 'Badges' })).toBeInTheDocument();
  });

  it('keeps them from a moderator, even by address', async () => {
    const { calls } = show(`#/users/${SUBJECT_ID}/ranks`, MODERATOR);
    expect(await screen.findByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Ranks' })).not.toBeInTheDocument();
    expect(calls.some((c) => c.path.startsWith('/admin/ranks/'))).toBe(false);
  });
});

describe('the Ranks tab', () => {
  it('shows a card per game as the player sees it, and their rated games', async () => {
    show(`#/users/${SUBJECT_ID}/ranks`, ADMIN, on('GET', `/admin/ranks/players/${SUBJECT_ID}`, json(RANKS)));
    const cards = within(await screen.findByRole('list', { name: 'Rank per game' })).getAllByRole('listitem');
    expect(cards[0]).toHaveTextContent('Peyvok Battle');
    expect(cards[0]).toHaveTextContent('Gir III');
    expect(cards[0]).toHaveTextContent('353 points?');
    expect(cards[0]).toHaveTextContent('Shield: 2 more games');
    expect(cards[0]).toHaveTextContent('47 points to go');
    expect(within(cards[0]!).getByRole('progressbar', { name: 'Progress to Gir II' })).toHaveAttribute('aria-valuenow', '53');
    expect(cards[1]).toHaveTextContent('Placing 2/5');
    expect(cards[1]).toHaveTextContent('Resting');
    // no rating yet: nothing to reset
    expect(within(cards[2]!).getByRole('button', { name: 'Reset rating…' })).toBeDisabled();

    const games = screen.getByRole('table', { name: 'Rated games' });
    const [, first, second] = within(games).getAllByRole('row');
    expect(first).toHaveTextContent('+106');
    expect(first).toHaveTextContent('expected win');
    expect(first).toHaveTextContent('Counted');
    expect(second).toHaveTextContent('3 of 3 · left');
    expect(second).toHaveTextContent('Voided');
    expect(within(second!).queryByRole('button', { name: 'Void…' })).not.toBeInTheDocument();
  });

  it('resets a game’s rating with a reason and reads the cards again', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      `#/users/${SUBJECT_ID}/ranks`,
      ADMIN,
      on('GET', `/admin/ranks/players/${SUBJECT_ID}`, json(RANKS)),
      on('POST', `/admin/ranks/players/${SUBJECT_ID}/wordle-battle/reset`, json({ ok: true })),
    );
    const cards = within(await screen.findByRole('list', { name: 'Rank per game' })).getAllByRole('listitem');
    await user.click(within(cards[0]!).getByRole('button', { name: 'Reset rating…' }));
    const ask = screen.getByRole('alertdialog', { name: 'Reset @baran’s Peyvok Battle rating?' });
    await user.type(within(ask).getByLabelText(/Why/), 'points from voided games');
    await user.click(within(ask).getByRole('button', { name: 'Reset the rating' }));
    await waitFor(() => expect(posts(calls, `/admin/ranks/players/${SUBJECT_ID}/wordle-battle/reset`)).toHaveLength(1));
    expect(posts(calls, `/admin/ranks/players/${SUBJECT_ID}/wordle-battle/reset`)[0]!.body).toEqual({ reason: 'points from voided games' });
    await waitFor(() => expect(calls.filter((c) => c.path === `/admin/ranks/players/${SUBJECT_ID}`)).toHaveLength(2));
  });

  it('voids a rated game from the list', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      `#/users/${SUBJECT_ID}/ranks`,
      ADMIN,
      on('GET', `/admin/ranks/players/${SUBJECT_ID}`, json(RANKS)),
      on('POST', `/admin/ranks/games/wordle-battle/${REF}/void`, json({ replayedGames: 0, players: 0 })),
    );
    await user.click(await screen.findByRole('button', { name: 'Void…' }));
    const ask = screen.getByRole('alertdialog');
    await user.type(within(ask).getByLabelText(/Why/), 'a bot account');
    await user.click(within(ask).getByRole('button', { name: 'Void its effect' }));
    await waitFor(() => expect(posts(calls, `/admin/ranks/games/wordle-battle/${REF}/void`)).toHaveLength(1));
    expect(await screen.findByText('Voided. Nothing after it needed working out again.')).toBeInTheDocument();
  });
});

describe('the Badges tab', () => {
  const routes = (): Route[] => [
    on('GET', `/admin/users/${SUBJECT_ID}/badges`, json(MINE)),
    on('GET', '/admin/badges', json(CATALOGUE)),
  ];

  it('shows what they earned, what an admin holds, a retired badge, and every award and revoke', async () => {
    show(`#/users/${SUBJECT_ID}/badges`, ADMIN, ...routes());
    const earned = within(await screen.findByRole('list', { name: 'Earned badges' })).getAllByRole('listitem');
    expect(earned).toHaveLength(3);
    expect(earned[0]).toHaveTextContent('Agir');
    expect(earned[0]).toHaveTextContent('Zîv (Silver)');
    expect(earned[0]).toHaveTextContent('41 counted · next tier at 100 days');
    expect(earned[1]).toHaveTextContent('Held at Sifir or above');
    expect(earned[2]).toHaveTextContent('tournament-win');
    expect(earned[2]).toHaveTextContent('retired badge');
    expect(screen.getByText(/Revoked to nothing, and held there: Peyvzan/)).toBeInTheDocument();
    const history = screen.getByRole('heading', { name: 'Awards and revokes' }).closest('section')!;
    expect(history).toHaveTextContent('Awarded Vegera up to Sifir (Copper)');
    expect(history).toHaveTextContent('came back after the outage');
  });

  it('awards a badge up to a tier, only with a reason', async () => {
    const user = userEvent.setup();
    const { calls } = show(`#/users/${SUBJECT_ID}/badges`, ADMIN, ...routes(), on('POST', `/admin/users/${SUBJECT_ID}/badges/helbestvan`, json({ key: 'helbestvan', tier: 2 })));
    await user.click(await screen.findByRole('button', { name: 'Award or revoke…' }));
    const drawer = screen.getByRole('dialog', { name: 'A badge for @baran' });
    await user.selectOptions(within(drawer).getByLabelText('Badge'), 'helbestvan');
    await user.selectOptions(within(drawer).getByLabelText('Up to'), '2');
    await user.click(within(drawer).getByRole('button', { name: 'Award it' }));
    expect(within(drawer).getByText(/at least 3 characters/)).toBeInTheDocument();
    expect(posts(calls, `/admin/users/${SUBJECT_ID}/badges/helbestvan`)).toHaveLength(0);
    await user.type(within(drawer).getByLabelText(/Why/), 'won the rhyme night; the results were lost');
    await user.click(within(drawer).getByRole('button', { name: 'Award it' }));
    await waitFor(() => expect(posts(calls, `/admin/users/${SUBJECT_ID}/badges/helbestvan`)).toHaveLength(1));
    expect(posts(calls, `/admin/users/${SUBJECT_ID}/badges/helbestvan`)[0]!.body).toEqual({
      action: 'award',
      tier: 2,
      reason: 'won the rhyme night; the results were lost',
    });
    expect(await screen.findByText('@baran holds Helbestvan at Zîv (Silver), and is told about it.')).toBeInTheDocument();
  });

  it('revokes an earned badge a tier down from its menu', async () => {
    const user = userEvent.setup();
    const { calls } = show(`#/users/${SUBJECT_ID}/badges`, ADMIN, ...routes(), on('POST', `/admin/users/${SUBJECT_ID}/badges/agir`, json({ key: 'agir', tier: 1 })));
    await user.click(await screen.findByRole('button', { name: 'More for Agir' }));
    await user.click(screen.getByRole('menuitem', { name: 'Revoke…' }));
    const drawer = screen.getByRole('dialog', { name: 'A badge for @baran' });
    expect(within(drawer).getByLabelText('Change')).toHaveValue('revoke');
    expect(within(drawer).getByLabelText('Down to')).toHaveValue('1');
    await user.type(within(drawer).getByLabelText(/Why/), 'streak repaired by a bug');
    await user.click(within(drawer).getByRole('button', { name: 'Revoke it' }));
    await waitFor(() => expect(posts(calls, `/admin/users/${SUBJECT_ID}/badges/agir`)).toHaveLength(1));
    expect(posts(calls, `/admin/users/${SUBJECT_ID}/badges/agir`)[0]!.body).toEqual({ action: 'revoke', tier: 1, reason: 'streak repaired by a bug' });
    expect(await screen.findByText('Agir is held at Sifir (Copper) for @baran.')).toBeInTheDocument();
  });
});
