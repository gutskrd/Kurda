/**
 * The gifts from the old stories (gift-art.ts): Kawa's hammer, from the Newroz legend of the smith who rose against the
 * tyrant, forged in Damascus steel; and Şahmaran, queen of the serpents, the owner's old folk painting of her traced
 * (gift-art-sahmaran.ts) and gone over by hand, its years only a light patina at its edges, in its worn wooden frame.
 */
import { n2, type Drawing, type Pt } from './svg.js';
import { SAHMARAN_DABS, SAHMARAN_EDGES, SAHMARAN_FACE_GROUND, SAHMARAN_INKS, SAHMARAN_PATHS, type SahmaranInk } from './gift-art-sahmaran.js';
import { along, brush, ellipse, floor, FLOOR, lerp, outline, paint, polygon, roundish, runs, streaks, touch, tremble, within, type Rnd, type Tone } from './gift-paint.js';

// ────────────────────────────────────────────────────────────────────── kawa

/** Blued Damascus steel: the dark of the steel, its folded silver, and the light along an edge. */
const BLUED = { deep: '#0c0f15', dark: '#161b25', base: '#1f2632', top: '#2c3442', silver: '#e3e9f0', dim: '#7d8798', edge: '#f7f9fc' };
const EMBER = ['#b8321e', '#ec7a2c', '#f7b63a', '#fff0c0'];
const FIRELIGHT = '#ef8a44';

/**
 * The folds of one bar of Damascus steel: a field whose level lines are its silver, shared by every face cut from the
 * bar so the lines run on unbroken over its edges. `u` runs along the bar and `s` round its girth, both 0 to 1; the
 * lines run lengthwise, meander, and here and there are pinched into the loops of a ladder.
 */
function folds(rnd: Rnd, count: number): (u: number, s: number) => number {
  const [ph1, ph2, ph3] = [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3];
  const rungs = Array.from({ length: 6 }, (_, k) => [(k + 0.3 + rnd() * 0.4) / 6, rnd() * 6.3, 0.7 + rnd() * 0.5] as const);
  return (u, s) => {
    let d = 1.1 * Math.sin(Math.PI * 2 * (1.3 * u + ph1 + 0.7 * s)) + 0.55 * Math.sin(Math.PI * 2 * (3.1 * u + 1.4 * s + ph2)) +
      0.3 * Math.sin(Math.PI * 2 * (7 * u + ph3));
    for (const [uk, psi, amp] of rungs) d += amp * 1.1 * Math.exp(-(((u - uk) / 0.035) ** 2)) * Math.sin(Math.PI * 2 * (s * count * 0.5 + psi));
    return s * count + d;
  };
}

/**
 * The Damascus over one four-sided face (corners p00, p10, p11, p01 going round, `u` from the first to the second):
 * bands of bright silver between pairs of the field's level lines, a hair of grey in each dark gap. The face lies
 * from `s0` to `s1` round the bar, which is what lets its lines meet its neighbours'.
 */
function damascus(dr: Drawing, rnd: Rnd, f: (u: number, s: number) => number, count: number, face: readonly [Pt, Pt, Pt, Pt], s0: number, s1: number,
  { bright = BLUED.silver, dim = BLUED.dim, band = 0.32, opacity = 1, samples = 18 } = {}): void {
  const [p00, p10, p11, p01] = face;
  const at = (u: number, v: number): Pt => [
    (1 - u) * (1 - v) * p00[0] + u * (1 - v) * p10[0] + u * v * p11[0] + (1 - u) * v * p01[0],
    (1 - u) * (1 - v) * p00[1] + u * (1 - v) * p10[1] + u * v * p11[1] + (1 - u) * v * p01[1],
  ];
  // where the field takes the value `c` along the face: at each step along it, a few rounds of solving for the girth
  const level = (c: number): Pt[] => {
    const pts: Pt[] = [];
    for (let k = 0; k <= samples; k++) {
      const u = -0.02 + (k / samples) * 1.04;
      let s = c / count;
      for (let it = 0; it < 6; it++) s -= (f(u, s) - c) / count;
      pts.push(at(u, (s - s0) / (s1 - s0)));
    }
    return pts;
  };
  const [lo, hi] = [Math.min(s0, s1), Math.max(s0, s1)];
  let lit = '';
  let hair = '';
  for (let c = Math.floor(lo * count) - 3; c <= Math.ceil(hi * count) + 3; c++) {
    const a = level(c);
    const b = level(c + band * (0.75 + rnd() * 0.5));
    lit += outline([...a, ...b.reverse()]);
    if (rnd() < 0.45) hair += brush(level(c + 0.66), 0.2, rnd, { start: 0.6, end: 0.6, peak: 0.5, count: samples + 2 });
  }
  within(dr, polygon(face), () => {
    paint(dr, hair, dim, opacity * 0.8);
    paint(dr, lit, bright, opacity);
  });
}

export function kawa(dr: Drawing, rnd: Rnd): void {
  // the ground seen from low down, and the hammer's long shadow thrown across it away from the light
  floor(dr, rnd, 60, 102.4, 54, 3.2);
  paint(dr, outline(tremble([[22, 101.6], [52, 97.6], [80, 95.2], [104, 96.4], [112, 99.6], [96, 103.2], [60, 104], [26, 103.6]], rnd, 0.4)), FLOOR, 0.3);
  // the stone the head rests on: a dark, rough block of basalt, lit warm on its side by the embers at its foot
  const front = tremble([[73, 72.4], [92, 71.6], [93.4, 86], [92.6, 101.4], [73.6, 101.8], [72.2, 88]], rnd, 0.3);
  const flank = tremble([[92, 71.6], [99.6, 68.4], [101, 84], [100.4, 99], [92.6, 101.4], [93.4, 86]], rnd, 0.3);
  const top = tremble([[73, 72.4], [80.6, 69], [99.6, 68.4], [92, 71.6]], rnd, 0.2);
  paint(dr, polygon(front), '#3a3531');
  paint(dr, polygon(flank), '#272320');
  paint(dr, polygon(top), '#5a534c');
  within(dr, polygon(flank), () => paint(dr, polygon([[96, 78], [102, 74], [102, 100], [96.6, 101]]), FIRELIGHT, 0.24));
  within(dr, polygon(front), () => {
    paint(dr, streaks(rnd, [73, 74, 93, 101], 10, 4, 7, 0.5), '#4c4640', 0.75);
    paint(dr, polygon([[72, 86.6], [94, 85.4], [94, 87], [72, 88.4]]), '#2a2623', 0.7);
  });
  paint(dr, brush([[76, 101], [77.6, 94], [76.6, 88]], 0.5, rnd, { count: 4 }) + brush([[86, 72], [87.4, 78], [86.4, 85.4]], 0.4, rnd, { count: 4 }), '#1a1714', 0.8);
  paint(dr, brush([[73.4, 72.6], [82, 72.2], [91.6, 71.8]], 0.6, rnd, { start: 0.4, end: 0.6, peak: 0.6, count: 8 }) +
    brush([[92.4, 72], [92.9, 84], [92.6, 98]], 0.4, rnd, { count: 8 }), '#8a8076', 0.9);

  // the hammer, drawn square to its own head and laid on the diagonal: its head on the stone, the pommel on the ground
  dr.add('<g transform="translate(69 41) rotate(44) scale(0.98)">');
  // the head: a block whose long edges are chamfered, so its ends are octagons; `D` is how its depth falls
  const D: Pt = [5.6, -5.6];
  const C = 3.8;
  const cf = 0.18;
  const HX = 26;
  const HY = 16;
  const P = (x: number, y: number, z: number): Pt => [x + z * D[0], y + z * D[1]];
  const COUNT = 34;
  const steel = folds(rnd, COUNT);
  // the handle, turned, out of the head's foot: ring grooves along it and a rounded pommel at its end
  const hx = D[0] / 2;
  const h0 = HY + D[1] / 2;
  const LEN = 64;
  const R = 4.6;
  const pommel = roundish(hx, h0 + LEN + 1.8, R + 1.3, 3.9, rnd, { count: 18, wobble: 0.01, tremor: 0.1 });
  paint(dr, outline(pommel), BLUED.base);
  const shaft: Pt[] = [[hx - R, h0], [hx + R, h0], [hx + R, h0 + LEN], [hx - R, h0 + LEN]];
  paint(dr, polygon(shaft), BLUED.base);
  // its silver runs its length and turns with it, crowding toward its edges as a round thing's does
  within(dr, polygon(shaft), () => {
    let lit = '';
    let soft = '';
    for (let i = 0; i < 17; i++) {
      const left: Pt[] = [];
      const right: Pt[] = [];
      for (let k = 0; k <= 14; k++) {
        const y = h0 + (k / 14) * LEN;
        const twist = 0.22 * Math.sin(y * 0.11 + i * 0.6) + 0.1 * Math.sin(y * 0.33 + i);
        const t0 = -Math.PI / 2 + (i / 17) * Math.PI + twist;
        const t1 = t0 + (Math.PI / 17) * (0.42 + 0.12 * Math.sin(y * 0.2 + i));
        left.push([hx + R * Math.sin(Math.max(-1.55, Math.min(1.55, t0))), y]);
        right.push([hx + R * Math.sin(Math.max(-1.55, Math.min(1.55, t1))), y]);
      }
      const ribbon = outline([...left, ...right.reverse()]);
      if (i % 4 === 3) soft += ribbon;
      else lit += ribbon;
    }
    paint(dr, soft, BLUED.dim);
    paint(dr, lit, BLUED.silver, 0.92);
    // the round of it: shade along its far side, the forge's warmth along its lower edge, a hard light down its near side
    paint(dr, polygon([[hx + R * 0.42, h0], [hx + R, h0], [hx + R, h0 + LEN], [hx + R * 0.42, h0 + LEN]]), BLUED.deep, 0.62);
    paint(dr, polygon([[hx + R * 0.72, h0], [hx + R, h0], [hx + R, h0 + LEN], [hx + R * 0.72, h0 + LEN]]), FIRELIGHT, 0.35);
    paint(dr, brush([[hx - R * 0.55, h0 + 2], [hx - R * 0.58, h0 + LEN * 0.5], [hx - R * 0.55, h0 +
      LEN - 2]], 0.9, rnd, { start: 0.2, end: 0.3, peak: 0.35, count: 14 }), BLUED.edge, 0.85);
  });
  let grooves = '';
  let lips = '';
  for (let k = 1; k <= 8; k++) {
    const y = h0 + 3 + k * 7;
    grooves += brush([[hx - R - 0.1, y], [hx, y + 0.8], [hx + R + 0.1, y]], 1.2, rnd, { start: 1, end: 1, peak: 0.5, count: 6 });
    lips += brush([[hx - R + 0.4, y + 1.3], [hx - R * 0.3, y + 1.9], [hx + R * 0.3, y + 1.9]], 0.5, rnd, { start: 0.5, end: 0.1, peak: 0.3, count: 6 });
  }
  paint(dr, grooves, BLUED.deep);
  paint(dr, lips, BLUED.edge, 0.85);
  within(dr, outline(pommel), () => {
    damascus(dr, rnd, steel, COUNT, [[hx - R - 1.4, h0 + LEN - 2], [hx + R + 1.4, h0 + LEN - 2], [hx + R + 1.4, h0 + LEN + 6], [hx - R - 1.4, h0 + LEN +
      6]], 0.1, 0.3, { samples: 8, bright: '#8f99a9' });
    paint(dr, touch(hx - 2, h0 + LEN + 0.8, 4.4, 1.3, 0), BLUED.edge, 0.85);
    paint(dr, touch(hx + 3, h0 + LEN + 3.6, 4, 1.2, 30), FIRELIGHT, 0.5);
  });
  paint(dr, brush([[hx - R - 1, h0 + LEN - 0.6], [hx, h0 + LEN + 0.4], [hx + R + 1, h0 + LEN - 0.6]], 1, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }), BLUED.deep);

  // the head's faces, back to front, each with its stretch of the bar's girth so the folds wrap round from face to face
  const backChamfer: [Pt, Pt, Pt, Pt] = [P(-HX, -HY, 1 - cf), P(HX, -HY, 1 - cf), P(HX, -HY + C, 1), P(-HX, -HY + C, 1)];
  const topFace: [Pt, Pt, Pt, Pt] = [P(-HX, -HY, cf), P(HX, -HY, cf), P(HX, -HY, 1 - cf), P(-HX, -HY, 1 - cf)];
  const upper: [Pt, Pt, Pt, Pt] = [P(-HX, -HY + C, 0), P(HX, -HY + C, 0), P(HX, -HY, cf), P(-HX, -HY, cf)];
  const lower: [Pt, Pt, Pt, Pt] = [P(-HX, HY - C, 0), P(HX, HY - C, 0), P(HX, HY, cf), P(-HX, HY, cf)];
  const end = [P(HX, -HY + C, 0), P(HX, -HY, cf), P(HX, -HY, 1 - cf), P(HX, -HY + C, 1), P(HX, HY - C, 1), P(HX, HY, 1 - cf), P(HX, HY, cf), P(HX, HY - C, 0)];
  const face: [Pt, Pt, Pt, Pt] = [P(-HX, -HY + C, 0), P(HX, -HY + C, 0), P(HX, HY - C, 0), P(-HX, HY - C, 0)];
  paint(dr, polygon(backChamfer), BLUED.top);
  damascus(dr, rnd, steel, COUNT, [backChamfer[0], backChamfer[1], backChamfer[2], backChamfer[3]], 0.02, -0.06, { opacity: 0.55, samples: 12 });
  paint(dr, polygon(topFace), BLUED.top);
  damascus(dr, rnd, steel, COUNT, [topFace[3], topFace[2], topFace[1], topFace[0]], 0.02, 0.22);
  paint(dr, polygon(end), BLUED.deep);
  damascus(dr, rnd, steel, COUNT, [end[1]!, end[6]!, end[5]!, end[2]!], 0.5, 0.2, { bright: '#b9c2cf', dim: '#4a5362', samples: 8 });
  within(dr, polygon(end), () => paint(dr, polygon(end), FIRELIGHT, 0.1));
  paint(dr, polygon(lower), BLUED.dark);
  damascus(dr, rnd, steel, COUNT, [lower[0], lower[1], lower[2], lower[3]], 0.9, 0.98, { bright: '#aeb7c5', dim: '#3c4452' });
  within(dr, polygon(lower), () => paint(dr, polygon(lower), FIRELIGHT, 0.2));
  const glowLine = [P(-HX + 0.4, HY - 0.3, cf * 0.9), P(0, HY - 0.2, cf * 0.9), P(HX - 0.4, HY - 0.3, cf * 0.9)];
  paint(dr, brush(glowLine, 0.7, rnd, { start: 0.3, end: 0.9, peak: 0.7, count: 10 }), FIRELIGHT, 0.9);
  paint(dr, polygon(face), BLUED.base);
  damascus(dr, rnd, steel, COUNT, face, 0.3, 0.9, { samples: 22 });
  // the polish: the sky lying across the broad face in a band, its far end turning into shade, the forge warming its foot
  within(dr, polygon(face), () => {
    paint(dr, polygon([P(-HX + 6, -HY, 0), P(-HX + 17, -HY, 0), P(-HX + 7, HY, 0), P(-HX - 4, HY, 0)]), BLUED.edge, 0.13);
    paint(dr, polygon([P(-HX + 19, -HY, 0), P(-HX + 22, -HY, 0), P(-HX + 12, HY, 0), P(-HX + 9, HY, 0)]), BLUED.edge, 0.1);
    paint(dr, polygon([P(HX - 13, -HY, 0), P(HX + 1, -HY, 0), P(HX + 1, HY, 0), P(HX - 18, HY, 0)]), BLUED.deep, 0.34);
    paint(dr, polygon([P(-HX, HY - 6, 0), P(HX, HY - 6, 0), P(HX, HY, 0), P(-HX, HY, 0)]), FIRELIGHT, 0.12);
  });
  within(dr, polygon(topFace), () => paint(dr, polygon([topFace[0], topFace[1], lerp(topFace[1], topFace[2], 0.35), lerp(topFace[0], topFace[3], 0.35)]), BLUED.edge, 0.14));
  // the edge that catches the light: the upper chamfer burnished bright, a hard white line along it and a spark where it turns
  paint(dr, polygon(upper), '#a9b2c0');
  damascus(dr, rnd, steel, COUNT, [upper[0], upper[1], upper[2], upper[3]], 0.3, 0.22, { bright: '#f4f7fa', dim: '#7d8798', opacity: 0.8, samples: 14 });
  paint(dr, brush([P(-HX + 0.4, -HY + C * 0.55, cf * 0.45), P(0, -HY + C * 0.5, cf * 0.5), P(HX - 0.4, -HY +
    C * 0.45, cf * 0.55)], 0.9, rnd, { start: 0.3, end: 0.9, peak: 0.62, count: 12 }), BLUED.edge);
  paint(dr, touch(...P(HX - 7, -HY + C * 0.5, cf * 0.5), 9, 1.5, 0) + touch(...P(HX - 7, -HY + C * 0.5, cf * 0.5), 2.6, 1.1, 90), '#ffffff');
  paint(dr, brush([P(HX, -HY + C, 0), P(HX, 0, 0), P(HX, HY - C, 0)], 0.55, rnd, { start: 0.7, end: 0.2, count: 8 }), BLUED.edge, 0.85);
  paint(dr, brush([P(-HX, -HY + C, 0), P(-HX, 0, 0), P(-HX, HY - C, 0)], 0.45, rnd, { start: 0.8, end: 0.3, count: 8 }), BLUED.edge, 0.5);
  dr.add('</g>');

  // a few small embers glowing at the stone's foot, and the sparks rising off them
  let glow = '';
  let coals = '';
  let hot = '';
  let hearts = '';
  for (const [x, y, r] of [[102.6, 101.2, 1.5], [107, 101.8, 1.1], [99.4, 102, 0.9], [105, 100.4, 0.7]] as const) {
    glow += ellipse(x, y - 0.2, r * 2.6, r * 1.6);
    coals += outline(roundish(x, y, r * 1.3, r, rnd, { count: 7, tremor: 0.12 }));
    hot += ellipse(x - r * 0.15, y - r * 0.2, r * 0.75, r * 0.55);
    hearts += ellipse(x - r * 0.2, y - r * 0.3, r * 0.35, r * 0.26);
  }
  paint(dr, glow, EMBER[1]!, 0.16);
  paint(dr, coals, EMBER[0]!);
  paint(dr, hot, EMBER[2]!);
  paint(dr, hearts, EMBER[3]!);
  let sparks = '';
  for (let i = 0; i < 6; i++) sparks += touch(98 + rnd() * 14, 82 + rnd() * 14, 1.3 + rnd(), 0.5, -70 - rnd() * 40);
  paint(dr, sparks, EMBER[2]!);
}

// ────────────────────────────────────────────────────────────────── şahmaran

/** A number to a tenth, as a path writes it. */
const n1 = (v: number): string => String(Math.round(v * 10) / 10);

/** The painting's paints as fresh as the photograph shows them: true black, rich gold, orange and red, deep green, clean cream. */
const INK: Readonly<Record<SahmaranInk, string>> = {
  black: '#110d0a', skin: '#f4e9da', white: '#f8f1e4', gold: '#efb530', orange: '#ea7b26', rust: '#cc4a22', crimson: '#a32617',
  umber: '#4a3a1c', khaki: '#a89838', olive: '#86a83a',
};
/** The scales' own paints, a few of each so no two neighbours are quite the same. */
const SCALE: Readonly<Record<'umber' | 'khaki' | 'olive', readonly string[]>> = {
  umber: ['#4a3a1c', '#56421e', '#3e3118'],
  khaki: ['#a89838', '#b8a640', '#9a8a32', '#c6b450'],
  olive: ['#86a83a', '#98b844', '#76962f', '#a8c450'],
};
const PAPER = '#f2e9d4';
const TONED = '#b49a6a';
const FOXING = '#94673a';
const WOOD: Tone = { base: '#3a2516', light: '#583922', shade: '#21140a' };
const WORN_WOOD = '#7a5536';
const GILT = '#a4843f';
/** The picture's own measure, 820 by 614: half pixels of the photograph its trace was taken from. */
const PW = 820;
const PH = 614;

type Measured = ReadonlyArray<readonly [number, number]>;
/** A point measured on the photograph, in the picture's half pixels. */
const at = ([x, y]: readonly [number, number]): Pt => [x * 2, y * 2];
const ats = (pts: Measured): Pt[] => pts.map(at);

/** Runs `draw` with all it paints kept inside the painting's black, holes and all. */
function inBlack(dr: Drawing, draw: () => void): void {
  let id = blackClips.get(dr);
  if (!id) blackClips.set(dr, (id = dr.clip(SAHMARAN_PATHS.black, true)));
  dr.add(`<g clip-path="url(#${id})">`);
  draw();
  dr.add('</g>');
}
const blackClips = new WeakMap<Drawing, string>();

/** A path painted with holes left where its outlines nest. */
function paintHoles(dr: Drawing, d: string, colour: string, opacity = 1): void {
  if (d) dr.add(`<path d="${d}" fill="${colour}" fill-rule="evenodd"${opacity < 1 ? ` fill-opacity="${n2(opacity)}"` : ''}/>`);
}

/** The way across a line at its `i`th point. */
function normalAt(line: readonly Pt[], i: number): Pt {
  const a = line[Math.max(0, i - 1)]!;
  const b = line[Math.min(line.length - 1, i + 1)]!;
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
}

/**
 * Brush marks that follow a mass the way the brush moved through it: strokes running beside `guide`, out to `reach`
 * either side, each loaded at its start and thinning to nothing; `pools` gathers a bead of paint where some of them lift.
 */
function flow(rnd: Rnd, guide: readonly Pt[], reach: readonly number[], count: number, width: number, pools: { d: string }, span = 0.3): string {
  const N = guide.length - 1;
  let d = '';
  for (let k = 0; k < count; k++) {
    const o = (rnd() * 2 - 1) * 0.94;
    const i0 = Math.floor(rnd() * N * 0.9);
    const i1 = Math.min(N, i0 + 3 + Math.floor(rnd() * N * span));
    const step = Math.max(1, Math.round((i1 - i0) / 5));
    const pts: Pt[] = [];
    for (let i = i0; i <= i1; i += step) {
      const [nx, ny] = normalAt(guide, i);
      pts.push([guide[i]![0] + nx * o * reach[i]!, guide[i]![1] + ny * o * reach[i]!]);
    }
    if (pts.length < 2) continue;
    const w = width * (0.5 + rnd() * 0.7);
    d += brush(pts, w, rnd, { start: 0.5, end: 0.05, peak: 0.2, count: 6 });
    const last = pts[pts.length - 1]!;
    if (rnd() < 0.35) pools.d += ellipse(last[0], last[1], w * 0.42, w * 0.34);
  }
  return d;
}

export function sahmaran(dr: Drawing, rnd: Rnd): void {
  const X0 = 12;
  const Y0 = 26.5;
  const W = 96;
  const H = (PH / PW) * W;

  // the cord it hangs by, faded, its nail, and the picture's shadow on the wall
  paint(dr, brush([[11, 21], [36, 13.4], [60, 8.6]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }) +
    brush([[109, 21], [84, 13.4], [60, 8.6]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }), '#8a3a2c');
  paint(dr, ellipse(60, 8.6, 1.5, 1.5), '#3a2a22');
  paint(dr, ellipse(59.6, 8.2, 0.5, 0.5), '#b9b2a8');
  paint(dr, polygon([[7.6, 23.6], [115.6, 23.6], [115.6, 107], [7.6, 107]]), FLOOR, 0.18);
  // the frame: old dark wood, its grain showing, rubbed pale at the corners where hands have straightened it for years
  const frame = tremble(runs([[6, 20.4], [114, 20.4], [114, 104.4], [6, 104.4]], 6), rnd, 0.22);
  paint(dr, outline(frame), WOOD.base);
  within(dr, outline(frame), () => {
    paint(dr, polygon([[4, 18], [116, 18], [116, 22.2], [8.2, 22.2], [8.2, 106], [4, 106]]), WOOD.light);
    paint(dr, polygon([[111.8, 22.2], [116, 22.2], [116, 106], [4, 106], [4, 102.2], [111.8, 102.2]]), WOOD.shade);
    paint(dr, streaks(rnd, [6, 20, 114, 24], 10, 0, 12, 0.5) + streaks(rnd, [6, 100.6, 114, 104.4], 10, 0, 12, 0.5), WOOD.light, 0.5);
    paint(dr, streaks(rnd, [6, 24, 10, 101], 8, 90, 12, 0.5) + streaks(rnd, [110, 24, 114, 101], 8, 90, 12, 0.5), WOOD.shade, 0.6);
    let worn = '';
    for (const [x, y] of [[6, 20.4], [114, 20.4], [114, 104.4], [6, 104.4]] as const) worn += outline(roundish(x, y, 3.4, 3, rnd, { wobble: 0.2, count: 10, tremor: 0.5 }));
    paint(dr, worn, WORN_WOOD, 0.75);
    let nicks = '';
    for (let i = 0; i < 14; i++) nicks += touch(6 + rnd() * 108, rnd() < 0.5 ? 20.4 + rnd() * 3 : 101.6 + rnd() * 2.8, 0.8 + rnd() * 1.4, 0.3, rnd() * 180);
    paint(dr, nicks, WORN_WOOD, 0.6);
  });
  paint(dr, polygon(tremble([[X0 - 1.2, Y0 - 1.2], [X0 + W + 1.2, Y0 - 1.2], [X0 + W + 1.2, Y0 + H + 1.2], [X0 - 1.2, Y0 + H + 1.2]], rnd, 0.12)), GILT);
  paint(dr, polygon([[X0 - 0.7, Y0 - 0.7], [X0 + W + 0.7, Y0 - 0.7], [X0 + W + 0.7, Y0 + H + 0.7], [X0 - 0.7, Y0 + H + 0.7]]), WOOD.shade, 0.55);
  const picture = tremble(runs([[X0, Y0], [X0 + W, Y0], [X0 + W, Y0 + H], [X0, Y0 + H]], 6), rnd, 0.1);
  paint(dr, outline(picture), PAPER);
  within(dr, outline(picture), () => {
    dr.add(`<g transform="translate(${X0} ${Y0}) scale(${(W / PW).toFixed(7)})">`);
    agedPaper(dr, rnd);
    painting(dr, rnd);
    years(dr, rnd);
    face(dr, rnd);
    dr.add('</g>');
  });
}

/** The paper: clean cream with a little life in it, and only at its edges and corners the patina of its years. */
function agedPaper(dr: Drawing, rnd: Rnd): void {
  for (let i = 0; i < 2; i++) {
    const hole = outline(roundish(PW / 2, PH / 2, PW * (0.64 - i * 0.025), PH * (0.66 - i * 0.03), rnd, { wobble: 0.06, count: 18, tremor: 8 }));
    dr.add(`<path d="M-20 -20H${PW + 20}V${PH + 20}H-20Z${hole}" fill="${TONED}" fill-rule="evenodd" fill-opacity="0.08"/>`);
  }
  let light = '';
  for (let i = 0; i < 6; i++) light += outline(roundish(rnd() * PW, rnd() * PH, 50 + rnd() * 110, 40 + rnd() * 80, rnd, { wobble: 0.2, count: 12, tremor: 6 }));
  paint(dr, light, '#faf4e6', 0.35);
  let spots = '';
  for (const [cx, cy] of [[40, 30], [790, 40], [30, 590], [800, 585]] as const) {
    for (let i = 0; i < 4; i++) {
      const r = 1 + rnd() * 2.6;
      spots += outline(roundish(cx + (rnd() - 0.5) * 50, cy + (rnd() - 0.5) * 36, r, r * (0.7 + rnd() * 0.3), rnd, { count: 7, tremor: 0.6 }));
    }
  }
  paint(dr, spots, FOXING, 0.3);
  paint(dr, streaks(rnd, [0, 0, PW, PH], 24, 0, 14, 0.9), '#e2d4b4', 0.35);
}

/** The painting itself: its traced inks, gone over by hand with the brush. */
function painting(dr: Drawing, rnd: Rnd): void {
  const black = SAHMARAN_PATHS.black;
  paintHoles(dr, black, INK.black);
  // the black laid on in long strokes down the body and the hair, and beading where the brush lifted
  const pools = { d: '' };
  inBlack(dr, () => {
    const spine: Array<[number, number, number]> = [[72, 96, 24], [56, 110, 26], [44, 126, 22], [40, 142, 20], [43, 158, 22], [50, 174, 26], [62, 194, 32],
      [80, 214, 36], [105, 224, 38], [140, 225, 38], [180, 223, 40], [220, 222, 40], [260, 228, 34], [300, 236, 26], [335, 236, 22]];
    const line = along(spine.map(([x, y]) => at([x, y])), 90);
    const reach = along(spine.map(([, , w], i): Pt => [i, w * 2]), 90).map(([, w]) => w);
    let strokes = flow(rnd, line, reach, 34, 7, pools);
    for (const [guide, half] of [
      [[[274, 102], [274, 125], [268, 145], [252, 160], [228, 172], [196, 181]], 9],
      [[[336, 102], [331, 130], [333, 160], [344, 190], [351, 222], [346, 250]], 9],
      [[[96, 74], [120, 64], [150, 52], [168, 46]], 16],
    ] as const) {
      const g = along(guide.map(at), 30);
      strokes += flow(rnd, g, g.map(() => half * 2), 9, 5, pools, 0.6);
    }
    paint(dr, strokes, '#2e2620', 0.65);
    paint(dr, pools.d, '#000000', 0.85);
    // the horns: a dull light along the outer curve of each, brushed on
    const sheen = { start: 0.3, end: 0.1, peak: 0.4, count: 12 };
    paint(dr, brush(ats([[258, 96], [257, 60], [246, 40], [222, 16]]), 3.6, rnd, sheen) +
      brush(ats([[331, 92], [338, 64], [356, 40], [384, 14]]), 3.6, rnd, sheen), '#3e3630', 0.65);
    paint(dr, brush([at([84, 58]), at([120, 48]), at([160, 42])], 3.4, rnd, { start: 0.2, end: 0.2, count: 10 }), '#5c5244', 0.7);
  });
  // the colours, each laid over the black a hair off true, as a hand fills a drawn shape
  for (const name of SAHMARAN_INKS) {
    if (name === 'black') continue;
    const loose = name !== 'skin' && name !== 'white';
    if (loose) dr.add(`<g transform="translate(${n1((rnd() - 0.5) * 1.6)} ${n1((rnd() - 0.5) * 1.6)})">`);
    paintHoles(dr, SAHMARAN_PATHS[name], INK[name]);
    if (loose) dr.add('</g>');
  }
  scales(dr, rnd);
  touches(dr, rnd);
  // the black's edge gone over with the brush, swelling and lifting, and here and there run dry so the paper shows
  let rim = '';
  let dry = '';
  const total = SAHMARAN_EDGES.reduce((sum, run) => sum + run.length, 0);
  const pick = (): readonly number[] => {
    let t = rnd() * total;
    for (const run of SAHMARAN_EDGES) if ((t -= run.length) <= 0) return run;
    return SAHMARAN_EDGES[0]!;
  };
  for (let k = 0; k < 26; k++) {
    const run = pick();
    const i0 = Math.floor(rnd() * (run.length / 3));
    const pts: Pt[] = [];
    for (let i = i0; i < Math.min(run.length / 3, i0 + 4 + Math.floor(rnd() * 6)); i++) pts.push([run[i * 3]!, run[i * 3 + 1]!]);
    if (pts.length > 2) rim += brush(pts, 2.6 + rnd() * 2.4, rnd, { start: 0.1, end: 0.1, peak: 0.3 + rnd() * 0.4, count: 10 });
  }
  for (let k = 0; k < 70; k++) {
    const run = pick();
    const i = Math.floor(rnd() * (run.length / 3)) * 3;
    dry += touch(run[i]! + (rnd() - 0.5) * 2, run[i + 1]! + (rnd() - 0.5) * 2, 5 + rnd() * 9, 1.1 + rnd() * 1.2, run[i + 2]! + (rnd() - 0.5) * 14);
  }
  paint(dr, rim, INK.black);
  inBlack(dr, () => paint(dr, dry, PAPER, 0.55));
}

/** The scales of her body: a dab each, never quite where the drawing put it, most with a lick of light on the upper side. */
function scales(dr: Drawing, rnd: Rnd): void {
  const tones = new Map<string, string>();
  const add = (tone: string, d: string): void => void tones.set(tone, (tones.get(tone) ?? '') + d);
  let lights = '';
  let eyes = '';
  for (const name of ['umber', 'khaki', 'olive'] as const) {
    const dabs = SAHMARAN_DABS[name];
    const paints = SCALE[name];
    for (let i = 0; i + 4 < dabs.length; i += 5) {
      const [x, y, l, w, a] = [dabs[i]!, dabs[i + 1]!, dabs[i + 2]!, dabs[i + 3]!, dabs[i + 4]!];
      const cx = x + (rnd() - 0.5) * 1.4;
      const cy = y + (rnd() - 0.5) * 1.4;
      add(paints[Math.floor(rnd() * paints.length)]!, touch(cx, cy, l * 1.1, w * 1.12, a + (rnd() - 0.5) * 16));
      if (name === 'umber' || l < 6) continue;
      if (rnd() < 0.5) lights += touch(cx - w * 0.22, cy - w * 0.26, l * 0.5, w * 0.3, a - 12);
      if (rnd() < 0.55) eyes += ellipse(cx + 0.4, cy + 0.4, w * 0.2, w * 0.17);
    }
  }
  for (const [tone, d] of tones) paint(dr, d, tone);
  paint(dr, eyes, '#1e170f', 0.85);
  paint(dr, lights, '#e6dc86', 0.8);
}

/** What the trace cannot carry: her tongue, the chains of beads, her eyes and lips gone over finely, and the painted lights. */
function touches(dr: Drawing, rnd: Rnd): void {
  const line = (pts: Measured, w: number, colour: string, opacity = 1, shape = { start: 0.3, end: 0.2, peak: 0.4 }): void =>
    paint(dr, brush(pts.map(at), w, rnd, { ...shape, count: Math.max(8, pts.length * 4) }), colour, opacity);
  // the serpent's forked tongue, reaching for her
  line([[164, 62], [182, 57], [197, 53]], 3, '#b8505a', 1, { start: 1, end: 0.8, peak: 0.4 });
  line([[196, 53], [210, 46]], 2, '#b8505a');
  line([[196, 53], [209, 58]], 2, '#b8505a');
  // the beads hanging from the ram's horns, and the rosettes at their ends
  let chains = '';
  let beads = '';
  let rosettes = '';
  for (const [x0, y0, x1, y1] of [[240, 90, 240, 116], [256, 96, 255, 134], [366, 95, 366, 114], [350, 100, 348, 134]] as const) {
    chains += brush([at([x0, y0]), at([x1, y1])], 1.2, rnd, { start: 1, end: 1, count: 4 });
    for (let k = 0.2; k < 1; k += 0.2) beads += ellipse(...at([x0 + (x1 - x0) * k, y0 + (y1 - y0) * k]), 1.7, 1.7);
    rosettes += outline(roundish(...at([x1, y1 + 4]), 4.2, 4.2, rnd, { count: 8, tremor: 0.5 }));
  }
  paint(dr, chains, '#7a5a26');
  paint(dr, beads, '#d6a340');
  paint(dr, rosettes, '#c98680');
  // the lights, painted on: a pale gold along the crowns and the cape's gold, a cool green along the ram's horns
  let gold = '';
  for (const pts of [[[52, 34], [70, 24], [84, 12]], [[112, 20], [130, 13], [146, 5]], [[284, 76], [286, 56], [288, 44]], [[324, 76], [325, 58], [327, 44]],
    [[270, 88], [290, 82], [305, 79]], [[228, 188], [250, 180], [264, 180]], [[282, 204], [310, 207], [336, 205]], [[296, 14], [314, 14]]] as const) {
    gold += brush(ats(pts), 2.4 + rnd(), rnd, { start: 0.2, end: 0.1, peak: 0.4, count: 10 });
  }
  paint(dr, gold, '#ffe39a', 0.85);
  // the ram's horns, striped across their coils as the painter banded them
  let bands = '';
  for (const [cx, cy, s, r0] of [[244, 75, 1, 16], [366, 80, -1, 18]] as const) {
    for (let i = 1; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = (r0 - 4 - (i / 12) * (r0 - 8)) * 2;
      const [x, y] = at([cx, cy]);
      bands += touch(x + s * Math.cos(a) * r, y - Math.sin(a) * r, 15, 3.4, (Math.atan2(-Math.cos(a), -s * Math.sin(a)) * 180) / Math.PI + 90);
    }
  }
  within(dr, SAHMARAN_PATHS.olive, () => paint(dr, bands, '#3e5a1c', 0.85));
  const lick = { start: 0.3, end: 0.1, count: 12 };
  paint(dr, brush(ats([[256, 62], [240, 60], [230, 68], [234, 80]]), 2.6, rnd, lick) +
    brush(ats([[352, 66], [368, 63], [380, 72], [378, 86]]), 2.6, rnd, lick), '#d8e08a', 0.85);
}

/**
 * Her face, neck and necklace, laid last so nothing crosses her features. The face is drawn to the painting's
 * proportions, measured on it in the photograph's pixels: a round, soft face from the hairline under the crown (101) to
 * the chin (145.5), 40 across, the hair falling over its sides; the brows arched high, the eyes on a line a quarter of the
 * way down and one eye's width apart, a short nose, and the small full mouth close under it. Then the choker, the gold
 * drops and the heart, laid on as measured there.
 */
function face(dr: Drawing, rnd: Rnd): void {
  const CX = 304.3;
  const TOP = 101;
  const MID = 121.5;
  const CHIN = 145.5;
  const HALF = 20;
  const SKIN_TONE = '#f2e6d6';
  const P = (x: number, y: number): Pt => at([x, y]);
  // the face: broad across the brow under the crown, its jaw narrowing softly into a round chin
  const oval = (): Pt[] => {
    const pts: Pt[] = [];
    for (let i = 0; i < 36; i++) {
      const t = (i / 36) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const n = s < 0 ? 3.2 : 2.6;
      const k = (v: number): number => Math.sign(v) * Math.abs(v) ** (2 / n);
      const w = HALF * (s > 0 ? 1 - 0.07 * s * s : 1);
      pts.push(P(CX + w * k(c), MID + (s > 0 ? CHIN - MID : MID - TOP) * k(s)));
    }
    return pts;
  };
  // the skin of her neck and breast where the painting has it, then her face over it
  dr.add('<g transform="scale(0.1)">');
  paintHoles(dr, SAHMARAN_FACE_GROUND, SKIN_TONE);
  dr.add('</g>');
  paint(dr, outline(oval()), SKIN_TONE);
  // her hair falls straight past her face on either side, framing her brow under the crown and lying over the edge of her
  // cheeks, as the painting has it
  const lock = (side: -1 | 1): Pt[] => {
    const edge: Array<[number, number]> = [[16.4, 99.6], [18.8, 104], [19.6, 112], [19.6, 121], [19, 129], [17.8, 136], [16.8, 142], [17.6, 151]];
    return [...edge.map(([dx, y]) => P(CX + side * dx, y)), P(CX + side * 27, 151), P(CX + side * 27.5, 124), P(CX + side * 26.5, 99)];
  };
  for (const side of [-1, 1] as const) {
    const hair = lock(side);
    paint(dr, outline(hair), INK.black);
    within(dr, outline(hair), () => {
      let strands = '';
      for (let k = 0; k < 5; k++) {
        const x = CX + side * (19.6 + k * 1.6);
        const fall = [P(x - side * 0.6, 100), P(x, 118), P(x + side * 0.4, 136), P(x + side * 1.2, 151)];
        strands += brush(fall, 1.5, rnd, { start: 0.4, end: 0.1, peak: 0.3, count: 12 });
      }
      paint(dr, strands, '#2e2620', 0.55);
    });
  }
  // a soft shade under each cheekbone, one under the lower lip, and the faint line of the chin
  const shade = '#e5d2c2';
  paint(dr, touch(...P(289.4, 128), 18, 8, 74) + touch(...P(319.2, 128), 18, 8, 106), shade, 0.22);
  paint(dr, touch(...P(CX, 148), 30, 3.6, 0), '#dcc6b4', 0.7);
  paint(dr, touch(...P(CX, 140.6), 11, 2.6, 0), shade, 0.6);
  const chin: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = Math.PI * (0.24 + (i / 8) * 0.52);
    const c = Math.cos(t);
    const s = Math.sin(t);
    chin.push(P(CX + HALF * 0.92 * (1 - 0.07 * s * s) * Math.sign(c) * Math.abs(c) ** (2 / 2.6), MID + (CHIN - MID) * 0.97 * s ** (2 / 2.6)));
  }
  paint(dr, brush(chin, 1.1, rnd, { start: 0.05, end: 0.05, peak: 0.5, count: 18 }), '#b48a7a', 0.7);

  // the brows: dark confident arches close over the eyes, each one stroke of the brush, full and a little square where it
  // starts by the bridge of the nose, rising to its peak two-thirds of the way out and tapering toward the outer corner
  const BROW = [[4.8, 109.6], [8, 108.6], [11.4, 107.8], [14.3, 107.5], [17.2, 108], [19.8, 109.5]] as const;
  const browAt = (side: -1 | 1): Pt[] => BROW.map(([dx, y]) => P(CX + side * dx, y));
  const arch = { start: 0.85, end: 0.04, peak: 0.32, count: 24 };
  paint(dr, brush(browAt(-1), 2.4, rnd, arch) + brush(browAt(1), 2.4, rnd, arch), '#21140f');
  // the eyes, painted as a folk painter paints a beauty: wide almonds lifted at their outer corners, lined with kohl that
  // wings out past the corner, a few lashes, large irises (the left violet-brown, the right grey-blue) with dark rims,
  // black pupils and the same catch of light in each, bright whites either side, and a warm shadow in the lid's crease
  for (const side of [-1, 1] as const) {
    const ex = CX + side * 11.8;
    const ey = 113.2;
    const inner: Pt = [ex - side * 7, ey + 0.3];
    const outer: Pt = [ex + side * 7.5, ey - 0.6];
    const arc = (lift: number, steps = 12, from = 0, to = 1): Pt[] => {
      const pts: Pt[] = [];
      for (let k = 0; k <= steps; k++) {
        const t = from + ((to - from) * k) / steps;
        const x = inner[0] + (outer[0] - inner[0]) * t;
        const y = inner[1] + (outer[1] - inner[1]) * t - lift * Math.sin(Math.PI * t ** 0.92);
        pts.push(P(x, y));
      }
      return pts;
    };
    const upper = arc(3.1);
    const lower = arc(-2.3);
    const almond = [...upper, ...lower.slice(1, -1).reverse()];
    paint(dr, outline(arc(4.6, 12, 0.08, 0.95)), '#d9b6a4', 0.4);
    paint(dr, outline(almond), '#fbf8f2');
    const [ix, iy] = [ex - side * 0.2, ey + 0.05];
    within(dr, outline(almond), () => {
      const [rim, base, light] = side < 0 ? ['#2c1822', '#5c3a4a', '#8a6476'] : ['#2e3c4c', '#7590aa', '#a6bdd0'];
      paint(dr, ellipse(...P(ix, iy), 5.6, 5.6), rim);
      paint(dr, ellipse(...P(ix, iy), 4.6, 4.6), base);
      paint(dr, touch(...P(ix + 0.2, iy + 1.3), 5.4, 1.9, 0), light, 0.8);
      paint(dr, ellipse(...P(ix, iy), 2.3, 2.3), '#0d080a');
      paint(dr, brush(upper.map(([x, y]): Pt => [x, y + 1.1]), 2.4, rnd, { start: 0.5, end: 0.5, peak: 0.5, count: 16 }), '#c8b4ac', 0.5);
      paint(dr, ellipse(...P(ix - 0.85, iy - 0.85), 0.95, 0.95) + ellipse(...P(ix + 0.7, iy + 0.55), 0.4, 0.4), '#ffffff');
    });
    // the kohl: bold along the upper lid, thickening outward into a short wing; finer below, meeting it at the corner
    const wing = P(outer[0] + side * 2.6, outer[1] - 1.3);
    paint(dr, brush([...arc(3.25, 12, 0.02, 1), wing], 3.4, rnd, { start: 0.3, end: 0.02, peak: 0.82, count: 30 }), '#120c0c');
    const under = [...arc(-2.35, 10, 0.12, 1), P(outer[0] + side * 0.6, outer[1] - 0.25)];
    paint(dr, brush(under, 1.2, rnd, { start: 0.15, end: 0.6, peak: 0.85, count: 20 }), '#24161a', 0.9);
    let lashes = '';
    const lid = arc(3.35, 12);
    for (const k of [7, 8, 9, 10, 11]) {
      const [x, y] = lid[k]!;
      const lean = (k - 6) * 0.22;
      const lash: Pt[] = [[x, y], [x + side * (0.6 + lean), y - 1.4], [x + side * (1.3 + lean * 1.4), y - 2.1]];
      lashes += brush(lash, 0.7, rnd, { start: 1, end: 0.05, peak: 0.1, count: 5 });
    }
    paint(dr, lashes, '#120c0c');
  }
  // the nose: one short soft line down its shaded side, and two small nostril marks just above the mouth
  paint(dr, brush([P(302.6, 116.6), P(302.2, 121.4), P(302.6, 125.6)], 1.1, rnd, { start: 0.1, end: 0.5, peak: 0.75, count: 10 }), '#bf9888', 0.8);
  paint(dr, touch(...P(CX - 2.3, 127.6), 2.8, 1.2, 16) + touch(...P(CX + 2.3, 127.6), 2.8, 1.2, -16), '#8a5a4c', 0.85);
  paint(dr, touch(...P(CX, 127), 5, 1.8, 0), '#e8d6c6', 0.6);
  // the mouth, small and full, close under the nose, the lipstick a little smudged past its line
  const lips = (dx: number, y: number): Pt => P(CX + dx * 0.82, y);
  const upper = [lips(-7, 135.6), lips(-4.4, 134.2), lips(-1.6, 133.2), lips(0, 133.8), lips(1.6, 133.2), lips(4.4, 134.2), lips(7, 135.6), lips(3.2, 135.9),
    lips(0, 136), lips(-3.2, 135.9)];
  const lower = [lips(-6.6, 135.8), lips(-3.4, 136.2), lips(0, 136.3), lips(3.4, 136.2), lips(6.6, 135.8), lips(4.6, 138.2), lips(2, 139.6), lips(0, 139.9),
    lips(-2, 139.6), lips(-4.6, 138.2)];
  const [mx, my] = P(CX, 136.6);
  const grown = (pts: Pt[], k: number): Pt[] => pts.map(([x, y]): Pt => [mx + (x - mx) * k, my + (y - my) * k * 1.12]);
  paint(dr, outline(grown([...upper.slice(0, 7), ...lower.slice(5)], 1.2)), '#d8807a', 0.32);
  paint(dr, outline(grown([...upper.slice(0, 7), ...lower.slice(5)], 1.08)), '#c85a54', 0.3);
  paint(dr, outline(lower), '#9a2a2c');
  paint(dr, outline(upper), '#7c2024');
  const parting = [lips(-6.8, 135.7), lips(-3.4, 136.1), lips(0, 136.2), lips(3.4, 136.1), lips(6.8, 135.7)];
  paint(dr, brush(parting, 0.7, rnd, { start: 0.2, end: 0.2, peak: 0.5, count: 12 }), '#4a1012', 0.9);
  paint(dr, touch(...lips(0.6, 138.2), 5, 1.1, -4), '#e29a90', 0.65);
  // the choker close under her chin: beads between two red cords
  const choker = along(ats([[284, 148.6], [290, 153.2], [297, 155.8], [304, 156.4], [311, 155.6], [317, 152.6], [322.4, 147.6]]), 48);
  let cords = '';
  for (const off of [-3, 3]) cords += brush(choker.map(([x, y]): Pt => [x, y + off]), 0.9, rnd, { start: 0.5, end: 0.5, peak: 0.5, count: 20 });
  paint(dr, cords, '#7a3020');
  let choke = '';
  for (let i = 1; i < 48; i += 3) choke += ellipse(choker[i]![0], choker[i]![1], 2.5, 2.5);
  paint(dr, choke, '#c0602e');
  // the beads strung below it, and gold drops hanging from them, fanned out as the string curves
  const string = along(ats([[281.6, 153.6], [287, 159.6], [294, 163.8], [302, 165.6], [310, 164.6], [317, 160.6], [323.4, 154.6]]), 60);
  let beads = '';
  let glints = '';
  for (let i = 0; i <= 60; i += 4) {
    const [x, y] = string[i]!;
    beads += ellipse(x, y, 2, 2);
    glints += ellipse(x - 0.6, y - 0.7, 0.6, 0.6);
  }
  let gold = '';
  let rims = '';
  let lights = '';
  for (const i of [3, 10, 17, 24, 36, 43, 50, 57]) {
    const [x, y] = string[i]!;
    const [nx, ny] = normalAt(string, i);
    const [ox, oy] = ny > 0 ? [nx, ny] : [-nx, -ny];
    const [dx, dy] = [ox * 0.55 / Math.hypot(ox * 0.55, oy * 0.55 + 0.45), (oy * 0.55 + 0.45) / Math.hypot(ox * 0.55, oy * 0.55 + 0.45)];
    const drop: Pt[] = [[x + dx * 2, y + dy * 2], [x + dx * 8 - dy * 3.6, y + dy * 8 + dx * 3.6], [x + dx * 17, y + dy * 17], [x + dx * 8 + dy * 3.6, y +
      dy * 8 - dx * 3.6]];
    gold += outline(drop);
    rims += brush([...drop, drop[0]!, drop[1]!], 1.1, rnd, { start: 0.6, end: 0.6, peak: 0.5, count: 14 });
    lights += touch(x + dx * 8 - dy * 1.2, y + dy * 8 + dx * 1.2, 5.6, 1, (Math.atan2(dy, dx) * 180) / Math.PI);
  }
  // the heart below them all, on a ring from the middle bead
  const heart: Pt[] = ats([[301, 176.4], [304, 174], [308, 174.2], [310, 177], [309.4, 181.4], [306, 186], [300.8, 191.6], [295.6, 186], [292.2, 181.4], [291.8, 177],
    [293.8, 174.2], [297.8, 174]]);
  paint(dr, ellipse(...at([301.4, 170.4]), 2.6, 3), '#7a3020');
  paint(dr, ellipse(...at([301.4, 170.4]), 1.3, 1.7), '#eedfcd');
  paint(dr, gold, '#d8a24c');
  paint(dr, outline(heart), '#d4893a');
  paint(dr, outline(heart.map(([x, y]): Pt => [x + (602 - x) * 0.32, y + (362 - y) * 0.36])), '#e8b45a');
  paint(dr, rims + brush([...heart, heart[0]!, heart[1]!], 1.3, rnd, { start: 0.6, end: 0.6, peak: 0.5, count: 30 }), '#7a3a1e');
  paint(dr, lights + touch(...at([297, 178.6]), 7, 1.6, -60), '#f3d68e', 0.85);
  paint(dr, beads, '#a8462a');
  paint(dr, glints, '#e8b066', 0.9);
}

/** A few years on its wall, lightly: faint cracks in the black, its edges a little rubbed, a crease across one corner. */
function years(dr: Drawing, rnd: Rnd): void {
  inBlack(dr, () => {
    let cracks = '';
    for (let k = 0; k < 18; k++) {
      // a crack wanders a few short steps, turning a little at each
      let [x, y] = [40 + rnd() * 700, 90 + rnd() * 480];
      let a = rnd() * Math.PI * 2;
      const pts: Pt[] = [[x, y]];
      for (let s = 0; s < 4 + Math.floor(rnd() * 4); s++) {
        a += (rnd() - 0.5) * 1.4;
        x += Math.cos(a) * (6 + rnd() * 9);
        y += Math.sin(a) * (6 + rnd() * 9);
        pts.push([x, y]);
      }
      cracks += brush(pts, 0.7, rnd, { start: 0.6, end: 0.3, peak: 0.5, count: pts.length * 2 });
    }
    paint(dr, cracks, '#6a5a44', 0.25);
  });
  // the paint rubbed a little from the picture's edges, and a rubbed corner at its foot
  let rubbed = '';
  for (let i = 0; i < 34; i++) {
    const side = Math.floor(rnd() * 4);
    const t = rnd();
    const [x, y] = side === 0 ? [t * PW, rnd() * 7] : side === 1 ? [PW - rnd() * 7, t * PH] : side === 2 ? [t * PW, PH - rnd() * 7] : [rnd() * 7, t * PH];
    rubbed += touch(x, y, 4 + rnd() * 10, 1 + rnd() * 2, side % 2 ? 90 : 0);
  }
  rubbed += outline(roundish(0, PH, 26, 22, rnd, { wobble: 0.2, count: 12, tremor: 3 }));
  paint(dr, rubbed, '#f7eedb', 0.4);
  // a crease across the top right corner, where it was once folded: a pale ridge with its shadow beside it
  paint(dr, brush([[PW - 150, 0], [PW - 90, 40], [PW, 104]], 1.6, rnd, { start: 0.6, end: 0.8, peak: 0.5, count: 12 }), '#fbf4e2', 0.5);
  paint(dr, brush([[PW - 148, 3], [PW - 88, 43], [PW, 107.6]], 1.4, rnd, { start: 0.6, end: 0.8, peak: 0.5, count: 12 }), '#8a7050', 0.18);
}
