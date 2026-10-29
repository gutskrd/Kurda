import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { FIRE_GROW, FIRE_SMALL, FIRE_SMALL_VIEW, FIRE_STAGES, fireDrawing, type FireLevel, type FireStage } from '@kurda/shared';
import { Fire } from './Fire';

/*
 * The streak's fire on the website: every stage burning with what it
 * promises, the light version beside a number, a cold hearth when the streak
 * is not burning, growing from one stage into the next on the day it grew,
 * still for a reader who asked for less motion, and hidden from a screen
 * reader every time — the words beside it say the streak.
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

describe('the fire', () => {
  it('burns at every stage with the parts it promises, each tongue flickering about its root', () => {
    for (const stage of FIRE_STAGES.filter((s) => s !== 'cold')) {
      const drawing = fireDrawing(lvl(stage), 168);
      const svg = fire(<Fire size={168} level={lvl(stage)} />);
      expect(svg).toHaveClass('fire', 'is-lit');
      expect(svg).not.toHaveClass('is-still');
      expect(svg).toHaveAttribute('data-stage', stage);
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('height', '168');
      expect(tongues(svg)).toEqual(drawing.tongues.map((t) => t.id));
      expect(svg.querySelectorAll('circle.fire-rise')).toHaveLength(drawing.embers.length);
      expect(svg.querySelectorAll('path.fire-rise')).toHaveLength(drawing.wisps.length + drawing.drifts.length);
      expect(svg.querySelector('ellipse.fire-loop')).not.toBeNull();
      // the stones and the sun come with the biggest fires
      expect(svg.querySelectorAll('[fill$="-stone)"]').length > 0, stage).toBe(stage === 'blaze' || stage === 'newroz');
      expect(svg.querySelector('[fill$="-rays)"]') !== null, stage).toBe(stage === 'newroz');
    }
    const outer = fire(<Fire size={168} level={lvl('campfire')} />).querySelector('path.fire-loop[fill$="-outer)"]') as SVGPathElement;
    const drawn = fireDrawing(lvl('campfire'), 168).tongues.find((t) => t.id === 'outer')!;
    expect(outer.style.getPropertyValue('--fire-period')).toBe(`${drawn.motion.periodMs}ms`);
    expect(outer.style.transformOrigin).toBe(`${drawn.origin[0]}px ${drawn.origin[1]}px`);
    expect(outer.style.getPropertyValue('--fire-k1')).toContain('skewX(');
  });

  it('turns the sun behind the Newroz fire slowly, about its middle', () => {
    const svg = fire(<Fire size={190} level={lvl('newroz')} />);
    const halo = svg.querySelector('[fill$="-rays)"]')!.parentElement as unknown as SVGGElement;
    expect(halo).toHaveClass('fire-rise', 'fire-keep');
    expect(halo.style.getPropertyValue('--fire-k5')).toContain('rotate(');
  });

  it('is a cold hearth with no streak: charred logs, one ember glowing, smoke rising, and no flame', () => {
    for (const svg of [fire(<Fire size={168} level={lvl('cold')} />), fire(<Fire size={168} lit={false} />)]) {
      expect(svg).toHaveClass('is-unlit');
      expect(svg).toHaveAttribute('data-stage', 'cold');
      expect(svg).not.toHaveClass('is-still');
      expect(tongues(svg)).toEqual([]);
      expect(svg.querySelectorAll('circle.fire-loop')).toHaveLength(1);
      expect(svg.querySelectorAll('path.fire-rise[fill$="-smoke)"]')).toHaveLength(2);
      expect(svg.querySelectorAll('[fill$="-char)"]').length).toBeGreaterThan(0);
      expect(svg.querySelector('ellipse')).toBeNull();
    }
  });

  it('is the campfire without a level, alight', () => {
    expect(fire(<Fire size={168} />)).toHaveAttribute('data-stage', 'campfire');
  });

  it('is the light version at the small size, in one box at every stage, so the number beside it never moves', () => {
    for (const stage of FIRE_STAGES) {
      const svg = fire(<Fire size={FIRE_SMALL} level={lvl(stage)} />);
      expect(svg).toHaveClass('is-small');
      expect(svg).toHaveAttribute('viewBox', `${FIRE_SMALL_VIEW.x} ${FIRE_SMALL_VIEW.y} ${FIRE_SMALL_VIEW.w} ${FIRE_SMALL_VIEW.h}`);
      expect(svg).toHaveAttribute('width', String((FIRE_SMALL * FIRE_SMALL_VIEW.w) / FIRE_SMALL_VIEW.h));
      expect(tongues(svg)).toEqual(['outer', 'core', 'heart']);
      expect(svg.querySelectorAll('.fire-rise, ellipse')).toHaveLength(0);
    }
    // no streak yet: the grey flame, standing still
    expect(fire(<Fire size={20} lit={false} />)).toHaveClass('is-small', 'is-unlit', 'is-still');
  });

  it('stands still for a reader who asked for less motion: the fire at its stage, nothing rising off it', () => {
    reduceMotion();
    const svg = fire(<Fire size={168} level={lvl('bonfire')} />);
    expect(svg).toHaveClass('is-lit', 'is-still');
    expect(svg.querySelectorAll('.fire-rise')).toHaveLength(0);
    expect(tongues(svg)).toEqual(fireDrawing(lvl('bonfire'), 168).tongues.map((t) => t.id));
    // a cold hearth still shows its smoke, held where it is
    const cold = fire(<Fire size={168} level={lvl('cold')} />);
    const smoke = cold.querySelector('path[fill$="-smoke)"]') as SVGPathElement;
    expect(cold.querySelectorAll('path[fill$="-smoke)"]')).toHaveLength(1);
    expect(smoke.style.opacity).not.toBe('');
  });

  it('stands still when asked to, as for a stage not reached yet: no sparks, and no growing', () => {
    const svg = fire(<Fire size={104} level={lvl('blaze')} from={lvl('bonfire')} still />);
    expect(svg).toHaveClass('is-still');
    expect(svg.querySelectorAll('.fire-rise, .fire-grow')).toHaveLength(0);
    expect(svg).toHaveAttribute('data-stage', 'blaze');
  });

  it('grows from the old fire into the new one after a moment, then lets the old one go', () => {
    const { container } = render(<Fire size={190} level={lvl('kindling')} from={lvl('spark', 0.9)} />);
    const svg = container.querySelector('svg.fire')!;
    const old = svg.querySelector('.fire-grow.is-gone') as SVGGElement;
    expect(tongues(old)).toEqual(['flame', 'heart']);
    expect(old.style.getPropertyValue('--fire-delay')).toBe(`${FIRE_GROW.delayMs}ms`);
    expect(old.style.getPropertyValue('--fire-period')).toBe(`${FIRE_GROW.ms}ms`);
    const grown = [...svg.querySelectorAll<SVGGElement>('.fire-grow:not(.is-gone)')].find((g) => tongues(g).length > 0)!;
    expect(tongues(grown)).toEqual(['outer', 'core', 'heart']);
    // it starts at the old one's size, unseen
    expect(grown.style.getPropertyValue('--fire-o0')).toBe('0');
    expect(svg.querySelectorAll('circle.fire-grow, .fire-grow > circle').length).toBeGreaterThan(0);
    fireEvent.animationEnd(old);
    expect(svg.querySelector('.fire-grow.is-gone')).toBeNull();
    expect(tongues(svg)).toEqual(['outer', 'core', 'heart']);
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
    expect(tongues(svg)).toEqual(['outer', 'core', 'heart']);
    vi.unstubAllGlobals();
    expect(fire(<Fire size={190} level={lvl('kindling')} from={lvl('bonfire')} />).querySelectorAll('.fire-grow')).toHaveLength(0);
  });

  it('keeps each fire on the page to its own gradients', () => {
    const { container } = render(
      <>
        <Fire size={40} />
        <Fire size={40} lit={false} />
        <Fire size={40} level={lvl('newroz')} from={lvl('blaze')} />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient, radialGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
