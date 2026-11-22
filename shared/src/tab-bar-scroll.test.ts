import { describe, expect, it } from 'vitest';
import { tabBarScroll } from './tab-bar-scroll.js';

/** A scroll from one offset to another in steps, as a page reports it; says whether the bar ends small. */
function scroll(bar: ReturnType<typeof tabBarScroll>, from: number, to: number, step = 8): boolean {
  const dir = to > from ? 1 : -1;
  for (let y = from; dir > 0 ? y <= to : y >= to; y += dir * step) bar.note(y);
  return bar.compact;
}

describe('the tab bar while the page scrolls', () => {
  it('shrinks once the page has scrolled down a little, not at the first nudge', () => {
    const bar = tabBarScroll();
    expect(scroll(bar, 0, 40)).toBe(false);
    expect(scroll(bar, 40, 120)).toBe(true);
  });

  it('grows back after a short scroll up, and not on a jiggle', () => {
    const bar = tabBarScroll();
    expect(scroll(bar, 0, 600)).toBe(true);
    expect(scroll(bar, 600, 570)).toBe(true);
    expect(scroll(bar, 570, 520)).toBe(false);
    // Down again: small once more.
    expect(scroll(bar, 520, 600)).toBe(true);
  });

  it('takes the first offset on a new page as where it starts, so scrolling up there never shrinks it', () => {
    const bar = tabBarScroll();
    expect(bar.note(800)).toBe(false);
    expect(scroll(bar, 800, 700)).toBe(false);
    expect(scroll(bar, 700, 800)).toBe(true);
  });

  it('is always full size near the top of the page, and again once reset', () => {
    const bar = tabBarScroll();
    scroll(bar, 0, 300);
    expect(bar.note(10)).toBe(false);
    scroll(bar, 10, 300);
    bar.reset();
    expect(bar.compact).toBe(false);
  });
});
