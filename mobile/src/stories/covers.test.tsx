// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORY_COVERS, STORY_RUGS, storyRugFor } from '@kurda/shared';
import { StoryCover } from './covers';

// a picture that loads or fails on request: jsdom fetches no images, so the test says which happened
vi.mock('react-native', async () => {
  const rnw = await import('react-native-web');
  return {
    ...rnw,
    Image: ({ source, onError }: { source: { uri: string }; onError?: () => void }) =>
      createElement('img', { src: source.uri, onError, 'data-testid': 'story-cover-picture' }),
  };
});

const SITE = 'https://hevalo.app/cosmetics/backgrounds';
const picture = (): string | null => screen.queryByTestId('story-cover-picture')?.getAttribute('src') ?? null;
/** The ground under the picture, as the browser reports a colour. */
const ground = (): string => (screen.getByTestId('story-cover') as HTMLElement).style.backgroundColor;
const rgb = (hex: string): string => `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

describe('StoryCover', () => {
  afterEach(cleanup);

  it('shows the picture the editor chose, from the website, for every cover the admin offers', () => {
    for (const c of STORY_COVERS) {
      render(<StoryCover slug="kmr-reya-gund" cover={c.key} />);
      expect(picture()).toBe(`${SITE}/${c.file}`);
      cleanup();
    }
  });

  it('lays a story without a picture on one of the seven rugs, always the same one, over that rug’s own colour', () => {
    const rug = storyRugFor('kmr-reya-gund');
    const view = render(<StoryCover slug="kmr-reya-gund" cover={null} />);
    expect(picture()).toBe(`${SITE}/${rug.file}`);
    expect(ground()).toBe(rgb(rug.ground));
    // a key no list knows is no picture either
    view.rerender(<StoryCover slug="kmr-reya-gund" cover="mountains" />);
    expect(picture()).toBe(`${SITE}/${rug.file}`);
    // and a shelf of such stories is not one rug seven times
    const seen = new Set<string>();
    for (const slug of ['kmr-qelema-sin', 'kmr-bacansor-penir-nan', 'kmr-nameya-dapire', 'kmr-top-u-ape-mehmud', 'kmr-barana-newroze', 'kmr-reya-gund', 'kmr-rovi-u-hirc']) {
      view.rerender(<StoryCover slug={slug} cover={null} />);
      seen.add(picture()!);
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
    for (const src of seen) expect(STORY_RUGS.map((r) => `${SITE}/${r.file}`)).toContain(src);
  });

  it('leaves the plain ground when the picture will not load, never a broken image', () => {
    const rug = storyRugFor('kmr-reya-gund');
    render(<StoryCover slug="kmr-reya-gund" cover={null} />);
    fireEvent.error(screen.getByTestId('story-cover-picture'));
    expect(screen.queryByTestId('story-cover-picture')).toBeNull();
    expect(ground()).toBe(rgb(rug.ground));
    cleanup();
    // a chosen picture that fails leaves the same quiet card, in the colour of the rug the story would have had
    render(<StoryCover slug="kmr-reya-gund" cover="berbang" />);
    expect(picture()).toBe(`${SITE}/made-09-berbang.webp`);
    fireEvent.error(screen.getByTestId('story-cover-picture'));
    expect(screen.queryByTestId('story-cover-picture')).toBeNull();
    expect(ground()).toBe(rgb(rug.ground));
  });

  it('tries a new picture when the story is given another after one failed', () => {
    const view = render(<StoryCover slug="kmr-reya-gund" cover="mij" />);
    fireEvent.error(screen.getByTestId('story-cover-picture'));
    view.rerender(<StoryCover slug="kmr-reya-gund" cover="bihar" />);
    expect(picture()).toBe(`${SITE}/made-17-bihar.webp`);
  });
});
