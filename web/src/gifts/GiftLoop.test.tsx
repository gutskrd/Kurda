import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { GIFT_LOOPS, giftArtKey, giftLoopPicture, type GiftArtId } from '@kurda/shared';
import { GiftItemArt } from './GiftArt';
import { GiftLoopArt, loopCss } from './GiftLoop';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A browser that plays motion, or one asked for less of it. */
function motion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('prefers-reduced-motion'), media: query, addEventListener() {}, removeEventListener() {} }));
}

const LOOPING = Object.keys(GIFT_LOOPS) as GiftArtId[];
const stillOf = (id: GiftArtId): string => `/cosmetics/${giftArtKey(id)}`;

describe('a gift’s living picture', () => {
  it('stacks its parts over the still, shows them only once all have loaded, and plays them on screen', () => {
    motion(false);
    const id = LOOPING[0]!;
    const picture = giftLoopPicture(stillOf(id))!;
    const { container } = render(<GiftLoopArt src={stillOf(id)} />);
    const root = container.querySelector('.gift-loop')!;
    expect(root.querySelector('img.gift-loop-still')).toHaveAttribute('src', stillOf(id));
    const parts = [...root.querySelectorAll<HTMLImageElement>('img.gift-loop-part')];
    expect(parts.map((p) => p.getAttribute('src'))).toEqual([...(picture.base ? [picture.base] : []), ...picture.layers.map((l) => l.src)]);
    expect(root).toHaveAttribute('data-ready', 'false');
    expect(root).toHaveAttribute('data-playing', 'false');
    for (const part of parts) fireEvent.load(part);
    expect(root).toHaveAttribute('data-ready', 'true');
    expect(root).toHaveAttribute('data-playing', 'true');
    const moving = root.querySelector<HTMLElement>(`[data-layer="${picture.layers[0]!.layer.name}"]`)!;
    expect(moving.style.animation).toContain(`gift-loop-${id}-${picture.layers[0]!.layer.name}`);
  });

  it('keeps the still when a part cannot be had, when less motion is asked for, and for any other picture', () => {
    motion(false);
    const id = LOOPING[0]!;
    const { container } = render(<GiftLoopArt src={stillOf(id)} />);
    fireEvent.error(container.querySelector('img.gift-loop-part')!);
    expect(container.querySelectorAll('img.gift-loop-part')).toHaveLength(0);
    expect(container.querySelector('.gift-loop')).toHaveAttribute('data-ready', 'false');

    motion(true);
    const calm = render(<GiftLoopArt src={stillOf(id)} />);
    expect(calm.container.querySelector('.gift-loop')).toBeNull();
    expect(calm.container.querySelector('img')).toHaveAttribute('src', stillOf(id));

    motion(false);
    const icon = render(<GiftLoopArt src="/cosmetics/icons/made-01-hinar.png" />);
    expect(icon.container.querySelector('.gift-loop')).toBeNull();
  });

  it('is asked for by the item art only where it should play, a still everywhere else', () => {
    motion(false);
    const id = LOOPING[0]!;
    const still = render(<GiftItemArt assetUrl={stillOf(id)} category="gift" />);
    expect(still.container.querySelector('.gift-loop')).toBeNull();
    const living = render(<GiftItemArt assetUrl={stillOf(id)} category="gift" loop />);
    expect(living.container.querySelector('.gift-loop')).not.toBeNull();
  });

  it('writes each round as keyframes on transform and opacity only, starting and ending on the same frame', () => {
    for (const id of LOOPING) {
      const loop = GIFT_LOOPS[id]!;
      const css = loopCss(id, loop);
      for (const [, name, body] of css.matchAll(/@keyframes gift-loop-[a-z-]+?-([a-zA-Z0-9]+)\{(.*?\})\}/g)) {
        expect(loop.layers.map((l) => l.name), id).toContain(name);
        const frames = [...body!.matchAll(/([\d.]+)%\{([^}]*)\}/g)];
        expect(frames[0]![1], `${id} ${name}`).toBe('0');
        expect(frames[frames.length - 1]![1], `${id} ${name}`).toBe('100');
        for (const [, , props] of frames) for (const prop of props!.split(';')) expect(['transform', 'opacity'], `${id} ${name}`).toContain(prop.split(':')[0]);
      }
    }
  });
});
