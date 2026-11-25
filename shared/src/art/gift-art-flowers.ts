/**
 * The flower gifts (gift-art.ts): a red rose tied with twine, a sprig of chamomile, a red mountain tulip, a bunch of
 * Newroz narcissus, an iris, and a bouquet of roses, tulips and narcissus wrapped in paper. Each bloom is painted once
 * here about its own middle and set in place, so the rose in the bouquet is the rose given on its own.
 */
import { n, type Drawing, type Pt } from './svg.js';
import { blade, brush, ellipse, leaf, lerp, outline, paint, polygon, roundish, shift, side, streaks, touch, tremble, within, type Rnd, type Tone } from './gift-paint.js';

const ROSE = { base: '#b8273a', light: '#e0626c', shade: '#801729', deep: '#52101b' };
const LEAF: Tone = { base: '#5d7f45', light: '#83a563', shade: '#3e5c2e' };
const TWINE: Tone = { base: '#c79a52', light: '#e2bd7c', shade: '#8f6a35' };
/** Grey-green, with the bloom on it: the leaves of bulbs, tulips, narcissus and iris. */
const BLUE_LEAF: Tone = { base: '#6f9277', light: '#9dbb9f', shade: '#4d6d56' };
type Petals = { base: string; light: string; shade: string; deep: string };
const TULIP_RED: Petals = { base: '#c8352b', light: '#e7664c', shade: '#8c2219', deep: '#4c100c' };
const TULIP_PINK: Petals = { base: '#d9728a', light: '#f0a2b2', shade: '#a64a62', deep: '#5e1a2e' };
const NARCISSUS = { base: '#fdf8ec', back: '#ebe3d3', shade: '#d3ccdb', cup: '#f2bd3e', rim: '#e0852a', eye: '#7c8c3c' };

/** Runs `draw` placed at (x, y), turned `deg` and scaled: a bloom painted about its own middle and set in its place. */
function placed(dr: Drawing, x: number, y: number, deg: number, sx: number, draw: () => void, sy = sx): void {
  dr.add(`<g transform="translate(${n(x)} ${n(y)}) rotate(${n(deg)}) scale(${n(sx)} ${n(sy)})">`);
  draw();
  dr.add('</g>');
}

/** A stem from `pts[0]` to its flower, lit down one side. */
function stem(dr: Drawing, rnd: Rnd, pts: Pt[], width: number, tone: Tone = LEAF): void {
  paint(dr, brush(pts, width, rnd, { start: 1, end: 0.8, peak: 0.5, count: 16 }), tone.shade);
  paint(dr, brush(shift(pts, -width * 0.2, 0), width * 0.36, rnd, { start: 0.6, end: 0.6, peak: 0.5, count: 12 }), tone.base);
}

// ─────────────────────────────────────────────────────────────── the blooms

/**
 * A rose about (0, 0), 25 across. Its petals are shells: the ones behind in shade, the cup in the middle with its spiral,
 * the ones in front wrapping it, each lip rolled back into the light with the dark of the flower showing above it, and
 * `flare` of the outer ones turned right back. `plain` leaves out the turns of shade and `fine` the brush's finest
 * sampling, for a rose among many.
 */
function rose(dr: Drawing, rnd: Rnd, { flare = 2, sepals = true, plain = false, fine = true } = {}): void {
  const count = fine ? 12 : 6;
  if (sepals) {
    for (const [tx, ty, b] of [[-15, 25, 0.1], [-6, 29, 0.06], [7, 29, -0.06], [16, 24, -0.1]] as const) {
      paint(dr, outline(tremble(blade([tx * 0.12, 15], [tx, ty], 3.8, { at: 0.3, bend: b, point: 1 }), rnd, 0.15)), LEAF.base);
    }
  }
  paint(dr, outline(roundish(0, -1, 24.5, 21.5, rnd, { wobble: 0.05, count: fine ? 28 : 16 })), ROSE.deep);
  const shellPetal = (pts: Pt[], lip: Pt[], face: string, light: string, shade: string | null): void => {
    const p = tremble(pts, rnd, 0.3);
    if (plain) {
      // among many, the lip is laid straight on, a little inside the edge, with no clip to keep it there
      paint(dr, outline(p), face);
      if (face !== ROSE.shade) paint(dr, brush(shift(lip, 0, 0.5), 1.5, rnd, { start: 0.6, end: 0.05, peak: 0.3, count }), light);
      return;
    }
    paint(dr, brush(shift(lip, 0, -0.9), 1.6, rnd, { start: 0.4, end: 0.3, peak: 0.5, count }), ROSE.deep);
    paint(dr, outline(p), face);
    if (shade) side(dr, p, 0, -2.6, shade);
    within(dr, outline(p), () => paint(dr, brush(lip, 2.1, rnd, { start: 0.7, end: 0.05, peak: 0.25, count }), light));
  };
  shellPetal([[-24.6, 3], [-25.4, -7], [-20.6, -15.6], [-11.6, -19.6], [-5, -14], [-10.4, -5.6], [-16.4, 2.4]], [[-24.8, -3], [-22.8, -11.6], [-16.6, -17.8], [-9.6, -19.6]], ROSE.shade, ROSE.base, null);
  shellPetal([[24.4, 1.4], [25.6, -8.6], [20.6, -16.6], [11, -20], [4.6, -14], [10, -5.4], [16.4, 1.8]], [[25.2, -5], [22.8, -13.6], [16.2, -18.8], [9, -20.4]], ROSE.shade, ROSE.base, null);
  shellPetal([[-11.6, -14.8], [-7, -21.6], [1.6, -24], [9.6, -21.8], [12.4, -15], [1.4, -12.2]], [[-9.2, -19.8], [-3.6, -23], [3.6, -23.8], [9.6, -21.4]], ROSE.shade, ROSE.base, null);
  // the outer petals turned back on themselves, their paler undersides catching the light where they curl
  const FLARES: Array<[Pt[], Pt[], Pt[]]> = [
    [[[-19.6, -3.4], [-26.4, -0.6], [-31, 5.6], [-29.4, 12], [-21.6, 13.2], [-14.6, 7.4]], [[-26.4, 0], [-30.6, 5.6], [-29.2, 11.2]], [[-21.4, -0.8], [-17.4, 4.6], [-15.6, 8]]],
    [[[19.6, -5.6], [26.6, -3.4], [31, 2.6], [29.2, 8.8], [21.6, 10.4], [15.4, 4.6]], [[26.8, -2.8], [30.8, 2.6], [29.2, 8]], [[21.2, -2.6], [17.6, 2.2], [16.2, 5.6]]],
  ];
  for (const [pts, lip, crease] of FLARES.slice(0, flare)) {
    const p = tremble(pts, rnd, 0.3);
    paint(dr, outline(p), ROSE.base);
    within(dr, outline(p), () => {
      paint(dr, brush(lip, 2.8, rnd, { start: 0.4, end: 0.2, peak: 0.5, count }), ROSE.light);
      paint(dr, brush(crease, 1.1, rnd, { start: 0.3, end: 0.3, peak: 0.5, count }), ROSE.deep);
    });
  }
  // the cup, its mouth dark, the inner petals curled into a spiral
  const cupPts = roundish(0.6, -7.4, 11.6, 9.6, rnd, { wobble: 0.05, count: fine ? 20 : 12 });
  paint(dr, outline(cupPts), ROSE.base);
  if (!plain) side(dr, cupPts, -1.4, -1.6, ROSE.shade);
  const mouth = roundish(1, -11, 8.6, 4.2, rnd, { wobble: 0.08, count: fine ? 18 : 10, rot: -6 });
  paint(dr, outline(mouth), ROSE.deep);
  within(dr, outline(mouth), () => {
    paint(dr, brush([[-8, -9.6], [-3.4, -13.4], [4.4, -13.6], [8.6, -10.4]], 2.8, rnd, { start: 0.3, end: 0.4, peak: 0.5, count }), ROSE.base);
    paint(dr, brush([[-6.4, -9.4], [-2, -12.2], [4, -12], [5.8, -9.8], [2.4, -8.2], [-1, -9.6]], 1.5, rnd, { start: 0.4, end: 0.2, count }), ROSE.light);
    paint(dr, brush([[-0.6, -10.8], [1.6, -11.6], [2.8, -10.4]], 1, rnd, { count }), ROSE.base);
  });
  paint(dr, brush([[-11, -5.4], [-10, -11.6], [-4.4, -15.6]], 1.6, rnd, { start: 0.3, end: 0.2, count }), ROSE.light);
  shellPetal([[-24, -0.6], [-21.4, 7.4], [-13.6, 13.6], [-3, 15.6], [3.4, 10.4], [-1.6, 4.2], [-9.4, 0.6], [-17.6, -1.4]], [[-23.6, -0.8], [-17.4, -1.2], [-10.6, 0.4], [-5, 2.8]], ROSE.base, ROSE.light, ROSE.shade);
  shellPetal([[23.8, -2.6], [20.6, 5.8], [12.4, 12.8], [1.6, 15.4], [-2.6, 10.6], [2.8, 4.4], [10.4, 0.2], [17.8, -2.2]], [[23.4, -2.8], [17.6, -2], [11.2, 0.2], [6, 2.8]], ROSE.base, ROSE.light, ROSE.shade);
  shellPetal([[-15.2, 8.6], [-8.4, 17.4], [1, 20.4], [10.6, 17.2], [14.6, 11.6], [8.4, 10.2], [0.4, 11], [-7.6, 9.4]], [[14.2, 11.8], [8.6, 10.6], [1.6, 11.2], [-4, 10.4]], ROSE.base, ROSE.light, ROSE.shade);
}

/**
 * A tulip about (0, 0), 24 tall, its stem joining at (0, 12): the two tepals behind just showing their tips over the
 * dark of the cup, two at its sides, and one in front with the satin light down it.
 */
function tulip(dr: Drawing, rnd: Rnd, t: Petals, fine = true): void {
  const tepal = (b: Pt, tip: Pt, w: number, bend: number): Pt[] => tremble(blade(b, tip, w, { at: 0.6, bend, point: 0.35, count: fine ? 12 : 7 }), rnd, 0.22);
  for (const [b, tip] of [[[-1, 9], [-6.6, -12.6]], [[1, 9], [7.4, -12.4]]] as Array<[Pt, Pt]>) paint(dr, outline(tepal(b, tip, 10.6, 0)), t.shade);
  paint(dr, outline(roundish(0.4, -8.8, 5, 2.4, rnd, { count: 10 })), t.deep);
  const left = tepal([-0.6, 11], [-8.8, -9], 12.6, -0.1);
  const right = tepal([0.6, 11], [9.2, -9.4], 12.6, 0.1);
  const front = tepal([0, 12], [0.6, -11.2], 14.2, 0);
  if (!fine) {
    // among many, the turns of shade are the tepals' own darker copies showing past them
    paint(dr, outline(shift(left, -1.4, 0)) + outline(shift(right, 1.6, 0)), t.shade);
    paint(dr, outline(left) + outline(right), t.base);
    paint(dr, outline(shift(front, 2, 0.4)), t.shade);
    paint(dr, outline(front), t.base);
    paint(dr, touch(-2.6, -0.6, 15, 2.4, -94), t.light, 0.85);
    return;
  }
  paint(dr, outline(left), t.base);
  side(dr, left, 1.6, 0, t.shade);
  paint(dr, outline(right), t.base);
  side(dr, right, -1.8, 0, t.shade);
  paint(dr, outline(front), t.base);
  side(dr, front, -2.2, 0.4, t.shade);
  side(dr, front, 1.8, 0.6, t.light);
  within(dr, outline(front), () => {
    paint(dr, brush([[-2.4, 8], [-3.2, -1], [-1.4, -8.4]], 1.6, rnd, { start: 0.3, end: 0.1, peak: 0.5, count: fine ? 12 : 6 }), t.light, 0.8);
    if (fine) paint(dr, streaks(rnd, [-6, -9, 6, 10], 7, 92, 7, 0.4), t.shade, 0.35);
  });
}

/** A narcissus about (0, 0), `r` from its middle to a tepal's tip: six white tepals and a gold cup with an orange rim. */
function narcissus(dr: Drawing, rnd: Rnd, r: number): void {
  let back = '';
  let front = '';
  let under = '';
  for (let i = 0; i < 6; i++) {
    const deg = -90 + i * 60 + (rnd() - 0.5) * 12;
    const a = (deg * Math.PI) / 180;
    const len = r * (0.94 + rnd() * 0.12);
    const [cx, cy] = [(Math.cos(a) * len) / 2, (Math.sin(a) * len) / 2];
    if (i % 2) back += touch(cx, cy, len, r * 0.6, deg);
    else {
      front += touch(cx, cy, len, r * 0.62, deg);
      under += touch(cx + r * 0.06, cy + r * 0.08, len * 0.94, r * 0.58, deg);
    }
  }
  paint(dr, back, NARCISSUS.back);
  paint(dr, under, NARCISSUS.shade);
  paint(dr, front, NARCISSUS.base);
  paint(dr, ellipse(0, 0, r * 0.37, r * 0.35), NARCISSUS.rim);
  paint(dr, ellipse(-r * 0.02, -r * 0.03, r * 0.27, r * 0.26), NARCISSUS.cup);
  paint(dr, ellipse(r * 0.02, r * 0.03, r * 0.08, r * 0.08), NARCISSUS.eye);
}

/** A chamomile head about (0, 0), `r` to the tips of its rays: white rays round a domed gold heart. */
function daisy(dr: Drawing, rnd: Rnd, r: number): void {
  let back = '';
  let front = '';
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * Math.PI * 2 + rnd() * 0.15;
    const len = r * (0.86 + rnd() * 0.16);
    const ray = outline(blade([Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22], [Math.cos(a) * len, Math.sin(a) * len], r * 0.27, { at: 0.6, point: 0.2, count: 6 }));
    if (Math.sin(a) < -0.2) back += ray;
    else front += ray;
  }
  paint(dr, back, '#e6e0e8');
  paint(dr, front, NARCISSUS.base);
  paint(dr, outline(roundish(0.4, 0.6, r * 0.5, r * 0.5, rnd, { count: 12 })), NARCISSUS.shade, 0.7);
  const heart = roundish(0, 0, r * 0.34, r * 0.33, rnd, { count: 12, tremor: r * 0.02 });
  paint(dr, outline(heart), '#f0b631');
  side(dr, heart, -r * 0.07, -r * 0.07, '#c4861c');
  side(dr, heart, r * 0.07, r * 0.07, '#f8d873');
  let florets = '';
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r * 0.28;
    florets += ellipse(Math.cos(a) * d, Math.sin(a) * d, r * 0.025, r * 0.025);
  }
  paint(dr, florets, '#b07614', 0.7);
}

// ───────────────────────────────────────────────────────────────────── gul

export function gul(dr: Drawing, rnd: Rnd): void {
  // the stem, bending a little under the flower, its cut end pale, a few thorns
  const stem: Pt[] = [[62, 56], [59.6, 72], [56.6, 87], [54.6, 101], [54, 114]];
  paint(dr, brush(stem, 3.2, rnd, { start: 1, end: 0.8, peak: 0.5, count: 24 }), LEAF.shade);
  paint(dr, brush(shift(stem, -0.6, 0), 1.2, rnd, { start: 0.6, end: 0.6, peak: 0.5 }), LEAF.base);
  paint(dr, ellipse(54, 114.2, 1.5, 0.6), '#b9cc98');
  for (const [x, y, dx, dy] of [[59.2, 79, 2.6, 1.6], [55.4, 95.6, -2.6, 1.8], [61.2, 64, 2.4, 1.2]] as const) {
    paint(dr, outline([[x - 0.2, y - 1.4], [x + dx, y + dy], [x - 0.1, y + 1.2]]), '#86422e');
  }
  paint(dr, brush([[59.6, 74], [50, 70.4], [40, 68.8]], 1.1, rnd, { start: 1, end: 0.7 }), LEAF.shade);
  leaf(dr, rnd, [48.4, 70.6], [44.6, 60], 8.6, LEAF, { bend: 0.08 });
  leaf(dr, rnd, [48.8, 71.4], [41.4, 80], 8.6, LEAF, { bend: -0.08 });
  leaf(dr, rnd, [40.6, 68.8], [24, 62.6], 11.6, LEAF, { bend: 0.06 });
  paint(dr, brush([[56.8, 88], [66.6, 91], [77, 89.8]], 1.1, rnd, { start: 1, end: 0.7 }), LEAF.shade);
  leaf(dr, rnd, [67.4, 90.4], [72.4, 80.4], 8.2, LEAF, { bend: -0.06 });
  leaf(dr, rnd, [68.2, 91.2], [74.6, 99.8], 8.2, LEAF, { bend: 0.06 });
  leaf(dr, rnd, [76.6, 89.8], [93.4, 85.6], 11.2, LEAF, { bend: -0.05 });

  // twine tied round the stem in a bow
  const knot: Pt = [54.6, 102];
  const loops: Pt[][] = [
    [knot, [49.2, 98], [44.8, 98.4], [45.6, 102.2], [50.2, 103], knot],
    [knot, [60, 97.8], [64.6, 98.6], [63.8, 102.4], [59, 103.2], knot],
  ];
  const tails: Pt[][] = [
    [knot, [51.8, 107], [48.6, 112.6]],
    [knot, [57.4, 107.6], [59.6, 113.2]],
  ];
  for (const t of tails) paint(dr, brush(t, 1.5, rnd, { start: 0.9, end: 0.5 }), TWINE.shade);
  for (const l of loops) {
    paint(dr, brush(shift(l, 0.4, 0.5), 1.6, rnd, { start: 0.8, end: 0.8, peak: 0.5, count: 16 }), TWINE.shade);
    paint(dr, brush(l, 1.3, rnd, { start: 0.8, end: 0.8, peak: 0.5, count: 16 }), TWINE.base);
  }
  paint(dr, brush([[51.8, 100.6], [54.6, 101.2], [57.4, 100.6]], 1.2, rnd), TWINE.base);
  paint(dr, brush([[52, 103.6], [54.6, 104], [57.2, 103.4]], 1.1, rnd), TWINE.base);
  paint(dr, ellipse(knot[0], knot[1], 1.5, 1.3), TWINE.light);

  // the bloom, nodding a little toward the light
  placed(dr, 62, 33, -8, 1.08, () => rose(dr, rnd));
}

// ─────────────────────────────────────────────────────────────────── beybûn

/** Chamomile's leaf: a stalk with fine threads off it either side, as feathery as the plant's. */
function feather(dr: Drawing, rnd: Rnd, pts: Pt[], len: number): void {
  const line = pts;
  let d = brush(line, 0.8, rnd, { start: 1, end: 0.3, count: 8 });
  for (let i = 1; i < 7; i++) {
    const t = i / 7;
    const p = lerp(line[0]!, line[line.length - 1]!, t);
    const [dx, dy] = [line[line.length - 1]![0] - line[0]![0], line[line.length - 1]![1] - line[0]![1]];
    const l = Math.hypot(dx, dy);
    for (const s of [-1, 1]) {
      const k = len * (1 - t * 0.6);
      d += brush([p, [p[0] + (dx / l) * k * 0.5 - (dy / l) * k * s, p[1] + (dy / l) * k * 0.5 + (dx / l) * k * s]], 0.55, rnd, { start: 1, end: 0.2, count: 4 });
    }
  }
  paint(dr, d, '#6f9150');
}

export function beybun(dr: Drawing, rnd: Rnd): void {
  // a sprig picked by hand: three heads at their different turns and a bud, on thin stems with feathery leaves
  stem(dr, rnd, [[50, 113], [53, 84], [60, 50]], 1.8);
  stem(dr, rnd, [[49, 113], [44, 88], [36, 60]], 1.7);
  stem(dr, rnd, [[51, 113], [63, 94], [83, 66]], 1.7);
  stem(dr, rnd, [[55, 76], [64, 52], [73, 32]], 1.3);
  feather(dr, rnd, [[52, 92], [40, 80], [30, 76]], 4.4);
  feather(dr, rnd, [[57, 98], [72, 96], [84, 88]], 4);
  feather(dr, rnd, [[54, 70], [44, 62], [42, 52]], 3.4);
  paint(dr, ellipse(50, 113.4, 2.6, 0.8), '#b9cc98');
  placed(dr, 72.6, 30, 0, 1, () => {
    paint(dr, outline(roundish(0, 0, 4.2, 3.8, rnd, { count: 10 })), '#f0b631');
    side(dr, roundish(0, 0, 4.2, 3.8, rnd, { count: 10 }), -0.8, -0.8, '#c4861c');
    paint(dr, outline(tremble(blade([-3, 2], [-4.6, 5.6], 2, { point: 0.4 }), rnd, 0.1)) + outline(tremble(blade([3, 2.2], [4.4, 5.8], 2, { point: 0.4 }), rnd, 0.1)), NARCISSUS.base);
  });
  placed(dr, 36, 56, -24, 1, () => daisy(dr, rnd, 13), 0.58);
  placed(dr, 84, 63, 30, 1, () => daisy(dr, rnd, 12), 0.45);
  placed(dr, 60.6, 42, -6, 1, () => daisy(dr, rnd, 16.4), 0.92);
}

// ───────────────────────────────────────────────────────────────────── lale

export function lale(dr: Drawing, rnd: Rnd): void {
  // a red tulip of the mountains, growing from a mound of earth among stones
  const mound = roundish(60, 104, 33, 7.4, rnd, { wobble: 0.05, tremor: 0.5 });
  paint(dr, outline(mound), '#b88c5c');
  side(dr, mound, 0, -1.6, '#8e6a42');
  side(dr, mound, 0.8, 1.6, '#d1aa78');
  for (const [x, y, r] of [[40, 104, 3.4], [76, 106, 2.6], [83, 102.6, 1.8]] as const) {
    const stone = roundish(x, y, r, r * 0.7, rnd, { count: 10, tremor: 0.2 });
    paint(dr, outline(stone), '#cfc6b6');
    side(dr, stone, -0.6, -0.6, '#a39a8a');
  }
  const blueLeaf = (base: Pt, tip: Pt, width: number, bend: number): void => {
    const pts = tremble(blade(base, tip, width, { at: 0.32, bend, point: 0.9, count: 14 }), rnd, 0.25);
    paint(dr, outline(pts), BLUE_LEAF.base);
    side(dr, pts, bend > 0 ? -1.6 : 1.6, 0, BLUE_LEAF.shade);
    within(dr, outline(pts), () => paint(dr, brush([base, lerp(base, tip, 0.5), tip], width * 0.2, rnd, { start: 0.6, end: 0.05 }), BLUE_LEAF.light, 0.8));
  };
  blueLeaf([57, 104], [24, 58], 16, 0.14);
  blueLeaf([63, 104], [92, 64], 13.4, -0.16);
  stem(dr, rnd, [[60, 104], [58.6, 80], [60.6, 52]], 3.2, BLUE_LEAF);
  blueLeaf([60, 104], [72, 82], 8, -0.1);
  placed(dr, 61, 35.4, 4, 1.62, () => tulip(dr, rnd, TULIP_RED));
  let grass = '';
  for (const [x, y] of [[30, 103], [90, 103], [50, 108]] as const) {
    for (const a of [-0.5, -0.1, 0.35]) grass += brush([[x, y], [x + Math.sin(a) * 2.4, y - 2.8], [x + Math.sin(a) * 4.2, y - 5]], 0.9, rnd, { start: 1, end: 0.05, count: 5 });
  }
  paint(dr, grass, '#7d9a52');
}

// ─────────────────────────────────────────────────────────────────── nêrgiz

export function nergiz(dr: Drawing, rnd: Rnd): void {
  // a bunch of Newroz narcissus, their flat leaves among them, tied with a red ribbon
  const strap = (base: Pt, tip: Pt, width: number, bend: number): void => {
    const pts = tremble(blade(base, tip, width, { at: 0.3, bend, point: 0.6, count: 12 }), rnd, 0.2);
    paint(dr, outline(pts), BLUE_LEAF.base);
    side(dr, pts, bend > 0 ? -1 : 1, 0, BLUE_LEAF.shade);
  };
  strap([55, 112], [30, 52], 5.4, 0.1);
  strap([58, 112], [96, 58], 5, -0.12);
  stem(dr, rnd, [[56, 112], [48, 74], [42, 40]], 2.4, BLUE_LEAF);
  stem(dr, rnd, [[57.4, 112], [62, 70], [66, 30]], 2.4, BLUE_LEAF);
  stem(dr, rnd, [[59, 112], [72, 80], [82, 50]], 2.4, BLUE_LEAF);
  strap([57, 112], [50, 44], 4.6, 0.04);
  // each stem's papery sheath, and its flowers on short stalks
  const cluster = (cx: number, cy: number, heads: ReadonlyArray<readonly [number, number, number, number, number]>): void => {
    paint(dr, outline(tremble(blade([cx, cy + 6], [cx + 2.4, cy - 3], 2.6, { point: 0.8 }), rnd, 0.1)), '#d9c9a0');
    for (const [dx, dy, deg, r, squash] of heads) {
      paint(dr, brush([[cx, cy + 2], [cx + dx * 0.5, cy + dy * 0.6], [cx + dx, cy + dy]], 0.8, rnd, { start: 1, end: 1, peak: 0.5, count: 4 }), BLUE_LEAF.shade);
      placed(dr, cx + dx, cy + dy, deg, 1, () => narcissus(dr, rnd, r), squash);
    }
  };
  cluster(42, 40, [[-8, -6, -30, 7.4, 0.7], [3, -12, 10, 7.6, 0.85], [-12, 6, -60, 6.6, 0.6]]);
  cluster(66, 30, [[-2, -10, 0, 8.4, 0.95], [9, -2, 40, 7.4, 0.7]]);
  cluster(82, 50, [[6, -8, 30, 7.8, 0.85], [12, 4, 70, 6.8, 0.55], [-2, -14, -10, 6.6, 0.75]]);
  // the ribbon, wound round twice and tied
  const RIBBON: Tone = { base: '#c8342f', light: '#e66450', shade: '#8a1e1c' };
  paint(dr, brush([[51.6, 94], [57.6, 95.6], [64, 94]], 3, rnd, { start: 0.9, end: 0.9, peak: 0.5 }), RIBBON.base);
  paint(dr, brush([[51.8, 98], [57.8, 99.4], [64.2, 97.8]], 2.6, rnd, { start: 0.9, end: 0.9, peak: 0.5 }), RIBBON.shade);
  for (const [tip, w] of [[[46, 106], 3], [[66, 108], 2.8]] as Array<[Pt, number]>) paint(dr, outline(tremble(blade([58, 96], tip, w, { at: 0.2, point: 0 }), rnd, 0.15)), RIBBON.shade);
  for (const tip of [[47.4, 90], [68.8, 90.4]] as Pt[]) {
    const loop = tremble(blade([58, 96], tip, 6.4, { at: 0.7, point: 0, count: 10 }), rnd, 0.15);
    paint(dr, outline(loop), RIBBON.base);
    side(dr, loop, 0, -1.2, RIBBON.shade);
    within(dr, outline(loop), () => paint(dr, brush([lerp([58, 96], tip, 0.3), lerp([58, 96], tip, 0.9)], 1.2, rnd), RIBBON.light, 0.8));
  }
  paint(dr, outline(roundish(58, 96, 2.4, 2, rnd, { count: 10 })), RIBBON.light);
}

// ──────────────────────────────────────────────────────────────────── sosin

const STANDARD: Tone = { base: '#8a6cc6', light: '#b49ce2', shade: '#5e4494' };
const FALL: Tone = { base: '#5b3c98', light: '#7e5fbe', shade: '#3a2368' };

export function sosin(dr: Drawing, rnd: Rnd): void {
  // the iris's swords of leaves, its stem and a bud
  const sword = (base: Pt, tip: Pt, width: number, bend: number): void => {
    const pts = tremble(blade(base, tip, width, { at: 0.25, bend, point: 1, count: 12 }), rnd, 0.2);
    paint(dr, outline(pts), BLUE_LEAF.base);
    side(dr, pts, bend > 0 ? -1.2 : 1.2, 0, BLUE_LEAF.shade);
    within(dr, outline(pts), () => paint(dr, brush([base, lerp(base, tip, 0.6), tip], 0.6, rnd, { start: 0.8, end: 0.05 }), BLUE_LEAF.light));
  };
  sword([54, 114], [30, 56], 8.6, 0.06);
  sword([66, 114], [94, 62], 8, -0.06);
  stem(dr, rnd, [[60, 114], [59.4, 90], [60, 62]], 3.2, BLUE_LEAF);
  sword([58, 114], [44, 70], 6.4, 0.04);
  stem(dr, rnd, [[59.6, 88], [70, 76], [76, 66]], 2, BLUE_LEAF);
  const bud = tremble(blade([76, 70], [79, 50], 6.4, { at: 0.55, point: 0.8 }), rnd, 0.2);
  paint(dr, outline(bud), FALL.base);
  side(dr, bud, -1.2, 0, FALL.shade);
  paint(dr, outline(tremble(blade([75, 72], [72, 60], 3.6, { point: 1, bend: 0.1 }), rnd, 0.1)), BLUE_LEAF.base);
  // the falls hanging out and down, veined white at the throat with a gold beard down each
  const petal = (b: Pt, tip: Pt, w: number, bend: number, tone: Tone, at = 0.62): Pt[] => {
    const pts = tremble(blade(b, tip, w, { at, bend, point: 0.25, count: 14 }), rnd, 0.3);
    paint(dr, outline(pts), tone.base);
    return pts;
  };
  const fall = (b: Pt, tip: Pt, w: number, bend: number): void => {
    const pts = petal(b, tip, w, bend, FALL);
    side(dr, pts, 0, -2, FALL.shade);
    within(dr, outline(pts), () => {
      paint(dr, brush([lerp(b, tip, 0.15), lerp(b, tip, 0.55), lerp(b, tip, 0.95)], w * 0.3, rnd, { start: 0.3, end: 0.1 }), FALL.light, 0.8);
      let veins = '';
      const [dx, dy] = [tip[0] - b[0], tip[1] - b[1]];
      const l = Math.hypot(dx, dy);
      for (const s of [-0.5, -0.25, 0.25, 0.5]) {
        const p = lerp(b, tip, 0.08);
        veins += brush([p, [p[0] + dx * 0.32 - (dy / l) * w * s, p[1] + dy * 0.32 + (dx / l) * w * s]], 0.5, rnd, { start: 1, end: 0.1, count: 4 });
      }
      paint(dr, veins, '#f4eefa', 0.85);
      paint(dr, brush([lerp(b, tip, 0.05), lerp(b, tip, 0.25), lerp(b, tip, 0.42)], 2.4, rnd, { start: 0.8, end: 0.2 }), '#f2b53c');
      paint(dr, brush([lerp(b, tip, 0.1), lerp(b, tip, 0.3)], 0.8, rnd), '#e07d24');
    });
  };
  fall([55, 47], [27, 66], 21, -0.12);
  fall([65, 47], [93, 66], 21, 0.12);
  // the standards standing up and closing over the heart
  for (const [b, tip, w, bend] of [[[58, 44], [44, 18], 15, 0.12], [[62, 44], [76, 18], 15, -0.12]] as Array<[Pt, Pt, number, number]>) {
    const pts = petal(b, tip, w, bend, STANDARD);
    side(dr, pts, bend > 0 ? 1.6 : -1.6, 1, STANDARD.shade);
  }
  const top = petal([60, 46], [60.6, 12], 18, 0, STANDARD, 0.58);
  side(dr, top, -1.8, 0, STANDARD.shade);
  side(dr, top, 1.6, 1, STANDARD.light);
  within(dr, outline(top), () => paint(dr, streaks(rnd, [52, 14, 68, 44], 8, 90, 9, 0.5), STANDARD.shade, 0.4));
  fall([60, 50], [61, 80], 22, 0);
}

// ─────────────────────────────────────────────────────────────── desteya gulan

const KRAFT: Tone = { base: '#c59a64', light: '#e0bb85', shade: '#98703f' };
const TISSUE: Tone = { base: '#efd7cc', light: '#fbefe9', shade: '#d4b3a5' };
const RIBBON: Tone = { base: '#a3243a', light: '#d0485c', shade: '#6c1424' };
const EUCALYPTUS: Tone = { base: '#87a28b', light: '#b1c8b0', shade: '#5f7a66' };

/** A sprig of eucalyptus: a bending stem with round leaves along it, smaller toward its tip. */
function eucalyptus(dr: Drawing, rnd: Rnd, pts: Pt[], size: number): void {
  paint(dr, brush(pts, 0.9, rnd, { start: 1, end: 0.4, count: 10 }), EUCALYPTUS.shade);
  const line = pts;
  let leaves = '';
  let lit = '';
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    const p = lerp(line[0]!, line[line.length - 1]!, t);
    const r = size * (1.1 - t * 0.5);
    const s = i % 2 ? 1 : -1;
    const [dx, dy] = [line[line.length - 1]![0] - line[0]![0], line[line.length - 1]![1] - line[0]![1]];
    const l = Math.hypot(dx, dy);
    const c: Pt = [p[0] - (dy / l) * r * s * 0.9, p[1] + (dx / l) * r * s * 0.9];
    leaves += outline(roundish(c[0], c[1], r, r * 0.9, rnd, { count: 7, tremor: r * 0.08 }));
    lit += touch(c[0] - r * 0.25, c[1] - r * 0.3, r * 1.1, r * 0.3, -40);
  }
  paint(dr, leaves, EUCALYPTUS.base);
  paint(dr, lit, EUCALYPTUS.light, 0.85);
}

export function desteGul(dr: Drawing, rnd: Rnd): void {
  const W: Pt = [60, 90];
  dr.add('<g transform="rotate(-5 60 64)">');
  // the tissue behind the flowers, folded into points: each fold a facet, light and shade by turns
  const fan: Pt[] = [[24, 70], [10, 44], [16, 30], [26, 34], [30, 16], [44, 20], [54, 5], [66, 15], [80, 6], [88, 22], [102, 18], [106, 34], [112, 46], [96, 70]];
  for (let i = 0; i < fan.length - 1; i++) {
    const facet = tremble([W, fan[i]!, fan[i + 1]!], rnd, 0.3);
    paint(dr, polygon(facet), [TISSUE.base, TISSUE.light, TISSUE.shade][i % 3]!);
  }
  // greenery out at the edges, narcissus in the gaps round the back
  eucalyptus(dr, rnd, [[40, 64], [22, 50], [5, 40]], 3);
  eucalyptus(dr, rnd, [[80, 62], [98, 50], [115, 41]], 3);
  eucalyptus(dr, rnd, [[52, 52], [42, 28], [36, 6]], 2.6);
  for (const [x, y, deg, r, squash] of [[22, 34, -30, 6.2, 0.82], [33, 20, -5, 5.8, 0.92], [16, 50, -60, 5.4, 0.66], [62, 10, 4, 5.6, 0.9], [92, 20, 25, 6.2, 0.86], [102, 34, 50, 5.6, 0.7], [86, 34, 15, 5, 0.9], [24, 46, -40, 5.6, 0.78]] as const) {
    placed(dr, x, y, deg, 1, () => narcissus(dr, rnd, r), squash);
  }
  // pink tulips rising between them
  for (const [x, y, deg, s] of [[45, 25, -14, 0.84], [75, 23, 12, 0.86], [104, 50, 46, 0.7]] as const) {
    placed(dr, x, y, deg, s, () => tulip(dr, rnd, TULIP_PINK, false));
  }
  // dark rose leaves showing between the blooms
  let leaves = '';
  let ribs = '';
  for (const [b0, tip, w] of [[[30, 60], [12, 66], 7], [[90, 59], [109, 64], 7], [[50, 40], [40, 30], 6], [[70, 39], [82, 31], 6], [[62, 58], [70, 68], 6]] as Array<[Pt, Pt, number]>) {
    leaves += outline(tremble(blade(b0, tip, w, { at: 0.42, point: 0.85, teeth: 0.07, count: 8 }), rnd, 0.15));
    ribs += touch((b0[0] + tip[0]) / 2, (b0[1] + tip[1]) / 2, Math.hypot(tip[0] - b0[0], tip[1] - b0[1]) * 0.9, 0.5, (Math.atan2(tip[1] - b0[1], tip[0] - b0[0]) * 180) / Math.PI);
  }
  paint(dr, leaves, LEAF.base);
  paint(dr, ribs, LEAF.light);
  // the roses: two smaller and turned, lower down, and the fullest in front of them
  placed(dr, 36, 54, -24, 0.52, () => rose(dr, rnd, { flare: 0, sepals: false, plain: true, fine: false }), 0.58);
  placed(dr, 85, 54, 20, 0.5, () => rose(dr, rnd, { flare: 0, sepals: false, plain: true, fine: false }), 0.56);
  placed(dr, 60.4, 43, -3, 0.62, () => rose(dr, rnd, { flare: 2, sepals: false, fine: false }));
  // the kraft paper wrapped round the front, two panels crossing, each with its top edge turned over
  const panel = (pts: Pt[], edge: Pt[], tone: Tone): void => {
    const p = tremble(pts, rnd, 0.3);
    paint(dr, polygon(p), tone.base);
    within(dr, polygon(p), () => {
      paint(dr, streaks(rnd, [10, 54, 110, 112], 8, 70, 10, 0.6), tone.shade, 0.3);
      paint(dr, polygon(tremble(edge, rnd, 0.2)), tone.light);
    });
  };
  panel([[8, 54], [30, 60], [56, 66], [66, 92], [54, 92]], [[8, 54], [30, 60], [56, 66], [55, 70], [29, 64], [9.6, 58.6]], KRAFT);
  panel([[112, 54], [88, 61], [62, 69], [54, 92], [67, 92]], [[112, 54], [88, 61], [62, 69], [63, 73], [88.6, 65], [110, 58.6]], { base: KRAFT.shade, light: KRAFT.base, shade: '#7a5630' });
  // below the tie the paper gathered, the stems' cut ends showing under it
  let ends = '';
  for (const x of [54.6, 57.6, 61, 64.2]) ends += brush([[x, 100], [x + (x - 60) * 0.12, 109], [x + (x - 60) * 0.2, 114]], 1.7, rnd, { start: 1, end: 1, peak: 0.5, count: 6 });
  paint(dr, ends, LEAF.shade);
  paint(dr, ellipse(54.4, 114.2, 1, 0.45) + ellipse(57.4, 114.6, 1, 0.45) + ellipse(61.6, 114.6, 1, 0.45) + ellipse(65.4, 114.2, 1, 0.45), '#b9cc98');
  const skirt = tremble([[53.4, 90], [66.6, 90], [72, 104], [66, 102.6], [61, 105.4], [56, 102.4], [48.4, 104.4]], rnd, 0.25);
  paint(dr, polygon(skirt), KRAFT.base);
  within(dr, polygon(skirt), () => paint(dr, polygon([[60, 90], [66.6, 90], [72, 104], [61, 105.4]]), KRAFT.shade));
  // a red ribbon round the waist, tied in a bow with forked tails
  for (const [tip, w] of [[[47, 110], 4.4], [[73.6, 109], 4.2]] as Array<[Pt, number]>) {
    const tail = tremble(blade(W, tip, w, { at: 0.15, point: 0 }), rnd, 0.15);
    paint(dr, outline(tail), RIBBON.shade);
    paint(dr, polygon([tip, [tip[0] + (tip[0] < 60 ? 2.6 : -2.6), tip[1] - 3], [tip[0] + (tip[0] < 60 ? -1 : 1), tip[1] + 2]]), '#fbf3ef');
  }
  paint(dr, polygon(tremble([[52, 87.6], [68, 87.6], [68.6, 92.4], [51.4, 92.4]], rnd, 0.2)), RIBBON.base);
  for (const tip of [[43, 82], [77.6, 81]] as Pt[]) {
    const loop = tremble(blade(W, tip, 9.6, { at: 0.72, point: 0, count: 10 }), rnd, 0.2);
    paint(dr, outline(loop), RIBBON.base);
    side(dr, loop, 0, -1.6, RIBBON.shade);
    within(dr, outline(loop), () => paint(dr, brush([lerp(W, tip, 0.35), lerp(W, tip, 0.92)], 1.6, rnd), RIBBON.light, 0.85));
  }
  paint(dr, outline(roundish(W[0], W[1], 3.2, 2.8, rnd, { count: 10 })), RIBBON.base);
  paint(dr, touch(W[0] - 0.8, W[1] - 0.8, 3, 0.8, -20), RIBBON.light);
  // a kraft tag on a string, a few lines written on it
  paint(dr, brush([[61, 91.4], [70, 96], [76.4, 99.6]], 0.45, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }), '#5a4632');
  const tag = tremble([[75.4, 97.4], [84.6, 101.4], [81.4, 108.8], [72.2, 104.8], [72.4, 100.2]], rnd, 0.15);
  paint(dr, polygon(shift(tag, 0.6, 0.8)), KRAFT.shade);
  paint(dr, polygon(tag), KRAFT.light);
  paint(dr, ellipse(75.2, 99.6, 0.6, 0.6), '#5a4632');
  paint(dr, brush([[75, 102.4], [77, 101.8], [79, 103.4], [81.4, 103.6]], 0.4, rnd, { start: 1, end: 0.6, count: 6 }) + brush([[74.2, 104.6], [76.4, 104.4], [78.4, 105.8]], 0.4, rnd, { start: 1, end: 0.6, count: 6 }), '#6e4a2a');
  dr.add('</g>');
}
