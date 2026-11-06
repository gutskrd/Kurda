import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { STORY_COVERS } from '@kurda/shared';
import { StoryCover, kilimBand } from './Cover';

describe('a story’s cover', () => {
  it('draws the picture its key names from the shared list', () => {
    const { container } = render(<StoryCover cover="gola-sin" category="nature" />);
    const img = container.querySelector('.story-cover img');
    expect(img).toHaveAttribute('src', '/cosmetics/backgrounds/made-06-gola-sin.webp');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(container.querySelector('.story-cover')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('asks for the story page’s own picture at once', () => {
    const { container } = render(<StoryCover cover="kilima-sor" category={null} eager />);
    expect(container.querySelector('img')).toHaveAttribute('loading', 'eager');
  });

  it('weaves the category’s band for no key, for a key the list does not know, and for a picture that will not load', () => {
    const none = render(<StoryCover cover={null} category="fable" />);
    expect(none.container.querySelector('.story-cover svg')).not.toBeNull();
    expect(none.container.querySelector('img')).toBeNull();
    none.unmount();

    // a character's id was a cover once; it is not one of the list's pictures
    const unknown = render(<StoryCover cover="hamo" category="fable" />);
    expect(unknown.container.querySelector('img')).toBeNull();
    expect(unknown.container.querySelector('.story-cover svg')).not.toBeNull();
    unknown.unmount();

    const broken = render(<StoryCover cover="bihar" category="fable" />);
    fireEvent.error(broken.container.querySelector('img')!);
    expect(broken.container.querySelector('img')).toBeNull();
    expect(broken.container.querySelector('.story-cover svg')).not.toBeNull();
  });

  it('gives a category the same weave every time, and every category one', () => {
    expect(kilimBand('fable')).toBe(kilimBand('fable'));
    expect(kilimBand('fable')).not.toBe(kilimBand('legend'));
    // a category this file has never heard of still gets a band, not the stone of an unfiled story
    expect(kilimBand('poems')).not.toBe(kilimBand(null));
  });

  it('knows a path for every cover the admin can choose, and the site serves a file there', () => {
    // Vite's own view of the folder the site serves, so a cover whose file was moved fails here
    const served = new Set(Object.keys(import.meta.glob('/public/cosmetics/backgrounds/*.webp')).map((p) => p.replace(/^\/public/, '')));
    for (const c of STORY_COVERS) {
      expect(served).toContain(`/cosmetics/backgrounds/${c.file}`);
      const { container, unmount } = render(<StoryCover cover={c.key} category={null} />);
      expect(container.querySelector('img')?.getAttribute('src')).toBe(`/cosmetics/backgrounds/${c.file}`);
      unmount();
    }
  });
});
