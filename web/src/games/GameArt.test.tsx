import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { gameEmblemLayers } from '@kurda/shared';
import { GameArt } from './GameArt';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The reader's setting for less motion, as the browser reports it. */
function lessMotion(on: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: on && query === '(prefers-reduced-motion: reduce)', media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
}

describe('a game’s emblem', () => {
  it('is one still picture, hidden from a screen reader, unless it is asked to move', () => {
    lessMotion(false);
    const { container } = render(<GameArt game="peyvok" size={84} />);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('.gp-art--moving')).toBeNull();
    expect(container.querySelector('.gp-art')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is laid out in its layers when it moves, each turning about its own pivot', () => {
    lessMotion(false);
    const { container } = render(<GameArt game="memory-thief" size={120} moving />);
    const layers = gameEmblemLayers({ game: 'memory-thief', size: 120 });
    const drawn = [...container.querySelectorAll<HTMLElement>('.gp-art-layer')];
    expect(drawn).toHaveLength(layers.length);
    expect(container.querySelectorAll('svg')).toHaveLength(layers.length);
    // the lifted word turns about its own middle, not the picture's
    expect(drawn[1]!.style.transformOrigin).toBe('88px 25px');
    expect(container.querySelector('.gp-art--moving')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives every drawing ids of its own, so two of the same emblem on a page do not share a clip path', () => {
    lessMotion(false);
    const { container } = render(
      <>
        <GameArt game="rhyme" moving />
        <GameArt game="rhyme" moving />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * One emblem with the screen to itself acts for as long as it is seen; a
   * shelf of them would be eight things acting for ever, so there each plays
   * through once and rests, and once more when its card is touched.
   */
  it('loops when it is the one put forward, and plays through once on a shelf, and again when asked', () => {
    lessMotion(false);
    const asked: Array<{ iterations?: number; delay?: number }> = [];
    const played: number[] = [];
    let state: AnimationPlayState = 'paused';
    const animate = vi.fn((_frames: unknown, options: { iterations?: number; delay?: number }) => {
      asked.push(options);
      return {
        get playState() {
          return state;
        },
        currentTime: 0,
        play() {
          played.push(this.currentTime);
          state = 'running';
        },
        pause() {
          state = 'paused';
        },
        cancel: () => undefined,
      };
    });
    const proto = HTMLElement.prototype as unknown as { animate?: unknown };
    const before = proto.animate;
    proto.animate = animate;
    // nothing to watch with, as in a test: a shelf emblem plays through as it is drawn
    vi.stubGlobal('IntersectionObserver', undefined);
    try {
      const hero = render(<GameArt game="rhyme" moving />);
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.every((o) => o.iterations === Infinity)).toBe(true);
      hero.unmount();

      asked.length = 0;
      played.length = 0;
      const shelf = render(<GameArt game="rhyme" moving="once" after={300} />);
      expect(asked.every((o) => o.iterations === 1 && o.delay === 300)).toBe(true);
      const firstRun = played.length;
      expect(firstRun).toBe(asked.length);

      // while it is still playing, a hand on its card does not start it over
      shelf.rerender(<GameArt game="rhyme" moving="once" after={300} again={1} />);
      expect(played).toHaveLength(firstRun);
      // at rest, it plays once more, from past the wait it had on arrival
      state = 'finished';
      shelf.rerender(<GameArt game="rhyme" moving="once" after={300} again={2} />);
      expect(played).toHaveLength(firstRun * 2);
      expect(played.slice(firstRun).every((from) => from === 300)).toBe(true);
    } finally {
      proto.animate = before;
    }
  });

  it('stays still for a reader who asked for less motion, whatever the page asks', () => {
    lessMotion(true);
    const { container } = render(<GameArt game="detective" moving />);
    expect(container.querySelector('.gp-art--moving')).toBeNull();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });
});
