// @vitest-environment jsdom
/**
 * Any item in the shop can carry a picture an admin gave it — a power-up, a
 * streak freeze, a tag — not only backgrounds and icons. Where the API sends
 * one it is drawn, wherever the item is (the shop, the inventory, the gift
 * picker, a gift in a chat); where it sends none, the kind's glyph is.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, waitFor } from '@testing-library/react';
import type { GiftCard } from '@kurda/shared';
import { GiftBubble } from '../gifts/GiftBubble';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { ItemArt } from './ItemFilters';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const FREEZE = 'https://media.hevalo.app/cosmetic/icon/freeze.png';

async function picture(container: HTMLElement): Promise<string | null | undefined> {
  await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
  return container.querySelector('img')?.getAttribute('src');
}

describe('an item’s picture', () => {
  it('is drawn for an item of any kind that has one', async () => {
    for (const category of ['streak_freeze', 'powerup', 'tag', 'frame']) {
      const { container } = renderWithProviders(<ItemArt category={category} path={FREEZE} width={64} />);
      expect(await picture(container)).toBe(FREEZE);
      cleanup();
    }
  });

  it('is the kind’s glyph when the item has none', () => {
    const { container } = renderWithProviders(<ItemArt category="streak_freeze" path={null} width={64} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('still draws backgrounds and icons from the art that ships', async () => {
    const background = renderWithProviders(<ItemArt category="background" path="/cosmetics/backgrounds/made-06-gola-sin.webp" width={160} />);
    expect(await picture(background.container)).toBe('https://hevalo.app/cosmetics/backgrounds/made-06-gola-sin.webp');
    cleanup();
    const icon = renderWithProviders(<ItemArt category="icon" path="/cosmetics/icons/made-08-caydan.png" width={64} />);
    expect(await picture(icon.container)).toBe('https://hevalo.app/cosmetics/icons/made-08-caydan.png');
  });
});

describe('a gift of something other than a background or an icon', () => {
  const card = (assetUrl: string | null): GiftCard => ({
    batchId: 'b1',
    sku: 'streak_freeze',
    name: 'Streak freeze',
    category: 'streak_freeze',
    assetUrl,
    tier: 'common',
    recipients: [{ name: 'Rojda', avatarUrl: null, isMe: false, opened: true }],
    myGiftId: null,
    myOpened: false,
    equippable: null,
  });

  it('shows the sender its picture', async () => {
    const { container } = renderWithProviders(<GiftBubble card={card(FREEZE)} mine senderName="me" onOpen={() => undefined} />);
    expect(await picture(container)).toBe(FREEZE);
  });

  it('shows the gift glyph when it has no picture', () => {
    const { container } = renderWithProviders(<GiftBubble card={card(null)} mine senderName="me" onOpen={() => undefined} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
