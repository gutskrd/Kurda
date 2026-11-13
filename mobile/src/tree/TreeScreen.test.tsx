// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { TREE_KINDS, TREE_SPECIES, treeView, type TreeRecord, type TreeView } from '@kurda/shared';
import { navigation } from '../play/testing/navigation';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import type { MyTree, Watered } from './api';
import { ProfileTree } from './ProfileTree';
import { TreeCard } from './TreeCard';
import { TreeScreen } from './TreeScreen';

// straight to how things stand after a pour, as for a reader who asked for less motion
patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(cleanup);

const TODAY = '2026-11-13';
const view = (over: Partial<TreeRecord> = {}): TreeView =>
  treeView({ species: 'beru', plantedOn: '2026-11-01', lastWateredOn: TODAY, waterings: 5, water: 2, harvests: 0, ...over }, TODAY);

/** GET /me/tree: this tree (or none), every kind, these bought, this much Zêr. */
const mine = (tree: TreeView | null, over: { owned?: string[]; zer?: number } = {}): MyTree => ({
  tree,
  planted: tree ? 1 : 0,
  kinds: TREE_SPECIES.map((species) => ({ ...TREE_KINDS[species], owned: TREE_KINDS[species].starter || (over.owned ?? []).includes(species) })),
  zer: over.zer ?? 0,
});

const missing = fail({ kind: 'client', status: 404, code: 'NOT_FOUND', message: 'no route' });

describe('the tree’s screen', () => {
  it('offers the seeds that are free to start from before a tree is planted, shows the tree the picked one will be, and plants it', async () => {
    const client = fakeClient({ 'GET /me/tree': ok(mine(null)), 'POST /me/tree/plant': ok(mine(view({ species: 'hinar', waterings: 0, water: 1, plantedOn: TODAY }))) });
    testAuth.client = client;
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Plant your tree' })).toBeTruthy();
    // the four starters, each a seed to pick; nothing that has to be bought
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    for (const name of ['Berû', 'Hinar', 'Behîv', 'Bî']) expect(screen.getByText(name)).toBeTruthy();
    expect(screen.queryByText('Dara Şevê')).toBeNull();
    // the first is picked to begin with, and what stands in the scene is the tree it will be
    expect(screen.getByRole('radio', { name: 'Berû (Oak)' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('img', { name: 'Berû (Oak)' })).toBeTruthy();
    expect(screen.getByText('The oak of the Zagros: slow to grow, and it outlasts everything.')).toBeTruthy();
    // picking another changes the tree shown, and plants nothing
    fireEvent.click(screen.getByRole('radio', { name: 'Hinar (Pomegranate)' }));
    expect(screen.getByRole('radio', { name: 'Hinar (Pomegranate)' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('img', { name: 'Hinar (Pomegranate)' })).toBeTruthy();
    expect(client.calls.some((c) => c.path === '/me/tree/plant')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Plant: Hinar (Pomegranate)' }));
    await waitFor(() => expect(client.calls.find((c) => c.path === '/me/tree/plant')?.body).toEqual({ species: 'hinar' }));
    // the seed, with the water to bring it up
    expect(await screen.findByRole('heading', { name: 'Hinar' })).toBeTruthy();
    expect(screen.getByText('Pomegranate · Seed · Day 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Give it its first water' })).toBeTruthy();
  });

  it('shows the tree with how far it is to its next stage and the water held', async () => {
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view({ waterings: 9, water: 3 }))) });
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Berû' })).toBeTruthy();
    expect(screen.getByText('Oak · Sapling · Day 13')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Berû, Sapling' })).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Next: Young tree' });
    expect(within(bar).getByText('2 / 7')).toBeTruthy();
    expect(screen.getByText('Water: 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Water the tree' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pour all 3' })).toBeTruthy();
    // it is well: nothing is said about how it fares
    expect(screen.queryByTestId('tree-health')).toBeNull();
  });

  it('pours one water, and celebrates when that grew the tree', async () => {
    const watered: Watered = { tree: view({ waterings: 7, water: 1 }), poured: 1, grew: 3, harvests: 0, zer: 0, revived: false };
    const client = fakeClient({ 'GET /me/tree': ok(mine(view({ waterings: 6, water: 2 }))), 'POST /me/tree/water': ok(watered) });
    testAuth.client = client;
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Water the tree' }));
    await waitFor(() => expect(client.calls.find((c) => c.path === '/me/tree/water')?.body).toEqual({ count: 1 }));
    expect(await screen.findByRole('heading', { name: 'It grew!' })).toBeTruthy();
    expect(screen.getByText('Now it is: Sapling.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'It grew!' })).toBeNull());
    expect(screen.getByText('Water: 1')).toBeTruthy();
    expect(screen.getByText('Oak · Sapling · Day 13')).toBeTruthy();
  });

  it('pours all that is held at once, and celebrates a harvest with what it paid', async () => {
    const after = view({ waterings: 49, water: 0, harvests: 1 });
    const client = fakeClient({ 'GET /me/tree': ok(mine(view({ waterings: 45, water: 4 }))), 'POST /me/tree/water': ok({ tree: after, poured: 4, grew: null, harvests: 1, zer: 25, revived: false } satisfies Watered) });
    testAuth.client = client;
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    expect(await screen.findByRole('progressbar', { name: 'Next harvest' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pour all 4' }));
    await waitFor(() => expect(client.calls.find((c) => c.path === '/me/tree/water')?.body).toEqual({ count: 4 }));
    expect(await screen.findByRole('heading', { name: 'Harvest!' })).toBeTruthy();
    expect(screen.getByText('+25 Zêr')).toBeTruthy();
    expect(screen.getByText('Harvests: 1')).toBeTruthy();
  });

  it('says plainly how a tree left dry is faring, and that water brought it back', async () => {
    const dry = treeView({ species: 'beru', plantedOn: '2026-11-01', lastWateredOn: '2026-11-08', waterings: 15, water: 1, harvests: 0 }, TODAY);
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(dry)), 'POST /me/tree/water': ok({ tree: view({ waterings: 16, water: 0 }), poured: 1, grew: null, harvests: 0, zer: 0, revived: true } satisfies Watered) });
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    const health = await screen.findByTestId('tree-health');
    expect(within(health).getByText('Wilting')).toBeTruthy();
    expect(within(health).getByText('No water for 5 days.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Water the tree' }));
    expect(await screen.findByText('It is drinking again. Welcome back.')).toBeTruthy();
    expect(screen.queryByTestId('tree-health')).toBeNull();
  });

  it('stands in the scene of the learner’s own season, none of it read out', async () => {
    const month = vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(3);
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view())) });
    const { unmount } = renderWithProviders(<TreeScreen onExit={() => undefined} />);
    const stage = await screen.findByTestId('tree-stage');
    // spring's blush is under the picture until it is drawn
    expect(stage.style.backgroundColor).toBe('rgb(251, 224, 234)');
    expect(within(stage).getByTestId('tree-scene')).toBeTruthy();
    // the tree is what is named; its weather is not
    expect(within(stage).getByRole('img', { name: 'Berû, Seedling' })).toBeTruthy();
    unmount();
    month.mockReturnValue(0);
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    expect((await screen.findByTestId('tree-stage')).style.backgroundColor).toBe('rgb(47, 132, 204)');
    month.mockRestore();
  });

  it('floats a thought of water by a tree that wants some, and not by one that is well', async () => {
    const dry = treeView({ species: 'beru', plantedOn: '2026-11-01', lastWateredOn: '2026-11-08', waterings: 15, water: 1, harvests: 0 }, TODAY);
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(dry)) });
    const { unmount } = renderWithProviders(<TreeScreen onExit={() => undefined} />);
    await screen.findByTestId('tree-health');
    expect(screen.getByTestId('tree-thought')).toBeTruthy();
    unmount();
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view())) });
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    await screen.findByRole('heading', { name: 'Berû' });
    expect(screen.queryByTestId('tree-thought')).toBeNull();
  });

  it('shows what is being grown toward: the next stage in a ring closed by how far it has come', async () => {
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view({ waterings: 9, water: 3 }))) });
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    await screen.findByRole('progressbar', { name: 'Next: Young tree' });
    // two of the seven waterings to the next stage
    const fill = screen.getByTestId('tree-goal-fill');
    expect(Number(fill.getAttribute('stroke-dashoffset')) / Number(fill.getAttribute('stroke-dasharray'))).toBeCloseTo(1 - 2 / 7, 4);
    // the tree itself, and the stage after it in the ring
    expect(screen.getAllByTestId('tree-art')).toHaveLength(2);
  });

  it('leads back to the lessons when no water is held', async () => {
    const onExit = vi.fn();
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view({ water: 0 }))) });
    renderWithProviders(<TreeScreen onExit={onExit} />);
    expect(await screen.findByText('No water left. A finished lesson earns some.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Water the tree' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start a lesson' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('says why when the server refuses a pour', async () => {
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view())), 'POST /me/tree/water': fail({ kind: 'client', status: 409, code: 'TREE_NO_WATER', message: 'there is no water to pour: a lesson earns some' }) });
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Water the tree' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  describe('the nursery', () => {
    it('lists every kind: the one that stands, the free ones, and the others at their price', async () => {
      testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view(), { zer: 900 })) });
      renderWithProviders(<TreeScreen onExit={() => undefined} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Other trees' }));
      expect(await screen.findByText('The nursery')).toBeTruthy();
      for (const species of TREE_SPECIES) expect(screen.getByTestId(`tree-kind-${species}`)).toBeTruthy();
      expect(within(screen.getByTestId('tree-kind-beru')).getByText('Growing now')).toBeTruthy();
      // the oak stands: it cannot be planted over itself
      expect(screen.queryByRole('button', { name: 'Plant: Berû (Oak)' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Plant: Hinar (Pomegranate)' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Buy: Tû (Mulberry)' })).toBeTruthy();
      expect(within(screen.getByTestId('tree-kind-sev')).getByText('2,200')).toBeTruthy();
    });

    it('asks before planting another, saying what is lost and what stays, and keeps the tree when told to', async () => {
      const client = fakeClient({ 'GET /me/tree': ok(mine(view())), 'POST /me/tree/plant': ok(mine(view({ species: 'bi', waterings: 0, plantedOn: TODAY }))) });
      testAuth.client = client;
      renderWithProviders(<TreeScreen onExit={() => undefined} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Other trees' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Plant: Bî (Willow)' }));
      expect(await screen.findByText('Your Berû will be gone, with everything it has grown. The water you hold stays with you.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Keep my tree' }));
      expect(client.calls.some((c) => c.path === '/me/tree/plant')).toBe(false);
      // back at the kinds; this time it is planted
      fireEvent.click(await screen.findByRole('button', { name: 'Plant: Bî (Willow)' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Plant it' }));
      await waitFor(() => expect(client.calls.find((c) => c.path === '/me/tree/plant')?.body).toEqual({ species: 'bi' }));
      expect(await screen.findByText('Willow · Seed · Day 1')).toBeTruthy();
    });

    it('buys a kind with Zêr, which plants nothing, and says how much is missing when it cannot be afforded', async () => {
      const client = fakeClient({ 'GET /me/tree': ok(mine(view(), { zer: 900 })), 'POST /me/tree/kinds/tu/buy': ok(mine(view(), { zer: 100, owned: ['tu'] })) });
      testAuth.client = client;
      renderWithProviders(<TreeScreen onExit={() => undefined} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Other trees' }));
      // too dear: no press is offered that would be refused
      fireEvent.click(await screen.findByRole('button', { name: 'Buy: Dara Şevê (Night tree)' }));
      expect(await screen.findByText('You need 1,300 more Zêr.')).toBeTruthy();
      expect(screen.getByTestId('tree-ask-confirm').getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(screen.getByTestId('tree-ask-back'));
      // within reach
      fireEvent.click(await screen.findByRole('button', { name: 'Buy: Tû (Mulberry)' }));
      expect(await screen.findByText('It costs 800 Zêr, once. After that you can plant it whenever you like.')).toBeTruthy();
      fireEvent.click(screen.getByTestId('tree-ask-confirm'));
      await waitFor(() => expect(client.calls.some((c) => c.method === 'POST' && c.path === '/me/tree/kinds/tu/buy')).toBe(true));
      // theirs to plant now; the oak still stands
      expect(await screen.findByRole('button', { name: 'Plant: Tû (Mulberry)' })).toBeTruthy();
      expect(within(screen.getByTestId('tree-kind-tu')).getByText('Yours')).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Berû' })).toBeTruthy();
    });
  });

  it('says trees are on their way on a server that has none yet', async () => {
    testAuth.client = fakeClient({ 'GET /me/tree': missing });
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    expect(await screen.findByText('Trees are on their way. Come back soon.')).toBeTruthy();
  });
});

describe('the tree’s card on Learn', () => {
  it('invites planting before there is a tree, and opens the tree', async () => {
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(null)) });
    renderWithProviders(<TreeCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plant your tree. Grow it with the water your lessons earn.' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Tree');
  });

  it('says there is water to pour, with how much', async () => {
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view({ water: 3 }))) });
    renderWithProviders(<TreeCard />);
    expect(await screen.findByRole('button', { name: 'Berû, Seedling. You have water to pour.' })).toBeTruthy();
    expect(within(screen.getByTestId('tree-card-water')).getByText('3')).toBeTruthy();
  });

  it('says how a dry tree fares, and what earns water when none is held', async () => {
    const dry = treeView({ species: 'beru', plantedOn: '2026-11-01', lastWateredOn: '2026-11-10', waterings: 5, water: 0, harvests: 0 }, TODAY);
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(dry)) });
    renderWithProviders(<TreeCard />);
    expect(await screen.findByRole('button', { name: 'Berû, Seedling, Thirsty. Thirsty. A lesson earns water.' })).toBeTruthy();
    expect(screen.queryByTestId('tree-card-water')).toBeNull();
  });

  it('is not there at all on a server without trees', async () => {
    const client = fakeClient({ 'GET /me/tree': missing });
    testAuth.client = client;
    renderWithProviders(<TreeCard />);
    await waitFor(() => expect(client.calls.some((c) => c.path === '/me/tree')).toBe(true));
    expect(screen.queryByTestId('tree-card')).toBeNull();
  });
});

describe('the tree on a profile', () => {
  it('shows somebody’s tree: its kind, its stage, how long it has stood and what it has borne', () => {
    renderWithProviders(<ProfileTree tree={{ species: 'hinar', stage: 6, health: 'fresh', age: 60, harvests: 2 }} />);
    expect(screen.getByRole('img', { name: 'Hinar, Great tree' })).toBeTruthy();
    expect(screen.getByText('Pomegranate')).toBeTruthy();
    expect(screen.getByText('Great tree · Day 61 · Harvests: 2')).toBeTruthy();
    // somebody else's: no way to a tree that is not theirs
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says how it fares only when that is not well', () => {
    renderWithProviders(<ProfileTree tree={{ species: 'beru', stage: 4, health: 'withered', age: 30, harvests: 0 }} />);
    expect(screen.getByText('Withered')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Berû, Young tree, Withered' })).toBeTruthy();
  });

  it('leads to one’s own tree, and invites planting before there is one', () => {
    const onOpen = vi.fn();
    renderWithProviders(<ProfileTree tree={{ species: 'beru', stage: 2, health: 'fresh', age: 3, harvests: 0 }} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'My tree: Berû, Seedling' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    cleanup();
    renderWithProviders(<ProfileTree tree={null} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plant your tree' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('shows nothing of a tree nobody has planted, a kind this app cannot draw, or on a server without trees', () => {
    renderWithProviders(<ProfileTree tree={null} />);
    expect(screen.queryByTestId('profile-tree')).toBeNull();
    cleanup();
    renderWithProviders(<ProfileTree tree={undefined} onOpen={() => undefined} />);
    expect(screen.queryByTestId('profile-tree')).toBeNull();
    cleanup();
    renderWithProviders(<ProfileTree tree={{ species: 'cactus' as never, stage: 3, health: 'fresh', age: 1, harvests: 0 }} />);
    expect(screen.queryByTestId('profile-tree')).toBeNull();
  });
});
