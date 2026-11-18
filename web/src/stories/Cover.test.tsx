import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { STORY_COVERS, STORY_RUGS, storyRugFor } from '@kurda/shared';
import { StoryCover } from './Cover';

const rgb = (hex: string): string => `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

describe('a story’s cover', () => {
  it('draws the picture its key names from the shared list', () => {
    const { container } = render(<StoryCover slug="kmr-reya-gund" cover="gola-sin" />);
    const img = container.querySelector('.story-cover img');
    expect(img).toHaveAttribute('src', '/cosmetics/backgrounds/made-06-gola-sin.webp');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(container.querySelector('.story-cover')).toHaveAttribute('aria-hidden', 'true');
    // No drawing of its own: a picture, or a plain ground.
    expect(container.querySelector('svg')).toBeNull();
  });

  it('asks for the story page’s own picture at once', () => {
    const { container } = render(<StoryCover slug="kmr-reya-gund" cover="kilima-sor" eager />);
    expect(container.querySelector('img')).toHaveAttribute('loading', 'eager');
  });

  it('lays a story without a picture, or with a key the list does not know, on its own rug over that rug’s colour', () => {
    const rug = storyRugFor('kmr-reya-gund');
    for (const cover of [null, 'hamo']) {
      const { container, unmount } = render(<StoryCover slug="kmr-reya-gund" cover={cover} />);
      expect(container.querySelector('img')).toHaveAttribute('src', `/cosmetics/backgrounds/${rug.file}`);
      expect((container.querySelector('.story-cover') as HTMLElement).style.backgroundColor).toBe(rgb(rug.ground));
      unmount();
    }
    // A shelf of them is not one rug over and over.
    const seen = new Set(['kmr-qelema-sin', 'kmr-bacansor-penir-nan', 'kmr-nameya-dapire', 'kmr-top-u-ape-mehmud', 'kmr-barana-newroze', 'kmr-reya-gund', 'kmr-rovi-u-hirc'].map((sl) => storyRugFor(sl).key));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    for (const key of seen) expect(STORY_RUGS.map((r) => r.key)).toContain(key);
  });

  it('leaves the plain ground when the picture will not load, never a broken image', () => {
    const rug = storyRugFor('kmr-reya-gund');
    const broken = render(<StoryCover slug="kmr-reya-gund" cover="bihar" />);
    fireEvent.error(broken.container.querySelector('img')!);
    expect(broken.container.querySelector('img')).toBeNull();
    expect((broken.container.querySelector('.story-cover') as HTMLElement).style.backgroundColor).toBe(rgb(rug.ground));
    // Given another picture, it tries that one.
    broken.rerender(<StoryCover slug="kmr-reya-gund" cover="mij" />);
    expect(broken.container.querySelector('img')).toHaveAttribute('src', '/cosmetics/backgrounds/made-19-mij.webp');
  });

  it('knows a path for every cover the admin can choose, and the site serves a file there', () => {
    // Vite's view of the served folder, so a moved cover file fails here.
    const served = new Set(Object.keys(import.meta.glob('/public/cosmetics/backgrounds/*.webp')).map((p) => p.replace(/^\/public/, '')));
    for (const c of STORY_COVERS) {
      expect(served).toContain(`/cosmetics/backgrounds/${c.file}`);
      const { container, unmount } = render(<StoryCover slug="kmr-reya-gund" cover={c.key} />);
      expect(container.querySelector('img')?.getAttribute('src')).toBe(`/cosmetics/backgrounds/${c.file}`);
      unmount();
    }
  });
});
