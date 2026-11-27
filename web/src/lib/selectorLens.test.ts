import { afterEach, describe, expect, it, vi } from 'vitest';
import { SELECTOR_LENS, planSwitch, lensAt } from '@kurda/shared';
import { SelectorLens, selectorStyles } from './selectorLens';

const box = { slot: 80, height: 50, width: 320 };

/** Four pieces, a lens and what is inside it, which record the keyframes they are asked to play. */
function parts() {
  const played: Array<{ el: string; frames: Keyframe[] }> = [];
  const make = (name: string) => {
    const el = document.createElement('span');
    el.animate = ((frames: Keyframe[]) => {
      played.push({ el: name, frames });
      return { cancel: () => undefined, finished: new Promise(() => undefined) } as unknown as Animation;
    }) as HTMLElement['animate'];
    return el;
  };
  return { played, els: { group: make('group'), start: make('start'), end: make('end'), span: make('span'), lens: make('lens'), copy: make('copy'), tint: make('tint'), rim: make('rim') } };
}

function withMotion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduced && q.includes('reduced-motion'), addEventListener: () => undefined, removeEventListener: () => undefined }));
}

describe('a selector on the website', () => {
  afterEach(() => vi.stubGlobal('matchMedia', undefined));

  it('draws the capsule round its place at rest, with no lens', () => {
    const s = selectorStyles(lensAt(planSwitch(1, 1, 0), 0), box, 0.34);
    expect(s.start).toBe('translateX(80px) scale(1, 1)');
    expect(s.end).toBe('translateX(110px) scale(1, 1)');
    expect(s.group).toBeCloseTo(0.34);
    expect(s.lensOpacity).toBe(0);
  });

  it('keeps the lens within a hair of the bar’s ends however it stretches', () => {
    const f = { phase: 'moving' as const, at: 0, velocity: 0, scale: 1.12, stretch: 0.45, tint: 0, lens: 1, squash: 1, lead: 0, magnify: 1.3 };
    expect(selectorStyles(f, box, 1).lens).toMatch(/^translateX\(-2px\)/);
    expect(selectorStyles({ ...f, at: 3 }, box, 1).end).toBe(`translateX(${320 + 2 - 50}px) scale(1.12, 1.12)`);
  });

  it('plays a move as one run of keyframes per piece, the lens up and the tint out on the way', () => {
    withMotion(false);
    const { played, els } = parts();
    const lens = new SelectorLens(els, box);
    lens.place(0);
    lens.moveTo(2);
    expect(played.map((p) => p.el).sort()).toEqual(['copy', 'end', 'group', 'lens', 'lens', 'rim', 'span', 'start', 'tint']);
    const opacities = (el: string) => played.filter((p) => p.el === el).at(-1)!.frames.map((k) => Number(k.opacity));
    const tint = opacities('group');
    expect(Math.min(...tint)).toBe(0);
    expect(tint.at(-1)).toBeGreaterThan(0.9);
    // The lens is whole for as long as it is up at all, with the capsule's tint inside it, and its rim comes and goes.
    const rim = opacities('rim');
    expect(opacities('lens')).toEqual(rim.map((r) => (r > 0 ? 1 : 0)));
    expect(opacities('tint')).toEqual(tint);
    expect(rim[1]).toBeLessThan(0.5);
    expect(Math.max(...rim)).toBe(1);
    expect(rim.at(-1)).toBe(0);
  });

  it('only fades the capsule in at its new place under Reduce Motion', () => {
    withMotion(true);
    const { played, els } = parts();
    const lens = new SelectorLens(els, box);
    lens.place(0);
    lens.moveTo(3);
    expect(played.map((p) => p.el)).toEqual(['group']);
    expect(els.start.style.transform).toBe('translateX(240px) scale(1, 1)');
    expect(els.lens.style.opacity).toBe('0');
    // No lens, so nothing is magnified: the copy lies on the row as it is.
    expect(els.copy.style.transform).toBe('translate(-240px, 0px) scale(1, 1)');
  });

  it('moves the copy inside the lens in step with it, showing the row magnified about the lens’s middle', () => {
    withMotion(false);
    const { played, els } = parts();
    const lens = new SelectorLens(els, box);
    lens.place(0);
    lens.moveTo(3);
    const glass = played.find((p) => p.el === 'lens' && 'transform' in p.frames[0]!)!.frames;
    const copy = played.find((p) => p.el === 'copy')!.frames;
    expect(copy).toHaveLength(glass.length);
    const nums = (k: Keyframe) => String(k.transform).match(/-?[\d.]+(?:e-?\d+)?/g)!.map(Number);
    let magnified = 0;
    for (let i = 0; i < glass.length; i++) {
      // The lens: translateX(left) scale(sx, sy) from its left middle; the copy: translate(x, y) scale(kx, ky) from its corner.
      const [left, sx] = nums(glass[i]!);
      const [x, , kx] = nums(copy[i]!);
      const middle = left! + (box.slot * sx!) / 2;
      const seen = (at: number) => left! + sx! * (x! + kx! * at);
      expect(seen(middle)).toBeCloseTo(middle, 3);
      magnified = Math.max(magnified, (seen(middle + 10) - middle) / 10);
    }
    expect(magnified).toBeCloseTo(SELECTOR_LENS.magnify, 3);
  });
});
