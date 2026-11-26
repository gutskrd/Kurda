import { afterEach, describe, expect, it, vi } from 'vitest';
import { planSwitch, lensAt } from '@kurda/shared';
import { SelectorLens, selectorStyles } from './selectorLens';

const box = { slot: 80, height: 50, width: 320 };

/** Four pieces and a lens that record the keyframes they are asked to play. */
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
  return { played, els: { group: make('group'), start: make('start'), end: make('end'), span: make('span'), lens: make('lens') } };
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
    const f = { phase: 'moving' as const, at: 0, velocity: 0, scale: 1.12, stretch: 0.45, tint: 0, lens: 1, squash: 1, lead: 0 };
    expect(selectorStyles(f, box, 1).lens).toMatch(/^translateX\(-2px\)/);
    expect(selectorStyles({ ...f, at: 3 }, box, 1).end).toBe(`translateX(${320 + 2 - 50}px) scale(1.12, 1.12)`);
  });

  it('plays a move as one run of keyframes per piece, the lens up and the tint out on the way', () => {
    withMotion(false);
    const { played, els } = parts();
    const lens = new SelectorLens(els, box);
    lens.place(0);
    lens.moveTo(2);
    expect(played.map((p) => p.el).sort()).toEqual(['end', 'group', 'lens', 'lens', 'span', 'start']);
    const tint = played.find((p) => p.el === 'group')!.frames.map((k) => Number(k.opacity));
    expect(Math.min(...tint)).toBe(0);
    expect(tint.at(-1)).toBeGreaterThan(0.9);
    const glass = played.filter((p) => p.el === 'lens')[1]!.frames.map((k) => Number(k.opacity));
    expect(Math.max(...glass)).toBe(1);
    expect(glass.at(-1)).toBe(0);
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
  });
});
