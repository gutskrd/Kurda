// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { AccessibilityInfo, Animated } from 'react-native';
import { GIFT_LOOP_LIMIT, GIFT_LOOPS, giftArtKey, giftLoopPicture, type GiftArtId } from '@kurda/shared';
import { GiftArt } from './GiftLoop';
import { GiftLoopRow, GiftLoopViewport, GiftLoopViewportProvider } from './loopStage';

const LOOPING = Object.keys(GIFT_LOOPS) as GiftArtId[];
const stillOf = (id: GiftArtId): string => `/cosmetics/${giftArtKey(id)}`;

/** A picture loader that has every picture at once, except those it is told are missing. */
function pictures(missing: (uri: string) => boolean = () => false): void {
  vi.stubGlobal(
    'Image',
    class {
      onload: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      set src(uri: string) {
        setTimeout(() => (missing(uri) ? this.onerror?.({}) : this.onload?.({})), 0);
      }
    },
  );
}

beforeEach(() => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const opacityOf = (el: HTMLElement): string => getComputedStyle(el).opacity;

describe('a gift’s living picture on the phone', () => {
  it('stacks its parts over the still, swaps them in once all have loaded, and runs each round on the native driver', async () => {
    pictures();
    const loops = vi.spyOn(Animated, 'loop');
    const timings = vi.spyOn(Animated, 'timing');
    const id = LOOPING[0]!;
    const picture = giftLoopPicture(`https://hevalo.app${stillOf(id)}`)!;
    render(<GiftArt path={stillOf(id)} size={120} testID="art" />);
    const parts = screen.getByTestId('art-parts');
    const srcs = [...parts.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual([...(picture.base ? [picture.base] : []), ...picture.layers.map((l) => l.src)]);
    expect(opacityOf(parts)).toBe('0');
    await waitFor(() => expect(opacityOf(screen.getByTestId('art-parts'))).not.toBe('0'));
    expect(opacityOf(screen.getByTestId('art-still'))).toBe('0');
    const rounds = new Set(picture.loop.layers.map((l) => l.ms));
    // the clocks start in an effect just after the parts show, so they are waited for in their own right
    await waitFor(() => expect(loops).toHaveBeenCalledTimes(rounds.size));
    for (const [, config] of timings.mock.calls) expect(config).toMatchObject({ toValue: 1, useNativeDriver: true });
    expect(new Set(timings.mock.calls.map(([, config]) => (config as { duration: number }).duration))).toEqual(rounds);
  });

  it('keeps the still when a part cannot be had', async () => {
    pictures((uri) => uri.includes('/gift-loops/'));
    const loops = vi.spyOn(Animated, 'loop');
    render(<GiftArt path={stillOf(LOOPING[0]!)} size={96} testID="art" />);
    await waitFor(() => expect(screen.queryByTestId('art-parts')).toBeNull());
    expect(opacityOf(screen.getByTestId('art-still'))).not.toBe('0');
    expect(loops).not.toHaveBeenCalled();
  });

  it('is the still alone when it is not asked to play, under Reduce Motion, and for any other picture', async () => {
    pictures();
    render(<GiftArt path={stillOf(LOOPING[0]!)} size={64} play={false} testID="held" />);
    expect(screen.queryByTestId('held-parts')).toBeNull();
    render(<GiftArt path="/cosmetics/icons/made-01-hinar.png" size={64} testID="icon" />);
    expect(screen.queryByTestId('icon-parts')).toBeNull();
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    render(<GiftArt path={stillOf(LOOPING[0]!)} size={64} testID="calm" />);
    await waitFor(() => expect(screen.queryByTestId('calm-parts')).toBeNull());
    expect(screen.getByTestId('calm-still')).toBeTruthy();
  });

  it('plays a gift in a list only while its row is in view, and stops on the still when it leaves', async () => {
    pictures();
    const loops = vi.spyOn(Animated, 'loop');
    const viewport = new GiftLoopViewport();
    const show = (keys: string[]): void =>
      act(() => {
        for (const pair of viewport.pairs) pair.onViewableItemsChanged?.({ viewableItems: keys.map((key, index) => ({ key, index, isViewable: true, item: null })), changed: [] });
      });
    render(
      <GiftLoopViewportProvider viewport={viewport}>
        <GiftLoopRow id="m1">
          <GiftArt path={stillOf(LOOPING[0]!)} size={64} testID="row" />
        </GiftLoopRow>
      </GiftLoopViewportProvider>,
    );
    // Never in view: nothing fetched, nothing moving, the still alone.
    expect(screen.queryByTestId('row-parts')).toBeNull();
    show(['m1']);
    await waitFor(() => expect(opacityOf(screen.getByTestId('row-parts'))).not.toBe('0'));
    await waitFor(() => expect(loops).toHaveBeenCalled());
    const started = loops.mock.calls.length;
    show([]);
    await waitFor(() => expect(opacityOf(screen.getByTestId('row-parts'))).toBe('0'));
    expect(opacityOf(screen.getByTestId('row-still'))).not.toBe('0');
    expect(loops.mock.calls.length).toBe(started);
    show(['m1']);
    await waitFor(() => expect(opacityOf(screen.getByTestId('row-parts'))).not.toBe('0'));
  });

  it('plays only the few gifts most in view at once, the rest on their stills', async () => {
    pictures();
    const viewport = new GiftLoopViewport();
    const keys = ['a', 'b', 'c', 'd', 'e'];
    render(
      <GiftLoopViewportProvider viewport={viewport}>
        {keys.map((key, i) => (
          <GiftLoopRow key={key} id={key}>
            <GiftArt path={stillOf(LOOPING[i % LOOPING.length]!)} size={64} testID={`gift-${key}`} />
          </GiftLoopRow>
        ))}
      </GiftLoopViewportProvider>,
    );
    act(() => {
      const items = keys.map((key, index) => ({ key, index, isViewable: true, item: null }));
      viewport.pairs[0]!.onViewableItemsChanged?.({ viewableItems: items, changed: [] });
      // Only the last two are seen whole, so they come first.
      viewport.pairs[1]!.onViewableItemsChanged?.({ viewableItems: items.slice(3), changed: [] });
    });
    const playing = (): string[] => keys.filter((key) => opacityOf(screen.getByTestId(`gift-${key}-still`)) === '0');
    await waitFor(() => expect(playing()).toHaveLength(GIFT_LOOP_LIMIT));
    expect(playing()).toEqual(['a', 'd', 'e']);
  });
});
