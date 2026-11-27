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
/**
 * The reference's skeleton, measured frame by frame over one half of its loop (the other half repeats the hand), on
 * the frame: the thumb's base, joint and tip; the index finger's base, middle joint, tip joint and tip; the middle
 * finger's root where the thumb covers it, its joint and its tip.
 */
const REFERENCE: readonly { thumb: [Pt, Pt, Pt]; index: [Pt, Pt, Pt, Pt]; middle: [Pt, Pt, Pt] }[] = [
  { thumb: [[157.7, 235.7], [156.8, 220.0], [144.7, 140.7]], index: [[233.1, 235.7], [226.8, 208.9], [197.3, 179.7], [137.6, 149.8]], middle: [[123.3, 188.4], [112.4, 189.5], [70.5, 198.2]] },
  { thumb: [[155.9, 235.7], [156.0, 220.1], [144.7, 139.4]], index: [[235.0, 235.7], [230.3, 210.5], [198.8, 178.7], [138.9, 149.2]], middle: [[120.0, 186.0], [111.5, 186.7], [69.7, 195.3]] },
  { thumb: [[154.3, 235.7], [153.9, 220.3], [143.6, 138.7]], index: [[236.9, 235.7], [234.0, 210.7], [202.7, 174.4], [141.9, 146.9]], middle: [[112.4, 169.3], [108.4, 169.1], [66.1, 173.8]] },
  { thumb: [[149.5, 235.7], [147.5, 220.8], [142.5, 137.7]], index: [[240.7, 235.7], [239.6, 207.5], [209.5, 171.5], [151.1, 139.0]], middle: [[107.4, 173.0], [100.6, 168.1], [61.7, 158.5]] },
  { thumb: [[140.2, 235.7], [138.5, 216.2], [134.1, 133.4]], index: [[252.0, 235.7], [257.6, 206.2], [230.8, 171.5], [171.3, 146.8]], middle: [[102.4, 176.7], [92.7, 167.0], [57.3, 143.3]] },
  { thumb: [[142.6, 235.7], [140.9, 217.7], [131.2, 134.4]], index: [[254.6, 235.7], [265.1, 208.1], [241.5, 168.5], [176.6, 144.5]], middle: [[102.4, 178.4], [92.2, 167.4], [61.1, 137.9]] },
  { thumb: [[145.7, 235.7], [145.5, 219.7], [134.2, 135.7]], index: [[256.2, 235.7], [267.5, 207.9], [243.9, 166.2], [180.5, 143.1]], middle: [[104.0, 178.4], [97.2, 171.0], [69.2, 138.5]] },
  { thumb: [[158.4, 235.7], [158.1, 218.8], [146.4, 144.0]], index: [[242.1, 235.7], [233.6, 196.1], [201.1, 153.1], [144.6, 117.7]], middle: [[109.0, 176.7], [98.8, 167.3], [67.1, 138.3]] },
  { thumb: [[175.2, 235.7], [172.9, 217.7], [133.6, 161.6]], index: [[237.3, 235.7], [223.7, 196.6], [191.6, 153.2], [148.8, 103.4]], middle: [[124.4, 170.6], [112.7, 153.9], [87.3, 119.3]] },
  { thumb: [[146.2, 235.7], [146.4, 219.5], [122.5, 138.7]], index: [[234.3, 235.7], [221.2, 200.4], [192.6, 155.8], [152.5, 101.4]], middle: [[118.2, 140.2], [118.2, 140.2], [92.9, 114.3]] },
  { thumb: [[139.6, 235.7], [134.3, 214.6], [121.0, 130.5]], index: [[232.3, 235.7], [214.7, 200.2], [185.5, 164.4], [142.8, 113.6]], middle: [[119.5, 197.1], [98.3, 202.3], [82.7, 211.8]] },
  { thumb: [[146.7, 235.7], [143.5, 220.1], [130.4, 136.4]], index: [[224.2, 235.7], [206.3, 204.9], [170.9, 167.7], [121.9, 122.3]], middle: [[112.4, 214.5], [112.3, 214.5], [78.3, 227.4]] },
  { thumb: [[148.2, 235.7], [146.9, 219.2], [137.9, 138.7]], index: [[219.9, 235.7], [213.5, 211.5], [168.0, 181.9], [114.7, 141.7]], middle: [[117.3, 214.5], [117.3, 214.5], [95.2, 231.5]] },
  { thumb: [[154.6, 235.7], [151.4, 216.8], [140.3, 140.0]], index: [[222.8, 235.7], [216.9, 208.6], [175.4, 182.0], [122.7, 141.0]], middle: [[117.7, 205.7], [117.7, 205.7], [80.2, 218.9]] },
  { thumb: [[156.9, 235.7], [153.6, 216.9], [143.3, 139.7]], index: [[229.0, 235.7], [223.8, 211.4], [196.0, 181.0], [137.2, 149.4]], middle: [[122.3, 197.4], [115.7, 198.4], [75.7, 212.1]] },
  { thumb: [[157.1, 235.7], [153.8, 216.9], [145.0, 139.0]], index: [[230.8, 235.7], [226.0, 211.6], [196.4, 181.1], [138.1, 148.6]], middle: [[121.4, 191.8], [113.0, 193.4], [71.9, 205.2]] },
  { thumb: [[157.6, 235.7], [154.1, 216.2], [145.2, 140.7]], index: [[232.0, 235.7], [226.3, 210.5], [196.3, 180.5], [137.4, 149.1]], middle: [[122.4, 189.4], [113.1, 190.9], [71.7, 201.9]] },
  { thumb: [[157.6, 235.7], [154.4, 216.3], [145.5, 141.0]], index: [[232.5, 235.7], [226.8, 209.6], [196.9, 180.4], [137.2, 150.6]], middle: [[122.7, 188.9], [112.9, 190.1], [71.4, 200.2]] },
  { thumb: [[157.7, 235.7], [155.3, 216.9], [145.5, 141.7]], index: [[233.1, 235.7], [226.6, 208.9], [197.2, 180.2], [138.6, 148.4]], middle: [[123.3, 188.2], [113.5, 189.2], [71.7, 198.3]] },
  { thumb: [[157.7, 235.7], [155.3, 216.9], [145.5, 141.7]], index: [[233.1, 235.7], [226.6, 208.9], [197.2, 180.2], [138.6, 148.4]], middle: [[123.3, 188.2], [113.5, 189.2], [71.7, 198.3]] },
  { thumb: [[157.7, 235.7], [155.3, 216.9], [145.5, 141.7]], index: [[233.1, 235.7], [226.6, 208.9], [197.2, 180.2], [138.6, 148.4]], middle: [[123.3, 188.2], [113.5, 189.2], [71.7, 198.3]] },
  { thumb: [[157.7, 235.7], [155.3, 216.9], [145.5, 141.7]], index: [[233.1, 235.7], [226.6, 208.9], [197.2, 180.2], [138.6, 148.4]], middle: [[123.3, 188.2], [113.5, 189.2], [71.7, 198.3]] },
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
      for (const name of ['back', 'thumb', 'curled', 'slit', 'wedge', 'ring', 'nail', 'freeEdge']) {
        const cross = selfCrossing(pts[name]!);
        expect(cross, `${name} at ${ms} ms crosses itself at ${String(cross)}`).toBeNull();
      }
    }
  });

  // The reference's fastest move, the middle finger letting go of the stamp's edge and curling under it, covers about
  // a hundred frame units in one of its frames; nothing of ours goes faster than that or changes speed in a jolt.
  it('moves every point of every shape smoothly: nothing jumps from one moment to the next', () => {
    const gap = (pts: readonly Pt[], k: number): number => Math.hypot(pts[k]![0] - pts[(k + 1) % pts.length]![0], pts[k]![1] - pts[(k + 1) % pts.length]![1]);
    // how far apart a shape's neighbouring points are in the reference's own frames, at their widest (a gap opens from shut)
    const frames = Array.from({ length: 23 }, (_, k) => handStampPointsAt(k * 80));
    const widest = Object.fromEntries(Object.keys(frames[0]!).map((name) => [name, Math.max(...frames.flatMap((f) => f[name]!.map((_, k) => gap(f[name]!, k))))]));
    let [before, last] = [handStampPointsAt(0), handStampPointsAt(5)];
    for (const ms of MOMENTS.slice(2)) {
      const now = handStampPointsAt(ms);
      for (const [name, pts] of Object.entries(now)) {
        pts.forEach(([x, y], k) => {
          const [[px, py], [bx, by]] = [last[name]![k]!, before[name]![k]!];
          // the fastest of the turn, the thumb swinging as the stamp passes edge-on, moves a point under five frame units in 5 ms
          expect(Math.hypot(x - px, y - py), `${name}[${k}] at ${ms} ms`).toBeLessThan(10);
          // and its speed only ever changes gently, so nothing snaps from one moment to the next
          expect(Math.hypot(x - 2 * px + bx, y - 2 * py + by), `${name}[${k}] at ${ms} ms`).toBeLessThan(2.5);
          // nor does any point pull far from its neighbours between the reference's frames
          if (pts.length > 1) expect(gap(pts, k), `${name}[${k}] at ${ms} ms`).toBeLessThan(3 * widest[name]!);
        });
      }
      [before, last] = [last, now];
    }
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
