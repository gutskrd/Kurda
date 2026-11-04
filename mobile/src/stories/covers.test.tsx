// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORY_COVERS } from '@kurda/shared';
import { StoryCover, coverUri, weaveFor } from './covers';

// a picture that loads or fails on request: jsdom fetches no images, so the test says which happened
vi.mock('react-native', async () => {
  const rnw = await import('react-native-web');
  return {
    ...rnw,
    Image: ({ source, onError }: { source: { uri: string }; onError?: () => void }) =>
      createElement('img', { src: source.uri, onError, 'data-testid': 'story-cover-picture' }),
  };
});
vi.mock('react-native-svg', () => import('../reports/testing/svg'));

describe('coverUri', () => {
  it('finds a cover’s picture on the website, and nothing for no key or an unknown one', () => {
    expect(coverUri('gola-sin')).toBe('https://hevalo.app/cosmetics/backgrounds/made-06-gola-sin.webp');
    expect(coverUri('kilima-seve')).toBe('https://hevalo.app/cosmetics/backgrounds/made-27-kilima-seve.webp');
    expect(coverUri(null)).toBeNull();
    expect(coverUri('')).toBeNull();
    expect(coverUri('mountains')).toBeNull();
  });

  it('knows every cover the admin offers', () => {
    for (const c of STORY_COVERS) expect(coverUri(c.key)).toBe(`https://hevalo.app/cosmetics/backgrounds/${c.file}`);
  });
});

describe('weaveFor', () => {
  it('weaves each category in its own colours, and an unfiled story in warm stone', () => {
    expect(weaveFor('folktale').band).not.toBe(weaveFor('fable').band);
    expect(weaveFor(null)).toEqual(weaveFor('no-such-category'));
  });
});

describe('StoryCover', () => {
  afterEach(cleanup);

  it('shows the chosen picture, and the category’s kilim band in its place when it will not load', () => {
    render(<StoryCover cover="berbang" category="folktale" />);
    const picture = screen.getByTestId('story-cover-picture');
    expect(picture.getAttribute('src')).toBe('https://hevalo.app/cosmetics/backgrounds/made-09-berbang.webp');
    expect(screen.queryByTestId('story-cover-kilim')).toBeNull();
    fireEvent.error(picture);
    expect(screen.queryByTestId('story-cover-picture')).toBeNull();
    expect(screen.getByTestId('story-cover-kilim')).toBeTruthy();
  });

  it('weaves the band for a story without a picture, or with a key no list knows', () => {
    const view = render(<StoryCover cover={null} category="nature" />);
    expect(screen.getByTestId('story-cover-kilim')).toBeTruthy();
    expect(screen.queryByTestId('story-cover-picture')).toBeNull();
    view.rerender(<StoryCover cover="mountains" category="nature" />);
    expect(screen.getByTestId('story-cover-kilim')).toBeTruthy();
  });

  it('tries a new picture when the story is given another after one failed', () => {
    const view = render(<StoryCover cover="mij" category={null} />);
    fireEvent.error(screen.getByTestId('story-cover-picture'));
    view.rerender(<StoryCover cover="bihar" category={null} />);
    expect(screen.getByTestId('story-cover-picture').getAttribute('src')).toBe('https://hevalo.app/cosmetics/backgrounds/made-17-bihar.webp');
  });
});
