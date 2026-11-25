// @vitest-environment jsdom
/**
 * A person's Badges tab, against a fake API: who sees it (the legacy admin role and superadmin its routes are guarded
 * by), and a badge awarded or revoked with exactly the body the API takes. Game ranks have ended, and their tab with them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { BADGES } from '@kurda/shared';
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
  balances: { zer: 0 },
  ledger: [],
  sessions: [],
  actions: [],
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
  it('shows Badges to the admin role, and no Ranks tab to anyone', async () => {
    show(`#/users/${SUBJECT_ID}`, ADMIN);
    expect(await screen.findByRole('tab', { name: 'Badges' })).toHaveAttribute('href', `#/users/${SUBJECT_ID}/badges`);
    expect(screen.queryByRole('tab', { name: 'Ranks' })).not.toBeInTheDocument();
  });

  it('shows Badges to a superadmin who does not hold the legacy admin role', async () => {
    show(`#/users/${SUBJECT_ID}`, { ...ADMIN, staffRoles: ['superadmin'] });
    expect(await screen.findByRole('tab', { name: 'Badges' })).toBeInTheDocument();
  });

  it('keeps Badges from a moderator, and opens the profile for the old ranks address', async () => {
    const { calls } = show(`#/users/${SUBJECT_ID}/ranks`, MODERATOR);
    expect(await screen.findByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Badges' })).not.toBeInTheDocument();
    expect(calls.some((c) => c.path.startsWith('/admin/ranks/'))).toBe(false);
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
