import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TREE_KINDS, TREE_SPECIES, treeView, type TreeRecord, type TreeView } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { ProfileTree } from './ProfileTree';
import { TreeCard } from './TreeCard';
import { TreePage } from './TreePage';
import type { MyTree, Watered } from './useTree';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const TODAY = '2026-11-13';
const view = (over: Partial<TreeRecord> = {}, today = TODAY): TreeView =>
  treeView({ species: 'beru', plantedOn: '2026-11-01', lastWateredOn: TODAY, waterings: 5, water: 2, harvests: 0, ...over }, today);

/** GET /me/tree: this tree (or none), every kind, these bought, this much Zêr. */
const mine = (tree: TreeView | null, over: { owned?: string[]; zer?: number } = {}): MyTree => ({
  tree,
  planted: tree ? 1 : 0,
  kinds: TREE_SPECIES.map((species) => ({ ...TREE_KINDS[species], owned: TREE_KINDS[species].starter || (over.owned ?? []).includes(species) })),
  zer: over.zer ?? 0,
});

/** A server that answers each path with what it is given; a function is called with the request's body. */
function server(routes: Record<string, unknown | ((body: unknown) => unknown)>, status: Record<string, number> = {}) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://x').pathname;
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const key = `${method} ${path}`;
    if (key === 'GET /me') return jsonResponse(200, { user: { id: 'u1', username: 'ana', displayName: 'Ana', locale: 'en' } });
    if (!(key in routes)) return jsonResponse(404, { code: 'NOT_FOUND', message: 'not found' });
    const answer = routes[key];
    return jsonResponse(status[key] ?? 200, typeof answer === 'function' ? (answer as (b: unknown) => unknown)(body) : answer);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

/** Somebody is signed in: the tree is asked for only then. */
beforeEach(() => {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
});

describe('TreePage', () => {
  it('offers the kinds that are free to start from before a tree is planted, and plants the one chosen', async () => {
    const planted = mine(view({ species: 'hinar', waterings: 0, water: 1, plantedOn: TODAY }));
    const calls = server({ 'GET /me/tree': mine(null), 'POST /me/tree/plant': planted });
    renderApp(<TreePage />);
    expect(await screen.findByRole('heading', { name: 'Plant your tree' })).toBeInTheDocument();
    // the four starters, each with its Kurdish name and what it means; nothing that has to be bought
    for (const name of ['Berû', 'Hinar', 'Behîv', 'Bî']) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByText('Pomegranate')).toBeInTheDocument();
    expect(screen.queryByText('Dara Şevê')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Plant: Hinar (Pomegranate)' }));
    expect(calls.find((c) => c.path === '/me/tree/plant')?.body).toEqual({ species: 'hinar' });
    // the seed, with the water to bring it up
    expect(await screen.findByRole('heading', { name: 'Hinar' })).toBeInTheDocument();
    expect(screen.getByText('Pomegranate · Seed · Day 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Give it its first water' })).toBeEnabled();
  });

  it('shows the tree with how far it is to its next stage and the water held', async () => {
    server({ 'GET /me/tree': mine(view({ waterings: 9, water: 3 })) });
    renderApp(<TreePage />);
    expect(await screen.findByRole('heading', { name: 'Berû' })).toBeInTheDocument();
    expect(screen.getByText('Oak · Sapling · Day 13')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Next: Young tree' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '7');
    expect(screen.getByText('Water: 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Water the tree' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pour all 3' })).toBeInTheDocument();
    // it is well: nothing is said about how it fares
    expect(screen.queryByText('Thirsty')).toBeNull();
    // its seven stages, the one it is at marked
    const steps = within(screen.getByRole('list', { name: 'Stages' })).getAllByRole('listitem');
    expect(steps).toHaveLength(7);
    expect(steps[3]).toHaveAttribute('aria-current', 'step');
  });

  it('pours one water, and says so when that grew the tree', async () => {
    const before = view({ waterings: 6, water: 2 });
    const after = view({ waterings: 7, water: 1 });
    const watered: Watered = { tree: after, poured: 1, grew: 3, harvests: 0, zer: 0, revived: false };
    const calls = server({ 'GET /me/tree': mine(before), 'POST /me/tree/water': watered });
    // straight to how it stands after, as for a reader who asked for less motion
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: /reduce/.test(q), media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }));
    renderApp(<TreePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Water the tree' }));
    expect(calls.find((c) => c.path === '/me/tree/water')?.body).toEqual({ count: 1 });
    const moment = await screen.findByRole('dialog', { name: 'It grew!' });
    expect(within(moment).getByText('Now it is: Sapling.')).toBeInTheDocument();
    await userEvent.click(within(moment).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'It grew!' })).toBeNull());
    expect(screen.getByText('Water: 1')).toBeInTheDocument();
    expect(screen.getByText('Oak · Sapling · Day 13')).toBeInTheDocument();
  });

  it('pours all that is held at once, and celebrates a harvest with what it paid', async () => {
    const before = view({ waterings: 45, water: 4 });
    const after = view({ waterings: 49, water: 0, harvests: 1 });
    const calls = server({ 'GET /me/tree': mine(before, { zer: 10 }), 'POST /me/tree/water': { tree: after, poured: 4, grew: null, harvests: 1, zer: 25, revived: false } satisfies Watered });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: /reduce/.test(q), media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }));
    renderApp(<TreePage />);
    expect(await screen.findByRole('progressbar', { name: 'Next harvest' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pour all 4' }));
    expect(calls.find((c) => c.path === '/me/tree/water')?.body).toEqual({ count: 4 });
    const moment = await screen.findByRole('dialog', { name: 'Harvest!' });
    expect(moment).toHaveTextContent('+25');
    expect(screen.getByText('Harvests: 1')).toBeInTheDocument();
  });

  it('says plainly how a tree left dry is faring, and that water brought it back', async () => {
    const dry = view({ waterings: 15, water: 1, lastWateredOn: '2026-11-08' });
    expect(dry.health).toBe('wilting');
    server({ 'GET /me/tree': mine(dry), 'POST /me/tree/water': { tree: view({ waterings: 16, water: 0 }), poured: 1, grew: null, harvests: 0, zer: 0, revived: true } satisfies Watered });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: /reduce/.test(q), media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }));
    renderApp(<TreePage />);
    expect(await screen.findByText('Wilting')).toBeInTheDocument();
    expect(screen.getByText('No water for 5 days.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Water the tree' }));
    expect(await screen.findByText('It is drinking again. Welcome back.')).toBeInTheDocument();
    expect(screen.queryByText('Wilting')).toBeNull();
  });

  it('leads to a lesson when no water is held', async () => {
    server({ 'GET /me/tree': mine(view({ water: 0 })) });
    renderApp(<TreePage />);
    expect(await screen.findByText('No water left. A finished lesson earns some.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a lesson' })).toHaveAttribute('href', '/app/learn/next');
    expect(screen.queryByRole('button', { name: 'Water the tree' })).toBeNull();
  });

  it('says why when the server refuses a pour', async () => {
    server({ 'GET /me/tree': mine(view()), 'POST /me/tree/water': { code: 'TREE_NO_WATER', message: 'there is no water to pour: a lesson earns some' } }, { 'POST /me/tree/water': 409 });
    renderApp(<TreePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Water the tree' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  describe('the nursery', () => {
    it('lists every kind: the one that stands, the free ones, and the others at their price', async () => {
      server({ 'GET /me/tree': mine(view(), { zer: 900 }) });
      renderApp(<TreePage />);
      await userEvent.click(await screen.findByRole('button', { name: 'Other trees' }));
      const sheet = await screen.findByRole('dialog', { name: 'The nursery' });
      expect(within(sheet).getAllByRole('listitem')).toHaveLength(TREE_SPECIES.length);
      expect(within(sheet).getByText('Growing now')).toBeInTheDocument();
      // the oak stands: it cannot be planted over itself
      expect(within(sheet).queryByRole('button', { name: 'Plant: Berû (Oak)' })).toBeNull();
      expect(within(sheet).getByRole('button', { name: 'Plant: Hinar (Pomegranate)' })).toBeInTheDocument();
      expect(within(sheet).getByRole('button', { name: 'Buy: Tû (Mulberry)' })).toBeInTheDocument();
      expect(within(sheet).getByText('2,200')).toBeInTheDocument();
    });

    it('asks before planting another, saying what is lost and what stays, and keeps the tree when told to', async () => {
      const calls = server({ 'GET /me/tree': mine(view()), 'POST /me/tree/plant': mine(view({ species: 'bi', waterings: 0, plantedOn: TODAY })) });
      renderApp(<TreePage />);
      await userEvent.click(await screen.findByRole('button', { name: 'Other trees' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Plant: Bî (Willow)' }));
      const ask = await screen.findByRole('dialog', { name: 'Plant Bî?' });
      expect(within(ask).getByText('Your Berû will be gone, with everything it has grown. The water you hold stays with you.')).toBeInTheDocument();
      await userEvent.click(within(ask).getByRole('button', { name: 'Keep my tree' }));
      expect(calls.some((c) => c.path === '/me/tree/plant')).toBe(false);
      // back at the kinds; this time it is planted
      await userEvent.click(await screen.findByRole('button', { name: 'Plant: Bî (Willow)' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Plant it' }));
      expect(calls.find((c) => c.path === '/me/tree/plant')?.body).toEqual({ species: 'bi' });
      expect(await screen.findByRole('heading', { name: 'Bî' })).toBeInTheDocument();
      expect(screen.getByText('Willow · Seed · Day 1')).toBeInTheDocument();
    });

    it('buys a kind with Zêr, which plants nothing, and says how much is missing when it cannot be afforded', async () => {
      const calls = server({ 'GET /me/tree': mine(view(), { zer: 900 }), 'POST /me/tree/kinds/tu/buy': mine(view(), { zer: 100, owned: ['tu'] }) });
      renderApp(<TreePage />);
      await userEvent.click(await screen.findByRole('button', { name: 'Other trees' }));
      // too dear: the button is not offered a press that would be refused
      await userEvent.click(await screen.findByRole('button', { name: 'Buy: Dara Şevê (Night tree)' }));
      const dear = await screen.findByRole('dialog', { name: 'Buy Dara Şevê?' });
      expect(within(dear).getByText('You need 1,300 more Zêr.')).toBeInTheDocument();
      expect(within(dear).getByRole('button', { name: 'Buy' })).toBeDisabled();
      await userEvent.click(within(dear).getByRole('button', { name: 'Cancel' }));
      // within reach
      await userEvent.click(await screen.findByRole('button', { name: 'Buy: Tû (Mulberry)' }));
      const ask = await screen.findByRole('dialog', { name: 'Buy Tû?' });
      expect(within(ask).getByText('It costs 800 Zêr, once. After that you can plant it whenever you like.')).toBeInTheDocument();
      await userEvent.click(within(ask).getByRole('button', { name: 'Buy' }));
      expect(calls.some((c) => c.method === 'POST' && c.path === '/me/tree/kinds/tu/buy')).toBe(true);
      // theirs to plant now; the oak still stands
      const sheet = await screen.findByRole('dialog', { name: 'The nursery' });
      expect(await within(sheet).findByRole('button', { name: 'Plant: Tû (Mulberry)' })).toBeInTheDocument();
      expect(within(sheet).getByText('Yours')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Berû' })).toBeInTheDocument();
    });
  });

  it('says trees are on their way on a server that has none yet', async () => {
    server({});
    renderApp(<TreePage />);
    expect(await screen.findByText('Trees are on their way. Come back soon.')).toBeInTheDocument();
  });
});

describe('TreeCard', () => {
  it('invites planting before there is a tree', async () => {
    server({ 'GET /me/tree': mine(null) });
    renderApp(<TreeCard />);
    const card = await screen.findByRole('link', { name: /Plant your tree/ });
    expect(card).toHaveAttribute('href', '/app/tree');
  });

  it('says there is water to pour, with how much', async () => {
    server({ 'GET /me/tree': mine(view({ water: 3 })) });
    renderApp(<TreeCard />);
    const card = await screen.findByRole('link', { name: 'Berû, Seedling. You have water to pour.' });
    expect(within(card).getByText('3')).toBeInTheDocument();
  });

  it('says how a dry tree fares, and what earns water when none is held', async () => {
    server({ 'GET /me/tree': mine(view({ water: 0, lastWateredOn: '2026-11-10' })) });
    renderApp(<TreeCard />);
    expect(await screen.findByRole('link', { name: 'Berû, Seedling, Thirsty. Thirsty. A lesson earns water.' })).toBeInTheDocument();
  });

  it('is not there at all on a server without trees', async () => {
    const calls = server({});
    const { container } = renderApp(<TreeCard />);
    await waitFor(() => expect(calls.some((c) => c.path === '/me/tree')).toBe(true));
    expect(container.querySelector('.tree-card')).toBeNull();
  });
});

describe('ProfileTree', () => {
  it('shows somebody’s tree: its kind, its stage, how long it has stood and what it has borne', () => {
    renderApp(<ProfileTree tree={{ species: 'hinar', stage: 6, health: 'fresh', age: 60, harvests: 2 }} />);
    expect(screen.getByRole('img', { name: 'Hinar, Great tree' })).toBeInTheDocument();
    expect(screen.getByText('Pomegranate')).toBeInTheDocument();
    expect(screen.getByText('Great tree · Day 61 · Harvests: 2')).toBeInTheDocument();
    // somebody else's: no way to a tree that is not theirs
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says how it fares only when that is not well', () => {
    renderApp(<ProfileTree tree={{ species: 'beru', stage: 4, health: 'withered', age: 30, harvests: 0 }} />);
    expect(screen.getByText('Withered')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Berû, Young tree, Withered' })).toBeInTheDocument();
  });

  it('leads to one’s own tree, and invites planting before there is one', () => {
    const { unmount } = renderApp(<ProfileTree tree={{ species: 'beru', stage: 2, health: 'fresh', age: 3, harvests: 0 }} own />);
    expect(screen.getByRole('link', { name: 'My tree' })).toHaveAttribute('href', '/app/tree');
    unmount();
    renderApp(<ProfileTree tree={null} own />);
    expect(screen.getByRole('link', { name: /Plant your tree/ })).toHaveAttribute('href', '/app/tree');
  });

  it('shows nothing of a tree nobody has planted, a kind this page cannot draw, or on a server without trees', () => {
    const { container, rerender } = renderApp(<ProfileTree tree={null} />);
    expect(container.querySelector('.profile-tree')).toBeNull();
    rerender(<ProfileTree tree={undefined} own />);
    expect(container.querySelector('.profile-tree')).toBeNull();
    rerender(<ProfileTree tree={{ species: 'cactus' as never, stage: 3, health: 'fresh', age: 1, harvests: 0 }} />);
    expect(container.querySelector('.profile-tree')).toBeNull();
  });
});
