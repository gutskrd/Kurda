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
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { TREE_KINDS, TREE_SPECIES, treeView, type TreeRecord, type TreeView } from '@kurda/shared';
import { navigation } from '../play/testing/navigation';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import type { MyTree, Watered } from './api';
import { TreeScreen } from './TreeScreen';

// The screen in motion, with motion allowed; `TreeScreen.test.tsx` covers it standing still.
patchReactNativeWeb({ reduceMotion: false });
beforeEach(() => navigation.navigate.mockReset());
afterEach(cleanup);

const TODAY = '2026-11-13';
const view = (over: Partial<TreeRecord> = {}): TreeView =>
  treeView({ species: 'beru', plantedOn: '2026-11-01', lastWateredOn: TODAY, waterings: 10, water: 2, harvests: 0, ...over }, TODAY);
const mine = (tree: TreeView | null): MyTree => ({ tree, planted: tree ? 1 : 0, kinds: TREE_SPECIES.map((species) => ({ ...TREE_KINDS[species], owned: TREE_KINDS[species].starter })), zer: 0 });

describe('the tree’s screen, moving', () => {
  it('plays the pour in the scene, lets the tree be seen to grow where it stands, and only then says that it grew', async () => {
    const watered: Watered = { tree: view({ waterings: 18, water: 1 }), poured: 1, grew: 3, harvests: 0, zer: 0, revived: false };
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view({ waterings: 17, water: 2 }))), 'POST /me/tree/water': ok(watered) });
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Water the tree' }));
    // The can is over the tree, with the water falling from it, and there is no pouring twice.
    expect(await screen.findByTestId('tree-pour')).toBeTruthy();
    expect(screen.getAllByTestId('tree-pour-drop').length).toBeGreaterThan(8);
    expect(screen.getByTestId('tree-water').getAttribute('aria-disabled')).toBe('true');
    // It still shows the tree as it was: the water's effect comes once it has landed.
    expect(screen.getByText('Oak · Seedling · Day 13')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'It grew!' })).toBeNull();
    // Then it grows in the scene itself, out of a burst of light and out of the old tree, before anything is said.
    await waitFor(() => expect(screen.queryByTestId('tree-burst')).not.toBeNull(), { timeout: 3000 });
    expect(screen.getByTestId('tree-was-grow')).toBeTruthy();
    expect(screen.queryByTestId('tree-pour')).toBeNull();
    expect(screen.getByText('Oak · Sapling · Day 13')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'It grew!' })).toBeNull();
    expect(await screen.findByRole('heading', { name: 'It grew!' }, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByTestId('tree-burst')).toBeNull();
    expect(screen.queryByTestId('tree-was-grow')).toBeNull();
  });

  it('hangs a swing from a great tree that is well, and none from one left to wilt', async () => {
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view({ waterings: 130 }))) });
    const well = renderWithProviders(<TreeScreen onExit={() => undefined} />);
    expect(await screen.findByTestId('tree-art-swing')).toBeTruthy();
    well.unmount();
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view({ waterings: 130, lastWateredOn: '2026-11-08' }))) });
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    await screen.findByTestId('tree-health');
    expect(screen.queryByTestId('tree-art-swing')).toBeNull();
  });

  it('stands sparks round a tree that has drunk without growing', async () => {
    const watered: Watered = { tree: view({ waterings: 11, water: 1 }), poured: 1, grew: null, harvests: 0, zer: 0, revived: false };
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view({ waterings: 10, water: 2 }))), 'POST /me/tree/water': ok(watered) });
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Water the tree' }));
    expect(await screen.findByTestId('tree-pour')).toBeTruthy();
    expect(await screen.findByTestId('tree-cheer', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByTestId('tree-burst')).toBeNull();
    expect(screen.getByText('Water: 1')).toBeTruthy();
  });

  it('blows the season past the tree, and stills it round one left to wilt but for the snow', async () => {
    const month = vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(3);
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view({ species: 'behiv', waterings: 80 }))) });
    const spring = renderWithProviders(<TreeScreen onExit={() => undefined} />);
    expect(await screen.findByTestId('tree-air-petals')).toBeTruthy();
    spring.unmount();
    month.mockReturnValue(9);
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(view({ waterings: 80 }))) });
    const autumn = renderWithProviders(<TreeScreen onExit={() => undefined} />);
    expect(await screen.findByTestId('tree-air-leaves')).toBeTruthy();
    autumn.unmount();
    const dry = treeView({ species: 'behiv', plantedOn: '2026-11-01', lastWateredOn: '2026-11-08', waterings: 80, water: 1, harvests: 0 }, TODAY);
    testAuth.client = fakeClient({ 'GET /me/tree': ok(mine(dry)) });
    const wilting = renderWithProviders(<TreeScreen onExit={() => undefined} />);
    await screen.findByTestId('tree-health');
    expect(screen.queryByTestId('tree-air-leaves')).toBeNull();
    wilting.unmount();
    month.mockReturnValue(0);
    renderWithProviders(<TreeScreen onExit={() => undefined} />);
    await screen.findByTestId('tree-health');
    expect(screen.getByTestId('tree-air-snow')).toBeTruthy();
    month.mockRestore();
  });
});
