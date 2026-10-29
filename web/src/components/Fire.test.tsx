import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import {
  FIRE_GROW,
  FIRE_SMALL,
  FIRE_SMALL_VIEW,
  FIRE_SPRITE_COLS,
  FIRE_SPRITE_MS,
  FIRE_SPRITE_ROWS,
  FIRE_STAGES,
  FIRE_VIEW,
  fireDrawing,
  fireFrame,
  type FireLevel,
  type FireStage,
} from '@kurda/shared';
import { Fire } from './Fire';

/*
 * The streak's fire on the website: every stage burning with what it
 * promises, its painted flame playing frame by frame, the light version
 * beside a number, a cold hearth when the streak is not burning, growing from
 * one stage into the next on the day it grew, still (one frame) for a reader
 * who asked for less motion, and hidden from a screen reader every time — the
 * words beside it say the streak.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

const lvl = (stage: FireStage, growth = 0): FireLevel => ({ stage, growth });

function fire(ui: React.ReactElement): SVGSVGElement {
  const { container } = render(ui);
  return container.querySelector('svg.fire')!;
}

const reduceMotion = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query, addEventListener() {}, removeEventListener() {} }));

/** The tongues drawn, by the gradient each is filled with. */
const tongues = (svg: Element): string[] => [...svg.querySelectorAll('path.fire-loop')].map((p) => /-(\w+)\)$/.exec(p.getAttribute('fill') ?? '')?.[1] ?? '');
/** The painted flames shown, by the stage whose sheet each plays. */
const sheets = (el: Element): string[] => [...el.querySelectorAll('image')].map((i) => /^\/fire\/(\w+)\.webp$/.exec(i.getAttribute('href') ?? '')?.[1] ?? '');

describe('the fire', () => {
  it('burns at every stage with the parts it promises, its painted flame playing frame by frame', () => {
    for (const stage of FIRE_STAGES.filter((s) => s !== 'cold')) {
      const drawing = fireDrawing(lvl(stage), 168);
      const svg = fire(<Fire size={168} level={lvl(stage)} />);
      expect(svg).toHaveClass('fire', 'is-lit');
      expect(svg).not.toHaveClass('is-still');
      expect(svg).toHaveAttribute('data-stage', stage);
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('height', '168');
      expect(tongues(svg)).toEqual([]);
      expect(sheets(svg), stage).toEqual([stage]);
      expect(svg.querySelectorAll('circle.fire-rise')).toHaveLength(drawing.embers.length);
      expect(svg.querySelectorAll('path.fire-rise')).toHaveLength(0);
      // its glow round it, and the same light pooled on the ground, both breathing
      expect(svg.querySelectorAll('ellipse.fire-loop')).toHaveLength(2);
      // the stones and the sun come with the biggest fires
      expect(svg.querySelectorAll('[fill$="-stone)"]').length > 0, stage).toBe(stage === 'blaze' || stage === 'newroz');
      expect(svg.querySelector('[fill$="-rays)"]') !== null, stage).toBe(stage === 'newroz');
    }
    // a window as big as the flame onto its sheet, which steps along a row a frame at a time, and down a row at the end of each
    const { box, sheet } = fireDrawing(lvl('campfire'), 168).painted!;
    const image = fire(<Fire size={168} level={lvl('campfire')} />).querySelector('image')!;
    const window = image.closest('svg.fire-flame')!;
    expect([window.getAttribute('x'), window.getAttribute('y'), window.getAttribute('width'), window.getAttribute('height')]).toEqual([box.x, box.y, box.w, box.h].map(String));
    expect(window).toHaveAttribute('viewBox', `0 0 ${sheet.frame.w} ${sheet.frame.h}`);
    expect([image.getAttribute('width'), image.getAttribute('height')]).toEqual([String(sheet.sheet.w), String(sheet.sheet.h)]);
    const across = image as unknown as SVGImageElement;
    const down = image.parentElement as unknown as SVGGElement;
    expect(across).toHaveClass('fire-frames', 'fire-frames-across');
    expect(down).toHaveClass('fire-frames', 'fire-frames-down');
    expect([across.style.getPropertyValue('--fire-steps'), across.style.getPropertyValue('--fire-shift')]).toEqual([String(FIRE_SPRITE_COLS), `${-sheet.sheet.w}px`]);
    expect([down.style.getPropertyValue('--fire-steps'), down.style.getPropertyValue('--fire-shift')]).toEqual([String(FIRE_SPRITE_ROWS), `${-sheet.sheet.h}px`]);
    // a row's frames in the time the whole loop takes to go down a row
    expect(down.style.getPropertyValue('--fire-period')).toBe(`${FIRE_SPRITE_MS}ms`);
    expect(across.style.getPropertyValue('--fire-period')).toBe(`${FIRE_SPRITE_MS / FIRE_SPRITE_ROWS}ms`);
  });

  it('turns the sun behind the Newroz fire slowly, about its middle', () => {
    const svg = fire(<Fire size={190} level={lvl('newroz')} />);
    const halo = svg.querySelector('[fill$="-rays)"]')!.parentElement as unknown as SVGGElement;
    expect(halo).toHaveClass('fire-rise', 'fire-keep');
    expect(halo.style.getPropertyValue('--fire-k5')).toContain('rotate(');
  });

  it('is a cold hearth with no streak: charred logs, one ember glowing, smoke rising, and no flame', () => {
    const svg = fire(<Fire size={168} level={lvl('cold')} />);
    expect(svg).toHaveClass('is-unlit');
    expect(svg).toHaveAttribute('data-stage', 'cold');
    expect(svg).not.toHaveClass('is-still');
    expect([tongues(svg), sheets(svg)]).toEqual([[], []]);
    expect(svg.querySelectorAll('circle.fire-loop')).toHaveLength(1);
    expect(svg.querySelectorAll('path.fire-rise[fill$="-smoke)"]')).toHaveLength(2);
    expect(svg.querySelectorAll('[fill$="-char)"]').length).toBeGreaterThan(0);
    expect(svg.querySelector('ellipse')).toBeNull();
  });

  it('is the light version at the small size, drawn, in one box at every stage, so the number beside it never moves', () => {
    for (const stage of FIRE_STAGES) {
      const svg = fire(<Fire size={FIRE_SMALL} level={lvl(stage)} />);
      expect(svg).toHaveClass('is-small');
      expect(svg).toHaveAttribute('viewBox', `${FIRE_SMALL_VIEW.x} ${FIRE_SMALL_VIEW.y} ${FIRE_SMALL_VIEW.w} ${FIRE_SMALL_VIEW.h}`);
      expect(svg).toHaveAttribute('width', String((FIRE_SMALL * FIRE_SMALL_VIEW.w) / FIRE_SMALL_VIEW.h));
      expect(tongues(svg)).toEqual(['outer', 'core', 'heart']);
      expect(sheets(svg)).toEqual([]);
      expect(svg.querySelectorAll('.fire-rise, ellipse')).toHaveLength(0);
    }
    // no streak yet: the grey flame, standing still
    expect(fire(<Fire size={20} level={lvl('cold')} />)).toHaveClass('is-small', 'is-unlit', 'is-still');
  });

  it('takes up only its stage frame when framed, drawn as big as the whole would be, and the same while it grows into it', () => {
    for (const stage of FIRE_STAGES) {
      const frame = fireFrame(stage);
      const svg = fire(<Fire size={250} level={lvl(stage)} framed />);
      expect(svg).toHaveAttribute('viewBox', `${frame.x} ${frame.y} ${frame.w} ${frame.h}`);
      expect(Number(svg.getAttribute('width'))).toBeCloseTo(frame.w, 9);
      expect(Number(svg.getAttribute('height'))).toBeCloseTo(frame.h, 9);
    }
    const growing = fire(<Fire size={125} level={lvl('campfire')} from={lvl('kindling', 0.8)} framed />);
    const frame = fireFrame('campfire');
    expect(growing).toHaveAttribute('viewBox', `${frame.x} ${frame.y} ${frame.w} ${frame.h}`);
    expect(Number(growing.getAttribute('height'))).toBeCloseTo((frame.h * 125) / FIRE_VIEW.h, 9);
    // beside a number it is the light version's own box, framed or not
    expect(fire(<Fire size={FIRE_SMALL} level={lvl('spark')} framed />)).toHaveAttribute('viewBox', `${FIRE_SMALL_VIEW.x} ${FIRE_SMALL_VIEW.y} ${FIRE_SMALL_VIEW.w} ${FIRE_SMALL_VIEW.h}`);
  });

  it('stands still for a reader who asked for less motion: the fire at its stage, its flame one frame, nothing rising off it', () => {
    reduceMotion();
    const svg = fire(<Fire size={168} level={lvl('bonfire')} />);
    expect(svg).toHaveClass('is-lit', 'is-still');
    expect(svg.querySelectorAll('.fire-rise')).toHaveLength(0);
    expect(sheets(svg)).toEqual(['bonfire']);
    // the first frame, held: nothing steps
    expect(svg.querySelectorAll('.fire-frames')).toHaveLength(0);
    // a cold hearth still shows its smoke, held where it is
    const cold = fire(<Fire size={168} level={lvl('cold')} />);
    const smoke = cold.querySelector('path[fill$="-smoke)"]') as SVGPathElement;
    expect(cold.querySelectorAll('path[fill$="-smoke)"]')).toHaveLength(1);
    expect(smoke.style.opacity).not.toBe('');
  });

  it('stands still when asked to, as for a stage not reached yet: no sparks, and no growing', () => {
    const svg = fire(<Fire size={104} level={lvl('blaze')} from={lvl('bonfire')} still />);
    expect(svg).toHaveClass('is-still');
    expect(svg.querySelectorAll('.fire-rise, .fire-grow, .fire-frames')).toHaveLength(0);
    expect(sheets(svg)).toEqual(['blaze']);
    expect(svg).toHaveAttribute('data-stage', 'blaze');
  });

  it('grows from the old fire into the new one after a moment, the old flame stretching up and fading into the new, then lets the old one go', () => {
    const { container } = render(<Fire size={190} level={lvl('kindling')} from={lvl('spark', 0.9)} />);
    const svg = container.querySelector('svg.fire')!;
    const old = svg.querySelector('.fire-grow.is-gone') as SVGGElement;
    expect(sheets(old)).toEqual(['spark']);
    expect(old.style.getPropertyValue('--fire-delay')).toBe(`${FIRE_GROW.delayMs}ms`);
    expect(old.style.getPropertyValue('--fire-period')).toBe(`${FIRE_GROW.ms}ms`);
    // stretching up toward the new one's size, then gone
    expect(Number(old.style.getPropertyValue('--fire-k1').match(/scale\([\d.]+, ([\d.]+)\)/)?.[1])).toBeGreaterThan(1);
    expect(old.style.getPropertyValue('--fire-o3')).toBe('0');
    const grown = [...svg.querySelectorAll<SVGGElement>('.fire-grow:not(.is-gone)')].find((g) => sheets(g).length > 0)!;
    expect(sheets(grown)).toEqual(['kindling']);
    // it starts at the old one's size, unseen, and fades in over it
    expect([grown.style.getPropertyValue('--fire-o0'), grown.style.getPropertyValue('--fire-o3')]).toEqual(['0', '1']);
    expect(svg.querySelectorAll('circle.fire-grow, .fire-grow > circle').length).toBeGreaterThan(0);
    fireEvent.animationEnd(old);
    expect(svg.querySelector('.fire-grow.is-gone')).toBeNull();
    expect(sheets(svg)).toEqual(['kindling']);
  });

  it('lights cold logs on the first day: the cold hearth fades as the spark grows up off them', () => {
    const svg = fire(<Fire size={190} level={lvl('spark')} from={lvl('cold')} />);
    const fading = [...svg.querySelectorAll('.fire-grow.is-gone')];
    expect(fading.some((g) => g.querySelector('[fill$="-char)"]'))).toBe(true);
    expect(fading.some((g) => g.querySelector('[fill$="-smoke)"]'))).toBe(true);
  });

  it('brings the sun in behind the Newroz fire as it grows into it', () => {
    const svg = fire(<Fire size={190} level={lvl('newroz')} from={lvl('blaze', 0.99)} />);
    const sun = svg.querySelector('[fill$="-rays)"]')!.closest('.fire-grow') as SVGGElement;
    expect(sun.style.getPropertyValue('--fire-o0')).toBe('0');
  });

  it('is simply the new fire under reduced motion, or when the old one was no smaller', () => {
    reduceMotion();
    const svg = fire(<Fire size={190} level={lvl('kindling')} from={lvl('spark')} />);
    expect(svg.querySelectorAll('.fire-grow')).toHaveLength(0);
    expect(sheets(svg)).toEqual(['kindling']);
    vi.unstubAllGlobals();
    expect(fire(<Fire size={190} level={lvl('kindling')} from={lvl('bonfire')} />).querySelectorAll('.fire-grow')).toHaveLength(0);
  });

  it('keeps each fire on the page to its own gradients', () => {
    const { container } = render(
      <>
        <Fire size={40} level={lvl('campfire')} />
        <Fire size={40} level={lvl('cold')} />
        <Fire size={40} level={lvl('newroz')} from={lvl('blaze')} />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient, radialGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
