// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { BADGES, badgeTierKey, resolveThresholds, type BadgeView, type CollectionResponse, type ProfileBadge } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { BadgePill } from './BadgeRow';
import { CollectionSheet, type CollectionOwner } from './CollectionSheet';

/*
 * The badge row beside a profile's handle and the collection it opens: badges with the league and the tree, icons
 * and gifts, as square tiles, with what is still to earn and the choices of your own.
 */

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(() => {
  cleanup();
  testAuth.user = { ...testAuth.user, guest: false };
});

const tree = { species: 'hinar', stage: 4, health: 'fresh', age: 30, harvests: 2 } as const;
const earned = (key: string): ProfileBadge => ({ key, family: 'learning', tier: 1, tierKey: 'sifir', earnedAt: '2026-08-01T00:00:00.000Z', rarity: 12 });

/** Your badges page: Wane and Agir earned, Dubare under way, and every secret still hidden. */
function badgesPage(): { badges: BadgeView[]; showcase: string[]; secretsFound: number; secretsTotal: number; legacy: never[]; monthlyChallenge: { month: string; days: number; goal: number } } {
  const progress: Record<string, { tier: number; progress: number }> = { ders: { tier: 1, progress: 12 }, agir: { tier: 1, progress: 7 }, dubare: { tier: 0, progress: 30 } };
  return {
    showcase: ['agir'],
    secretsFound: 0,
    secretsTotal: 9,
    legacy: [],
    monthlyChallenge: { month: '2026-11', days: 2, goal: 20 },
    badges: BADGES.map((def) => {
      const p = progress[def.key] ?? { tier: 0, progress: 0 };
      const thresholds = resolveThresholds(def, 30);
      return {
        key: def.key,
        family: def.family,
        tier: p.tier,
        tierCount: def.tiers.length,
        tierKey: badgeTierKey(def, p.tier),
        progress: p.progress,
        thresholds,
        next: p.tier < thresholds.length ? thresholds[p.tier]! : null,
        unit: def.unit,
        earnedAt: p.tier > 0 ? '2026-08-01T00:00:00.000Z' : null,
        tierEarnedAt: Array.from({ length: p.tier }, () => '2026-08-01T00:00:00.000Z'),
        secret: def.secret,
        hidden: def.secret && p.tier === 0,
        hintKey: null,
        rarity: null,
      };
    }),
  };
}

const collection = (over: Partial<CollectionResponse> = {}): CollectionResponse => ({
  private: false,
  icons: {
    items: [
      { sku: 'icon-star', name: 'Star', assetUrl: '/cosmetics/icons/star.png', worn: true },
      { sku: 'icon-moon', name: 'Moon', assetUrl: '/cosmetics/icons/moon.png', worn: false },
    ],
    total: 2,
  },
  received: {
    items: [
      {
        sku: 'bg-sky',
        name: 'Sky',
        category: 'background',
        assetUrl: null,
        count: 2,
        lastAt: '2026-11-20T00:00:00.000Z',
        people: [
          { person: { id: 'u3', username: 'zana', displayName: 'Zana', avatarUrl: null }, at: '2026-11-20T00:00:00.000Z' },
          { person: null, at: '2026-11-01T00:00:00.000Z' },
        ],
      },
    ],
    total: 1,
  },
  ...over,
});

const yours: CollectionOwner = { userId: 'me', name: '', own: true, league: { tier: 'cem' }, tree, showcase: [earned('agir')], earned: [earned('ders'), earned('agir')] };
const theirs: CollectionOwner = { userId: 'u2', name: 'Hamo', own: false, league: { tier: 'gol' }, tree, showcase: [], earned: [earned('roj')] };

describe('the badge row', () => {
  it('holds the top three, counts the rest, and opens the collection', () => {
    const onOpen = vi.fn();
    const badges = ['ders', 'agir', 'roj', 'dubare', 'rewi', 'bekemasi'].map(earned);
    renderWithProviders(<BadgePill league="cem" tree={tree} badges={badges} title="Hamo’s collection" onOpen={onOpen} />);
    const pill = screen.getByRole('button', { name: 'Hamo’s collection, Badges: 6' });
    expect(pill.textContent).toContain('+5');
    fireEvent.click(pill);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows nobody else’s empty row, and keeps your own as a quiet way to what there is to earn', () => {
    const { container, unmount } = renderWithProviders(<BadgePill badges={[]} title="Hamo’s collection" onOpen={() => {}} />);
    expect(container.textContent).toBe('');
    unmount();
    renderWithProviders(<BadgePill badges={[]} own title="Your collection" onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Your collection, Badges: 0' }).textContent).toBe('Badges');
  });
});

describe('the collection', () => {
  it('leads your league and tree to their pages and lists your badges, then what is still to earn', async () => {
    testAuth.client = fakeClient({ 'GET /users/me/collection': ok(collection()), 'GET /me/badges': ok(badgesPage()) });
    const onClose = vi.fn();
    renderWithProviders(<CollectionSheet visible onClose={onClose} owner={yours} />);
    expect(screen.getByText('Your collection')).toBeTruthy();
    expect(screen.getByText('Young tree · Doing well')).toBeTruthy();
    fireEvent.click(screen.getByTestId('collection-league'));
    expect(navigation.navigate).toHaveBeenCalledWith('League');
    expect(onClose).toHaveBeenCalled();
    // The chosen badge first, then the rest; each named with its tier.
    expect(screen.getAllByRole('button', { name: /^(Agir|Wane) · / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Agir · Sifir', 'Wane · Sifir']);
    expect(await screen.findByText('Available to unlock')).toBeTruthy();
    const first = screen.getAllByRole('button', { name: /not earned yet/ })[0]!;
    expect(first.getAttribute('aria-label')).toMatch(/^Dubare/);
    expect(screen.queryByRole('button', { name: /Secret badge/ })).toBeNull();
  });

  it('never shows somebody else what they have not earned, opens a badge in place, and goes back', async () => {
    testAuth.client = fakeClient({ 'GET /users/u2/collection': ok(collection()) });
    renderWithProviders(<CollectionSheet visible onClose={() => {}} owner={theirs} />);
    expect(screen.getByText('Hamo’s collection')).toBeTruthy();
    expect(screen.queryByText('Available to unlock')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Customise your badges' })).toBeNull();
    expect(screen.getByText('Lake · Weekly league 4 of 6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Roj · / }));
    expect(screen.getByRole('heading', { name: 'Roj' })).toBeTruthy();
    expect(screen.getByText(/^Earned /)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('radio', { name: 'Badges' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('chooses the three shown first in place and saves them', async () => {
    const client = fakeClient({
      'GET /users/me/collection': ok(collection()),
      'GET /me/badges': ok(badgesPage()),
      'PUT /me/badges/showcase': ok({ showcase: ['agir', 'ders'] }),
    });
    testAuth.client = client;
    const saved = vi.fn();
    renderWithProviders(<CollectionSheet visible onClose={() => {}} owner={yours} onShowcase={saved} />);
    const customise = await screen.findByRole('button', { name: 'Customise your badges' });
    await waitFor(() => expect(customise.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(customise);
    fireEvent.click(screen.getByRole('checkbox', { name: /^Wane/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save showcase' }));
    await waitFor(() => expect(client.calls).toContainEqual({ method: 'PUT', path: '/me/badges/showcase', body: { keys: ['agir', 'ders'] } }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(['agir', 'ders']));
  });

  it('wears one of your icons with a tap, and only shows somebody else’s', async () => {
    const client = fakeClient({ 'GET /users/me/collection': ok(collection()), 'GET /me/badges': ok(badgesPage()), 'PUT /me/cosmetics/icon': ok({}) });
    testAuth.client = client;
    const { unmount } = renderWithProviders(<CollectionSheet visible onClose={() => {}} owner={yours} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Icons' }));
    expect(await screen.findByRole('button', { name: 'Star, Wearing' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Moon' }));
    expect(await screen.findByRole('button', { name: 'Moon, Wearing' })).toBeTruthy();
    await waitFor(() => expect(client.calls).toContainEqual({ method: 'PUT', path: '/me/cosmetics/icon', body: { sku: 'icon-moon' } }));
    unmount();

    testAuth.client = fakeClient({ 'GET /users/u2/collection': ok(collection()) });
    renderWithProviders(<CollectionSheet visible onClose={() => {}} owner={theirs} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Icons' }));
    expect(await screen.findByRole('img', { name: 'Star, Wearing' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Moon' })).toBeNull();
  });

  it('says under the worn icon who gave it, and follows the icon worn next', async () => {
    const gifted = collection({
      icons: {
        items: [
          { sku: 'icon-star', name: 'Star', assetUrl: null, worn: true, giftedBy: { id: 'u3', username: 'zana', displayName: 'Zana', avatarUrl: null } },
          { sku: 'icon-moon', name: 'Moon', assetUrl: null, worn: false, giftedBy: { id: 'u4', username: 'hejar', displayName: null, avatarUrl: null } },
          { sku: 'icon-sun', name: 'Sun', assetUrl: null, worn: false, giftedBy: null },
        ],
        total: 3,
      },
    });
    testAuth.client = fakeClient({ 'GET /users/me/collection': ok(gifted), 'GET /me/badges': ok(badgesPage()), 'PUT /me/cosmetics/icon': ok({}) });
    renderWithProviders(<CollectionSheet visible onClose={() => {}} owner={yours} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Icons' }));
    expect(await screen.findByText('Gift from Zana')).toBeTruthy();
    // Only the worn one says it: the moon’s giver shows once it is worn, by their handle where they have no name.
    expect(screen.queryByText('Gift from hejar')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Moon' }));
    expect(await screen.findByText('Gift from hejar')).toBeTruthy();
    expect(screen.queryByText('Gift from Zana')).toBeNull();
    // An icon that was not a gift says nothing of where it came from.
    fireEvent.click(screen.getByRole('button', { name: 'Sun' }));
    expect(await screen.findByRole('button', { name: 'Sun, Wearing' })).toBeTruthy();
    expect(screen.queryByText(/^Gift from/)).toBeNull();
  });

  it('says who each gift came from, a member the reader may not see without a name, and opens the giver’s profile', async () => {
    testAuth.client = fakeClient({ 'GET /users/u2/collection': ok(collection()) });
    const onClose = vi.fn();
    renderWithProviders(<CollectionSheet visible onClose={onClose} owner={theirs} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Gifts' }));
    expect(screen.queryByText('Sent')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Sky, ×2' }));
    expect(screen.getByText('Gift from a Hevalo member')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: /Gift from Zana/ }));
    expect(onClose).toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('UserProfile', { userId: 'u3' });
  });

  it.each([
    [300, '×300', '×300', 'and 298 more', 'and 298 more'],
    [3400, '×3.4K', '×3,400', 'and 3.4K more', 'and 3,398 more'],
    [5_600_000, '×5.6M', '×5,600,000', 'and 5.6M more', 'and 5,599,998 more'],
  ])('writes a gift that came %i times short on its tile and its page, and says it whole', async (n, shown, whole, more, moreWhole) => {
    const received = collection().received;
    const many = { ...received, items: [{ ...received.items[0]!, name: 'Çay', count: n }] };
    testAuth.client = fakeClient({ 'GET /users/u2/collection': ok(collection({ received: many })) });
    renderWithProviders(<CollectionSheet visible onClose={() => undefined} owner={theirs} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Gifts' }));
    const tile = await screen.findByRole('button', { name: `Çay, ${whole}` });
    const chip = screen.getByText(shown);
    expect(getComputedStyle(chip).whiteSpace).toBe('nowrap');
    fireEvent.click(tile);
    expect(screen.getByText(shown)).toBeTruthy();
    expect(screen.getByLabelText(whole)).toBeTruthy();
    expect(screen.getByText(more)).toBeTruthy();
    expect(screen.getByLabelText(moreWhole)).toBeTruthy();
  });

  it('turns into your own collection, on the same tab, from somebody else’s, and offers it to no guest', async () => {
    testAuth.client = fakeClient({
      'GET /users/u2/collection': ok(collection()),
      'GET /users/me/collection': ok(collection({ icons: { items: [], total: 0 } })),
      'GET /users/me': ok({ userId: 'me', earnedBadges: [earned('ders')] }),
      'GET /me/badges': ok(badgesPage()),
    });
    const { unmount } = renderWithProviders(<CollectionSheet visible onClose={() => {}} owner={theirs} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Icons' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View your collection' }));
    expect(await screen.findByText('Your collection')).toBeTruthy();
    expect(await screen.findByText('No icons yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Visit the shop' })).toBeTruthy();
    unmount();

    testAuth.user = { ...testAuth.user, guest: true };
    renderWithProviders(<CollectionSheet visible onClose={() => {}} owner={theirs} />);
    expect(screen.queryByRole('button', { name: 'View your collection' })).toBeNull();
  });
});
