import { describe, expect, it } from 'vitest';
import {
  FIRE_BASE,
  FIRE_CYCLE_MS,
  FIRE_EMBERS,
  FIRE_GLOW,
  FIRE_LOOP_STOPS,
  FIRE_RISE_STOPS,
  FIRE_SMALL,
  FIRE_SMALL_VIEW,
  FIRE_TONGUES,
  FIRE_VIEW,
  FIRE_WISPS,
  calmMotion,
  fireColours,
  fireParts,
  firePoseAt,
  fireSamples,
  fireStops,
  type FireColours,
  type FireMotion,
} from './fire.js';

/** Every outline in the drawing, with what it is. */
const OUTLINES = [
  ...FIRE_TONGUES.map((t) => ({ name: t.id, d: t.d })),
  ...FIRE_WISPS.map((w, i) => ({ name: `wisp ${i}`, d: w.d })),
  ...FIRE_BASE.map((b, i) => ({ name: `${b.part} ${i}`, d: b.d })),
];

/** Every moving part's motion, with what it is. */
const MOTIONS: { name: string; motion: FireMotion }[] = [
  ...FIRE_TONGUES.map((t) => ({ name: t.id, motion: t.motion })),
  ...FIRE_WISPS.map((w, i) => ({ name: `wisp ${i}`, motion: w.motion })),
  ...FIRE_EMBERS.map((e, i) => ({ name: `ember ${i}`, motion: e.motion })),
  { name: 'glow', motion: FIRE_GLOW.motion },
];

/** The numbers in a path, as x, y pairs (an arc's radii and flags are left out). */
function points(d: string): [number, number][] {
  const out: [number, number][] = [];
  for (const [, cmd, args] of d.matchAll(/([MLCA])([^MLCAZ]*)/g)) {
    const nums = (args!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const pairs = cmd === 'A' ? [nums.slice(5, 7)] : Array.from({ length: nums.length / 2 }, (_, i) => nums.slice(i * 2, i * 2 + 2));
    for (const [x, y] of pairs) out.push([x!, y!]);
  }
  return out;
}

function box(d: string): { left: number; right: number; top: number; bottom: number } {
  const p = points(d);
  return { left: Math.min(...p.map((q) => q[0])), right: Math.max(...p.map((q) => q[0])), top: Math.min(...p.map((q) => q[1])), bottom: Math.max(...p.map((q) => q[1])) };
}

/** How grey a colour is: the spread between its strongest and weakest channel, 0 to 255. */
function chroma(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(...c) - Math.min(...c);
}

const warm = (hex: string): boolean => parseInt(hex.slice(1, 3), 16) > parseInt(hex.slice(5, 7), 16);

function flameColours(c: FireColours): string[] {
  return Object.values(c.tongues).flat();
}

describe('the fire as drawn', () => {
  it('is made of closed outlines, each one shape, inside its box', () => {
    for (const { name, d } of OUTLINES) {
      expect(d.startsWith('M'), name).toBe(true);
      expect(d.endsWith('Z'), name).toBe(true);
      // one outline per path: a second move would start a second shape
      expect(d.match(/M/g)?.length, name).toBe(1);
      const b = box(d);
      expect(b.left, name).toBeGreaterThanOrEqual(FIRE_VIEW.x);
      expect(b.right, name).toBeLessThanOrEqual(FIRE_VIEW.x + FIRE_VIEW.w);
      expect(b.top, name).toBeGreaterThanOrEqual(FIRE_VIEW.y);
      expect(b.bottom, name).toBeLessThanOrEqual(FIRE_VIEW.y + FIRE_VIEW.h);
    }
  });

  it('lays its tongues back to front, each in front narrower than the flame around it, rooted where it is drawn', () => {
    expect(FIRE_TONGUES.map((t) => t.id)).toEqual(['back', 'outer', 'flame', 'core', 'heart']);
    const [, ...nested] = FIRE_TONGUES;
    for (let i = 1; i < nested.length; i++) {
      const outer = box(nested[i - 1]!.d);
      const inner = box(nested[i]!.d);
      expect(inner.left, nested[i]!.id).toBeGreaterThan(outer.left);
      expect(inner.right, nested[i]!.id).toBeLessThan(outer.right);
      expect(inner.top, nested[i]!.id).toBeGreaterThan(outer.top);
    }
    for (const t of FIRE_TONGUES) {
      const b = box(t.d);
      // a tongue leans and stretches about its root: the bottom of its own outline, not somewhere in the air
      expect(t.origin[1], t.id).toBe(b.bottom);
      expect(t.origin[0], t.id).toBeGreaterThan(b.left);
      expect(t.origin[0], t.id).toBeLessThan(b.right);
    }
  });

  it('gives every moving part a period that divides the loop, a phase within it and a pose for each stop', () => {
    for (const { name, motion } of MOTIONS) {
      expect(motion.periodMs, name).toBeGreaterThan(0);
      expect(FIRE_CYCLE_MS % motion.periodMs, name).toBe(0);
      expect(motion.phase, name).toBeGreaterThanOrEqual(0);
      expect(motion.phase, name).toBeLessThan(1);
      expect(motion.poses.length, name).toBe(fireStops(motion).length);
    }
  });

  it('never moves two neighbouring tongues on the same period, so the layers slide against each other', () => {
    for (let i = 1; i < FIRE_TONGUES.length; i++) {
      expect(FIRE_TONGUES[i]!.motion.periodMs).not.toBe(FIRE_TONGUES[i - 1]!.motion.periodMs);
    }
  });

  it('only flickers in place: a tongue stretches and leans but never fades, and a spark or a wisp is unseen where it starts again', () => {
    for (const t of FIRE_TONGUES) for (const p of t.motion.poses) expect(p.o ?? 1).toBe(1);
    for (const part of [...FIRE_WISPS, ...FIRE_EMBERS]) {
      expect(part.motion.kind).toBe('rise');
      expect(part.motion.poses[0]!.o).toBe(0);
      expect(part.motion.poses.at(-1)!.o).toBe(0);
    }
  });
});

describe('the colours it burns in', () => {
  for (const scheme of ['light', 'dark'] as const) {
    it(`burns warm on the ${scheme} page, with a glow and sparks`, () => {
      const lit = fireColours({ lit: true, scheme });
      for (const c of flameColours(lit)) expect(warm(c), c).toBe(true);
      expect(lit.glow).not.toBeNull();
      expect(lit.ember).not.toBeNull();
    });

    it(`is cool grey and still unlit on the ${scheme} page: no glow, no sparks, whatever the event`, () => {
      for (const accent of [undefined, '#8E2DE2']) {
        const unlit = fireColours({ lit: false, scheme, accent });
        for (const c of [...flameColours(unlit), ...Object.values(unlit.base).flat()]) expect(chroma(c), c).toBeLessThan(40);
        expect(unlit.glow).toBeNull();
        expect(unlit.ember).toBeNull();
      }
    });
  }

  it('runs from deep red-orange outside to a heart nearly white', () => {
    const lit = fireColours({ lit: true, scheme: 'light' });
    const lightness = (hex: string): number => [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
    const order = (['outer', 'flame', 'core', 'heart'] as const).map((id) => lightness(lit.tongues[id][0]));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('takes an event accent for the flame, keeping its logs, and ignores one it cannot read', () => {
    const plain = fireColours({ lit: true, scheme: 'dark' });
    const event = fireColours({ lit: true, scheme: 'dark', accent: '#8E2DE2' });
    expect(event.tongues.flame[0]).toBe('#8E2DE2');
    expect(event.glow?.colour).toBe('#8E2DE2');
    expect(event.base).toEqual(plain.base);
    expect(fireColours({ lit: true, scheme: 'dark', accent: 'violet' })).toEqual(plain);
  });
});

describe('the light version', () => {
  it('is drawn at the small size and under: three tongues, cropped round the flame, nothing around it', () => {
    const small = fireParts(FIRE_SMALL);
    expect(small.small).toBe(true);
    expect(small.view).toEqual(FIRE_SMALL_VIEW);
    expect(small.tongues.map((t) => t.id)).toEqual(['outer', 'core', 'heart']);
    expect([small.wisps.length, small.embers.length, small.glow, small.base]).toEqual([0, 0, false, false]);
    for (const t of small.tongues) {
      const b = box(t.d);
      expect(b.left).toBeGreaterThanOrEqual(FIRE_SMALL_VIEW.x);
      expect(b.right).toBeLessThanOrEqual(FIRE_SMALL_VIEW.x + FIRE_SMALL_VIEW.w);
      expect(b.bottom).toBeLessThanOrEqual(FIRE_SMALL_VIEW.y + FIRE_SMALL_VIEW.h);
    }
    const big = fireParts(FIRE_SMALL + 1);
    expect([big.small, big.tongues.length, big.glow, big.base]).toEqual([false, FIRE_TONGUES.length, true, true]);
    expect(big.embers.length).toBeGreaterThan(0);
  });

  it('flickers by only part as much', () => {
    const outer = FIRE_TONGUES.find((t) => t.id === 'outer')!.motion;
    const calm = calmMotion(outer, 0.5);
    outer.poses.forEach((p, i) => {
      expect(calm.poses[i]!.sy! - 1).toBeCloseTo((p.sy! - 1) * 0.5);
      expect(calm.poses[i]!.skew!).toBeCloseTo(p.skew! * 0.5);
    });
    expect(calm.periodMs).toBe(outer.periodMs);
  });
});

describe('how a part moves', () => {
  const loop: FireMotion = { kind: 'loop', periodMs: 800, phase: 0, poses: [{ sy: 1 }, { sy: 1.2 }, { sy: 0.8 }, { sy: 1.1 }] };
  const rise: FireMotion = { kind: 'rise', periodMs: 1200, phase: 0, poses: [{ y: 0, o: 0 }, { y: -10, o: 1 }, { y: -40, o: 1 }, { y: -60, o: 0 }] };

  it('is at each pose at its stop, and eases between them', () => {
    FIRE_LOOP_STOPS.forEach((at, i) => expect(firePoseAt(loop, at).sy).toBeCloseTo(loop.poses[i]!.sy!));
    FIRE_RISE_STOPS.slice(0, 3).forEach((at, i) => expect(firePoseAt(rise, at).y).toBeCloseTo(rise.poses[i]!.y!));
    // a sine ease is slow at either end of a step and fastest in its middle
    expect(firePoseAt(loop, 0.25 * 0.1).sy - 1).toBeLessThan(0.2 * 0.1);
    expect(firePoseAt(loop, 0.125).sy).toBeCloseTo(1.1);
  });

  it('loops back to its first pose by the end of its period, and a rise climbs straight', () => {
    expect(firePoseAt(loop, 0.999).sy).toBeCloseTo(1, 2);
    expect(firePoseAt(loop, 1).sy).toBe(1);
    expect(firePoseAt(rise, 0.425).y).toBeCloseTo(-25);
    expect(firePoseAt(rise, 0.999).o).toBeCloseTo(0, 1);
  });

  it('lays each part along one clock that loops without a seam', () => {
    for (const { name, motion } of MOTIONS) {
      const { input, poses } = fireSamples(motion);
      expect(input[0], name).toBe(0);
      expect(input.at(-1), name).toBe(1);
      for (let i = 1; i < input.length; i++) expect(input[i]!, name).toBeGreaterThan(input[i - 1]!);
      const first = poses[0]!;
      const last = poses.at(-1)!;
      const start = firePoseAt(motion, motion.phase);
      for (const f of ['x', 'y', 'sx', 'sy', 'skew', 'o'] as const) {
        expect(last[f], `${name} ${f}`).toBeCloseTo(first[f], 9);
        expect(first[f], `${name} ${f}`).toBeCloseTo(start[f], 9);
      }
    }
  });
});
