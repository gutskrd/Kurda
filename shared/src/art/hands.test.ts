import { describe, expect, it } from 'vitest';
import { HAND_PHONE_SCREEN, HAND_PHONE_VIEW, handPhoneSvg } from './hand-phone.js';
import { HAND_STAMP_CARD, HAND_STAMP_FLIP, HAND_STAMP_VIEW, handStampBonesAt, handStampCardAt, handStampFlip, handStampPointsAt, handStampShapesAt, handStampSvg } from './hand-stamp.js';
import type { Pt } from './svg.js';
import { SKIN } from './hand-paint.js';

const back = handPhoneSvg({ part: 'back' });
const front = handPhoneSvg({ part: 'front' });
const stampBack = handStampSvg({ part: 'back' });
const stampFront = handStampSvg({ part: 'front' });
const colours = (svg: string): Set<string> => new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)].map((m) => m[1]!));
const ids = (svg: string): string[] => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]!);
/** Every point a layer's paths pass through or bend toward, in its own units. */
const points = (svg: string): [number, number][] =>
  [...svg.matchAll(/<path d="([^"]+)"/g)].flatMap((m) => {
    const v = (m[1]!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    return Array.from({ length: Math.floor(v.length / 2) }, (_, i) => [v[i * 2]!, v[i * 2 + 1]!] as [number, number]);
  });

describe('the hand holding a phone', () => {
  it('draws both layers on the one frame, the same every time, hidden from screen readers since the words beside it say it all', () => {
    for (const svg of [back, front]) {
      expect(svg).toContain(`viewBox="0 0 ${HAND_PHONE_VIEW.w} ${HAND_PHONE_VIEW.h}"`);
      expect(svg).toContain('aria-hidden="true"');
    }
    expect(handPhoneSvg({ part: 'back' })).toBe(back);
  });

  it('keeps each layer’s ids its own, so both can sit on one page', () => {
    expect(ids(back).length).toBeGreaterThan(0);
    expect(ids(back).filter((id) => ids(front).includes(id))).toEqual([]);
    expect(ids(handPhoneSvg({ part: 'back', idPrefix: 'mine' })).every((id) => id.startsWith('mine'))).toBe(true);
  });

  it('paints the hand flat, in a face and one shade step, with no gradient, blur, filter or picture', () => {
    for (const svg of [back, front]) expect(svg).not.toMatch(/Gradient|<filter|blur|<image|href=/);
    // the finger pads in the skin’s face, and the island in the phone’s black
    expect(colours(front).size).toBe(2);
  });

  it('puts the screen inside the frame, on the glass the back layer leaves dark for it', () => {
    const s = HAND_PHONE_SCREEN;
    const a = (s.turn * Math.PI) / 180;
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const [dx, dy] = [(x * s.w) / 2, (y * s.h) / 2];
      const [px, py] = [s.cx + dx * Math.cos(a) - dy * Math.sin(a), s.cy + dx * Math.sin(a) + dy * Math.cos(a)];
      expect(px).toBeGreaterThan(0);
      expect(px).toBeLessThan(HAND_PHONE_VIEW.w);
      expect(py).toBeGreaterThan(0);
      expect(py).toBeLessThan(HAND_PHONE_VIEW.h);
    }
    expect(back).toContain(`width="${s.w}" height="${s.h}" rx="${s.r}"`);
    expect(back).toContain(`rotate(${s.turn})`);
  });

  it('holds the phone nearly upright, and lays nothing of the hand on the glass', () => {
    expect(Math.abs(HAND_PHONE_SCREEN.turn)).toBeLessThanOrEqual(3);
    // the finger pads come over the bezel's outer edge only, in the phone's own units, centred on it
    for (const [x] of points(front)) expect(x).toBeLessThan(-HAND_PHONE_SCREEN.w / 2);
  });

  it('refuses a part it does not draw', () => {
    expect(() => handPhoneSvg({ part: 'side' as 'back' })).toThrow(RangeError);
  });
});

describe('the hand holding up a game’s stamp', () => {
  it('draws both layers on the one frame, hidden from screen readers, with ids of their own', () => {
    for (const svg of [stampBack, stampFront]) {
      expect(svg).toContain(`viewBox="0 0 ${HAND_STAMP_VIEW.w} ${HAND_STAMP_VIEW.h}"`);
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).not.toMatch(/Gradient|<filter|blur|<image|href=/);
    }
    expect(ids(stampBack).filter((id) => ids(stampFront).includes(id))).toEqual([]);
  });

  it('marks every shape that moves, the fingers behind as one outline and the thumb as another, nothing in pieces', () => {
    const shapes = (svg: string): string[] => [...new Set([...svg.matchAll(/data-shape="([^"]+)"/g)].map((m) => m[1]!))];
    expect(shapes(stampBack)).toContain('back');
    expect(shapes(stampFront)).toContain('thumb');
    for (const svg of [stampBack, stampFront]) expect(svg).not.toContain('data-part');
    // every marked shape has its path at every moment of a turn
    const at = handStampShapesAt(500);
    for (const name of [...shapes(stampBack), ...shapes(stampFront)]) expect(at[name]).toMatch(/^M/);
  });

  it('wears the skin of the hand holding the phone flat, as the reference paints it, its gaps in its charcoal and its lines a warm brown', () => {
    const used = new Set([...colours(stampBack), ...colours(stampFront)]);
    expect(used).toContain(SKIN.face);
    expect(colours(back)).toContain(SKIN.face);
    // no shade step on any finger: nothing that could read as a shadow along an edge
    expect(used).not.toContain(SKIN.shade);
    // the gaps between the digits in the reference's own charcoal, the darkest colour drawn
    const rgb = (c: string): number[] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    expect(colours(stampBack)).toContain('#3b353c');
    for (const c of used) expect(Math.max(...rgb(c))).toBeGreaterThanOrEqual(60);
    // a warm brown for the lines: red over green over blue, darker than the skin
    const warm = [...used].filter((c) => {
      const [r, g, b] = rgb(c);
      return r! > g! && g! > b! && r! < rgb(SKIN.face)[0]!;
    });
    expect(warm.length).toBeGreaterThan(0);
  });

  it('refuses a part it does not draw', () => {
    expect(() => handStampSvg({ part: 'side' as 'front' })).toThrow(RangeError);
  });
});

/** Whether segments p1-p2 and q1-q2 cross, other than at a shared end. */
function crosses(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const side = (a: Pt, b: Pt, c: Pt): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const [d1, d2, d3, d4] = [side(q1, q2, p1), side(q1, q2, p2), side(p1, p2, q1), side(p1, p2, q2)];
  return d1 * d2 < 0 && d3 * d4 < 0;
}
/** Whether a closed outline crosses itself. */
function selfCrossing(pts: readonly Pt[]): [number, number] | null {
  const m = pts.length;
  for (let i = 0; i < m; i++) {
    for (let j = i + 2; j < m; j++) {
      if (i === 0 && j === m - 1) continue;
      if (crosses(pts[i]!, pts[(i + 1) % m]!, pts[j]!, pts[(j + 1) % m]!)) return [i, j];
    }
  }
  return null;
}
/** Whether a point lies inside a closed outline. */
function inside([x, y]: Pt, pts: readonly Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [a, b] = [pts[i]!, pts[j]!];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
/** How far a point lies outside a closed outline, on the frame, or 0 inside it. */
function outside(p: Pt, pts: readonly Pt[]): number {
  if (inside(p, pts)) return 0;
  return Math.min(
    ...pts.map((a, i) => {
      const b = pts[(i + 1) % pts.length]!;
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    }),
  );
}
/**
 * The reference's skeleton, fitted frame by frame to its silhouette over one half of its loop (the other half repeats
 * the hand), on the frame: the thumb's base, joint and tip; the index finger's base, middle joint, tip joint and tip;
 * the middle finger's root where the thumb covers it, its joint and its tip.
 */
const REFERENCE: readonly { thumb: [Pt, Pt, Pt]; index: [Pt, Pt, Pt, Pt]; middle: [Pt, Pt, Pt] }[] = [
  { thumb: [[157.2, 235.7], [154.8, 220.3], [142.3, 143.6]], index: [[235.5, 235.7], [225.7, 208.6], [194.7, 179.7], [141.1, 149.6]], middle: [[114.9, 187.3], [111.4, 189.2], [72.8, 200.6]] },
  { thumb: [[156.2, 235.7], [156.5, 220.2], [144.7, 141.3]], index: [[237.2, 235.7], [229.5, 209.8], [198.6, 178.7], [139.9, 148.1]], middle: [[112.6, 184.2], [110.6, 185.5], [71.2, 197.3]] },
  { thumb: [[152.5, 235.7], [152.8, 219.6], [140.4, 140.2]], index: [[237.8, 235.7], [233.6, 211.9], [202.2, 174.4], [141.2, 146.4]], middle: [[114.3, 170.7], [107.7, 171.8], [64.2, 167.7]] },
  { thumb: [[147.6, 235.7], [147.8, 223.4], [136.9, 143.3]], index: [[242.2, 235.7], [239.5, 206.4], [208.0, 171.2], [154.4, 142.1]], middle: [[104.0, 165.7], [102.8, 165.4], [79.0, 144.9]] },
  { thumb: [[140.4, 235.7], [138.5, 217.1], [133.1, 134.0]], index: [[254.4, 235.7], [258.0, 206.5], [230.0, 170.8], [171.9, 142.7]], middle: [[108.4, 174.8], [92.2, 167.0], [59.3, 137.4]] },
  { thumb: [[142.6, 235.7], [141.0, 218.7], [131.5, 134.4]], index: [[257.6, 235.7], [264.9, 206.0], [239.5, 166.6], [177.8, 144.3]], middle: [[109.3, 175.6], [92.2, 165.0], [62.2, 137.5]] },
  { thumb: [[146.0, 235.7], [145.5, 218.7], [134.0, 135.9]], index: [[257.7, 235.7], [266.8, 206.1], [243.8, 165.3], [181.4, 145.3]], middle: [[106.5, 176.4], [99.2, 170.8], [71.8, 134.5]] },
  { thumb: [[158.3, 235.7], [158.4, 220.5], [140.4, 144.0]], index: [[246.5, 235.7], [232.1, 196.2], [203.1, 155.1], [139.7, 121.6]], middle: [[112.1, 175.4], [98.4, 166.8], [68.0, 138.5]] },
  { thumb: [[174.7, 235.7], [173.4, 218.7], [132.7, 158.1]], index: [[240.4, 235.7], [222.4, 196.6], [191.6, 153.0], [146.8, 105.4]], middle: [[139.2, 175.0], [115.4, 153.8], [83.4, 124.0]] },
  { thumb: [[147.4, 235.7], [146.4, 219.5], [124.8, 132.7]], index: [[235.6, 235.7], [219.0, 200.8], [192.3, 155.4], [152.8, 101.2]], middle: [[116.1, 142.8], [120.0, 139.9], [92.3, 115.5]] },
  { thumb: [[146.3, 235.7], [138.2, 210.5], [121.8, 132.6]], index: [[235.3, 235.7], [212.2, 201.9], [186.2, 163.9], [134.4, 120.8]], middle: [[129.4, 202.1], [103.9, 202.7], [81.8, 210.0]] },
  { thumb: [[147.4, 235.7], [143.0, 220.0], [127.7, 138.9]], index: [[226.3, 235.7], [204.3, 205.9], [170.4, 168.0], [113.9, 128.3]], middle: [[103.0, 213.7], [107.3, 214.5], [79.8, 226.4]] },
  { thumb: [[144.7, 235.7], [147.4, 219.4], [134.7, 139.6]], index: [[219.9, 235.7], [209.2, 211.4], [175.9, 173.5], [111.7, 142.7]], middle: [[117.3, 214.5], [117.3, 214.5], [98.1, 234.0]] },
  { thumb: [[154.6, 235.7], [153.4, 217.8], [137.4, 140.6]], index: [[223.2, 235.7], [212.4, 208.1], [181.4, 176.2], [125.7, 139.0]], middle: [[115.8, 206.5], [113.3, 202.3], [85.3, 229.8]] },
  { thumb: [[157.0, 235.7], [152.7, 216.4], [141.3, 140.7]], index: [[230.0, 235.7], [224.0, 210.2], [195.3, 180.5], [141.2, 145.3]], middle: [[119.4, 195.1], [114.1, 196.4], [77.5, 215.8]] },
  { thumb: [[157.2, 235.7], [153.8, 216.2], [143.1, 142.6]], index: [[232.0, 235.7], [224.7, 211.0], [195.4, 181.6], [145.6, 147.7]], middle: [[115.9, 190.3], [110.8, 193.0], [73.3, 206.9]] },
  { thumb: [[157.6, 235.7], [154.1, 216.1], [142.6, 143.3]], index: [[234.7, 235.7], [225.2, 209.0], [196.4, 180.6], [141.0, 146.5]], middle: [[108.4, 188.1], [109.9, 190.9], [72.6, 202.9]] },
  { thumb: [[157.6, 235.7], [154.9, 216.3], [143.7, 144.0]], index: [[234.5, 235.7], [225.3, 209.6], [196.4, 181.2], [145.1, 149.8]], middle: [[114.6, 186.9], [109.6, 189.9], [72.3, 201.6]] },
  { thumb: [[157.7, 235.7], [155.3, 216.7], [143.7, 142.9]], index: [[236.6, 235.7], [226.3, 208.7], [197.2, 180.4], [142.5, 147.4]], middle: [[114.9, 186.2], [111.5, 189.1], [72.7, 200.2]] },
  { thumb: [[157.7, 235.7], [155.3, 216.7], [143.7, 142.9]], index: [[236.6, 235.7], [226.3, 208.7], [197.2, 180.4], [142.5, 147.4]], middle: [[114.9, 186.2], [111.5, 189.1], [72.7, 200.2]] },
  { thumb: [[157.7, 235.7], [155.3, 216.7], [143.7, 142.9]], index: [[236.6, 235.7], [226.3, 208.7], [197.2, 180.4], [142.5, 147.4]], middle: [[114.9, 186.2], [111.5, 189.1], [72.7, 200.2]] },
  { thumb: [[157.7, 235.7], [155.3, 216.7], [143.7, 142.9]], index: [[236.6, 235.7], [226.3, 208.7], [197.2, 180.4], [142.5, 147.4]], middle: [[114.9, 186.2], [111.5, 189.1], [72.7, 200.2]] },
];
/** The moments of a turn the checks look at: every 5 ms from rest to rest. */
const MOMENTS = Array.from({ length: HAND_STAMP_FLIP.ms / 5 + 1 }, (_, k) => k * 5);

describe('the turn of the stamp in the hand', () => {
  const flip = handStampFlip();

  it('takes the reference’s 22 frames of 80 ms from rest to rest, the stamp at rest at both ends but for showing its other face', () => {
    expect(HAND_STAMP_FLIP.ms).toBe(1760);
    expect(flip[0]).toBe(`translate(0px, 0px) rotate(${HAND_STAMP_CARD.turn}deg) rotateY(0deg)`);
    expect(flip.at(-1)).toBe(`translate(0px, 0px) rotate(${HAND_STAMP_CARD.turn}deg) rotateY(180deg)`);
    // and the hand ends as it began, so turns played back to back are the reference's loop
    const [start, end] = [handStampShapesAt(0), handStampShapesAt(HAND_STAMP_FLIP.ms)];
    for (const name of Object.keys(start)) expect(end[name]).toBe(start[name]);
  });

  it('turns the stamp a little as the fingers gather, then over fast, edge-on where its words change, and lays it flat', () => {
    const at = (f: number): number => handStampCardAt(f * HAND_STAMP_FLIP.ms).turn;
    // the reference's turns 11 to 19 degrees as the fingers gather round it
    for (const k of [5, 6, 7]) {
      expect(at(k / 22)).toBeGreaterThan(10);
      expect(at(k / 22)).toBeLessThan(25);
    }
    expect(Math.abs(at(HAND_STAMP_FLIP.edgeOn) - 90)).toBeLessThan(2);
    // two frames past edge-on it is over, and for the last eight it lies flat
    for (let k = 12; k <= 22; k++) expect(at(k / 22)).toBeGreaterThan(165);
    for (let k = 15; k <= 22; k++) expect(at(k / 22)).toBeCloseTo(180, 0);
  });

  it('never folds an outline over itself, at any moment of the turn', () => {
    for (const ms of MOMENTS) {
      const pts = handStampPointsAt(ms);
      for (const name of ['back', 'thumb', 'palm', 'curled', 'slit', 'band', 'wedge', 'ring', 'nail', 'freeEdge']) {
        const cross = selfCrossing(pts[name]!);
        expect(cross, `${name} at ${ms} ms crosses itself at ${String(cross)}`).toBeNull();
      }
    }
  });

  it('keeps the hand whole as the stamp goes edge-on: no gap opens between the thumb and the index finger', () => {
    // at the reference's frame 9 the hand is whole between them, up to where the stamp's edge runs: halfway from the
    // thumb's tip to the index finger's tip joint is hand, not a hollow
    const pts = handStampPointsAt(800);
    const { joints, tips } = handStampBonesAt(800);
    const between: Pt = [(tips.thumb[0] + joints.index[2]![0]) / 2, (tips.thumb[1] + joints.index[2]![1]) / 2];
    expect(inside(between, pts.back!) || inside(between, pts.thumb!)).toBe(true);
  });

  it('casts the thumb’s shadows from under the thumb, so they lie on the fingers beside it with no skin between', () => {
    for (const ms of MOMENTS) {
      const pts = handStampPointsAt(ms);
      for (const name of ['slit', 'wedge']) {
        // the shadow's near side, its first half, runs inside the thumb's outline wherever it is on the frame
        const near = pts[name]!.slice(0, pts[name]!.length / 2).filter(([, y]) => y < HAND_STAMP_VIEW.h);
        expect(near.length, `${name} at ${ms} ms`).toBeGreaterThan(0);
        for (const p of near) expect(inside(p, pts.thumb!), `${name} at ${ms} ms`).toBe(true);
      }
    }
  });

  it('narrows the thumb’s shadow toward its tip with no spike or sliver of skin inside it', () => {
    let [rewidens, sliver] = [{ by: 0, at: 0 }, { run: 0, at: 0 }];
    for (const ms of MOMENTS) {
      const pts = handStampPointsAt(ms);
      const n = pts.slit!.length / 2;
      // how far out past the thumb's edge the shadow and the palm laid over its inner part reach, place by place up the thumb
      const reach = (name: string): number[] => Array.from({ length: n }, (_, k) => outside(pts[name]![2 * n - 1 - k]!, pts.thumb!));
      const [slit, band] = [reach('slit'), reach('band')];
      // from its widest place on toward the tip the shadow only narrows: it never stands up again beside the nail
      let least = Math.max(...slit);
      for (let k = slit.indexOf(least) + 1; k < n; k++) {
        least = Math.min(least, slit[k]!);
        if (slit[k]! - least > rewidens.by) rewidens = { by: slit[k]! - least, at: ms };
      }
      // the palm between the thumb and its shadow is either wide enough to read as palm or not there: never a thin
      // line of skin running inside the shadow, only the last few places where a band of palm tapers away
      let run = 0;
      for (let k = 0; k < n; k++) {
        run = band[k]! > 0.3 && band[k]! < 1.2 && slit[k]! > band[k]! + 0.3 ? run + 1 : 0;
        if (run > sliver.run) sliver = { run, at: ms };
      }
    }
    expect(rewidens.by, `widens again at ${rewidens.at} ms`).toBeLessThan(1.5);
    expect(sliver.run, `a sliver of skin at ${sliver.at} ms`).toBeLessThanOrEqual(4);
  });

  it('keeps the palm beside the thumb as the hand opens, so the shadow there lies on skin', () => {
    // low down just out from the thumb's index-finger side, in the reference's frames 3 and 5, is palm, not background
    for (const [ms, p] of [[320, [194.7, 222.8]], [480, [181.5, 209.6]]] as const) expect(inside(p, handStampPointsAt(ms).palm!), `at ${ms} ms`).toBe(true);
  });

  it('shows the background between the palm and the index finger low down at rest, as the reference does', () => {
    const pts = handStampPointsAt(0);
    const pocket: Pt = [202, 218.8];
    for (const name of ['back', 'palm', 'thumb']) expect(inside(pocket, pts[name]!), name).toBe(false);
  });

  // The reference's fastest move, the middle finger letting go of the stamp's edge and curling under it, covers about
  // a hundred frame units in one of its frames; nothing of ours goes faster than that or changes speed in a jolt.
  it('moves every point of every shape smoothly: nothing jumps from one moment to the next', () => {
    const gap = (pts: readonly Pt[], k: number): number => Math.hypot(pts[k]![0] - pts[(k + 1) % pts.length]![0], pts[k]![1] - pts[(k + 1) % pts.length]![1]);
    // how far apart a shape's neighbouring points are in the reference's own frames, at their widest (a gap opens from shut)
    const frames = Array.from({ length: 23 }, (_, k) => handStampPointsAt(k * 80));
    const widest = Object.fromEntries(Object.keys(frames[0]!).map((name) => [name, Math.max(...frames.flatMap((f) => f[name]!.map((_, k) => gap(f[name]!, k))))]));
    // the worst of each measure over every point at every moment, and where it is, checked once at the end
    const worst = { step: { v: 0, at: '' }, change: { v: 0, at: '' }, spread: { v: 0, at: '' } };
    const note = (w: { v: number; at: string }, v: number, at: () => string): void => {
      if (v > w.v) [w.v, w.at] = [v, at()];
    };
    let [before, last] = [handStampPointsAt(0), handStampPointsAt(5)];
    for (const ms of MOMENTS.slice(2)) {
      const now = handStampPointsAt(ms);
      for (const [name, pts] of Object.entries(now)) {
        pts.forEach(([x, y], k) => {
          const [[px, py], [bx, by]] = [last[name]![k]!, before[name]![k]!];
          const where = (): string => `${name}[${k}] at ${ms} ms`;
          note(worst.step, Math.hypot(x - px, y - py), where);
          note(worst.change, Math.hypot(x - 2 * px + bx, y - 2 * py + by), where);
          if (pts.length > 1) note(worst.spread, gap(pts, k) / (3 * widest[name]!), where);
        });
      }
      [before, last] = [last, now];
    }
    // the fastest of the turn, the thumb swinging as the stamp passes edge-on, moves a point under five frame units in 5 ms
    expect(worst.step.v, worst.step.at).toBeLessThan(10);
    // and its speed only ever changes gently, so nothing snaps from one moment to the next
    expect(worst.change.v, worst.change.at).toBeLessThan(2.5);
    // nor does any point pull far from its neighbours between the reference's frames: under three times their widest
    expect(worst.spread.v, worst.spread.at).toBeLessThan(1);
  });

  it('bends every joint only as the reference’s do: the fingers curl and never bend back, the thumb barely sideways', () => {
    const way = (p: Pt, q: Pt): number => (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
    const bend = (p: Pt, q: Pt, r: Pt): number => ((((way(q, r) - way(p, q)) % 360) + 540) % 360) - 180;
    // Measured on the reference: the index finger's middle joint bends 12 to 52 degrees and its tip joint up to 40,
    // giving 5 back as it presses; the thumb up to 28 at its joint where it leans toward us; the middle finger 22 at most.
    for (const ms of MOMENTS) {
      const { joints, tips } = handStampBonesAt(ms);
      const [index, thumb, middle] = [[...joints.index, tips.index], [joints.thumb[0]!, joints.thumb[1]!, tips.thumb], [joints.reaching[0]!, joints.reaching[1]!, tips.reaching]];
      for (const k of [1, 2]) {
        const b = bend(index[k - 1]!, index[k]!, index[k + 1]!);
        expect(b, `index joint ${k} at ${ms} ms`).toBeLessThanOrEqual(k === 2 ? 8 : 2);
        expect(b, `index joint ${k} at ${ms} ms`).toBeGreaterThan(-60);
      }
      const t = bend(thumb[0]!, thumb[1]!, thumb[2]!);
      expect(t, `thumb at ${ms} ms`).toBeGreaterThan(-32);
      expect(t, `thumb at ${ms} ms`).toBeLessThan(8);
      const m = bend(middle[0]!, middle[1]!, middle[2]!);
      expect(m, `middle finger at ${ms} ms`).toBeGreaterThan(-30);
      expect(m, `middle finger at ${ms} ms`).toBeLessThan(20);
    }
  });

  it('puts every joint where the reference’s is, frame by frame', () => {
    for (const [k, f] of REFERENCE.entries()) {
      const { joints, tips } = handStampBonesAt(((k + 1) % 22) * 80);
      const near = (ours: Pt, theirs: Pt, what: string): void => {
        expect(Math.hypot(ours[0] - theirs[0], ours[1] - theirs[1]), `${what} in frame ${k}`).toBeLessThan(0.5);
      };
      near(joints.thumb[1]!, f.thumb[1], 'the thumb’s joint');
      near(tips.thumb, f.thumb[2], 'the thumb’s tip');
      near(joints.index[1]!, f.index[1], 'the index finger’s middle joint');
      near(joints.index[2]!, f.index[2], 'the index finger’s tip joint');
      near(tips.index, f.index[3], 'the index finger’s tip');
      near(joints.reaching[1]!, f.middle[1], 'the middle finger’s joint');
      near(tips.reaching, f.middle[2], 'the middle finger’s tip');
    }
  });

  /** The stamp's corners `ms` into a turn, on the frame: its foot's two, then its top's. */
  const stampAt = (ms: number): Pt[] => {
    const c = HAND_STAMP_CARD;
    const s = handStampCardAt(ms);
    const a = (s.lean * Math.PI) / 180;
    const half = (c.w / 2) * Math.abs(Math.cos((s.turn * Math.PI) / 180));
    const corner = (x: number, y: number): Pt => [s.cx + x * Math.cos(a) - y * Math.sin(a), s.cy + x * Math.sin(a) + y * Math.cos(a)];
    return [corner(-half, c.h / 2), corner(half, c.h / 2), corner(half, -c.h / 2), corner(-half, -c.h / 2)];
  };
  const toSegment = ([x, y]: Pt, a: Pt, b: Pt): number => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
  };
  /** How far apart two outlines are, 0 where they overlap. */
  const apart = (p: readonly Pt[], q: readonly Pt[]): number => {
    const edges = (r: readonly Pt[]): [Pt, Pt][] => r.map((v, i) => [v, r[(i + 1) % r.length]!]);
    if (p.some((v) => inside(v, q)) || q.some((v) => inside(v, p)) || edges(p).some(([a, b]) => edges(q).some(([c, d]) => crosses(a, b, c, d)))) return 0;
    return Math.min(...p.map((v) => Math.min(...edges(q).map(([a, b]) => toSegment(v, a, b)))), ...q.map((v) => Math.min(...edges(p).map(([a, b]) => toSegment(v, a, b)))));
  };

  it('pinches the stamp’s foot between the thumb in front and the index finger behind, all through the turn', () => {
    for (const ms of MOMENTS) {
      const stamp = stampAt(ms);
      const turn = handStampCardAt(ms).turn;
      const facing = Math.abs(Math.cos((turn * Math.PI) / 180)) >= 0.6;
      // the thumb lies over the stamp's foot while its face shows; edge-on, the foot sits in the shadow between thumb and
      // finger, as close as the reference holds it (its thumb's tip 13 to 17 frame units from the stamp)
      const foot = apart(handStampPointsAt(ms).thumb!, [stamp[0]!, stamp[1]!]);
      expect(foot, `the stamp's foot ${foot.toFixed(1)} from the thumb at ${ms} ms`).toBeLessThanOrEqual(facing ? 0 : 17);
      // and while the stamp faces us, turned no more than about 25 degrees, the thumb's pad is on it
      if (Math.abs(Math.cos((turn * Math.PI) / 180)) >= 0.9) expect(apart([handStampBonesAt(ms).pad], stamp), `the pad off the stamp at ${ms} ms`).toBeLessThan(0.5);
    }
  });

  it('keeps the index finger on the stamp’s back, but for the moments the reference’s lets go', () => {
    // The reference's lets go twice: lifted off as the fingers gather (frames 4 to 6), and pushed off as the stamp turns
    // over (frames 8 to 10), a finger's width away at most (25 frame units); between, in frame 7, it is back on it.
    const lets = (ms: number): boolean => (ms > 320 && ms < 640) || (ms > 640 && ms < 960);
    let widest = 0;
    for (const ms of MOMENTS) {
      const gap = apart(handStampBonesAt(ms).index, stampAt(ms));
      if (lets(ms)) widest = Math.max(widest, gap);
      else expect(gap, `the index finger ${gap.toFixed(1)} off the stamp at ${ms} ms`).toBeLessThan(1);
    }
    expect(widest).toBeGreaterThan(15);
    expect(widest).toBeLessThan(32);
  });

  it('refuses a step that is not a positive time', () => {
    expect(() => handStampFlip(0)).toThrow(RangeError);
  });
});
