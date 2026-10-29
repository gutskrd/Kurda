import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FIRE_EMBERS, FIRE_SMALL, FIRE_SMALL_VIEW, FIRE_TONGUES, FIRE_WISPS } from '@kurda/shared';
import { Fire } from './Fire';

/*
 * The streak's fire on the website: the whole campfire burning, the light
 * version beside a number, grey and still when the streak is not burning,
 * still for a reader who asked for less motion, and hidden from a screen
 * reader every time — the words beside it say the streak.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function fire(ui: React.ReactElement): SVGSVGElement {
  const { container } = render(ui);
  return container.querySelector('svg.fire')!;
}

const moving = (svg: SVGSVGElement): Element[] => [...svg.querySelectorAll('.fire-part')];

describe('the fire', () => {
  it('burns big: every tongue flickering about its root, sparks and broken-off tips rising, a glow, the logs', () => {
    const svg = fire(<Fire size={168} />);
    expect(svg).toHaveClass('fire', 'is-lit');
    expect(svg).not.toHaveClass('is-small');
    expect(svg).not.toHaveClass('is-still');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('height', '168');
    const loops = svg.querySelectorAll('path.fire-loop');
    expect(loops).toHaveLength(FIRE_TONGUES.length);
    const outer = loops[1] as SVGPathElement;
    expect(outer.style.getPropertyValue('--fire-period')).toBe(`${FIRE_TONGUES[1]!.motion.periodMs}ms`);
    expect(outer.style.transformOrigin).toBe(`${FIRE_TONGUES[1]!.origin[0]}px ${FIRE_TONGUES[1]!.origin[1]}px`);
    expect(outer.style.getPropertyValue('--fire-k1')).toContain('skewX(');
    expect(svg.querySelectorAll('circle.fire-rise')).toHaveLength(FIRE_EMBERS.length);
    expect(svg.querySelectorAll('path.fire-rise')).toHaveLength(FIRE_WISPS.length);
    expect(svg.querySelector('ellipse.fire-loop')).not.toBeNull();
  });

  it('is the light version at the small size: fewer tongues, cropped round the flame, nothing rising', () => {
    const svg = fire(<Fire size={FIRE_SMALL} />);
    expect(svg).toHaveClass('is-small', 'is-lit');
    expect(svg).toHaveAttribute('viewBox', `${FIRE_SMALL_VIEW.x} ${FIRE_SMALL_VIEW.y} ${FIRE_SMALL_VIEW.w} ${FIRE_SMALL_VIEW.h}`);
    expect(svg.querySelectorAll('path.fire-loop')).toHaveLength(FIRE_TONGUES.filter((t) => t.small).length);
    expect(svg.querySelectorAll('.fire-rise, ellipse')).toHaveLength(0);
  });

  it('is grey and still unlit: no glow, nothing rising, nothing flickering', () => {
    const svg = fire(<Fire size={168} lit={false} />);
    expect(svg).toHaveClass('is-unlit', 'is-still');
    expect(svg.querySelectorAll('.fire-rise, ellipse')).toHaveLength(0);
    // the logs are still there, cold
    expect(svg.querySelectorAll('path:not(.fire-part)').length).toBeGreaterThan(0);
  });

  it('stands still for a reader who asked for less motion, burning but with nothing rising off it', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query, addEventListener() {}, removeEventListener() {} }));
    const svg = fire(<Fire size={168} />);
    expect(svg).toHaveClass('is-lit', 'is-still');
    expect(svg.querySelectorAll('.fire-rise')).toHaveLength(0);
    expect(moving(svg).length).toBeGreaterThan(0);
  });

  it('keeps each fire on the page to its own gradients', () => {
    const { container } = render(
      <>
        <Fire size={40} />
        <Fire size={40} lit={false} />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
