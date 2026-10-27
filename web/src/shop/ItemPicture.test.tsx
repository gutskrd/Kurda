import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ItemPicture, isVideoArt } from './ItemPicture';
import { GiftItemArt } from '../gifts/GiftArt';

describe('an item’s own picture', () => {
  it('is a picture, or a silent video for a moving background', () => {
    expect(isVideoArt('/cosmetics/backgrounds/night.mp4')).toBe(true);
    expect(isVideoArt('https://cdn.test/bg/night.webm?v=2')).toBe(true);
    expect(isVideoArt('/cosmetics/backgrounds/made-01-hevalo.webp')).toBe(false);
    expect(isVideoArt('https://cdn.test/art/freeze.png')).toBe(false);

    const { container } = render(
      <>
        <ItemPicture src="https://cdn.test/art/freeze.png" />
        <ItemPicture src="/cosmetics/backgrounds/night.mp4" />
      </>,
    );
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    const video = container.querySelector('video')!;
    expect(video).toHaveAttribute('src', '/cosmetics/backgrounds/night.mp4');
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute('aria-hidden', 'true');
  });

  it('is drawn for a gift of any kind, and the kind’s glyph when there is none', () => {
    const { container } = render(
      <>
        <GiftItemArt assetUrl="https://cdn.test/art/freeze.png" category="streak_freeze" size={64} />
        <GiftItemArt assetUrl={null} category="powerup" size={64} />
      </>,
    );
    const [withPicture, without] = [...container.querySelectorAll('.gift-item-art')];
    expect(withPicture!.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/art/freeze.png');
    expect(without!.querySelector('img')).toBeNull();
    expect(without!.querySelector('svg')).not.toBeNull();
  });
});
