// @vitest-environment jsdom
/**
 * The equipped background and icon on a profile load on a phone: the art the
 * shop ships with arrives as a path on the website, which the phone resolves
 * against the site, and art uploaded in the admin as a whole CDN address,
 * which it keeps.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { cleanup, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { CosmeticBackground, IconOverlay } from './cosmetic-parts';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const UPLOADED = `https://media.hevalo.app/cosmetic/background/${'ab'.repeat(32)}.webp`;

const src = async (container: HTMLElement): Promise<string | null | undefined> => {
  // the picture is drawn once it starts loading, an effect after the element
  await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
  return container.querySelector('img')?.getAttribute('src');
};

describe('the equipped background', () => {
  it('loads the art that ships from the website', async () => {
    const { container } = renderWithProviders(
      <CosmeticBackground background={{ sku: 'bg-made-gola-sin', assetKey: 'backgrounds/made-06-gola-sin.webp', type: 'image', url: '/cosmetics/backgrounds/made-06-gola-sin.webp', giftedBy: null }} />,
    );
    expect(await src(container)).toBe('https://hevalo.app/cosmetics/backgrounds/made-06-gola-sin.webp');
  });

  it('loads uploaded art from where the API says it is', async () => {
    const { container } = renderWithProviders(
      <CosmeticBackground background={{ sku: 'bg-new', assetKey: 'cosmetic/background/x.webp', type: 'image', url: UPLOADED, giftedBy: null }} />,
    );
    expect(await src(container)).toBe(UPLOADED);
  });
});

describe('the equipped icon', () => {
  it('loads the icon that ships from the website, and an uploaded one from the CDN', async () => {
    const shipped = renderWithProviders(
      <IconOverlay icon={{ sku: 'icon-made-caydan', assetKey: 'icons/made-08-caydan.png', url: '/cosmetics/icons/made-08-caydan.png', giftedBy: null }} size={96} />,
    );
    expect(await src(shipped.container)).toBe('https://hevalo.app/cosmetics/icons/made-08-caydan.png');
    const icon = UPLOADED.replace('background', 'icon').replace('.webp', '.png');
    const uploaded = renderWithProviders(<IconOverlay icon={{ sku: 'icon-new', assetKey: 'cosmetic/icon/x.png', url: icon, giftedBy: null }} size={96} />);
    expect(await src(uploaded.container)).toBe(icon);
  });
});
