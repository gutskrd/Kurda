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

  it('wears the skin of the hand holding the phone, its shadows in the antlers’ brown and its lines a warm one', () => {
    const used = new Set([...colours(stampBack), ...colours(stampFront)]);
    for (const c of [SKIN.face, SKIN.shade]) expect(used).toContain(c);
    for (const c of [SKIN.face, SKIN.shade]) expect(colours(back)).toContain(c);
    // a warm brown for the lines: red over green over blue, darker than the skin's shade
    const rgb = (c: string): number[] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const warm = [...used].filter((c) => {
      const [r, g, b] = rgb(c);
      return r! > g! && g! > b! && r! < rgb(SKIN.shade)[0]!;
    });
    expect(warm.length).toBeGreaterThan(0);
    // nothing near black: every colour has some light in it
    for (const c of used) expect(Math.max(...rgb(c))).toBeGreaterThan(64);
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
/** The moments of a turn the checks look at: every 5 ms from rest to rest. */
const MOMENTS = Array.from({ length: HAND_STAMP_FLIP.ms / 5 + 1 }, (_, k) => k * 5);

describe('the turn of the stamp in the hand', () => {
  const flip = handStampFlip();
  const turnOf = (transform: string): number => Number(/rotateY\((-?[\d.]+)deg\)/.exec(transform)![1]);

  it('takes 1.36 s from rest to rest, the stamp at rest at both ends but for showing its other face', () => {
    expect(HAND_STAMP_FLIP.ms).toBe(1360);
    expect(flip[0]).toBe(`translate(0px, 0px) rotate(${HAND_STAMP_CARD.turn}deg) rotateY(0deg)`);
    expect(flip.at(-1)).toBe(`translate(0px, 0px) rotate(${HAND_STAMP_CARD.turn}deg) rotateY(180deg)`);
    // and every shape of the hand ends where it began
    const [start, end] = [handStampShapesAt(0), handStampShapesAt(HAND_STAMP_FLIP.ms)];
    for (const name of Object.keys(start)) expect(end[name]).toBe(start[name]);
  });

  it('holds the stamp a third turned, then turns it over fast, edge-on where its words change, and lands it softly', () => {
    const at = (share: number): number => turnOf(flip[Math.round(share * (flip.length - 1))]!);
    expect(at(5 / 17)).toBeGreaterThan(25);
    expect(at(5 / 17)).toBeLessThan(40);
    expect(Math.abs(at(HAND_STAMP_FLIP.edgeOn) - 90)).toBeLessThan(8);
    const turns = flip.map(turnOf);
    const over = turns.findIndex((v) => v > 90);
    for (let i = over + 1; i < turns.length; i++) expect(turns[i]!).toBeGreaterThanOrEqual(turns[i - 1]! - 0.5);
    expect(turns.at(-1)! - turns.at(-5)!).toBeLessThan(turns[over + 4]! - turns[over]!);
  });

  it('never folds an outline over itself, at any moment of the turn', () => {
    for (const ms of MOMENTS) {
      const pts = handStampPointsAt(ms);
      for (const name of ['back', 'thumb', 'curled', 'slit', 'wedge', 'nail', 'freeEdge']) {
        const cross = selfCrossing(pts[name]!);
        expect(cross, `${name} at ${ms} ms crosses itself at ${String(cross)}`).toBeNull();
      }
    }
  });

  it('moves every point of every shape smoothly: nothing jumps from one moment to the next', () => {
    const gap = (pts: readonly Pt[], k: number): number => Math.hypot(pts[k]![0] - pts[(k + 1) % pts.length]![0], pts[k]![1] - pts[(k + 1) % pts.length]![1]);
    const rest = handStampPointsAt(0);
    const widest = Object.fromEntries(Object.entries(rest).map(([name, pts]) => [name, Math.max(...pts.map((_, k) => gap(pts, k)))]));
    let [before, last] = [handStampPointsAt(0), handStampPointsAt(5)];
    for (const ms of MOMENTS.slice(2)) {
      const now = handStampPointsAt(ms);
      for (const [name, pts] of Object.entries(now)) {
        pts.forEach(([x, y], k) => {
          const [[px, py], [bx, by]] = [last[name]![k]!, before[name]![k]!];
          // the fastest of the turn, the thumb swinging as the stamp passes edge-on, moves a point under five frame units in 5 ms
          expect(Math.hypot(x - px, y - py), `${name}[${k}] at ${ms} ms`).toBeLessThan(5.5);
          // and its speed only ever changes gently, so nothing snaps from one moment to the next
          expect(Math.hypot(x - 2 * px + bx, y - 2 * py + by), `${name}[${k}] at ${ms} ms`).toBeLessThan(1);
          // nor does any point pull far from its neighbours (the wedges stretch most, as the middle finger reaches out)
          if (pts.length > 1) expect(gap(pts, k), `${name}[${k}] at ${ms} ms`).toBeLessThan(3 * widest[name]!);
        });
      }
      [before, last] = [last, now];
    }
  });

  it('bends every joint only as a hand does: the fingers curl and never bend back, and the thumb barely bends sideways', () => {
    const way = (p: Pt, q: Pt): number => (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
    const bend = (p: Pt, q: Pt, r: Pt): number => ((((way(q, r) - way(p, q)) % 360) + 540) % 360) - 180;
    for (const ms of MOMENTS) {
      const { thumb, index, reaching } = handStampBonesAt(ms).joints;
      // the index finger curls toward the thumb (turning anticlockwise on the screen) at its knuckle and its middle joint
      for (const k of [1, 2]) {
        const b = bend(index[k - 1]!, index[k]!, index[k + 1]!);
        expect(b, `index joint ${k} at ${ms} ms`).toBeLessThanOrEqual(2);
        expect(b, `index joint ${k} at ${ms} ms`).toBeGreaterThan(-95);
      }
      // seen from the nail, the thumb's joint bends toward the palm, so hardly at all across the picture
      expect(Math.abs(bend(thumb[0]!, thumb[1]!, thumb[2]!)), `thumb at ${ms} ms`).toBeLessThan(12);
      // the middle finger curls up round the stamp's edge (clockwise on the screen), never back
      const m = bend(reaching[0]!, reaching[1]!, reaching[2]!);
      expect(m, `middle finger at ${ms} ms`).toBeGreaterThan(-5);
      expect(m, `middle finger at ${ms} ms`).toBeLessThan(95);
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
      const facing = Math.abs(Math.cos((turn * Math.PI) / 180)) >= 0.5;
      // the thumb lies over the stamp's foot while its face shows; edge-on, the foot sits in the shadow between thumb and
      // finger, as close as the reference holds it (about ten frame units)
      const foot = apart(handStampPointsAt(ms).thumb!, [stamp[0]!, stamp[1]!]);
      expect(foot, `the stamp's foot ${foot.toFixed(1)} from the thumb at ${ms} ms`).toBeLessThanOrEqual(facing ? 0 : 12);
      // and while the stamp faces us, turned no more than about 40 degrees, the thumb's pad is on it
      if (Math.abs(Math.cos((turn * Math.PI) / 180)) >= 0.75) expect(apart([handStampBonesAt(ms).pad], stamp), `the pad off the stamp at ${ms} ms`).toBeLessThan(0.5);
    }
  });

  it('keeps the index finger on the stamp’s back, but for the moment the reference’s lets go', () => {
    // As the reference does, the finger stays where it is while the stamp, held a third turned, turns off it, and a
    // finger's width opens between them (the reference's widest is 28 frame units); then it comes back to push.
    const lets = (ms: number): boolean => ms > 240 && ms < 560;
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
