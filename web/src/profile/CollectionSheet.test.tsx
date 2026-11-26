import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BADGES, badgeTierKey, resolveThresholds, type BadgeView, type CollectionResponse, type ProfileBadge } from '@kurda/shared';
import { CollectionSheet, type CollectionOwner } from './CollectionSheet';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const tree = { species: 'hinar', stage: 4, health: 'thirsty', age: 30, harvests: 2 } as const;
const earned = (key: string, tier = 1): ProfileBadge => ({ key, family: 'learning', tier, tierKey: 'sifir', earnedAt: '2026-08-01T00:00:00.000Z', rarity: 12 });

/** Your badges page: Wane and Agir earned, Dubare under way, and every secret still hidden. */
function badgesPage(): { badges: BadgeView[]; showcase: string[] } {
  const progress: Record<string, { tier: number; progress: number }> = { ders: { tier: 1, progress: 12 }, agir: { tier: 1, progress: 7 }, dubare: { tier: 0, progress: 30 } };
  return {
    showcase: ['agir'],
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

const person = (id: string, name: string) => ({ id, username: name.toLowerCase(), displayName: name, avatarUrl: null });
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
          { person: person('u3', 'Zana'), at: '2026-11-20T00:00:00.000Z' },
          { person: null, at: '2026-11-01T00:00:00.000Z' },
        ],
      },
    ],
    total: 1,
  },
  ...over,
});

/** Answers by path, and writes down every change sent. */
function serve(routes: Array<[string, unknown]>, sent: Array<{ url: string; method: string; body: unknown }> = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        const body = init?.body ? JSON.parse(init.body as string) : null;
        sent.push({ url, method, body });
        return jsonResponse(200, body ?? {});
      }
      const hit = routes.find(([path]) => url.includes(path));
      return jsonResponse(200, hit ? hit[1] : {});
    }),
  );
  return sent;
}

const yours: CollectionOwner = { userId: 'me1', name: 'Ada', own: true, league: { tier: 'cem' }, tree, showcase: [earned('agir')], earned: [earned('ders'), earned('agir')] };
const theirs: CollectionOwner = { userId: 'u2', name: 'Hamo', own: false, league: { tier: 'gol' }, tree, showcase: [], earned: [earned('roj')] };

describe('the collection sheet', () => {
  it('shows your league and tree as ways to their pages, your badges with the chosen first, and what is still to earn', async () => {
    serve([
      ['/users/me1/collection', collection()],
      ['/me/badges', badgesPage()],
    ]);
    renderApp(<CollectionSheet open onClose={() => {}} owner={yours} />);
    const sheet = screen.getByRole('dialog', { name: 'Your collection' });
    expect(within(sheet).getByRole('link', { name: /Çem League/ })).toHaveAttribute('href', '/app/rankings');
    expect(within(sheet).getByRole('link', { name: /Hinar/ })).toHaveAttribute('href', '/app/tree');
    expect(within(sheet).getByText('Young tree · Thirsty')).toBeInTheDocument();

    const mine = within(sheet).getByRole('region', { name: 'Badges' });
    expect(within(mine).getAllByRole('button').map((b) => b.textContent)).toHaveLength(2);
    expect(within(mine).getAllByRole('button')[0]).toHaveAccessibleName(/Agir/);

    // Under way first, each with how far along it is; a secret not yet found is left out.
    const toEarn = await within(sheet).findByRole('region', { name: 'Available to unlock' });
    const first = within(toEarn).getAllByRole('button')[0]!;
    expect(first).toHaveAccessibleName(/Dubare.*not earned yet/);
    expect(first.querySelector('.coll-bar')).not.toBeNull();
    expect(within(toEarn).queryByRole('button', { name: /Secret badge/ })).toBeNull();
  });

  it('opens a badge in place with what it is for, its tier, when it came and how rare it is, and goes back', async () => {
    serve([['/users/u2/collection', collection()]]);
    renderApp(<CollectionSheet open onClose={() => {}} owner={theirs} />);
    const sheet = screen.getByRole('dialog', { name: 'Hamo’s collection' });
    await userEvent.click(within(sheet).getByRole('button', { name: /Roj/ }));
    expect(within(sheet).getByRole('heading', { name: 'Roj' })).toBeInTheDocument();
    expect(within(sheet).getByText(/^Earned /)).toBeInTheDocument();
    expect(within(sheet).getByText('12% of learners have this')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Back' }));
    expect(within(sheet).getByRole('region', { name: 'Badges' })).toBeInTheDocument();
  });

  it('never shows somebody else what they have not earned, and opens their tree in place', async () => {
    serve([['/users/u2/collection', collection()]]);
    renderApp(<CollectionSheet open onClose={() => {}} owner={theirs} />);
    const sheet = screen.getByRole('dialog', { name: 'Hamo’s collection' });
    expect(within(sheet).queryByText('Available to unlock')).toBeNull();
    expect(within(sheet).queryByRole('button', { name: 'Customise your badges' })).toBeNull();
    // Their league says what it is and leads nowhere.
    expect(within(sheet).queryByRole('link')).toBeNull();
    expect(within(sheet).getByText('Lake · Weekly league 4 of 6')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: /Hinar/ }));
    expect(sheet.querySelector('.profile-tree')).not.toBeNull();
  });

  it('chooses the three shown first in place and saves them', async () => {
    const sent = serve([
      ['/users/me1/collection', collection()],
      ['/me/badges', badgesPage()],
    ]);
    const saved = vi.fn();
    renderApp(<CollectionSheet open onClose={() => {}} owner={yours} onShowcase={saved} />);
    const sheet = screen.getByRole('dialog', { name: 'Your collection' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Customise your badges' }));
    await userEvent.click(within(sheet).getByRole('button', { name: /Wane/ }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toEqual([expect.objectContaining({ method: 'PUT', body: { keys: ['agir', 'ders'] } })]));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(['agir', 'ders']));
    expect(within(sheet).getByRole('region', { name: 'Badges' })).toBeInTheDocument();
  });

  it('wears one of your icons with a tap, and only shows somebody else’s', async () => {
    const sent = serve([['/users/me1/collection', collection()]]);
    const { unmount } = renderApp(<CollectionSheet open onClose={() => {}} owner={yours} />);
    let sheet = screen.getByRole('dialog', { name: 'Your collection' });
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Icons' }));
    expect(await within(sheet).findByRole('button', { name: 'Star', pressed: true })).toBeInTheDocument();
    expect(within(sheet).getByText('Wearing')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Moon' }));
    expect(within(sheet).getByRole('button', { name: 'Moon', pressed: true })).toBeInTheDocument();
    await waitFor(() => expect(sent).toEqual([expect.objectContaining({ method: 'PUT', body: { sku: 'icon-moon' } })]));
    unmount();

    serve([['/users/u2/collection', collection()]]);
    renderApp(<CollectionSheet open onClose={() => {}} owner={theirs} />);
    sheet = screen.getByRole('dialog', { name: 'Hamo’s collection' });
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Icons' }));
    expect(await within(sheet).findByRole('img', { name: 'Star' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Moon' })).toBeNull();
  });

  it('says under the worn icon who gave it, and follows the icon worn next', async () => {
    const gifted = collection({
      icons: {
        items: [
          { sku: 'icon-star', name: 'Star', assetUrl: null, worn: true, giftedBy: person('u3', 'Zana') },
          { sku: 'icon-moon', name: 'Moon', assetUrl: null, worn: false, giftedBy: { ...person('u4', 'Hejar'), displayName: null } },
          { sku: 'icon-sun', name: 'Sun', assetUrl: null, worn: false, giftedBy: null },
        ],
        total: 3,
      },
    });
    serve([['/users/me1/collection', gifted]]);
    renderApp(<CollectionSheet open onClose={() => {}} owner={yours} />);
    const sheet = screen.getByRole('dialog', { name: 'Your collection' });
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Icons' }));
    expect(await within(sheet).findByText('Gift from Zana')).toBeInTheDocument();
    // Only the worn one says it: the moon’s giver shows once it is worn, by their handle where they have no name.
    expect(within(sheet).queryByText('Gift from hejar')).toBeNull();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Moon' }));
    expect(within(sheet).getByText('Gift from hejar')).toBeInTheDocument();
    expect(within(sheet).queryByText('Gift from Zana')).toBeNull();
    // An icon that was not a gift says nothing of where it came from.
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sun' }));
    expect(within(sheet).getByRole('button', { name: 'Sun', pressed: true })).toBeInTheDocument();
    expect(within(sheet).queryByText(/^Gift from/)).toBeNull();
  });

  it('sends you to the shop from an empty case of icons', async () => {
    serve([['/users/me1/collection', collection({ icons: { items: [], total: 0 } })]]);
    renderApp(<CollectionSheet open onClose={() => {}} owner={yours} />);
    const sheet = screen.getByRole('dialog', { name: 'Your collection' });
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Icons' }));
    expect(await within(sheet).findByText('No icons yet')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Visit the shop' })).toHaveAttribute('href', '/app/shop');
  });

  it('says who each gift came from, and a member the reader may not see without a name or a link', async () => {
    serve([['/users/u2/collection', collection()]]);
    renderApp(<CollectionSheet open onClose={() => {}} owner={theirs} />);
    const sheet = screen.getByRole('dialog', { name: 'Hamo’s collection' });
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Gifts' }));
    expect(within(sheet).queryByText('Sent')).toBeNull();
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Sky, ×2' }));
    expect(within(sheet).getByRole('link', { name: /Gift from Zana/ })).toHaveAttribute('href', '/app/users/u3');
    expect(within(sheet).getByText('Gift from a Hevalo member').closest('a')).toBeNull();
  });

  it('adds what you sent to your own gifts, with calm words where there is none', async () => {
    serve([['/users/me1/collection', collection({ received: { items: [], total: 0 }, sent: { items: [], total: 0 } })]]);
    renderApp(<CollectionSheet open onClose={() => {}} owner={yours} />);
    const sheet = screen.getByRole('dialog', { name: 'Your collection' });
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Gifts' }));
    expect(await within(sheet).findByText('No gifts received yet')).toBeInTheDocument();
    expect(within(sheet).getByText('No gifts sent yet')).toBeInTheDocument();
  });

  it('turns into your own collection, on the same tab, from somebody else’s', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    serve([
      ['/users/u2/collection', collection()],
      ['/users/me1/collection', collection({ icons: { items: [], total: 0 } })],
      ['/users/me1', { userId: 'me1', username: 'ada', friendStatus: 'self', private: false, earnedBadges: [earned('ders')] }],
      ['/me/badges', badgesPage()],
      ['/me', { user: { id: 'me1', email: 'a@b.c', username: 'ada', displayName: 'Ada', emailVerified: true } }],
    ]);
    renderApp(<CollectionSheet open onClose={() => {}} owner={theirs} />);
    const sheet = screen.getByRole('dialog', { name: 'Hamo’s collection' });
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Icons' }));
    await userEvent.click(await within(sheet).findByRole('button', { name: 'View your collection' }));
    expect(await screen.findByRole('dialog', { name: 'Your collection' })).toBeInTheDocument();
    expect(await screen.findByText('No icons yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View your collection' })).toBeNull();
  });
});
