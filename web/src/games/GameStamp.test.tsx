import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GAME_EMBLEMS, STAMP_GLOW, STAMP_GLOW_REACH, STAMP_MEANING_INK, STAMP_NIGHT_REACH, gameEmblemHue, stampLook, stampSize } from '@kurda/shared';
import { GameStamp } from './GameStamp';

/** The stamp's box and the paper laid outside it, the day's unless the night's is asked for. */
function drawn(container: HTMLElement, scheme: 'day' | 'night' = 'day'): { stamp: HTMLElement; paper: HTMLElement; svg: SVGSVGElement } {
  const stamp = container.querySelector<HTMLElement>('.game-stamp')!;
  const paper = stamp.querySelector<HTMLElement>(`.game-stamp-paper--${scheme}`)!;
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

  /* The paper and light use the stylesheet's variables, so a scheme change repaints a drawn stamp. */
  it('draws its paper in the stylesheet’s variables, for each scheme, and hides it from a screen reader', () => {
    const { container } = render(<GameStamp game="detective" name="Detektîf" meaning="Detective" width={228} large />);
    for (const scheme of ['day', 'night'] as const) {
      const { paper, svg } = drawn(container, scheme);
      expect(paper).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      const paths = [...svg.querySelectorAll('path')];
      expect(paths.map((path) => path.getAttribute('fill')).filter((fill) => fill !== 'none')).toEqual(['var(--game-stamp-paper)']);
      expect(new Set(paths.map((path) => path.getAttribute('stroke')).filter(Boolean))).toEqual(new Set(['var(--game-stamp-glow)']));
      expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  /* At night a stamp keeps light paper and the day's deep ink, which the component passes to the stylesheet. */
  it('hands the stylesheet the paper and the ink it is printed in by night', () => {
    const { container } = render(<GameStamp game="memory-thief" name="Dizê Bîrê" meaning="The memory thief" width={169} />);
    const night = stampLook('dark', gameEmblemHue('memory-thief'));
    const { stamp } = drawn(container);
    expect(stamp.style.getPropertyValue('--game-stamp-night-paper')).toBe(night.paper);
    expect(stamp.style.getPropertyValue('--game-stamp-night-ink')).toBe(night.ink);
  });

  it('shines in full when it is the one put forward, and more quietly among others, by day and by night', () => {
    const forward = render(<GameStamp game="race" name="Pêşbaziya Nivîsandinê" width={228} large />).container;
    const among = render(<GameStamp game="race" name="Pêşbaziya Nivîsandinê" width={169} />).container;
    for (const scheme of ['day', 'night'] as const) {
      const bright = light(drawn(forward, scheme).svg);
      const quiet = light(drawn(among, scheme).svg);
      expect(bright).toHaveLength(STAMP_GLOW.length);
      expect(quiet).toHaveLength(STAMP_GLOW.length);
      bright.forEach((shows, ring) => expect(shows).toBeGreaterThan(quiet[ring]!));
      for (const shows of quiet) expect(shows).toBeGreaterThan(0);
    }
    // and by night fainter than by day, where a long light on a dark page is a fog
    light(drawn(among, 'night').svg).forEach((shows, ring) => expect(shows).toBeLessThan(light(drawn(among).svg)[ring]!));
  });

  it('lays each paper outside its own box by the reach of its light, so the light takes no room on the page', () => {
    const { container } = render(<GameStamp game="race" name="Pêşbaziya Nivîsandinê" width={169} />);
    const { height } = stampSize(169);
    const { stamp } = drawn(container);
    // the stamp's own box is the stamp
    expect(stamp.style.getPropertyValue('--game-stamp-width')).toBe('169px');
    expect(stamp.style.getPropertyValue('--game-stamp-height')).toBe(`${height}px`);
    // and each paper is told how far past it it is laid: the day's long light, the night's short one
    for (const [scheme, reach] of [['day', STAMP_GLOW_REACH], ['night', STAMP_NIGHT_REACH]] as const) {
      const { paper, svg } = drawn(container, scheme);
      expect(paper.style.getPropertyValue('--game-stamp-reach')).toBe(`${reach}px`);
      // the picture is the stamp with that reach all round it
      expect(svg).toHaveAttribute('width', String(169 + reach * 2));
      expect(svg).toHaveAttribute('height', String(height + reach * 2));
    }
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

  // A Kurmancî name on an Arabic page keeps its question mark at its end, and an Arabic meaning reads its own way.
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
 * The stamp's day and night colours live in the stylesheet, so they are checked against the shared stamp here. The
 * stylesheet is read from disk, since an imported stylesheet arrives empty in tests.
 */
describe('what a stamp is printed in, as the stylesheet says it', () => {
  /** each rule's selector and what it sets a variable to, comments taken out */
  async function rules(variable: string): Promise<Array<{ light: boolean; value: string }>> {
    interface FileSystem {
      readFileSync(file: URL, encoding: 'utf8'): string;
    }
    const fileSystem = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
    // Beside this file wherever the suite runs; the URL is held in a variable so the bundler does not treat it as an asset.
    const here = import.meta.url;
    const sheet = readFileSync(new URL('game-stamp.css', here), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    return [...sheet.matchAll(new RegExp(`([^{}]*)\\{[^{}]*${variable}:\\s*([^;]+);`, 'g'))].map((m) => ({ light: /data-theme=['"]light['"]/.test(m[1]!), value: m[2]!.trim() }));
  }

  it('is the hue’s palest step and deep shade by day, and the night’s paper and ink handed over by night', async () => {
    const papers = await rules('--game-stamp-paper');
    expect(papers.find((rule) => rule.light)?.value).toBe('var(--hue-tint)');
    expect(papers.find((rule) => !rule.light)?.value).toBe('var(--game-stamp-night-paper)');
    const inks = await rules('--game-stamp-ink');
    expect(inks.find((rule) => rule.light)?.value).toBe('var(--hue-deep)');
    expect(inks.find((rule) => !rule.light)?.value).toBe('var(--game-stamp-night-ink)');
  });

  // The night glow's strength is in the night drawing, so the stylesheet uses the hue's lifted colour as is.
  it('lights a stamp in the hue itself, its strength drawn into each scheme’s paper', async () => {
    expect((await rules('--game-stamp-glow')).map((rule) => rule.value)).toEqual(['var(--hue-base)']);
  });

  it('writes what a name means in the shared stamp’s share of the name’s ink', async () => {
    expect((await rules('--game-stamp-ink-soft')).map((rule) => rule.value)).toEqual([
      `color-mix(in srgb, var(--game-stamp-ink) ${Math.round(STAMP_MEANING_INK * 100)}%, var(--game-stamp-paper))`,
    ]);
  });
});
