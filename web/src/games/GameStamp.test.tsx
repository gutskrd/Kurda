import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GAME_EMBLEMS, STAMP_GLOW, STAMP_GLOW_REACH, STAMP_NIGHT_GLOW, gameEmblemHue, stampSize } from '@kurda/shared';
import { GameStamp } from './GameStamp';

/** The stamp's own box, and the paper laid outside it. */
function drawn(container: HTMLElement): { stamp: HTMLElement; paper: HTMLElement; svg: SVGSVGElement } {
  const stamp = container.querySelector<HTMLElement>('.game-stamp')!;
  const paper = stamp.querySelector<HTMLElement>('.game-stamp-paper')!;
  return { stamp, paper, svg: paper.querySelector('svg')! };
}

/** How much of each stroke of the light shows, from the widest in. */
const light = (svg: SVGSVGElement): number[] => [...svg.querySelectorAll('path[stroke]')].map((ring) => Number(ring.getAttribute('stroke-opacity')));

describe('a game’s stamp', () => {
  it('is the game’s cover, its name as a heading, and what the name means under it', () => {
    const { container } = render(<GameStamp game="rhyme" name="Peyvên Hevserwa" meaning="Rhyming words" width={169} />);
    expect(screen.getByRole('heading', { name: 'Peyvên Hevserwa', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('Rhyming words')).toBeInTheDocument();
    // the cover is decoration beside the name, as it is wherever it is drawn
    expect(container.querySelector('.game-stamp-face .gp-art')).toHaveAttribute('aria-hidden', 'true');
  });

  it('says a name once where it means only itself', () => {
    const { container, rerender } = render(<GameStamp game="peyvok" name="Peyvok" width={169} />);
    expect(container.querySelector('.game-stamp-meaning')).toBeNull();
    rerender(<GameStamp game="peyvok" name="Peyvok" meaning={null} width={169} />);
    expect(container.querySelector('.game-stamp-meaning')).toBeNull();
  });

  it('wears its game’s hue, and no two games the same', () => {
    const worn = GAME_EMBLEMS.map((game) => {
      const { container, unmount } = render(<GameStamp game={game} name={game} width={169} />);
      const hue = [...drawn(container).stamp.classList].filter((name) => name.startsWith('hue-'));
      unmount();
      expect(hue).toEqual([`hue-${gameEmblemHue(game)}`]);
      return hue[0];
    });
    expect(new Set(worn).size).toBe(GAME_EMBLEMS.length);
  });

  /*
   * The paper and its light are filled and stroked by name, with the two
   * variables the stylesheet sets from the hue for whichever scheme is on. So
   * a change of scheme repaints a stamp that is already drawn, and no colour
   * is ever written into the picture to be wrong in the other scheme.
   */
  it('draws its paper in the hue’s own variables, and hides it from a screen reader', () => {
    const { container } = render(<GameStamp game="detective" name="Detektîf" meaning="Detective" width={228} large />);
    const { paper, svg } = drawn(container);
    expect(paper).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    const paths = [...svg.querySelectorAll('path')];
    expect(paths.map((path) => path.getAttribute('fill')).filter((fill) => fill !== 'none')).toEqual(['var(--game-stamp-paper)']);
    expect(new Set(paths.map((path) => path.getAttribute('stroke')).filter(Boolean))).toEqual(new Set(['var(--game-stamp-glow)']));
    expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('shines in full when it is the one put forward, and more quietly among others', () => {
    const forward = light(drawn(render(<GameStamp game="race" name="Pêşbaziya Nivîsandinê" width={228} large />).container).svg);
    const among = light(drawn(render(<GameStamp game="race" name="Pêşbaziya Nivîsandinê" width={169} />).container).svg);
    expect(forward).toHaveLength(STAMP_GLOW.length);
    expect(among).toHaveLength(STAMP_GLOW.length);
    forward.forEach((shows, ring) => expect(shows).toBeGreaterThan(among[ring]!));
    for (const shows of among) expect(shows).toBeGreaterThan(0);
  });

  it('lays the paper outside its own box by the reach of its light, so the light takes no room on the page', () => {
    const { container } = render(<GameStamp game="race" name="Pêşbaziya Nivîsandinê" width={169} />);
    const { stamp, svg } = drawn(container);
    const { height } = stampSize(169);
    // the stamp's own box is the stamp, and the stylesheet is told how far past it the paper is laid
    expect(stamp.style.getPropertyValue('--game-stamp-width')).toBe('169px');
    expect(stamp.style.getPropertyValue('--game-stamp-height')).toBe(`${height}px`);
    expect(stamp.style.getPropertyValue('--game-stamp-reach')).toBe(`${STAMP_GLOW_REACH}px`);
    // the picture is the stamp with that reach all round it
    expect(svg).toHaveAttribute('width', String(169 + STAMP_GLOW_REACH * 2));
    expect(svg).toHaveAttribute('height', String(height + STAMP_GLOW_REACH * 2));
  });

  it('is as tall for a long name as for a short one, so a row of stamps stands level', () => {
    const tall = (name: string, meaning?: string): string => {
      const { container, unmount } = render(<GameStamp game="race" name={name} meaning={meaning} width={165} />);
      const height = drawn(container).stamp.style.getPropertyValue('--game-stamp-height');
      unmount();
      return height;
    };
    expect(tall('Peyvok')).toBe(tall('Pêşbaziya Nivîsandinê', 'Carrera de escritura'));
  });

  // a Kurmancî name on an Arabic page keeps its question mark at its end, and an Arabic meaning under a Latin name reads its own way
  it('writes the name and its meaning each in its own direction', () => {
    render(<GameStamp game="who-am-i" name="Ez kî me?" meaning="من أنا؟" width={165} />);
    expect(screen.getByRole('heading', { name: 'Ez kî me?' })).toHaveAttribute('dir', 'auto');
    expect(screen.getByText('من أنا؟')).toHaveAttribute('dir', 'auto');
  });

  it('hands its cover’s own box to whoever carries the cover to the game’s page', () => {
    const cover = createRef<HTMLSpanElement>();
    render(<GameStamp game="peyvok" name="Peyvok" width={169} coverRef={cover} />);
    expect(cover.current).toHaveClass('gp-art');
  });
});

/*
 * How much of a stamp's light is left by night is said in the stylesheet, as
 * a share of the hue mixed into nothing, because a change of scheme repaints
 * a stamp without drawing it again. The phone app takes the same share from
 * the shared stamp, so the stylesheet is read here as it is written and held
 * to it. It is read from the disk: the suite draws no styles, and a
 * stylesheet a test imports arrives empty.
 */
describe('a stamp’s light by night', () => {
  it('is the shared stamp’s share of the day’s, and the whole of it by day', async () => {
    interface FileSystem {
      readFileSync(file: URL, encoding: 'utf8'): string;
    }
    const fileSystem = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
    // beside this file, wherever the suite is run from; the address is taken first, or the bundler reads the pair as an asset to serve
    const here = import.meta.url;
    const sheet = readFileSync(new URL('game-stamp.css', here), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const glows = [...sheet.matchAll(/([^{}]*)\{[^{}]*--game-stamp-glow:\s*([^;]+);/g)].map((m) => ({ light: /data-theme=['"]light['"]/.test(m[1]!), value: m[2]!.trim() }));
    expect(glows.find((glow) => !glow.light)?.value).toBe(`color-mix(in srgb, var(--hue-base) ${STAMP_NIGHT_GLOW * 100}%, transparent)`);
    expect(glows.find((glow) => glow.light)?.value).toBe('var(--hue-base)');
  });
});
