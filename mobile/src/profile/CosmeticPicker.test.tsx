// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import type { InventoryItem } from './cosmetics';
import { CosmeticPicker } from './CosmeticPicker';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(cleanup);

const owned = (sku: string, name: string, category: string, assetUrl: string | null = null): InventoryItem => ({
  sku,
  name,
  category,
  quantity: 1,
  premiumOnly: category === 'icon',
  assetUrl,
});

const BACKGROUNDS = [
  owned('bg-made-hevalo', 'Hevalo', 'background', '/cosmetics/backgrounds/made-01-hevalo.webp'),
  owned('bg-made-gola-sin', 'Gola Şîn', 'background', '/cosmetics/backgrounds/made-06-gola-sin.webp'),
];
const ICONS = [owned('icon-made-caydan', 'Îstîkan', 'icon', '/cosmetics/icons/made-08-caydan.png')];
const FRAMES = [owned('frame_rank_gir', 'Gir frame', 'frame'), owned('frame_rank_zozan', 'Zozan frame', 'frame')];
const TAG = owned('tag_kurdish', 'Kurdish Tag', 'tag');

function open(items: InventoryItem[], { frameSku = null as string | null, equippedIcon = 'icon-made-caydan' } = {}) {
  const client = fakeClient({
    'GET /me/inventory': ok({ items, refreshedItems: [] }),
    'GET /users/me': ok({ frameSku }),
    'PUT /me/cosmetics/icon': ok({ iconSku: null }),
    'PUT /me/cosmetics/background': ok({ backgroundSku: 'bg-made-gola-sin' }),
    'PUT /me/cosmetics/frame': (body) => ok({ frameSku: (body as { sku: string | null }).sku }),
  });
  testAuth.client = client;
  const onChanged = vi.fn();
  renderWithProviders(
    <CosmeticPicker equippedBackground="bg-made-hevalo" equippedIcon={equippedIcon} iconVisible onChanged={onChanged} />,
  );
  return { client, onChanged };
}

describe('the inventory (Edit profile → Cosmetics)', () => {
  it('sorts what you own into kinds, each tab with how many there are', async () => {
    open([...BACKGROUNDS, ...ICONS, ...FRAMES, TAG]);
    const tabs = await screen.findByRole('tablist', { name: 'What you own' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Backgrounds, 2 items',
      'Icons, 1 item',
      'Frames, 2 items',
      'Tags, 1 item',
    ]);
    expect(within(tabs).getByRole('tab', { name: 'Backgrounds, 2 items' }).getAttribute('aria-selected')).toBe('true');
  });

  it('names every item under its picture, and says which one you are wearing', async () => {
    open([...BACKGROUNDS, ...ICONS]);
    expect(await screen.findByText('Gola Şîn')).toBeTruthy();
    expect(screen.getByText('Hevalo')).toBeTruthy();
    // what is worn is said in words, not only drawn
    expect(screen.getByRole('button', { name: 'Hevalo, equipped' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gola Şîn' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Icons, 1 item' }));
    expect(screen.getByText('Îstîkan')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Îstîkan, equipped' })).toBeTruthy();
    // the switch that hides the icon without giving it up lives with the icons
    expect(screen.getByRole('switch', { name: 'Show premium icon on my profile' })).toBeTruthy();
  });

  it('puts one on with a tap, and takes off the one you are wearing', async () => {
    const { client, onChanged } = open([...BACKGROUNDS, ...ICONS]);
    fireEvent.click(await screen.findByRole('button', { name: 'Gola Şîn' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(client.calls.find((c) => c.method === 'PUT')).toMatchObject({ path: '/me/cosmetics/background', body: { sku: 'bg-made-gola-sin' } });

    fireEvent.click(screen.getByRole('tab', { name: 'Icons, 1 item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Îstîkan, equipped' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
    expect(client.calls.filter((c) => c.method === 'PUT')[1]).toMatchObject({ path: '/me/cosmetics/icon', body: { sku: null } });
  });

  it('wears and takes off season frames here, as the Season screen does', async () => {
    const { client } = open([...BACKGROUNDS, ...FRAMES], { frameSku: 'frame_rank_zozan' });
    fireEvent.click(await screen.findByRole('tab', { name: 'Frames, 2 items' }));
    // a frame is named for its tier, in the reader's language
    expect(screen.getByText('Gir')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Zozan season frame, equipped' })).toBeTruthy();

    /*
     * Each tap is made inside act(), so its answer has come back and the tile
     * has been told what it does now before it is tapped again. The tile's
     * press handler hears that in an effect after the draw; a second tap that
     * landed in between still ran the handler from while the first was
     * saving, which ignores a tap, and nothing was sent.
     */
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gir season frame' }));
    });
    expect(screen.getByRole('button', { name: 'Gir season frame, equipped' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zozan season frame' })).toBeTruthy();
    expect(client.calls.find((c) => c.method === 'PUT')).toMatchObject({ path: '/me/cosmetics/frame', body: { sku: 'frame_rank_gir' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gir season frame, equipped' }));
    });
    expect(client.calls.filter((c) => c.method === 'PUT')[1]).toMatchObject({ body: { sku: null } });
    expect(screen.getByRole('button', { name: 'Gir season frame' })).toBeTruthy();
  });

  it('says how frames are earned when you have none, with the way to the season', async () => {
    open(BACKGROUNDS);
    fireEvent.click(await screen.findByRole('tab', { name: 'Frames, 0 items' }));
    expect(screen.getByText('No frames yet. When a season ends, everyone who played enough rated games gets a profile frame.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'See this season' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Season');
  });

  it('shows the Kurdish tag as yours, with the way to where it is shown', async () => {
    open([...BACKGROUNDS, TAG]);
    fireEvent.click(await screen.findByRole('tab', { name: 'Tags, 1 item' }));
    expect(screen.getByText('Kurdish Tag')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Tags & badges' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Tags');
  });

  it('opens on the first kind you own any of, and points to the Shop for a kind you have none of', async () => {
    open(ICONS);
    expect(await screen.findByRole('button', { name: 'Îstîkan, equipped' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Backgrounds, 0 items' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open the Shop' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Shop');
  });

  it('offers a search past eight of a kind, with the Kurdish letters left out', async () => {
    const many = Array.from({ length: 8 }, (_, i) => owned(`bg-${i}`, `Kilîma ${i}`, 'background'));
    open([...BACKGROUNDS, ...many]);
    const field = await screen.findByLabelText('Search what you own');
    fireEvent.change(field, { target: { value: 'gola sin' } });
    expect(screen.getByRole('button', { name: 'Gola Şîn' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kilîma 3' })).toBeNull();

    fireEvent.change(field, { target: { value: 'xyzzy' } });
    expect(screen.getByText('Nothing matches that')).toBeTruthy();

    // eight or fewer: no field
    fireEvent.click(screen.getByRole('tab', { name: 'Icons, 0 items' }));
    expect(screen.queryByLabelText('Search what you own')).toBeNull();
  });
});
