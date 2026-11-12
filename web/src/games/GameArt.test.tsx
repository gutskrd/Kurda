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

  it('stays still for a reader who asked for less motion, whatever the page asks', () => {
    lessMotion(true);
    const { container } = render(<GameArt game="detective" moving />);
    expect(container.querySelector('.gp-art--moving')).toBeNull();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });
});
