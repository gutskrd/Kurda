/**
 * The hand the games' covers are drawn with (game-covers.ts): a brush pen and
 * flat colour, the way an illustrator works on paper.
 *
 * Three things make a drawing read as made by a person rather than plotted,
 * and each is a tool here:
 *
 *   - no shape is a perfect one. An outline goes through points placed by eye
 *     (`smooth`), so a head is nearly round and a card nearly square;
 *   - a line has a beginning and an end. A brush stroke (`brush`) is thin
 *     where the pen comes down, full in the middle and thin again where it
 *     lifts, and a ring drawn in one go (`loop`) is heavier on one side;
 *   - letters are written, not set. Each is a few strokes of the same brush
 *     (`letter`), so no font is needed and the phone and the browser draw the
 *     very same marks.
 *
 * Everything here is a filled path: the phone's renderer and the browser's
 * agree on those to the pixel, and a stroke's width could not vary along it.
 */
import { n } from './svg.js';

/** A point; a third value of 1 makes it a corner, where an outline turns sharply instead of bending. */
export type P = readonly [number, number, (0 | 1)?];

/** The ink lines are drawn in: nearly black, with the purple of the app's night in it. */
export const INK = '#231b33';
/** The paper white: an eye, a card, a page. */
export const PAPER = '#fff7e8';

const sub = (a: P, b: P): [number, number] => [a[0] - b[0], a[1] - b[1]];

/**
 * A curve through hand-placed points: closed for a shape, open for a line.
 * Each bend is eased by its neighbours; at a corner the curve leaves straight
 * for the next point.
 */
export function smooth(pts: readonly P[], closed = true): string {
  const k = pts.length;
  if (k < 2) return '';
  const at = (i: number): P => (closed ? pts[((i % k) + k) % k]! : pts[Math.max(0, Math.min(k - 1, i))]!);
  // how the curve leaves a point, and how it arrives at one
  const leaves = (i: number): [number, number] => {
    const [dx, dy] = at(i)[2] === 1 ? sub(at(i + 1), at(i)) : sub(at(i + 1), at(i - 1));
    const f = at(i)[2] === 1 ? 1 / 3 : 1 / 6;
    return [dx * f, dy * f];
  };
  const arrives = (i: number): [number, number] => {
    const [dx, dy] = at(i)[2] === 1 ? sub(at(i), at(i - 1)) : sub(at(i + 1), at(i - 1));
    const f = at(i)[2] === 1 ? 1 / 3 : 1 / 6;
    return [dx * f, dy * f];
  };
  let d = `M${n(pts[0]![0])} ${n(pts[0]![1])}`;
  const spans = closed ? k : k - 1;
  for (let i = 0; i < spans; i++) {
    const [p1, p2, out, into] = [at(i), at(i + 1), leaves(i), arrives(i + 1)];
    d += `C${n(p1[0] + out[0])} ${n(p1[1] + out[1])} ${n(p2[0] - into[0])} ${n(p2[1] - into[1])} ${n(p2[0])} ${n(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** Points along the curve `smooth` draws through `pts`, `per` to a span, with the direction of travel at each. */
function along(pts: readonly P[], per: number, closed: boolean): Array<{ x: number; y: number; tx: number; ty: number }> {
  const k = pts.length;
  const at = (i: number): P => (closed ? pts[((i % k) + k) % k]! : pts[Math.max(0, Math.min(k - 1, i))]!);
  const out: Array<{ x: number; y: number; tx: number; ty: number }> = [];
  const spans = closed ? k : k - 1;
  for (let i = 0; i < spans; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6] as const;
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6] as const;
    const steps = i === spans - 1 && !closed ? per + 1 : per;
    for (let s = 0; s < steps; s++) {
      const u = s / per;
      const v = 1 - u;
      const x = v * v * v * p1[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * p2[0];
      const y = v * v * v * p1[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * p2[1];
      const tx = 3 * v * v * (c1[0] - p1[0]) + 6 * v * u * (c2[0] - c1[0]) + 3 * u * u * (p2[0] - c2[0]);
      const ty = 3 * v * v * (c1[1] - p1[1]) + 6 * v * u * (c2[1] - c1[1]) + 3 * u * u * (p2[1] - c2[1]);
      const len = Math.hypot(tx, ty) || 1;
      out.push({ x, y, tx: tx / len, ty: ty / len });
    }
  }
  return out;
}

/**
 * One stroke of the brush pen along a line through `pts`, as a shape to fill:
 * `width` at its fullest, thinning to a share of that at each end (`taper`,
 * the start's share and the end's; 1 is a marker that never thins).
 */
export function brush(pts: readonly P[], width: number, taper: readonly [number, number] = [0.3, 0.3]): string {
  const line = along(pts, 4, false);
  const last = line.length - 1;
  if (last < 1) return '';
  // the pen takes a fifth of the stroke to come down and a fifth to lift
  const press = (u: number): number => {
    const ease = (t: number): number => t * t * (3 - 2 * t);
    const down = taper[0] + (1 - taper[0]) * ease(Math.min(1, u / 0.22));
    const up = taper[1] + (1 - taper[1]) * ease(Math.min(1, (1 - u) / 0.22));
    return (width / 2) * Math.min(down, up);
  };
  const left: P[] = [];
  const right: P[] = [];
  line.forEach((q, i) => {
    const w = press(i / last);
    left.push([q.x - q.ty * w, q.y + q.tx * w]);
    right.push([q.x + q.ty * w, q.y - q.tx * w]);
  });
  const [a, b] = [line[0]!, line[last]!];
  const [wa, wb] = [press(0), press(1)];
  // the ends are rounded by a point set a little beyond each: where the brush touched and where it left
  const outline: P[] = [[a.x - a.tx * wa, a.y - a.ty * wa], ...left, [b.x + b.tx * wb, b.y + b.ty * wb], ...right.reverse()];
  return smooth(outline, true);
}

/**
 * A ring drawn in one go through `pts`: heavier on one side than the other,
 * as a hand makes it (`vary` is how much, `phase` where round the ring the
 * heavy side falls). Fill it with the even-odd rule.
 */
export function loop(pts: readonly P[], width: number, vary = 0.3, phase = 0): string {
  const line = along(pts, 4, true);
  const outer: P[] = [];
  const inner: P[] = [];
  line.forEach((q, i) => {
    const w = (width / 2) * (1 + vary * Math.sin((i / line.length) * Math.PI * 2 + phase));
    outer.push([q.x - q.ty * w, q.y + q.tx * w]);
    inner.push([q.x + q.ty * w, q.y - q.tx * w]);
  });
  return `${smooth(outer, true)}${smooth(inner, true)}`;
}

/** A nearly round outline about a point: eight points, each a little off the circle, the same every time. */
export function roundish(cx: number, cy: number, rx: number, ry = rx, turn = 0): P[] {
  // the offsets are fixed, not random: a drawing is the same string on every machine
  const off = [1.02, 0.97, 1.01, 1.04, 0.98, 1.02, 0.96, 1.03];
  return off.map((f, i): P => {
    const a = turn + (i / off.length) * Math.PI * 2;
    return [cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f];
  });
}

/**
 * The letters the covers write, each as the strokes a hand makes it with, in a
 * box seven wide and ten tall (the top of a capital is 0, the line it stands
 * on is 10; a hat sits above the box and a cedilla hangs below it, clear of
 * its letter so that an S with one is never taken for a coin). A stroke of a
 * single point is a dot.
 */
const HAT: P[][] = [
  [
    [1.6, -1.4],
    [3.5, -3.3, 1],
    [5.4, -1.4],
  ],
];
const TAIL: P[][] = [
  [
    [3.7, 11.2],
    [4.5, 12.3],
    [2.9, 13.4],
  ],
];
const E: P[][] = [
  [
    [1.2, 0],
    [1, 10],
  ],
  [
    [1, 0.3],
    [6.2, 0],
  ],
  [
    [1.1, 4.9],
    [5.2, 4.6],
  ],
  [
    [1, 9.9],
    [6.4, 9.6],
  ],
];
const S: P[][] = [
  [
    [6, 1.6],
    [3.9, 0],
    [1.3, 1.5],
    [1.8, 4],
    [5.2, 5.8],
    [5.8, 8.4],
    [3.3, 10],
    [0.6, 8.6],
  ],
];
const C: P[][] = [
  [
    [6.4, 2],
    [4, 0],
    [1.2, 2.3],
    [0.8, 6.6],
    [3.5, 10],
    [6.5, 8.2],
  ],
];
const I: P[][] = [
  [
    [3.5, 0],
    [3.4, 10],
  ],
];
const U: P[][] = [
  [
    [0.7, 0],
    [0.8, 6.8],
    [3.5, 10],
    [6.2, 6.8],
    [6.4, 0],
  ],
];
const P_: P[][] = [
  [
    [1.3, 10],
    [1.1, 0.1],
  ],
  [
    [1.1, 0.5],
    [5.4, 0.3],
    [6.7, 2.8],
    [5.3, 5.3],
    [1.3, 5.6],
  ],
];
const GLYPHS: Readonly<Record<string, readonly P[][]>> = {
  A: [
    [
      [0.3, 10],
      [3.5, 0],
    ],
    [
      [3.5, 0],
      [6.8, 10],
    ],
    [
      [1.7, 6.5],
      [5.5, 6.2],
    ],
  ],
  C,
  Ç: [...C, ...TAIL],
  D: [
    [
      [1.3, 0],
      [1.1, 10],
    ],
    [
      [1.1, 0.3],
      [4.6, 0.6],
      [6.8, 4.9],
      [4.7, 9.5],
      [1.1, 9.9],
    ],
  ],
  E,
  Ê: [...E, ...HAT],
  I,
  Î: [...I, ...HAT],
  J: [
    [
      [5.4, 0],
      [5.3, 7.4],
      [3.2, 10],
      [0.9, 8.4],
    ],
  ],
  K: [
    [
      [1.3, 0],
      [1.1, 10],
    ],
    [
      [6.3, 0],
      [1.4, 5.6],
    ],
    [
      [3, 4.2],
      [6.6, 10],
    ],
  ],
  N: [
    [
      [1.1, 10],
      [1.2, 0],
    ],
    [
      [1.2, 0],
      [6, 10],
    ],
    [
      [6, 10],
      [6.1, 0],
    ],
  ],
  O: [
    [
      [3.6, 0],
      [0.8, 2.6],
      [0.8, 7.2],
      [3.5, 10],
      [6.3, 7.3],
      [6.3, 2.7],
      [3.4, 0.1],
    ],
  ],
  P: P_,
  Q: [
    [
      [3.6, 0],
      [0.8, 2.6],
      [0.8, 7.2],
      [3.5, 10],
      [6.3, 7.3],
      [6.3, 2.7],
      [3.4, 0.1],
    ],
    [
      [4.2, 7.4],
      [7, 10.6],
    ],
  ],
  R: [
    ...P_,
    [
      [3.5, 5.5],
      [6.7, 10],
    ],
  ],
  S,
  Ş: [...S, ...TAIL],
  U,
  Û: [...U, ...HAT],
  V: [
    [
      [0.3, 0],
      [3.5, 10],
    ],
    [
      [3.5, 10],
      [6.8, 0],
    ],
  ],
  W: [
    [
      [0, 0],
      [1.9, 10],
    ],
    [
      [1.9, 10],
      [3.5, 3],
    ],
    [
      [3.5, 3],
      [5.2, 10],
    ],
    [
      [5.2, 10],
      [7, 0],
    ],
  ],
  X: [
    [
      [0.6, 0],
      [6.4, 10],
    ],
    [
      [6.5, 0],
      [0.5, 10],
    ],
  ],
  Y: [
    [
      [0.3, 0],
      [3.5, 4.9],
    ],
    [
      [6.8, 0],
      [3.5, 4.9],
      [3.4, 10],
    ],
  ],
  '?': [
    [
      [1, 2.6],
      [3.5, 0],
      [6, 2.3],
      [3.7, 5.2],
      [3.5, 7],
    ],
    [[3.5, 9.7]],
  ],
};

/** The letters a cover can write. */
export const LETTERS: readonly string[] = Object.keys(GLYPHS);

/**
 * One letter written with the brush, as a shape to fill: its box's upper left
 * at (x, y), `height` tall, turned by `turn` degrees about its middle, each
 * stroke `weight` wide at its fullest.
 */
export function letter(ch: string, x: number, y: number, height: number, weight: number, turn = 0): string {
  const strokes = GLYPHS[ch];
  if (!strokes) throw new RangeError(`art: the covers cannot write ${ch}`);
  const k = height / 10;
  const [mx, my] = [x + 3.5 * k, y + 5 * k];
  const [cos, sin] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)];
  const place = ([px, py]: P): P => {
    const [dx, dy] = [x + px * k - mx, y + py * k - my];
    return [mx + dx * cos - dy * sin, my + dx * sin + dy * cos];
  };
  // a stroke of one point is a dot: the brush set down and lifted
  return strokes.map((s) => (s.length === 1 ? smooth(roundish(place(s[0]!)[0], place(s[0]!)[1], weight * 0.62)) : brush(s.map(place), weight, [0.55, 0.45]))).join('');
}
