/**
 * The equipped background and icon are drawn from whatever URL the API gives:
 * a path on this site for the art the shop ships with, a whole CDN address for
 * art uploaded in the admin. Neither is rewritten on the way.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CosmeticBackground, IconOverlay } from './cosmetic-parts';

const UPLOADED = `https://media.hevalo.app/cosmetic/background/${'ab'.repeat(32)}.webp`;

describe('equipped cosmetics', () => {
  it('draw the art that ships from this site', () => {
    const { container } = render(
      <>
        <CosmeticBackground background={{ sku: 'bg', assetKey: 'backgrounds/a.webp', type: 'image', url: '/cosmetics/backgrounds/a.webp' }} />
        <IconOverlay icon={{ sku: 'ic', assetKey: 'icons/a.png', url: '/cosmetics/icons/a.png' }} />
      </>,
    );
    expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
      '/cosmetics/backgrounds/a.webp',
      '/cosmetics/icons/a.png',
    ]);
  });

  it('draw uploaded art from the CDN address it came with', () => {
    const icon = UPLOADED.replace('background', 'icon').replace('.webp', '.png');
    const { container } = render(
      <>
        <CosmeticBackground background={{ sku: 'bg', assetKey: 'cosmetic/background/x.webp', type: 'image', url: UPLOADED }} />
        <IconOverlay icon={{ sku: 'ic', assetKey: 'cosmetic/icon/x.png', url: icon }} />
      </>,
    );
    expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([UPLOADED, icon]);
  });
});
