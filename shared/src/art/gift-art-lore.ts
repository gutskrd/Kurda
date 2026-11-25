/**
 * The gifts from the old stories (gift-art.ts): Kawa's hammer, from the Newroz legend of the smith who rose against the
 * tyrant, forged in Damascus steel with the sun of Kurdistan on its plate; and Şahmaran, queen of the serpents, as the
 * owner's folk painting shows her, framed to hang on a wall and painted afresh rather than traced.
 */
import { type Drawing, type Pt } from './svg.js';
import { along, brush, ellipse, floor, FLOOR, outline, paint, polygon, roundish, runs, scaleAbout, streaks, touch, tremble, within, type Rnd, type Tone } from './gift-paint.js';

// ────────────────────────────────────────────────────────────────────── kawa

/** A point `t` of the way from a to b. */
const lerpPt = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Blued Damascus steel: the dark of the steel, its folded silver lines, and the light along an edge. */
const BLUED = { deep: '#12151c', dark: '#1d222d', base: '#272e3b', top: '#353d4c', silver: '#d3dae3', dim: '#8e97a6', edge: '#eef2f6' };
const EMBER = ['#c33a28', '#ec7a2c', '#f7b63a', '#ffe4a0'];
const FIRELIGHT = '#e98b4e';

/**
 * The folded lines of Damascus steel over a four-sided face (corners p00, p10, p11, p01 going round): `count` thin
 * silver ribbons running across it from its p00-p10 side to its p01-p11 side, each a line where the steel's folds
 * come to the surface. They waver together in slow waves and are pinched here and there into the eyes and rungs of a
 * ladder pattern, and the odd one breaks off, as the real metal's do.
 */
function damascus(dr: Drawing, rnd: Rnd, face: readonly [Pt, Pt, Pt, Pt], count: number, { width = 0.8, bright = BLUED.silver, dim = BLUED.dim, rungs = 3, opacity = 1 } = {}): void {
  const [p00, p10, p11, p01] = face;
  const at = (u: number, v: number): Pt => [
    (1 - u) * (1 - v) * p00[0] + u * (1 - v) * p10[0] + u * v * p11[0] + (1 - u) * v * p01[0],
    (1 - u) * (1 - v) * p00[1] + u * (1 - v) * p10[1] + u * v * p11[1] + (1 - u) * v * p01[1],
  ];
  const [ph1, ph2] = [rnd() * 6.3, rnd() * 6.3];
  const steps = Array.from({ length: rungs }, () => [0.15 + rnd() * 0.7, rnd() * 6.3, 0.6 + rnd() * 0.5] as const);
  const g = (u: number, v: number): number => {
    let d = 0.22 * Math.sin(Math.PI * 2 * (1.1 * v + ph1 + 0.9 * u)) + 0.12 * Math.sin(Math.PI * 2 * (2.6 * v + 1.7 * u + ph2));
    for (const [vk, psi, amp] of steps) d += amp * 0.7 * Math.exp(-(((v - vk) / 0.06) ** 2)) * Math.sin(Math.PI * 2 * (u * count * 0.5 + psi));
    return d;
  };
  let lit = '';
  let soft = '';
  for (let c = -1; c <= count + 1; c++) {
    const pts: Pt[] = [];
    for (let k = 0; k <= 16; k++) {
      const v = -0.04 + (k / 16) * 1.08;
      let u = c / count;
      for (let it = 0; it < 4; it++) u = (c - g(u, v)) / count;
      pts.push(at(u, v));
    }
    const w = width * (rnd() < 0.35 ? 0.35 + rnd() * 0.25 : 0.7 + rnd() * 0.6);
    const shape = { start: 0.5 + rnd() * 0.5, end: 0.5 + rnd() * 0.5, peak: 0.3 + rnd() * 0.4, count: 14 };
    // now and then a line breaks, leaving an eye of dark steel between its ends
    if (rnd() < 0.25) {
      const cut = 5 + Math.floor(rnd() * 6);
      const ribbon = brush(pts.slice(0, cut), w, rnd, { ...shape, end: 0.05 }) + brush(pts.slice(cut + 2), w, rnd, { ...shape, start: 0.05 });
      if (rnd() < 0.7) lit += ribbon;
      else soft += ribbon;
    } else if (rnd() < 0.72) lit += brush(pts, w, rnd, shape);
    else soft += brush(pts, w, rnd, shape);
  }
  within(dr, polygon(face), () => {
    paint(dr, soft, dim, opacity);
    paint(dr, lit, bright, opacity);
  });
}

export function kawa(dr: Drawing, rnd: Rnd): void {
  // the ground and the stone its head rests on
  floor(dr, rnd, 58, 102, 52, 4.4);
  const top = tremble([[60, 70], [94, 70], [101, 64.6], [67, 64.6]], rnd, 0.3);
  const front = tremble([[60, 70], [94, 70], [94.4, 100], [59.6, 100.4]], rnd, 0.35);
  const flank = tremble([[94, 70], [101, 64.6], [101.4, 94.6], [94.4, 100]], rnd, 0.35);
  paint(dr, polygon(front), '#8f877b');
  paint(dr, polygon(flank), '#6e685f');
  paint(dr, polygon(top), '#b3ab9e');
  within(dr, polygon(front), () => {
    paint(dr, streaks(rnd, [60, 70, 94, 100], 18, 4, 8, 0.8), '#776f64', 0.6);
  });
  paint(dr, brush([[66, 100], [68.4, 92], [67, 86]], 0.6, rnd, { count: 4 }) + brush([[100, 90], [101.6, 84], [100.6, 78]], 0.5, rnd, { count: 4 }), '#58524a', 0.8);

  // the hammer, drawn square to its own head and laid on the diagonal: its head on the stone, the pommel on the ground
  dr.add('<g transform="translate(72 42) rotate(46) scale(0.84)">');
  // the head: a block whose long edges are chamfered, so its ends are octagons; `D` is how its depth falls
  const D: Pt = [6.5, -6.5];
  const C = 3.6;
  const cf = 0.16;
  const HX = 24;
  const HY = 15;
  const P = (x: number, y: number, z: number): Pt => [x + z * D[0], y + z * D[1]];
  // the handle, long and turned, out of the head's foot, ring grooves along it and a rounded pommel at its end
  const hx = D[0] / 2;
  const h0 = HY + D[1] / 2;
  const LEN = 80;
  const R = 4.2;
  const pommel = roundish(hx, h0 + LEN + 1.6, R + 1.2, 3.6, rnd, { count: 18, wobble: 0.01, tremor: 0.1 });
  paint(dr, outline(pommel), BLUED.base);
  const shaft: Pt[] = [[hx - R, h0], [hx + R, h0], [hx + R, h0 + LEN], [hx - R, h0 + LEN]];
  paint(dr, polygon(shaft), BLUED.base);
  // its lines run its length and turn with it, crowding toward its edges as a round thing's do
  within(dr, polygon(shaft), () => {
    let lit = '';
    let soft = '';
    for (let i = 0; i < 23; i++) {
      const theta = -Math.PI / 2 + ((i + 0.5) / 23) * Math.PI;
      const pts: Pt[] = [];
      for (let k = 0; k <= 18; k++) {
        const y = h0 + (k / 18) * LEN;
        const sway = 0.14 * Math.sin(y * 0.12 + i * 0.5) + 0.07 * Math.sin(y * 0.37 + i);
        pts.push([hx + R * Math.sin(Math.max(-1.5, Math.min(1.5, theta + sway))), y]);
      }
      const ribbon = brush(pts, 0.24 + rnd() * 0.26, rnd, { start: 0.6, end: 0.6, peak: 0.5, count: 30 });
      if (i % 3 === 2) soft += ribbon;
      else lit += ribbon;
    }
    paint(dr, soft, BLUED.dim);
    paint(dr, lit, BLUED.silver, 0.85);
    paint(dr, polygon([[hx - R, h0], [hx - R * 0.45, h0], [hx - R * 0.45, h0 + LEN], [hx - R, h0 + LEN]]), BLUED.edge, 0.16);
    paint(dr, polygon([[hx + R * 0.55, h0], [hx + R, h0], [hx + R, h0 + LEN], [hx + R * 0.55, h0 + LEN]]), BLUED.deep, 0.55);
    paint(dr, brush([[hx + R * 0.86, h0 + LEN * 0.5], [hx + R * 0.88, h0 + LEN * 0.75], [hx + R * 0.86, h0 + LEN]], 0.5, rnd, { start: 0.1, end: 0.9, peak: 0.8, count: 10 }), FIRELIGHT, 0.8);
  });
  let grooves = '';
  let lips = '';
  for (let k = 1; k <= 9; k++) {
    const y = h0 + 4 + k * 7.6;
    grooves += brush([[hx - R - 0.1, y], [hx, y + 0.8], [hx + R + 0.1, y]], 1, rnd, { start: 1, end: 1, peak: 0.5, count: 6 });
    lips += brush([[hx - R + 0.4, y + 1.2], [hx - R * 0.3, y + 1.8], [hx + R * 0.3, y + 1.8]], 0.45, rnd, { start: 0.5, end: 0.1, peak: 0.3, count: 6 });
  }
  paint(dr, grooves, BLUED.deep);
  paint(dr, lips, BLUED.edge, 0.75);
  within(dr, outline(pommel), () => {
    damascus(dr, rnd, [[hx - R - 1.4, h0 + LEN - 2], [hx + R + 1.4, h0 + LEN - 2], [hx + R + 1.4, h0 + LEN + 5.4], [hx - R - 1.4, h0 + LEN + 5.4]], 6, { width: 0.5, rungs: 0 });
    paint(dr, touch(hx - 1.8, h0 + LEN + 0.6, 4, 1.2, 0), BLUED.edge, 0.7);
  });
  paint(dr, brush([[hx - R - 1, h0 + LEN - 0.6], [hx, h0 + LEN + 0.4], [hx + R + 1, h0 + LEN - 0.6]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }), BLUED.deep);
  // the head's faces, back to front: the back chamfer and the top, the front's two chamfers, the octagonal end, the face
  const backChamfer: [Pt, Pt, Pt, Pt] = [P(-HX, -HY, 1 - cf), P(HX, -HY, 1 - cf), P(HX, -HY + C, 1), P(-HX, -HY + C, 1)];
  const topFace: [Pt, Pt, Pt, Pt] = [P(-HX, -HY, cf), P(HX, -HY, cf), P(HX, -HY, 1 - cf), P(-HX, -HY, 1 - cf)];
  const upper: [Pt, Pt, Pt, Pt] = [P(-HX, -HY + C, 0), P(HX, -HY + C, 0), P(HX, -HY, cf), P(-HX, -HY, cf)];
  const lower: [Pt, Pt, Pt, Pt] = [P(-HX, HY - C, 0), P(HX, HY - C, 0), P(HX, HY, cf), P(-HX, HY, cf)];
  const end = [P(HX, -HY + C, 0), P(HX, -HY, cf), P(HX, -HY, 1 - cf), P(HX, -HY + C, 1), P(HX, HY - C, 1), P(HX, HY, 1 - cf), P(HX, HY, cf), P(HX, HY - C, 0)];
  const face: [Pt, Pt, Pt, Pt] = [P(-HX, -HY + C, 0), P(HX, -HY + C, 0), P(HX, HY - C, 0), P(-HX, HY - C, 0)];
  paint(dr, polygon(backChamfer), BLUED.top);
  damascus(dr, rnd, [backChamfer[0], backChamfer[3], backChamfer[2], backChamfer[1]], 4, { width: 0.6, rungs: 0, opacity: 0.6 });
  paint(dr, polygon(topFace), BLUED.top);
  damascus(dr, rnd, [topFace[0], topFace[1], topFace[2], topFace[3]], 44, { width: 0.48, rungs: 4 });
  paint(dr, polygon(end), BLUED.deep);
  damascus(dr, rnd, [end[1]!, end[2]!, end[5]!, end[6]!], 12, { width: 0.6, bright: BLUED.dim, dim: '#4a5260', rungs: 1 });
  paint(dr, polygon(lower), BLUED.dark);
  damascus(dr, rnd, [lower[0], lower[1], lower[2], lower[3]], 26, { width: 0.45, bright: BLUED.dim, dim: '#4a5260', rungs: 0, opacity: 0.8 });
  paint(dr, brush([P(-HX + 0.4, HY - 0.3, cf * 0.9), P(0, HY - 0.2, cf * 0.9), P(HX - 0.4, HY - 0.3, cf * 0.9)], 0.6, rnd, { start: 0.3, end: 0.9, peak: 0.7, count: 10 }), FIRELIGHT, 0.85);
  paint(dr, polygon(face), BLUED.base);
  damascus(dr, rnd, face, 48, { width: 0.6, rungs: 6 });
  // the polish: the sky lying across the broad face in a band, and its far end turning into shade
  within(dr, polygon(face), () => {
    paint(dr, polygon([P(-HX + 7, -HY, 0), P(-HX + 19, -HY, 0), P(-HX + 7, HY, 0), P(-HX - 5, HY, 0)]), BLUED.edge, 0.12);
    paint(dr, polygon([P(-HX + 21, -HY, 0), P(-HX + 24, -HY, 0), P(-HX + 12, HY, 0), P(-HX + 9, HY, 0)]), BLUED.edge, 0.1);
    paint(dr, polygon([P(HX - 12, -HY, 0), P(HX + 1, -HY, 0), P(HX + 1, HY, 0), P(HX - 16, HY, 0)]), BLUED.deep, 0.3);
  });
  within(dr, polygon(topFace), () => paint(dr, polygon([topFace[0], topFace[1], lerpPt(topFace[1], topFace[2], 0.35), lerpPt(topFace[0], topFace[3], 0.35)]), BLUED.edge, 0.12));
  paint(dr, polygon(upper), '#9aa3b1');
  paint(dr, brush([P(-HX + 0.4, -HY + C * 0.55, cf * 0.45), P(0, -HY + C * 0.5, cf * 0.5), P(HX - 0.4, -HY + C * 0.45, cf * 0.55)], 0.7, rnd, { start: 0.4, end: 0.8, peak: 0.6, count: 10 }), BLUED.edge);
  paint(dr, brush([P(HX, -HY + C, 0), P(HX, 0, 0), P(HX, HY - C, 0)], 0.5, rnd, { start: 0.6, end: 0.2, count: 8 }), BLUED.edge, 0.8);
  paint(dr, brush([P(-HX, -HY + C, 0), P(-HX, 0, 0), P(-HX, HY - C, 0)], 0.45, rnd, { start: 0.8, end: 0.3, count: 8 }), BLUED.edge, 0.5);
  dr.add('</g>');
  // a few embers at the stone's foot, and a few sparks
  let coals = '';
  let hearts = '';
  for (const [x, y, r] of [[50, 100.6, 1.6], [55.6, 101.4, 1.2], [45, 101.8, 1]] as const) {
    coals += outline(roundish(x, y, r * 1.3, r, rnd, { count: 7, tremor: 0.12 }));
    hearts += ellipse(x - r * 0.2, y - r * 0.2, r * 0.5, r * 0.4);
  }
  paint(dr, coals, EMBER[0]!);
  paint(dr, hearts, EMBER[2]!);
  let sparks = '';
  for (let i = 0; i < 5; i++) sparks += touch(44 + rnd() * 18, 78 + rnd() * 18, 1.4 + rnd(), 0.5, -70 - rnd() * 40);
  paint(dr, sparks, EMBER[2]!);
}

// ────────────────────────────────────────────────────────────────── şahmaran

/** A number to a tenth, as a path writes it. */
const n1 = (v: number): string => String(Math.round(v * 10) / 10);
const PAPER = '#efe5cf';
const SUMI = '#16130f';
const BODY_DARK = '#1b2016';
const SKIN_PALE = '#f2e6d8';
const WALNUT: Tone = { base: '#6c4326', light: '#93633a', shade: '#472a14' };
const GILT_LINE = '#d6ab48';
const SCALE_TONES = ['#a6ab46', '#a6ab46', '#6e8f3a', '#6e8f3a', '#cdb44c', '#4d6a30', '#3e5626', '#d8cf74'];

export function sahmaran(dr: Drawing, rnd: Rnd): void {
  // the picture is the owner's painting copied at its own proportions; `A` turns its measure (410 across) into the frame's
  const X0 = 12;
  const Y0 = 26.5;
  const K = 96 / 410;
  const W = 96;
  const H = 307 * K;
  const A = (x: number, y: number): Pt => [X0 + x * K, Y0 + y * K];
  const shape = (pts: ReadonlyArray<readonly [number, number]>, wobble = 0.14): Pt[] => tremble(pts.map(([x, y]) => A(x, y)), rnd, wobble);
  // a line laid with a brush: it swells and thins along its length, never the even line of a pen
  const ink = (pts: ReadonlyArray<readonly [number, number]>, w: number, colour = SUMI, opacity = 1): void =>
    paint(dr, brush(pts.map(([x, y]) => A(x, y)), w, rnd, { start: 0.25 + rnd() * 0.4, end: 0.15 + rnd() * 0.35, peak: 0.3 + rnd() * 0.4, count: Math.max(8, pts.length * 4) }), colour, opacity);

  // the cord it hangs by, its nail, and its shadow on the wall
  paint(dr, brush([[11, 21], [36, 13.4], [60, 8.6]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }) + brush([[109, 21], [84, 13.4], [60, 8.6]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }), '#a8302c');
  paint(dr, ellipse(60, 8.6, 1.5, 1.5), '#3a2a22');
  paint(dr, ellipse(59.6, 8.2, 0.5, 0.5), '#b9b2a8');
  paint(dr, polygon([[7.6, 23.6], [115.6, 23.6], [115.6, 107], [7.6, 107]]), FLOOR, 0.16);
  // the frame: carved walnut with a gold fillet inside, quiet, so the cream picture reads clearly within it
  const frame = tremble(runs([[6, 20.4], [114, 20.4], [114, 104.4], [6, 104.4]], 6), rnd, 0.2);
  paint(dr, outline(frame), WALNUT.base);
  within(dr, outline(frame), () => {
    paint(dr, polygon([[4, 18], [116, 18], [116, 22.4], [8.4, 22.4], [8.4, 106], [4, 106]]), WALNUT.light);
    paint(dr, polygon([[111.6, 22.4], [116, 22.4], [116, 106], [4, 106], [4, 102], [111.6, 102]]), WALNUT.shade);
    paint(dr, streaks(rnd, [6, 20, 114, 104], 24, 0, 10, 0.6), WALNUT.light, 0.4);
  });
  let carving = '';
  for (const [x, y] of [[9.2, 23.4], [110.8, 23.4], [110.8, 101.4], [9.2, 101.4]] as const) carving += touch(x, y, 3.2, 1.3, 45) + touch(x, y, 3.2, 1.3, -45);
  paint(dr, carving, WALNUT.light);
  paint(dr, polygon(tremble([[X0 - 1.4, Y0 - 1.4], [X0 + W + 1.4, Y0 - 1.4], [X0 + W + 1.4, Y0 + H + 1.4], [X0 - 1.4, Y0 + H + 1.4]], rnd, 0.1)), GILT_LINE);
  const picture = tremble(runs([[X0, Y0], [X0 + W, Y0], [X0 + W, Y0 + H], [X0, Y0 + H]], 6), rnd, 0.1);
  paint(dr, outline(picture), PAPER);

  within(dr, outline(picture), () => {
    // the paper: an uneven wash over it, and the flecks in its grain
    let wash = '';
    let darker = '';
    for (let i = 0; i < 9; i++) {
      const blot = outline(roundish(X0 + rnd() * W, Y0 + rnd() * H, 8 + rnd() * 14, 6 + rnd() * 10, rnd, { wobble: 0.18, count: 12, tremor: 1 }));
      if (i % 3) wash += blot;
      else darker += blot;
    }
    paint(dr, wash, '#f6eedd', 0.55);
    paint(dr, darker, '#e4d8bd', 0.35);
    let flecks = '';
    let motes = '';
    for (let i = 0; i < 46; i++) {
      const r = 0.1 + rnd() * 0.22;
      const f = ellipse(X0 + rnd() * W, Y0 + rnd() * H, r * (1 + rnd()), r);
      if (i % 3) flecks += f;
      else motes += f;
    }
    paint(dr, flecks, '#b6a585', 0.45);
    paint(dr, motes, '#fffaf0', 0.8);

    // the row of feet under her belly, each a black wave with its crest curling back pale
    let feet = '';
    let crests = '';
    for (const x of [104, 145, 182, 218, 262, 302]) {
      feet += outline(shape([[x - 6, 264], [x - 9, 273], [x - 5, 282], [x + 3, 287.6], [x + 14, 288], [x + 22, 285], [x + 14, 283.6], [x + 9, 280], [x + 7, 273], [x + 8, 264]], 0.1));
      crests += brush([A(x - 3, 271), A(x - 4, 277), A(x, 281.4), A(x + 4.4, 280)], 0.55, rnd, { start: 0.3, end: 0.6, peak: 0.6, count: 8 });
    }
    paint(dr, feet, SUMI);
    paint(dr, crests, PAPER, 0.9);

    // her body: one great U, rising on the left to the serpent's head and running along the bottom to the queen; dark,
    // brushed, and scaled with dabs of green and gold of every size and tone
    const outer: Array<[number, number]> = [[62, 72], [50, 90], [36, 108], [25, 128], [20, 148], [21, 170], [28, 192], [40, 212], [56, 234], [72, 252], [88, 264], [115, 268], [160, 270], [220, 270], [280, 270], [330, 268], [352, 262], [360, 245], [362, 215], [359, 185]];
    const inner: Array<[number, number]> = [[345, 178], [300, 184], [255, 176], [222, 168], [200, 176], [165, 180], [130, 182], [100, 180], [78, 170], [64, 152], [66, 128], [80, 110], [97, 96], [108, 90]];
    const body = shape([...outer, ...inner], 0.3);
    paint(dr, outline(body), BODY_DARK);
    within(dr, outline(body), () => {
      paint(dr, streaks(rnd, [X0, Y0 + 15, X0 + W, Y0 + H], 40, 10, 9, 1.2), '#2b3324', 0.6);
      const spine: Array<[number, number, number]> = [[100, 90, 12], [80, 104, 17], [60, 122, 21], [44, 145, 22], [40, 170, 24], [48, 198, 29], [66, 224, 35], [98, 232, 39], [140, 228, 42], [190, 226, 44], [240, 226, 45], [290, 226, 44], [330, 224, 42], [358, 220, 38]];
      const N = 90;
      const line = along(spine.map(([x, y]) => A(x, y)), N);
      const widths = along(spine.map(([, , w], i): Pt => [i, w * K]), N).map(([, w]) => w);
      const run = [0];
      for (let i = 1; i <= N; i++) run.push(run[i - 1]! + Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]));
      const dabs: string[] = SCALE_TONES.map(() => '');
      let marks = '';
      for (let d = 0.6, i = 0, n = 0; d < run[N]!; d += 2.3, n++) {
        while (i < N - 1 && run[i + 1]! < d) i++;
        const a = line[Math.max(0, i - 1)]!;
        const b = line[Math.min(N, i + 1)]!;
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const [tx, ty] = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
        const [nx, ny] = [-ty, tx];
        const w = widths[i]!;
        const size = Math.max(0.55, Math.min(1, w / 8.5));
        const rows = Math.max(2, Math.round(w / (2.05 * size)));
        const deg = (Math.atan2(ty, tx) * 180) / Math.PI;
        for (let j = -rows; j <= rows; j++) {
          const o = (j / rows) * w;
          const slide = (j % 2 ? 1.15 : 0) * size;
          const [cx, cy] = [line[i]![0] + nx * o + tx * slide + (rnd() - 0.5) * 0.3, line[i]![1] + ny * o + ty * slide + (rnd() - 0.5) * 0.3];
          const len = (1.8 + rnd() * 0.7) * size;
          const tone = Math.floor(rnd() * SCALE_TONES.length);
          dabs[tone] += touch(cx, cy, len, len * (0.7 + rnd() * 0.18), deg + (rnd() - 0.5) * 24);
          if (rnd() < 0.4) marks += touch(cx + tx * len * 0.1, cy + ty * len * 0.1, len * 0.45, len * 0.18, deg + 90);
        }
        void n;
      }
      for (let t = 0; t < SCALE_TONES.length; t++) paint(dr, dabs[t]!, SCALE_TONES[t]!, 0.95);
      paint(dr, marks, '#2c3a20', 0.8);
      // where the paint thinned at its edges, the paper shows through in dry strokes
      let dry = '';
      for (let i = 0; i < 18; i++) {
        const [x, y] = A(...outer[2 + Math.floor(rnd() * (outer.length - 4))]!);
        dry += touch(x + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 3, 2 + rnd() * 2.6, 0.3 + rnd() * 0.3, rnd() * 180);
      }
      paint(dr, dry, PAPER, 0.35);
    });
    ink(outer.slice(0, 8), 1.1);
    ink(outer.slice(7, 14), 1.2);
    ink(outer.slice(13), 1);
    ink(inner.slice(4), 0.9);

    // her hair, black and brushed, framing her face and falling past her shoulders into her body
    const hairLeft = shape([[262, 96], [256, 118], [250, 140], [240, 160], [226, 172], [210, 180], [194, 187], [206, 189], [224, 185], [246, 177], [264, 166], [275, 152], [279, 128], [281, 104]], 0.2);
    const hairRight = shape([[344, 96], [350, 114], [356, 140], [360, 170], [362, 205], [360, 232], [352, 254], [343, 246], [344, 220], [340, 192], [334, 164], [330, 136], [328, 108]], 0.2);
    for (const hair of [hairLeft, hairRight]) {
      paint(dr, outline(hair), '#141110');
      within(dr, outline(hair), () => {
        paint(dr, streaks(rnd, [X0 + 180 * K, Y0 + 90 * K, X0 + 370 * K, Y0 + 260 * K], 16, 70, 8, 0.6), '#34302b', 0.7);
        paint(dr, streaks(rnd, [X0 + 180 * K, Y0 + 90 * K, X0 + 370 * K, Y0 + 260 * K], 5, 70, 6, 0.3), PAPER, 0.25);
      });
    }

    // her neck and breast, pale
    const breast = shape([[268, 160], [286, 150], [324, 150], [338, 162], [346, 190], [300, 188], [262, 180]], 0.1);
    paint(dr, outline(breast), SKIN_PALE);
    within(dr, outline(breast), () => paint(dr, polygon([A(318, 148), A(340, 148), A(348, 192), A(324, 192)]), '#e5d3bf', 0.7));
    ink([[322, 150], [328, 166], [338, 182]], 0.5, '#6a4a36', 0.8);

    // the cape of feathered scales at her shoulders: yellow with orange teeth, orange with red, red, and green tips
    const capeTop: Pt[] = along([A(206, 182), A(240, 172), A(270, 174), A(300, 182), A(330, 187), A(352, 190)], 24);
    const capeFoot: Pt[] = along([A(210, 216), A(250, 228), A(290, 235), A(325, 236), A(352, 232)], 24);
    const between = (f: number): Pt[] => capeTop.map((p, i) => [p[0] + (capeFoot[i]![0] - p[0]) * f, p[1] + (capeFoot[i]![1] - p[1]) * f]);
    const bandOf = (f0: number, f1: number): string => polygon([...between(f0), ...between(f1).reverse()]);
    const cape = tremble([...between(-0.02), ...between(1.02).reverse()], rnd, 0.12);
    paint(dr, outline(cape), SUMI);
    within(dr, outline(cape), () => {
      paint(dr, bandOf(-0.05, 0.3), '#efc03c');
      paint(dr, bandOf(0.3, 0.56), '#d9622a');
      paint(dr, bandOf(0.56, 0.8), '#b8361f');
      paint(dr, bandOf(0.8, 1.05), '#3c5a24');
      const teeth = (f0: number, f1: number, down: boolean): string => {
        const a = between(f0);
        const b = between(f1);
        let d = '';
        for (let i = 0; i + 2 < a.length; i += 2) d += down ? polygon([a[i]!, a[i + 2]!, b[i + 1]!]) : polygon([b[i]!, b[i + 2]!, a[i + 1]!]);
        return d;
      };
      paint(dr, teeth(0.04, 0.27, true), '#e07a2a');
      paint(dr, teeth(0.33, 0.54, false), '#a5301f');
      let dots = '';
      for (const p of between(0.44).filter((_, i) => i % 2)) dots += ellipse(p[0], p[1], 0.45, 0.45);
      paint(dr, dots, '#f2c44a');
      let tips = '';
      const row = between(0.88);
      for (let i = 1; i < row.length; i += 2) tips += touch(row[i]![0], row[i]![1] + 0.4, 2.4, 1.8, 0);
      paint(dr, tips, '#79a23e');
      let scallops = '';
      for (const f of [0.62, 0.72]) {
        const r2 = between(f);
        for (let i = 0; i + 2 < r2.length; i += 2) scallops += `M${n1(r2[i]![0])} ${n1(r2[i]![1])}Q${n1(r2[i + 1]![0])} ${n1(r2[i + 1]![1] + 1.6)} ${n1(r2[i + 2]![0])} ${n1(r2[i + 2]![1])}`;
      }
      dr.add(`<path d="${scallops}" fill="none" stroke="#e98a3a" stroke-width="0.45"/>`);
      paint(dr, streaks(rnd, [X0 + 200 * K, Y0 + 170 * K, X0 + 360 * K, Y0 + 240 * K], 12, 8, 6, 0.4), PAPER, 0.22);
    });
    paint(dr, brush(between(0.3), 0.35, rnd, { start: 1, end: 1, peak: 0.5, count: 20 }) + brush(between(0.56), 0.35, rnd, { start: 1, end: 1, peak: 0.5, count: 20 }), SUMI, 0.7);

    // her necklace: a red choker, a row of gold beads, gold drops hanging from it, and a heart
    ink([[290, 151], [305, 156], [320, 151]], 0.9, '#b8301f');
    let beads = '';
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = 284 + t * 42;
      beads += ellipse(...A(x, 158 + Math.sin(t * Math.PI) * 9), 0.5, 0.5);
    }
    paint(dr, beads, '#e0aa3e');
    let drops = '';
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const [x, y] = A(281 + t * 48, 163 + Math.sin(t * Math.PI) * 10);
      drops += polygon([[x, y - 0.2], [x + 0.75, y + 1], [x, y + 2.2], [x - 0.75, y + 1]]);
    }
    paint(dr, drops, '#dba43a');
    const [hx, hy] = A(301, 182);
    const heart = (s: number): string => `M${n1(hx)} ${n1(hy + 2.6 * s)}c${n1(-3.4 * s)} ${n1(-2 * s)} ${n1(-3.9 * s)} ${n1(-4.6 * s)} ${n1(-1.9 * s)} ${n1(-5.4 * s)}c${n1(1 * s)} ${n1(-0.4 * s)} ${n1(1.6 * s)} ${n1(0.2 * s)} ${n1(1.9 * s)} ${n1(0.8 * s)}c${n1(0.3 * s)} ${n1(-0.6 * s)} ${n1(0.9 * s)} ${n1(-1.2 * s)} ${n1(1.9 * s)} ${n1(-0.8 * s)}c${n1(2 * s)} ${n1(0.8 * s)} ${n1(1.5 * s)} ${n1(3.4 * s)} ${n1(-1.9 * s)} ${n1(5.4 * s)}Z`;
    paint(dr, heart(1.05), '#c58a28');
    paint(dr, heart(0.8), '#e0782a');
    paint(dr, heart(0.45), '#c8302a');

    // her face: pale, gentle, painted plainly in the old way
    const face = shape([[305, 99], [318, 101], [326, 110], [328, 125], [324, 140], [315, 149], [305, 152], [294, 149], [285, 140], [281, 125], [283, 110], [292, 101]], 0.1);
    paint(dr, outline(face), SKIN_PALE);
    within(dr, outline(face), () => {
      paint(dr, outline(shape([[318, 104], [330, 112], [330, 140], [316, 152], [322, 132]], 0.05)), '#e7d5c3', 0.8);
      paint(dr, touch(...A(289, 132), 3, 1.6, 0) + touch(...A(320, 132), 3, 1.6, 0), '#e8a090', 0.35);
    });
    ink([[284, 112], [281, 126], [285, 140], [296, 150], [306, 152]], 0.55, '#5a3a2a', 0.85);
    ink([[316, 149], [324, 140], [327, 124]], 0.45, '#5a3a2a', 0.6);
    for (const [x0, x1, y] of [[286, 298, 114], [310, 322, 114]] as const) {
      const mid = (x0 + x1) / 2;
      paint(dr, polygon(shape([[x0, y], [mid - 2, y - 2.4], [mid + 2, y - 2.4], [x1, y], [mid + 2, y + 2], [mid - 2, y + 2]], 0.02)), '#fbf6ee');
      paint(dr, ellipse(...A(mid + (x0 < 300 ? 1 : -1), y), 0.55, 0.6), '#3a2a22');
      ink([[x0 - 1, y + 0.4], [mid, y - 2.8], [x1 + 1, y]], 0.5);
      ink([[x0 + 1, y + 1.2], [mid, y + 2.6], [x1 - 1, y + 1]], 0.22, '#6a4a3a', 0.7);
    }
    ink([[284, 108], [291, 105], [298, 107]], 0.32, '#3a2620');
    ink([[309, 107], [316, 105], [323, 108]], 0.32, '#3a2620');
    ink([[307, 112], [305, 122], [302, 128], [305, 130]], 0.26, '#8a5a44', 0.8);
    paint(dr, polygon(shape([[297, 137], [302, 134.4], [305, 135.6], [308, 134.4], [313, 137], [305, 138.6]], 0.03)), '#a8282a');
    paint(dr, polygon(shape([[298, 137.6], [305, 138.4], [312, 137.6], [309, 141.6], [305, 142.4], [301, 141.6]], 0.03)), '#c63a3a');
    paint(dr, touch(...A(305, 140), 2, 0.5, 0), '#e8807a', 0.8);

    // the horns, black, curving up and out from under the crown, a green ram's horn curled on each with drops hanging
    paint(dr, brush([A(268, 100), A(252, 72), A(236, 44), A(222, 22), A(210, 6)], 3.8, rnd, { start: 1, end: 0.02, peak: 0.03, count: 20 }), SUMI);
    paint(dr, brush([A(340, 100), A(354, 72), A(366, 46), A(376, 28), A(386, 14)], 3.8, rnd, { start: 1, end: 0.02, peak: 0.03, count: 20 }), SUMI);
    const curl = (cx: number, cy: number, s: number): void => {
      const pts: Pt[] = [];
      for (let i = 0; i <= 18; i++) {
        const a = -Math.PI * 0.15 + s * (i / 18) * Math.PI * 2.1;
        const r = 3.5 * (1 - (i / 18) * 0.72);
        pts.push([A(cx, cy)[0] + Math.cos(a) * r * s, A(cx, cy)[1] - Math.sin(a) * r]);
      }
      const coil = brush(pts, 2.4, rnd, { start: 1, end: 0.35, peak: 0.1, count: 26 });
      paint(dr, brush(pts, 3, rnd, { start: 1, end: 0.4, peak: 0.1, count: 26 }), '#2c3a1a');
      paint(dr, coil, '#6f9b3b');
      within(dr, coil, () => {
        let stripes = '';
        for (let i = 1; i < 17; i += 2) stripes += touch(pts[i]![0], pts[i]![1], 2.6, 0.5, (Math.atan2(pts[i + 1]![1] - pts[i - 1]![1], pts[i + 1]![0] - pts[i - 1]![0]) * 180) / Math.PI + 90);
        paint(dr, stripes, '#3f6424');
        paint(dr, brush(pts.slice(0, 12).map(([x, y]): Pt => [x - 0.4, y - 0.4]), 0.6, rnd, { start: 0.6, end: 0.2, count: 16 }), '#c3d878', 0.8);
      });
    };
    curl(240, 76, 1);
    curl(370, 77, -1);
    let chains = '';
    let charms = '';
    for (const [x, y, l] of [[240, 90, 26], [254, 104, 28], [366, 92, 26], [349, 106, 40]] as const) {
      chains += brush([A(x, y), A(x + 1, y + l)], 0.3, rnd, { start: 1, end: 1, count: 4 });
      for (let k = 6; k < l; k += 6) charms += ellipse(...A(x + k / l, y + k), 0.42, 0.42);
      const [dx, dy] = A(x + 1, y + l + 4);
      paint(dr, polygon([[dx, dy - 1.6], [dx + 0.9, dy + 0.2], [dx, dy + 1.4], [dx - 0.9, dy + 0.2]]), '#c8302a');
    }
    paint(dr, chains, '#8a6a2a');
    paint(dr, charms, '#e0aa3e');

    // the crown: an arched band over her brow with an eye painted in it, gold flames above it round a green leaf, and a
    // gold cup at its peak
    const flames = shape([[284, 86], [281, 60], [288, 70], [289, 42], [296, 60], [300, 34], [305, 52], [310, 34], [314, 60], [321, 42], [322, 70], [329, 60], [326, 86]], 0.08);
    paint(dr, polygon(flames), '#f0c23e');
    within(dr, polygon(flames), () => {
      let tongues = '';
      for (const [x, top] of [[287, 52], [295, 48], [315, 48], [323, 52]] as const) tongues += touch(...A(x, (top + 84) / 2), (84 - top) * K * 0.9, 1.3, 90);
      paint(dr, tongues, '#e07a2a');
      paint(dr, streaks(rnd, [X0 + 280 * K, Y0 + 34 * K, X0 + 330 * K, Y0 + 86 * K], 8, 90, 5, 0.4), '#c8501e', 0.4);
    });
    paint(dr, brush(flames.slice(0, 7), 0.35, rnd, { start: 0.8, end: 0.8, count: 20 }) + brush(flames.slice(6), 0.35, rnd, { start: 0.8, end: 0.8, count: 20 }), '#a8501a', 0.8);
    const leaf = shape([[310, 42], [319, 62], [310, 84], [301, 62]], 0.06);
    paint(dr, polygon(leaf), '#5f9a38');
    paint(dr, brush([A(310, 46), A(310, 64), A(310, 82)], 0.45, rnd, { count: 8 }), '#e3c24a');
    let leafDots = '';
    for (const [x, y] of [[306, 58], [314, 58], [306, 70], [314, 70], [310, 52]] as const) leafDots += ellipse(...A(x, y), 0.4, 0.4);
    paint(dr, leafDots, '#c8302a');
    const band = shape([[262, 99], [282, 87], [305, 80], [328, 87], [346, 99], [346, 106], [328, 96], [305, 92], [282, 96], [262, 106]], 0.08);
    paint(dr, polygon(band), '#e3ae3a');
    within(dr, polygon(band), () => {
      paint(dr, polygon([A(258, 101), A(282, 91.6), A(305, 87.4), A(328, 91.6), A(350, 101), A(350, 110), A(258, 110)]), '#c8302a', 0.9);
      paint(dr, outline(shape([[294, 87], [305, 83], [316, 87], [305, 91]], 0.02)), '#c8302a');
      paint(dr, ellipse(...A(305, 87), 0.9, 0.7), '#f2c44a');
      let gems = '';
      for (const x of [272, 284, 326, 338]) gems += ellipse(...A(x, 95.6 - Math.sin(((x - 262) / 84) * Math.PI) * 7), 0.55, 0.55);
      paint(dr, gems, '#c8302a');
    });
    paint(dr, brush([A(262, 99), A(282, 87), A(305, 80), A(328, 87), A(346, 99)], 0.4, rnd, { start: 0.8, end: 0.8, count: 16 }), '#7a4a1a', 0.8);
    const cup = shape([[293, 12], [317, 12], [305, 31]], 0.05);
    paint(dr, polygon(cup), '#e3ae3a');
    paint(dr, polygon(shape([[298, 15], [312, 15], [305, 26]], 0.03)), '#c8302a');
    paint(dr, outline(roundish(...A(305, 7), 1.1, 1, rnd, { count: 8, tremor: 0.1 })), '#c8302a');
    paint(dr, brush([A(293, 12), A(305, 31), A(317, 12)], 0.3, rnd, { count: 8 }), '#7a4a1a', 0.8);

    // the serpent's head at the top of the left, its jaw open and toothed, its forked tongue reaching across to her
    paint(dr, brush([A(166, 62), A(186, 56), A(204, 50)], 0.75, rnd, { start: 1, end: 0.8, peak: 0.4, count: 8 }) + brush([A(203, 50), A(216, 44.6)], 0.5, rnd, { count: 4 }) + brush([A(203, 50), A(214, 54.6)], 0.5, rnd, { count: 4 }), '#c8505a');
    const head = shape([[58, 76], [64, 64], [80, 54], [100, 48], [126, 45], [148, 44], [164, 44], [172, 48], [170, 53], [156, 57], [142, 62], [156, 63], [170, 64], [174, 68], [160, 73], [140, 82], [118, 92], [100, 99], [84, 104], [68, 100]], 0.12);
    paint(dr, outline(head), '#1c1612');
    within(dr, outline(head), () => {
      let specks = '';
      for (let i = 0; i < 34; i++) {
        const [x, y] = A(70 + rnd() * 90, 52 + rnd() * 44);
        specks += touch(x, y, 0.7 + rnd() * 0.5, 0.45, rnd() * 180);
      }
      paint(dr, specks, '#a5a94a', 0.85);
      paint(dr, brush([A(84, 56), A(120, 48), A(160, 47)], 0.7, rnd, { start: 0.2, end: 0.2, count: 10 }), '#4a4436', 0.8);
    });
    let teeth = '';
    for (let x = 145; x < 170; x += 4.4) {
      const [ux, uy] = A(x, 58 - (x - 140) * 0.1);
      const [lx, ly] = A(x + 2, 64.6);
      teeth += polygon([[ux - 0.45, uy], [ux + 0.45, uy], [ux, uy + 1.1]]) + polygon([[lx - 0.4, ly], [lx + 0.4, ly], [lx, ly - 0.9]]);
    }
    paint(dr, teeth, '#f6f0e2');
    paint(dr, brush([A(142, 62), A(156, 61), A(171, 60)], 0.4, rnd, { count: 6 }), '#c8505a');
    paint(dr, ellipse(...A(113, 57.4), 0.75, 0.6) + ellipse(...A(117.6, 57.6), 0.5, 0.45) + ellipse(...A(160, 47.4), 0.35, 0.3), '#f4eee0');
    // the beaded collar where its neck begins
    const collar = shape([[54, 66], [66, 68], [72, 84], [78, 100], [81, 114], [72, 118], [63, 105], [57, 88], [50, 74]], 0.08);
    paint(dr, outline(collar), '#efc03c');
    within(dr, outline(collar), () => {
      let red = '';
      for (let k = 0; k < 7; k++) red += outline(roundish(...A(54 + k * 3.6, 70 + k * 7), 1.1, 0.9, rnd, { count: 7, tremor: 0.08 }));
      paint(dr, red, '#c8382c');
      paint(dr, brush([A(66, 70), A(74, 92), A(78, 112)], 0.7, rnd, { count: 8 }), '#e0782a');
    });
    ink([[50, 74], [56, 92], [64, 108], [72, 118]], 0.4, '#7a3a1a', 0.8);
    // its own crown: a fan of gold, a red-edged petal in its middle, green petals dotted red either side, small red
    // flowers along its rim
    const fan = shape([[32, 38], [44, 32], [56, 26], [62, 16], [70, 8], [80, 4], [90, 3], [100, 6], [106, 12], [112, 18], [124, 16], [140, 10], [160, 4], [152, 16], [140, 28], [128, 38], [116, 46], [100, 50], [84, 50], [68, 47], [52, 44]], 0.1);
    paint(dr, outline(fan), '#f0c540');
    within(dr, outline(fan), () => {
      paint(dr, streaks(rnd, [X0 + 30 * K, Y0, X0 + 160 * K, Y0 + 50 * K], 14, -60, 6, 0.5), '#e9a634', 0.5);
      paint(dr, outline(shape([[84, 48], [70, 40], [64, 28], [76, 28], [88, 42]], 0.05)) + outline(shape([[104, 48], [112, 32], [124, 28], [120, 42], [108, 50]], 0.05)), '#a8b84a');
      const petal = shape([[92, 49], [87, 32], [95, 15], [103, 32], [100, 49]], 0.05);
      paint(dr, outline(petal), '#b8301f');
      paint(dr, outline(scaleAbout(petal, ...A(96, 34), 0.72, 0.84)), '#e2782a');
      paint(dr, brush([A(95, 46), A(95, 32), A(95, 20)], 0.4, rnd, { count: 6 }), '#f2c44a');
      let dots = '';
      for (const [x, y] of [[74, 34], [80, 40], [114, 36], [118, 42], [70, 30]] as const) dots += ellipse(...A(x, y), 0.35, 0.35);
      paint(dr, dots, '#c8302a');
      let flowers = '';
      let hearts = '';
      for (const [x, y] of [[74, 13], [88, 9], [104, 14], [58, 30], [140, 18]] as const) {
        flowers += outline(roundish(...A(x, y), 1.1, 1.1, rnd, { count: 8, tremor: 0.1 }));
        hearts += ellipse(...A(x, y), 0.4, 0.4);
      }
      paint(dr, flowers, '#c8382c');
      paint(dr, hearts, '#f6d36a');
    });
    paint(dr, brush(fan.slice(0, 12), 0.35, rnd, { start: 0.8, end: 0.8, count: 30 }) + brush(fan.slice(11), 0.35, rnd, { start: 0.8, end: 0.8, count: 30 }), '#c06a1e', 0.85);
  });
}
