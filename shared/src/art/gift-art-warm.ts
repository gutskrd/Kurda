/**
 * The warm gifts and the music (gift-art.ts): a glass of tea on its saucer, a cup of Kurdish coffee on a kilim, a red
 * apple, a samovar on its tray, a frame drum and a saz.
 */
import { type Drawing, type Pt } from './svg.js';
import { along, band, brush, CHINA, ellipse, FLOOR, floor, form, GOLD, INK, leaf, lerp, outline, paint, polygon, rest, roundish, runs, scaleAbout, shift, side, slab, streaks, sugar, touch, tremble, within, type Rnd, type Tone } from './gift-paint.js';

// ───────────────────────────────────────────────────────────────────── çay

/**
 * The tea glass's half-width down its height, in the units of the owner's painting it is traced from (512 across): widest
 * at the lip, drawn in slowly to a waist, swelling as slowly to a belly low down and quickly in to a small foot. Measured,
 * because a tea glass drawn by eye comes out a tumbler.
 */
const TEA_GLASS: readonly Pt[] = [
  [85, 140], [107, 135], [120, 128.5], [134, 119.5], [148, 112], [161, 106], [175, 103], [189, 101], [203, 99.5], [216, 98.5], [230, 98],
  [244, 100], [260, 104], [282, 108.5], [304, 111.5], [326, 114], [348, 115], [369, 112.5], [391, 104], [413, 90], [429, 76], [438, 69],
];

const TEA: Tone = { base: '#a3301a', light: '#e2762f', shade: '#5c150c' };

export function cay(dr: Drawing, rnd: Rnd): void {
  const k = 0.2;
  const X = 60;
  const row = (v: number): number => 12 + v * k;
  const halfAt = (v: number): number => {
    let i = TEA_GLASS.findIndex(([r]) => r >= v);
    if (i < 0) i = TEA_GLASS.length - 1;
    i = Math.max(1, i);
    const [ra, wa] = TEA_GLASS[i - 1]!;
    const [rb, wb] = TEA_GLASS[i]!;
    return (wa + ((wb - wa) * (v - ra)) / (rb - ra)) * k;
  };
  // the glass from row `from` to row `to`, `inset` in from its outside, with the far edge of an ellipse across its top
  // (`lid` deep) and the near edge of one across its foot, as a round thing seen from a little above has
  const body = (inset: number, from: number, to: number, lid: number, foot: number): Pt[] => {
    const rows: Pt[] = [[from, halfAt(from) - inset], ...TEA_GLASS.filter(([r]) => r > from && r < to).map(([r, w]): Pt => [r, w * k - inset]), [to, halfAt(to) - inset]];
    const out: Pt[] = rows.map(([r, w]): Pt => [X - w, row(r)]);
    const [rb, wb] = rows[rows.length - 1]!;
    for (let i = 1; i < 8; i++) out.push([X + wb * Math.cos(Math.PI - (i / 8) * Math.PI), row(rb) + foot * Math.sin(Math.PI - (i / 8) * Math.PI)]);
    for (const [r, w] of rows.slice().reverse()) out.push([X + w, row(r)]);
    const [rt, wt] = rows[0]!;
    for (let i = 1; i < 8; i++) out.push([X + wt * Math.cos(-(i / 8) * Math.PI), row(rt) + lid * Math.sin(-(i / 8) * Math.PI)]);
    return out;
  };

  // the saucer, broad and seen from above, its edge scalloped; a shape on it is given round the plate's own circle
  const S = { x: 60, y: row(374), rx: 226 * k, ry: 122 * k };
  const plate = (u: number, v: number): Pt => [S.x + u * S.rx, S.y + v * S.ry];
  const edge: Pt[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r = 1 + 0.02 * Math.cos(a * 12 + 0.4);
    edge.push(plate(Math.cos(a) * r, Math.sin(a) * r));
  }
  const saucer = tremble(edge, rnd, 0.25);
  floor(dr, rnd, S.x + 3, S.y + 3.5, S.rx, S.ry);
  paint(dr, outline(slab(saucer, 1.6)), CHINA.shade);
  paint(dr, outline(saucer), CHINA.base);
  side(dr, saucer, 2.2, 1.7, CHINA.shade, { grow: 0.975 });
  within(dr, outline(saucer), () => paint(dr, streaks(rnd, [S.x - S.rx, S.y - S.ry, S.x + S.rx, S.y + S.ry], 40, 0, 6, 0.7), CHINA.shade, 0.3));
  band(dr, saucer, scaleAbout(saucer, S.x, S.y, 0.975, 0.965), GOLD);
  band(dr, roundish(S.x, S.y + 5.2, 26.4, 13.4, rnd, { tremor: 0.2 }), roundish(S.x, S.y + 5.4, 25.2, 12.5, rnd, { tremor: 0.2 }), CHINA.shade);
  // coral strokes round the rim, each pointing at the middle, and a gold sprig between each and the next
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    const [vx, vy] = [-uy, ux];
    const stroke: Pt[] = [];
    for (let j = 0; j < 14; j++) {
      const t = (j / 14) * Math.PI * 2;
      const al = 0.72 + Math.cos(t) * 0.17;
      const ac = Math.sin(t) * (0.095 + 0.025 * Math.cos(t));
      stroke.push(plate(ux * al + vx * ac, uy * al + vy * ac));
    }
    const coral = tremble(stroke, rnd, 0.35);
    paint(dr, outline(coral), '#dc6748');
    side(dr, coral, 0.7, 0.7, '#f1977a');
    const b = a + Math.PI / 8;
    const [gx, gy] = plate(Math.cos(b) * 0.8, Math.sin(b) * 0.8);
    const near = 0.62 + 0.38 * Math.max(0, Math.sin(b));
    for (const t of [-1, 0, 1]) paint(dr, touch(gx + t * 1.6 * near, gy - Math.abs(t) * 0.5, 2.4 * near, 0.8 * near, t * 42), '#b5862e');
    paint(dr, ellipse(gx, gy + 0.9 * near, 0.55 * near, 0.5 * near), '#6a4a1e');
  }
  // what the glass casts: grey to its right, and before its foot the light that has come through the tea
  paint(dr, outline(roundish(X + 15, row(442), 17, 4.6, rnd)), CHINA.shade);
  paint(dr, outline(roundish(X + 6, row(466), 9.5, 2.8, rnd)), '#ee9645', 0.75);
  paint(dr, outline(roundish(X, row(441), 15, 2.6, rnd)), '#3a2418', 0.4);

  // a sugar cube on the plate, for the glass is drunk through one held in the teeth
  sugar(dr, rnd, ...plate(-0.67, 0.34), 6.4, CHINA.shade);

  // the glass above the tea is clear: no colour of its own, only a breath of the room's light, so whatever page it is on
  // shows through it
  const outside = tremble(body(0, 85, 438, 61 * k, 11 * k), rnd, 0.1);
  const RIM = { y: row(85), rx: 140 * k, ry: 61 * k };
  const mouth = roundish(X, RIM.y, RIM.rx, RIM.ry, rnd, { wobble: 0.005, tremor: 0.1 });
  paint(dr, outline(outside), '#ffffff', 0.08);
  within(dr, outline(mouth), () => {
    paint(dr, brush([[X - 4, row(36)], [X + 14, row(34)], [X + 24, row(58)]], 5, rnd, { start: 0.5, end: 0.2 }), '#ffffff', 0.9);
    paint(dr, brush([[X - 25, row(80)], [X - 20, row(50)], [X - 12, row(36)]], 3.4, rnd, { start: 0.6, end: 0.2 }), '#ffffff', 0.6);
    paint(dr, brush([[X - 10, row(32)], [X - 6, row(58)], [X - 5, row(84)]], 1.4, rnd), '#9a94a0', 0.35);
  });

  // the tea: red, dark where the round glass turns it from the light, amber where the light comes through
  const tea = tremble(body(1.1, 121, 428, 25 * k, 9 * k), rnd, 0.08);
  const lens = (v: number, depth: number, reach: number, off: number): string => {
    const w = (halfAt(v) + 1.4) * reach;
    const cx = X + off * halfAt(v);
    const sag = w * 0.36;
    const y = row(v);
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push([cx - w + 2 * w * t, y + (sag + depth * k) * 4 * t * (1 - t)]);
    }
    for (let i = 9; i > 0; i--) {
      const t = i / 10;
      pts.push([cx - w + 2 * w * t, y + (sag - depth * k) * 4 * t * (1 - t)]);
    }
    return outline(tremble(pts, rnd, 1.1));
  };
  paint(dr, outline(tea), TEA.base);
  within(dr, outline(tea), () => {
    paint(dr, lens(148, 28, 0.94, 0), TEA.light);
    paint(dr, lens(204, 46, 0.84, -0.08), TEA.shade, 0.85);
    paint(dr, lens(298, 38, 0.6, 0.32), TEA.shade, 0.8);
    paint(dr, lens(390, 30, 0.76, -0.04), TEA.light);
    dr.add(`<path d="${outline(tea)}${outline(scaleAbout(tea, X, row(280), 0.82, 1))}" fill="${TEA.shade}" fill-rule="evenodd" fill-opacity="0.55"/>`);
    paint(dr, streaks(rnd, [X - 24, row(130), X + 24, row(420)], 34, 88, 10, 0.8), TEA.shade, 0.3);
    paint(dr, streaks(rnd, [X - 20, row(170), X + 20, row(340)], 14, 92, 9, 0.7), TEA.light, 0.25);
  });
  // its surface in the mouth of the glass, lit along its far edge
  within(dr, outline(mouth), () => {
    const top = roundish(X, row(121), 111 * k, 25 * k, rnd, { wobble: 0.005, tremor: 0.15 });
    paint(dr, outline(top), TEA.light);
    paint(dr, outline(roundish(X + 5, row(127), 12, 1.8, rnd)), TEA.shade, 0.5);
    paint(dr, brush(along([[X - 19, row(115)], [X, row(98)], [X + 19, row(115)]], 8), 0.9, rnd, { start: 0.3, end: 0.3, peak: 0.5 }), '#f8b768');
  });

  // the glass itself: its foot, the line round it, the lip, and the white lights down it
  const foot = body(0, 424, 438, 0, 11 * k);
  paint(dr, outline(foot), '#ffffff', 0.1);
  paint(dr, brush([[X - 10, row(441)], [X - 1, row(450)], [X + 7, row(444)]], 0.8, rnd), '#fbf7f0', 0.85);
  const left = TEA_GLASS.map(([r, w]): Pt => [X - w * k, row(r)]);
  const right = TEA_GLASS.map(([r, w]): Pt => [X + w * k, row(r)]);
  const footArc: Pt[] = [];
  for (let i = 0; i <= 8; i++) footArc.push([X - 69 * k * Math.cos((i / 8) * Math.PI), row(438) + 11 * k * Math.sin((i / 8) * Math.PI)]);
  paint(dr, brush(left, 1.05, rnd, { start: 0.7, end: 0.6, peak: 0.5, count: 30 }), INK);
  paint(dr, brush(right, 1.05, rnd, { start: 0.7, end: 0.6, peak: 0.5, count: 30 }), INK);
  paint(dr, brush(footArc, 0.8, rnd, { start: 0.6, end: 0.6, peak: 0.5 }), INK);
  const near: Pt[] = [];
  const far: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    near.push([X - RIM.rx * Math.cos(a), RIM.y + RIM.ry * Math.sin(a)]);
    far.push([X - RIM.rx * Math.cos(a), RIM.y - RIM.ry * Math.sin(a)]);
  }
  paint(dr, brush(near, 1, rnd, { start: 0.6, end: 0.6, peak: 0.5, count: 24 }), INK);
  paint(dr, brush(far, 0.6, rnd, { start: 0.8, end: 0.5, peak: 0.4, count: 24 }), INK, 0.8);
  paint(dr, brush(near.slice(1, 6), 0.8, rnd), '#ffffff', 0.9);
  // where the glass is empty its edges are caught by the light, fine and pale beside the ink, so they hold on a dark page
  const glint = { start: 0.4, end: 0.4, peak: 0.5, count: 9 };
  const inside = (pts: Pt[], dx: number): Pt[] => pts.map(([x, y]): Pt => [x + dx, y]);
  paint(dr, brush(near.map(([x, y]): Pt => [x, y - 0.7]), 0.45, rnd, glint) + brush(far.map(([x, y]): Pt => [x, y + 0.6]), 0.4, rnd, glint) +
    brush(inside(left.slice(0, 4), 0.8), 0.45, rnd, glint) + brush(inside(right.slice(0, 4), -0.8), 0.45, rnd, glint), '#eef2f4', 0.8);
  const light = (at: number, from: number, to: number, width: number, opacity: number): void => {
    const pts: Pt[] = [];
    for (let v = from; v <= to; v += 14) pts.push([X + at * halfAt(v), row(v)]);
    paint(dr, brush(pts, width, rnd, { start: 0.3, end: 0.05 }), '#fffaf3', opacity);
  };
  light(-0.8, 150, 262, 1.4, 0.85);
  light(-0.62, 170, 356, 0.7, 0.75);
  light(-0.18, 168, 320, 0.5, 0.6);
  light(0.82, 300, 392, 0.7, 0.5);
  paint(dr, brush([[X + 11, row(330)], [X + 11.6, row(340)], [X + 11, row(350)]], 0.8, rnd), '#f6b83a', 0.9);

  // steam rising off the tea, curling as it goes: a pale wisp with its shaded side
  const wisps: Array<[Pt[], number]> = [
    [[[51.5, 34.5], [48.6, 27], [53, 19.4], [48.4, 11], [51, 3.2]], 2.6],
    [[[61, 35.4], [64.6, 28.6], [61.2, 22], [65.4, 15.6], [64, 11]], 2],
    [[[70, 33.4], [72.6, 29], [70.2, 24.6]], 1.4],
  ];
  for (const [pts, w] of wisps) {
    paint(dr, brush(shift(pts, 0.6, 0.2), w, rnd, { start: 0.5, end: 0.05, peak: 0.3 }), '#b9aca3', 0.8);
    paint(dr, brush(pts, w, rnd, { start: 0.5, end: 0.05, peak: 0.3 }), '#e2d9d1', 0.95);
  }
}

// ─────────────────────────────────────────────────────────────────── qehwe

const KILIM = { field: '#b5432f', fieldLight: '#cf6a50', fieldShade: '#7e2a20', border: '#2f3c68', ochre: '#dea43f', cream: '#f3e5c6' };
const CARDAMOM: Tone = { base: '#8da15d', light: '#b9cb8d', shade: '#5f7339' };

/** A cardamom pod `len` long, laid at `deg` degrees over its shadow; split open, it shows its seeds. */
function pod(dr: Drawing, rnd: Rnd, [cx, cy]: Pt, deg: number, len: number, open: boolean, [shadow, opacity]: readonly [string, number]): void {
  const a = (deg * Math.PI) / 180;
  const [ux, uy] = [(Math.cos(a) * len) / 2, (Math.sin(a) * len) / 2];
  const [nx, ny] = [-Math.sin(a), Math.cos(a)];
  const line: Pt[] = [[cx - ux, cy - uy], [cx + nx * 0.3, cy + ny * 0.3], [cx + ux, cy + uy]];
  const w = len * 0.46;
  const shape = { start: 0.22, end: 0.18, peak: 0.5 };
  paint(dr, brush(shift(line, 0.8, 1), w, rnd, shape), shadow, opacity);
  if (open) {
    paint(dr, brush(shift(line, nx * w * 0.45, ny * w * 0.45), w * 0.62, rnd, shape), CARDAMOM.shade);
    paint(dr, brush(shift(line, -nx * w * 0.45, -ny * w * 0.45), w * 0.62, rnd, shape), CARDAMOM.light);
    let seeds = '';
    for (let i = 0; i < 4; i++) seeds += outline(roundish(cx + (i - 1.5) * ux * 0.4, cy + (i - 1.5) * uy * 0.4, 0.9, 0.8, rnd, { count: 6, tremor: 0.12 }));
    paint(dr, seeds, '#3a2a20');
    return;
  }
  const body = brush(line, w, rnd, shape);
  paint(dr, body, CARDAMOM.base);
  within(dr, body, () => {
    paint(dr, brush(shift(line, -nx * w * 0.32, -ny * w * 0.32), w * 0.42, rnd), CARDAMOM.light);
    paint(dr, brush(shift(line, nx * w * 0.44, ny * w * 0.44), w * 0.4, rnd), CARDAMOM.shade);
    paint(dr, brush(shift(line, nx * w * 0.06, ny * w * 0.06), 0.35, rnd, { start: 0.2, end: 0.2, peak: 0.5 }), CARDAMOM.shade);
  });
}

export function qehwe(dr: Drawing, rnd: Rnd): void {
  // the cloth: a small kilim laid corner-on across the table, seen from in front; (u, v) is a point across it
  const B: Pt = [66, 69];
  const R: Pt = [117, 86];
  const F: Pt = [57, 113];
  const L: Pt = [4, 91];
  const at = (u: number, v: number): Pt => [
    (1 - u) * (1 - v) * B[0] + u * (1 - v) * R[0] + u * v * F[0] + (1 - u) * v * L[0],
    (1 - u) * (1 - v) * B[1] + u * (1 - v) * R[1] + u * v * F[1] + (1 - u) * v * L[1],
  ];
  const quad = (u0: number, v0: number, u1: number, v1: number): Pt[] => runs([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], 4);
  const diamond = (u: number, v: number, du: number, dv: number): Pt[] => [at(u, v - dv), at(u + du, v), at(u, v + dv), at(u - du, v)];
  // its right-hand corner is turned back along u - v = FOLD; `back` is where a point of that corner lands
  const FOLD = 0.66;
  const back = (u: number, v: number): Pt => at(v + FOLD, u - FOLD);
  const cloth = tremble(runs([B, at(FOLD, 0), at(1, 1 - FOLD), F, L], 4), rnd, 0.4);

  // the warp's ends, knotted into a fringe along two opposite edges: behind the cloth at the back, over it at the front
  const fringe = (from: Pt, to: Pt, out: Pt, len: number, count: number): void => {
    let d = '';
    for (let i = 0; i < count; i++) {
      const p = lerp(from, to, (i + 0.5) / count);
      const l = len * (0.8 + rnd() * 0.4);
      const deg = (Math.atan2(out[1], out[0]) * 180) / Math.PI + (rnd() - 0.5) * 16;
      d += touch(p[0] + (out[0] * l) / 2, p[1] + (out[1] * l) / 2, l + 0.6, 0.8, deg);
    }
    paint(dr, d, KILIM.cream);
  };
  fringe(B, at(FOLD, 0), [0.32, -0.95], 3.2, 11);
  paint(dr, outline(shift(cloth, 1.5, 2.6)), FLOOR, 0.14);
  paint(dr, outline(shift(cloth, 0, 1.3)), KILIM.fieldShade);
  paint(dr, outline(cloth), KILIM.field);
  within(dr, outline(cloth), () => {
    paint(dr, streaks(rnd, [6, 68, 116, 112], 46, 18, 7, 0.5), KILIM.fieldLight, 0.35);
    // the border: indigo, a row of ochre diamonds with cream eyes down its middle, an ochre line inside it
    dr.add(`<path d="${outline(quad(-0.05, -0.05, 1.05, 1.05))}${outline(tremble(quad(0.11, 0.11, 0.89, 0.89), rnd, 0.3))}" fill="${KILIM.border}" fill-rule="evenodd"/>`);
    band(dr, quad(0.12, 0.12, 0.88, 0.88), quad(0.135, 0.135, 0.865, 0.865), KILIM.ochre);
    let eyes = '';
    let marks = '';
    for (let i = 0; i < 9; i++) {
      const t = 0.1 + (i / 8) * 0.8;
      for (const [u, v] of [[t, 0.055], [t, 0.945], [0.055, t], [0.945, t]] as const) {
        marks += polygon(diamond(u, v, 0.032, 0.032));
        eyes += polygon(diamond(u, v, 0.012, 0.012));
      }
    }
    paint(dr, marks, KILIM.ochre);
    paint(dr, eyes, KILIM.cream);
    // the field's stepped medallion, mostly under the saucer, and an eye in each corner of the field
    const stepped = (s: number): Pt[] => {
      const pts: Pt[] = [];
      const k = 5;
      for (let i = 0; i < k; i++) pts.push([0.5 + (s * i) / k, 0.5 - s + (s * i) / k], [0.5 + (s * (i + 1)) / k, 0.5 - s + (s * i) / k]);
      for (let i = 0; i < k; i++) pts.push([0.5 + s - (s * i) / k, 0.5 + (s * i) / k], [0.5 + s - (s * i) / k, 0.5 + (s * (i + 1)) / k]);
      for (let i = 0; i < k; i++) pts.push([0.5 - (s * i) / k, 0.5 + s - (s * i) / k], [0.5 - (s * (i + 1)) / k, 0.5 + s - (s * i) / k]);
      for (let i = 0; i < k; i++) pts.push([0.5 - s + (s * i) / k, 0.5 - (s * i) / k], [0.5 - s + (s * i) / k, 0.5 - (s * (i + 1)) / k]);
      return pts.map(([u, v]) => at(u, v));
    };
    paint(dr, polygon(stepped(0.3)), KILIM.ochre);
    paint(dr, polygon(stepped(0.22)), KILIM.border);
    paint(dr, polygon(stepped(0.13)), KILIM.cream);
    for (const [u, v] of [[0.27, 0.27], [0.73, 0.27], [0.73, 0.73], [0.27, 0.73]] as const) {
      paint(dr, polygon(diamond(u, v, 0.045, 0.045)), KILIM.cream);
      paint(dr, polygon(diamond(u, v, 0.022, 0.022)), KILIM.border);
    }
    // what the cup and saucer cast on it
    paint(dr, outline(roundish(67, 93, 35, 9, rnd, { rot: 6 })), '#2a0c0a', 0.3);
  });
  fringe(L, F, [-0.38, 0.92], 4.4, 16);
  // the corner turned back over the cloth: the weave's other face, duller, its border and fringe lying back across it
  const flap = tremble(runs([at(FOLD, 0), at(1, 1 - FOLD), back(1, 0)], 2.5), rnd, 0.25);
  within(dr, outline(cloth), () => paint(dr, outline(shift(flap, -0.6, 1.8)), '#2a0c0a', 0.35));
  paint(dr, outline(flap), '#bf5a42');
  within(dr, outline(flap), () => {
    const strip = (u0: number, v0: number, u1: number, v1: number): string => polygon([back(u0, v0), back(u1, v0), back(u1, v1), back(u0, v1)]);
    paint(dr, strip(FOLD - 0.1, -0.05, 1.05, 0.11) + strip(0.89, -0.05, 1.05, 1.1 - FOLD), '#3c4874');
    let marks = '';
    for (const t of [0.78, 0.86, 0.94]) marks += polygon([back(t, 0.023), back(t + 0.025, 0.055), back(t, 0.087), back(t - 0.025, 0.055)]);
    for (const t of [0.05, 0.13, 0.21]) marks += polygon([back(0.945, t - 0.032), back(0.977, t), back(0.945, t + 0.032), back(0.913, t)]);
    paint(dr, marks, '#d2a14a');
    paint(dr, streaks(rnd, [88, 80, 108, 94], 8, 40, 5, 0.5), '#d77a5e', 0.5);
  });
  paint(dr, brush([at(FOLD, 0), at((1 + FOLD) / 2, (1 - FOLD) / 2), at(1, 1 - FOLD)], 1.1, rnd, { start: 0.5, end: 0.5, peak: 0.5 }), '#e3906e');
  let tassels = '';
  for (let i = 0; i < 4; i++) {
    const u = FOLD + ((i + 0.5) / 4) * (1 - FOLD);
    const p = back(u, 0);
    const q = back(u, -0.1);
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    const l = Math.hypot(dx, dy);
    tassels += touch(p[0] + (dx / l) * 1.8, p[1] + (dy / l) * 1.8, 3.6, 0.8, (Math.atan2(dy, dx) * 180) / Math.PI + (rnd() - 0.5) * 14);
  }
  paint(dr, tassels, KILIM.cream);
  pod(dr, rnd, [93, 101], 22, 8.2, true, ['#2a0c0a', 0.35]);

  // the saucer, the cup's shadow on it, and two pods laid by the cup
  const S = { x: 60, y: 86, rx: 32, ry: 9.8 };
  const saucer = roundish(S.x, S.y, S.rx, S.ry, rnd, { wobble: 0.01, tremor: 0.2, count: 40 });
  paint(dr, outline(slab(saucer, 1.6)), CHINA.shade);
  paint(dr, outline(saucer), CHINA.base);
  side(dr, saucer, 2.4, 1.6, CHINA.shade, { grow: 0.97 });
  band(dr, saucer, scaleAbout(saucer, S.x, S.y, 0.975, 0.945), GOLD);
  paint(dr, outline(roundish(66, 87.6, 15.5, 4.2, rnd)), CHINA.shade);
  pod(dr, rnd, [38.6, 89.2], -16, 8.4, false, [CHINA.shade, 1]);
  pod(dr, rnd, [48, 92.4], 6, 8, false, [CHINA.shade, 1]);

  // the cup: small and white, an indigo band painted round it with gold dots, gold at its lip; its handle a ring
  const X = 60;
  const LIP = { y: 52, rx: 19, ry: 5.6 };
  const profile: Pt[] = [[52, 19], [56, 18.9], [61, 18.2], [66, 17], [71, 15.2], [75.6, 13], [79.4, 10.8], [82.4, 9.4]];
  const cup: Pt[] = profile.map(([y, w]): Pt => [X - w, y]);
  for (let i = 1; i < 8; i++) cup.push([X - 9.4 * Math.cos((i / 8) * Math.PI), 82.4 + 2.4 * Math.sin((i / 8) * Math.PI)]);
  for (const [y, w] of profile.slice().reverse()) cup.push([X + w, y]);
  for (let i = 1; i < 8; i++) cup.push([X + LIP.rx * Math.cos((i / 8) * Math.PI), LIP.y - LIP.ry * Math.sin((i / 8) * Math.PI)]);
  const shell = tremble(cup, rnd, 0.12);
  const ringOut = roundish(80.4, 64.4, 7, 7.8, rnd, { wobble: 0.02, rot: 14, count: 24, tremor: 0.15 });
  const ringIn = roundish(81.2, 64.6, 3.5, 4.5, rnd, { wobble: 0.03, rot: 14, count: 18, tremor: 0.15 });
  band(dr, shift(ringOut, 0.5, 0.9), shift(ringIn, 0.5, 0.9), CHINA.shade);
  band(dr, ringOut, ringIn, CHINA.base);
  form(dr, shell, CHINA, [-2.8, -0.6], [1.8, 0.4]);
  within(dr, outline(shell), () => {
    const upper: Pt[] = [];
    const lower: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      upper.push([X - 20 * Math.cos(a), 57.6 + 5.2 * Math.sin(a)]);
      lower.push([X + 20 * Math.cos(a), 63.6 + 4.8 * Math.sin(a)]);
    }
    paint(dr, outline(tremble([...upper, ...lower], rnd, 0.25)), KILIM.border);
    let dots = '';
    for (let i = 0; i < 11; i++) {
      const a = 0.22 + (i / 10) * (Math.PI - 0.44);
      dots += ellipse(X - 18.4 * Math.cos(a), 60.7 + 5 * Math.sin(a), 0.75 * (0.35 + 0.65 * Math.sin(a)), 0.72);
    }
    paint(dr, dots, '#e6b552');
    paint(dr, streaks(rnd, [X - 18, 56, X + 18, 80], 10, 80, 5, 0.8), CHINA.shade, 0.16);
    paint(dr, brush([[X - 17.2, 55.6], [X - 16, 66], [X - 12.6, 77]], 1.8, rnd), CHINA.light, 0.9);
  });
  // inside the lip: the cup's far wall in shade, and the coffee under its foam
  const mouth = roundish(X, LIP.y, LIP.rx, LIP.ry, rnd, { wobble: 0.005, tremor: 0.1 });
  paint(dr, outline(mouth), CHINA.shade);
  const coffee = roundish(X, LIP.y + 1.3, 16.8, 4.2, rnd, { wobble: 0.01, tremor: 0.1 });
  paint(dr, outline(coffee), '#9a6a44');
  within(dr, outline(coffee), () => {
    paint(dr, outline(roundish(X + 3, LIP.y + 2.4, 10.4, 2.4, rnd, { wobble: 0.12 })), '#5f3a24');
    let bubbles = '';
    for (let i = 0; i < 16; i++) bubbles += ellipse(X - 14 + rnd() * 28, LIP.y - 1.6 + rnd() * 5, 0.4 + rnd() * 0.4, 0.3 + rnd() * 0.22);
    paint(dr, bubbles, '#d5b083');
  });
  const lipNear: Pt[] = [];
  const lipFar: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    lipNear.push([X - LIP.rx * Math.cos(a), LIP.y + LIP.ry * Math.sin(a)]);
    lipFar.push([X + LIP.rx * Math.cos(a), LIP.y - LIP.ry * Math.sin(a)]);
  }
  paint(dr, brush(lipNear, 0.9, rnd, { start: 0.6, end: 0.6, peak: 0.5, count: 24 }), GOLD);
  paint(dr, brush(lipFar, 0.55, rnd, { start: 0.6, end: 0.6, peak: 0.5, count: 24 }), '#a98a5e');

  // steam
  for (const [pts, w] of [
    [[[55, 49], [52, 41], [56, 33], [52, 25], [54.6, 18]], 2.4],
    [[[65, 49.6], [68, 42], [64.6, 35.4], [67.6, 29]], 1.8],
  ] as Array<[Pt[], number]>) {
    paint(dr, brush(shift(pts, 0.6, 0.2), w, rnd, { start: 0.5, end: 0.05, peak: 0.3 }), '#b9aca3', 0.8);
    paint(dr, brush(pts, w, rnd, { start: 0.5, end: 0.05, peak: 0.3 }), '#e2d9d1', 0.95);
  }
}

// ───────────────────────────────────────────────────────────────────── sêv

const APPLE: Tone = { base: '#b8352a', light: '#d95b41', shade: '#7c2019' };
const APPLE_LEAF: Tone = { base: '#6a8a3e', light: '#94b35f', shade: '#48682b' };

export function sev(dr: Drawing, rnd: Rnd): void {
  floor(dr, rnd, 62, 99.5, 33, 6);
  rest(dr, rnd, 60, 98.6, 24, 3.2);
  dr.add('<g transform="rotate(-8 58 70)">');
  const apple = tremble([[58, 41], [66, 37.4], [76, 37.6], [86, 43], [92.4, 53], [94, 65], [91.4, 78], [84.4, 90], [74.4, 97.6], [64, 99.4], [58, 97.6], [52, 99.4], [41.6, 97.6], [31.6, 90], [24.6, 78], [22, 65], [23.6, 53], [30, 43], [40, 37.6], [50, 37.4]], rnd, 0.35);
  const skin = outline(apple);
  paint(dr, skin, APPLE.base);
  // the streaks a red apple's skin runs in, out from its stalk, over the gold where the sun did not reach
  within(dr, skin, () => {
    let gold = '';
    for (let i = 0; i < 8; i++) {
      const t = 0.05 + i * 0.062 + (rnd() - 0.5) * 0.02;
      gold += brush([[58 + t * 10, 46], [58 + t * 66, 60 + t * 6], [58 + t * 58, 62 + rnd() * 30]], 1.4 + rnd() * 1.4, rnd, { start: 0.1, end: 0.05, peak: 0.55 });
    }
    paint(dr, gold, '#d9963c', 0.42);
    let lit = '';
    let dark = '';
    for (let i = 0; i < 13; i++) {
      const t = i / 12 - 0.5 + (rnd() - 0.5) * 0.04;
      const reach = 0.55 + rnd() * 0.35;
      const mark = brush([[58 + t * 10, 42], [58 + t * 64, 58 + Math.abs(t) * 6], [58 + t * 60, 42 + 50 * reach]], 1 + rnd() * 1.6, rnd, { start: 0.2, end: 0.05, peak: 0.3 });
      if (t < 0.1 && rnd() < 0.8) lit += mark;
      else dark += mark;
    }
    paint(dr, lit, APPLE.light, 0.45);
    paint(dr, dark, APPLE.shade, 0.25);
  });
  side(dr, apple, -3.4, -3, APPLE.shade, { grow: 0.99 });
  side(dr, apple, 3.6, 3.2, APPLE.light, { grow: 0.97 });
  // the warm light thrown back up into its shaded side from what it stands on, and the shine of the window on its skin
  side(dr, apple, -1, -0.9, '#a53b2c', { grow: 0.995 });
  paint(dr, touch(37.6, 57, 9, 2.6, -52) + touch(43.6, 50.4, 3, 1.3, -30), '#fbe6d2', 0.85);
  paint(dr, ellipse(35.4, 63.6, 0.9, 0.9), '#fbe6d2', 0.7);
  // the hollow the stalk grows from, and the pale pores over the skin
  within(dr, skin, () => {
    paint(dr, outline(roundish(58.4, 43, 7.4, 3, rnd, { wobble: 0.1 })), APPLE.shade);
    let pores = '';
    for (let i = 0; i < 26; i++) pores += ellipse(28 + rnd() * 62, 46 + rnd() * 48, 0.32 + rnd() * 0.25, 0.28 + rnd() * 0.2);
    paint(dr, pores, '#eba27a', 0.6);
  });
  paint(dr, brush([[58.6, 43], [59.4, 35], [62.4, 27.6]], 2.3, rnd, { start: 0.9, end: 0.7, peak: 0.4 }), '#5a3a22');
  leaf(dr, rnd, [60.6, 31.6], [42, 22.4], 9, { base: '#55722f', light: '#7e9c4c', shade: '#3c5622' }, { bend: 0.1, teeth: 0.03, rib: '#a9c084' });
  leaf(dr, rnd, [61.6, 30.4], [89, 21], 14, APPLE_LEAF, { bend: -0.12, teeth: 0.03, rib: '#bfd29a' });
  dr.add('</g>');
}

// ──────────────────────────────────────────────────────────────── semawer

const BRASS: Tone = { base: '#c99a42', light: '#efd08a', shade: '#8a6322' };
const COPPER: Tone = { base: '#b9693c', light: '#dc925e', shade: '#83442a' };

/** A small tea glass on its saucer, the same measured glass as Çay's, its foot at (cx, cy) and `k` of the painting's size. */
function teaGlass(dr: Drawing, rnd: Rnd, cx: number, cy: number, k: number): void {
  const y = (r: number): number => cy - (438 - r) * k;
  const body = (inset: number, from: number): Pt[] => {
    const rows = TEA_GLASS.filter(([r]) => r >= from);
    return [...rows.map(([r, w]): Pt => [cx - w * k + inset, y(r)]), ...rows.slice().reverse().map(([r, w]): Pt => [cx + w * k - inset, y(r)])];
  };
  const saucer = roundish(cx, cy + 0.4, 160 * k, 48 * k, rnd, { wobble: 0.01, tremor: 0.12, count: 20 });
  paint(dr, outline(slab(saucer, 0.9)), CHINA.shade);
  paint(dr, outline(saucer), CHINA.base);
  band(dr, saucer, scaleAbout(saucer, cx, cy + 0.4, 0.95, 0.92), GOLD);
  paint(dr, outline(roundish(cx + 4, cy + 0.6, 70 * k, 14 * k, rnd, { count: 12 })), CHINA.shade);
  paint(dr, outline(body(0, 85)), '#e4dfe7', 0.85);
  const tea = body(0.4, 128);
  paint(dr, outline(tea), TEA.base);
  within(dr, outline(tea), () => {
    paint(dr, outline(roundish(cx + 1, y(240), 100 * k, 50 * k, rnd, { wobble: 0.1, count: 12 })), TEA.shade, 0.85);
    paint(dr, outline(roundish(cx, y(400), 80 * k, 26 * k, rnd, { wobble: 0.1, count: 12 })), TEA.light);
  });
  paint(dr, outline(roundish(cx, y(128), 106 * k, 22 * k, rnd, { wobble: 0.01, tremor: 0.1, count: 14 })), TEA.light);
  const left = TEA_GLASS.map(([r, w]): Pt => [cx - w * k, y(r)]);
  const right = TEA_GLASS.map(([r, w]): Pt => [cx + w * k, y(r)]);
  paint(dr, brush(left, 0.55, rnd, { start: 0.8, end: 0.7, peak: 0.5, count: 16 }) + brush(right, 0.55, rnd, { start: 0.8, end: 0.7, peak: 0.5, count: 16 }), INK);
  const lip: Pt[] = [];
  for (let i = 0; i <= 8; i++) lip.push([cx - 140 * k * Math.cos((i / 8) * Math.PI), y(85) + 40 * k * Math.sin((i / 8) * Math.PI)]);
  paint(dr, brush(lip, 0.5, rnd, { start: 0.7, end: 0.7, peak: 0.5 }), INK);
  paint(dr, brush(left.slice(4, 15).map(([x, yy]): Pt => [x + 2.2 * k * 12, yy]), 0.7, rnd), '#fffaf3', 0.8);
}

export function semawer(dr: Drawing, rnd: Rnd): void {
  // the tray: round and copper, a ring of dots beaten into it inside its rim
  const tray = roundish(60, 99, 54, 13, rnd, { wobble: 0.008, tremor: 0.2, count: 40 });
  floor(dr, rnd, 63, 103, 54, 12);
  paint(dr, outline(slab(tray, 2.4)), COPPER.shade);
  paint(dr, outline(tray), COPPER.base);
  side(dr, tray, 2.6, 1.8, COPPER.shade, { grow: 0.97 });
  band(dr, tray, scaleAbout(tray, 60, 99, 0.965, 0.94), COPPER.light);
  let dots = '';
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    dots += ellipse(60 + Math.cos(a) * 46, 99 + Math.sin(a) * 10.6, 0.5, 0.4);
  }
  paint(dr, dots, COPPER.shade);
  sugar(dr, rnd, 22.6, 99.6, 5, COPPER.shade);
  sugar(dr, rnd, 29.6, 103, 4.6, COPPER.shade);

  // the samovar: a trumpet foot, an urn with engraved bands, handles, a tap, a crown with its vents
  const X = 50;
  paint(dr, outline(roundish(X + 5, 97.6, 17, 3.4, rnd)), COPPER.shade);
  const foot: Pt[] = [[X - 13, 96], [X - 10.6, 92.6], [X - 6.6, 90], [X - 5.4, 86.4], [X + 5.4, 86.4], [X + 6.6, 90], [X + 10.6, 92.6], [X + 13, 96], [X + 9, 97.8], [X, 98.6], [X - 9, 97.8]];
  form(dr, tremble(foot, rnd, 0.15), BRASS, [-2.2, 0], [1.6, 0]);
  const rows: Pt[] = [[41, 13.4], [44, 16.6], [50, 18.8], [58, 19.6], [66, 19.2], [74, 17.4], [80, 14.4], [85, 10], [87.4, 7]];
  const urn: Pt[] = rows.map(([yy, w]): Pt => [X - w, yy]);
  for (let i = 1; i < 6; i++) urn.push([X - 7 * Math.cos((i / 6) * Math.PI), 87.4 + 2 * Math.sin((i / 6) * Math.PI)]);
  for (const [yy, w] of rows.slice().reverse()) urn.push([X + w, yy]);
  for (let i = 1; i < 8; i++) urn.push([X + 13.4 * Math.cos((i / 8) * Math.PI), 41 - 3.4 * Math.sin((i / 8) * Math.PI)]);
  const handle = (s: number): void => {
    const pts: Pt[] = [[X + s * 16.8, 45], [X + s * 24.4, 45.6], [X + s * 25.6, 51], [X + s * 19.4, 56.4]];
    paint(dr, brush(pts, 2.4, rnd, { start: 0.9, end: 0.8, peak: 0.5 }), BRASS.shade);
    paint(dr, brush(shift(pts, -0.5, -0.5), 0.8, rnd, { start: 0.9, end: 0.6, peak: 0.5 }), BRASS.light);
  };
  handle(-1);
  handle(1);
  const shell = tremble(urn, rnd, 0.12);
  form(dr, shell, BRASS, [-3.4, 0], [2.4, 0.4]);
  within(dr, outline(shell), () => {
    const arc = (yy: number, sag: number): Pt[] => [-1, -0.6, 0, 0.6, 1].map((t): Pt => [X + t * 21, yy + sag * (1 - t * t)]);
    let lines = '';
    for (const [yy, sag] of [[49.4, 2.6], [56.4, 2.8], [73, 2.6], [77, 2.4]] as const) lines += brush(arc(yy, sag), 0.6, rnd, { start: 0.8, end: 0.8, peak: 0.5 });
    let leaves = '';
    for (let i = 0; i < 9; i++) {
      const t = -0.85 + (i / 8) * 1.7;
      leaves += touch(X + t * 19.6, 52.9 + 2.7 * (1 - t * t), 2.6, 0.9, 30 + (i % 2) * 120);
    }
    paint(dr, lines + leaves, BRASS.shade, 0.85);
    paint(dr, brush([[X - 12.6, 45], [X - 14.4, 62], [X - 10.6, 82]], 2.2, rnd), BRASS.light, 0.9);
    paint(dr, streaks(rnd, [X - 19, 44, X + 19, 86], 16, 90, 7, 0.7), BRASS.shade, 0.25);
  });
  paint(dr, brush([[X + 17.6, 71], [X + 24, 70.4], [X + 27.4, 72.6], [X + 28, 76]], 2.8, rnd, { start: 1, end: 0.65, peak: 0.2 }), BRASS.base);
  paint(dr, brush([[X + 18, 70.2], [X + 24, 69.6], [X + 27, 71.6]], 0.8, rnd), BRASS.light);
  paint(dr, brush([[X + 23, 70.4], [X + 23.4, 66.8], [X + 26.2, 66]], 1.2, rnd, { start: 1, end: 0.8 }), BRASS.shade);
  const crown = tremble(runs([[X - 8.6, 41.4], [X - 8.6, 34], [X + 8.6, 34], [X + 8.6, 41.4]], 2), rnd, 0.12);
  form(dr, crown, BRASS, [-1.8, 0], [1.2, 0]);
  paint(dr, ellipse(X - 5, 38, 1, 1.5) + ellipse(X, 38, 1, 1.5) + ellipse(X + 5, 38, 1, 1.5), '#4a3214');
  paint(dr, outline(roundish(X, 41.4, 13.4, 3.4, rnd, { wobble: 0.01, tremor: 0.12 })), BRASS.light);
  paint(dr, outline(roundish(X, 34, 8.6, 2, rnd, { wobble: 0.01, tremor: 0.1, count: 16 })), BRASS.light);

  // the teapot brewing on the crown: white china painted with roses, a gold line round it
  const spout: Pt[] = [[X + 9.6, 28.6], [X + 15, 24.6], [X + 18.6, 18.6]];
  paint(dr, brush(shift(spout, 0.4, 0.6), 3.2, rnd, { start: 1, end: 0.45, peak: 0.05 }), CHINA.shade);
  paint(dr, brush(spout, 2.8, rnd, { start: 1, end: 0.45, peak: 0.05 }), CHINA.base);
  paint(dr, brush([[X - 10.2, 21.6], [X - 16, 22.4], [X - 16.4, 28], [X - 10.6, 31]], 2, rnd, { start: 0.9, end: 0.9, peak: 0.5 }), CHINA.shade);
  const pot = roundish(X, 25.6, 11.4, 8.4, rnd, { wobble: 0.02, count: 20 });
  form(dr, pot, CHINA, [-2.2, -1.2], [1.4, 1]);
  within(dr, outline(pot), () => {
    let roses = '';
    let greens = '';
    for (const [x, yy] of [[X - 4.4, 26.4], [X + 3.8, 27.8], [X + 0.2, 23]] as const) {
      roses += outline(roundish(x, yy, 1.7, 1.5, rnd, { count: 8, tremor: 0.15 }));
      greens += touch(x - 2.2, yy + 1, 2.4, 0.8, -30) + touch(x + 2.2, yy + 1.2, 2.2, 0.7, 30);
    }
    paint(dr, greens, '#6f8f4e');
    paint(dr, roses, '#c8423a');
    paint(dr, brush([[X - 11, 29.4], [X, 32.6], [X + 11, 29.4]], 0.7, rnd, { start: 0.8, end: 0.8, peak: 0.5 }), GOLD);
  });
  paint(dr, outline(roundish(X, 17.8, 6.4, 2.2, rnd, { count: 14, tremor: 0.1 })), CHINA.light);
  paint(dr, brush([[X - 6.2, 18.4], [X, 20.4], [X + 6.2, 18.4]], 0.6, rnd, { start: 0.8, end: 0.8, peak: 0.5 }), GOLD);
  paint(dr, ellipse(X, 15.6, 1.8, 1.4), GOLD);
  for (const [pts, w] of [
    [[[X + 19, 17.6], [X + 22, 12], [X + 18.6, 7], [X + 21.6, 2.4]], 1.9],
    [[[X + 1, 14.4], [X - 1.6, 9.6], [X + 1, 5.4]], 1.4],
  ] as Array<[Pt[], number]>) {
    paint(dr, brush(shift(pts, 0.5, 0.2), w, rnd, { start: 0.5, end: 0.05, peak: 0.3 }), '#b9aca3', 0.8);
    paint(dr, brush(pts, w, rnd, { start: 0.5, end: 0.05, peak: 0.3 }), '#e2d9d1', 0.95);
  }
  // two glasses poured for guests
  teaGlass(dr, rnd, 101, 97.4, 0.052);
  teaGlass(dr, rnd, 86, 101.6, 0.058);
}

// ───────────────────────────────────────────────────────────────────── def

const SKIN: Tone = { base: '#e9d3a6', light: '#f6e8c8', shade: '#cdaa72' };
const FRAME: Tone = { base: '#6e3c1c', light: '#b0703e', shade: '#45230e' };

export function def(dr: Drawing, rnd: Rnd): void {
  // the great frame drum stood on its rim and turned a little from us, so the depth of its hoop shows at the right: a
  // walnut hoop inlaid with bone, the goatskin stretched thin enough to glow, a henna star at its heart, a red tassel
  rest(dr, rnd, 62, 101, 36, 3.6);
  dr.add('<g transform="rotate(-6 60 58)">');
  const hoop = roundish(57, 57, 38.4, 44, rnd, { wobble: 0.006, tremor: 0.2, count: 40 });
  const back = shift(hoop, 6.8, 0.4);
  paint(dr, outline(back), FRAME.shade);
  within(dr, outline(back), () => {
    paint(dr, streaks(rnd, [60, 14, 106, 102], 14, 92, 12, 0.6), FRAME.base, 0.6);
    paint(dr, outline(shift(hoop, 4.2, 0.2)), '#2c1608');
  });
  paint(dr, outline(hoop), FRAME.base);
  within(dr, outline(hoop), () => paint(dr, streaks(rnd, [14, 12, 100, 102], 16, 80, 10, 0.6), FRAME.light, 0.35));
  side(dr, hoop, 1.6, 1.6, FRAME.light, { grow: 0.99 });
  side(dr, hoop, -1.4, -1.2, FRAME.shade, { grow: 0.99 });
  let inlay = '';
  let dots = '';
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const [x, y] = [57 + Math.cos(a) * 36.5, 57 + Math.sin(a) * 41.9];
    if (i % 2) dots += ellipse(x, y, 0.6, 0.6);
    else inlay += touch(x, y, 2.6, 0.9, (a * 180) / Math.PI + 90);
  }
  paint(dr, inlay + dots, '#efdcb4');
  // the skin: pale and uneven where it is thinner or thicker, lit from the upper left, darker where the hoop shades it
  const skin = roundish(57, 57, 34.4, 39.6, rnd, { wobble: 0.008, tremor: 0.2, count: 36 });
  paint(dr, outline(skin), SKIN.base);
  within(dr, outline(skin), () => {
    let thin = '';
    let thick = '';
    for (let i = 0; i < 10; i++) {
      const blot = outline(roundish(26 + rnd() * 62, 24 + rnd() * 66, 4 + rnd() * 8, 3 + rnd() * 6, rnd, { wobble: 0.2, count: 10, tremor: 1 }));
      if (i % 2) thin += blot;
      else thick += blot;
    }
    paint(dr, thin, SKIN.light, 0.5);
    paint(dr, thick, '#d9bc88', 0.35);
    paint(dr, streaks(rnd, [20, 20, 94, 94], 22, -30, 12, 0.8), SKIN.light, 0.4);
  });
  side(dr, skin, 2.6, 2.8, SKIN.shade, { grow: 0.985 });
  side(dr, skin, -2.2, -2.4, '#fbf1da', { grow: 0.98 });
  // the henna: a band of small triangles pointing in near the rim, a ring of dots, and an eight-pointed star at the centre
  let henna = '';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const p = (r: number, da = 0): Pt => [57 + Math.cos(a + da) * r * 0.92, 57 + Math.sin(a + da) * r * 1.06];
    henna += polygon([p(33), p(29.6, 0.11), p(33, 0.22)]);
  }
  let ring = '';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ring += ellipse(57 + Math.cos(a) * 24.3, 57 + Math.sin(a) * 28, 0.75, 0.75);
  }
  const star = (r: number, turnBy: number): string => {
    const pts: Pt[] = [];
    for (let i = 0; i < 16; i++) {
      const a = turnBy + (i / 16) * Math.PI * 2;
      const rr = i % 2 ? r * 0.46 : r;
      pts.push([57 + Math.cos(a) * rr * 0.92, 57 + Math.sin(a) * rr * 1.06]);
    }
    return polygon(tremble(pts, rnd, 0.25));
  };
  paint(dr, henna + ring + star(15, -Math.PI / 2), '#a8532e', 0.82);
  paint(dr, star(9, -Math.PI / 2 + Math.PI / 8), SKIN.base);
  paint(dr, star(6.4, -Math.PI / 2), '#a8532e', 0.82);
  paint(dr, ellipse(57, 57, 1.7, 1.9), SKIN.base);
  dr.add('</g>');
  // and the tassel, hung from the hoop on a gold cord
  paint(dr, brush([[99, 66], [100.6, 74], [100, 81]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }), '#d9a43e');
  paint(dr, ellipse(100, 81.6, 1.8, 1.6), '#d9a43e');
  let tassel = '';
  for (let i = 0; i < 7; i++) tassel += touch(100 + (i - 3) * 0.6, 88, 10 - Math.abs(i - 3) * 0.6, 0.65, 90 + (i - 3) * 4);
  paint(dr, tassel, '#b8333a');
  paint(dr, touch(99.4, 87, 7, 0.5, 92), '#e0605a', 0.8);
}

// ───────────────────────────────────────────────────────────────────── saz

const SPRUCE: Tone = { base: '#e2bf83', light: '#f2daa6', shade: '#bf9656' };
const MULBERRY: Tone = { base: '#8c4a26', light: '#b46a3a', shade: '#5c2c14' };

export function saz(dr: Drawing, rnd: Rnd): void {
  // laid on the diagonal: drawn upright about its bowl, then turned
  const T = { x: 50, y: 74, deg: 40, s: 0.74 };
  const toCanvas = ([x, y]: Pt): Pt => {
    const a = (T.deg * Math.PI) / 180;
    return [T.x + (x * Math.cos(a) - y * Math.sin(a)) * T.s, T.y + (x * Math.sin(a) + y * Math.cos(a)) * T.s];
  };
  floor(dr, rnd, 40, 108, 28, 4.6);
  dr.add(`<g transform="translate(${T.x} ${T.y}) rotate(${T.deg}) scale(${T.s})">`);
  const half: Pt[] = [[9, 62], [16.4, 56], [20.4, 46], [21, 35], [18.6, 24], [13.8, 14], [8, 6.4], [4.2, 2]];
  const pear: Pt[] = [[0, 64], ...half, [0, 0.6], ...half.slice().reverse().map(([x, y]): Pt => [-x, y])];
  // the bowl carved in staves of mulberry, showing past the soundboard
  const bowl = tremble(scaleAbout(shift(pear, 2.4, 1.2), 2.4, 34, 1.07), rnd, 0.2);
  paint(dr, outline(bowl), MULBERRY.base);
  within(dr, outline(bowl), () => {
    let staves = '';
    for (let j = -3; j <= 4; j++) staves += brush([[2.4 + j * 1.3, 2], [2.4 + j * 6.6, 34], [2.4 + j * 1.8, 66]], 0.8, rnd, { start: 0.6, end: 0.6, peak: 0.5 });
    paint(dr, staves, MULBERRY.light, 0.85);
  });
  side(dr, bowl, -1.6, -1.6, MULBERRY.shade);
  // the soundboard: pale spruce with its grain, a dark purfling dotted with bone, the bridge and the tailpiece
  const board = tremble(pear, rnd, 0.15);
  paint(dr, outline(board), SPRUCE.base);
  within(dr, outline(board), () => paint(dr, streaks(rnd, [-20, 2, 20, 64], 26, 90, 12, 0.6), SPRUCE.light, 0.5));
  side(dr, board, -1.8, -1.6, SPRUCE.shade);
  band(dr, board, scaleAbout(board, 0, 34, 0.93), MULBERRY.shade);
  let bone = '';
  for (const t of [0.12, 0.2, 0.28, 0.36, 0.44, 0.52, 0.6, 0.68, 0.76, 0.84]) {
    for (const s of [-1, 1]) {
      const i = Math.min(half.length - 1, Math.floor(t * half.length));
      const [x, y] = half[i]!;
      bone += ellipse(s * x * 0.965, y + (t * half.length - i) * -6, 0.45, 0.45);
    }
  }
  paint(dr, bone, '#f1e2c2');
  let holes = '';
  for (const [x, y] of [[-9.6, 20], [-8, 17.6], [-11.2, 17.8], [9.6, 20], [8, 17.6], [11.2, 17.8], [0, 28]] as const) holes += ellipse(x, y, 0.8, 0.8);
  paint(dr, holes, '#3a2214');
  paint(dr, polygon(tremble([[-6.4, 47.6], [6.4, 47.6], [6, 49.8], [-6, 49.8]], rnd, 0.1)), '#3a2214');
  paint(dr, polygon(tremble([[-3, 58], [3, 58], [0, 62.4]], rnd, 0.1)), '#f1e2c2');
  // the neck with its tied frets, the strings, and the head with its pegs
  const neck = brush([[0, 6], [0, -38], [0, -84]], 6, rnd, { start: 1, end: 0.76, peak: 0.02, count: 16 });
  paint(dr, neck, '#6a3820');
  within(dr, neck, () => paint(dr, brush([[-2, 6], [-1.8, -40], [-1.6, -84]], 1.4, rnd, { start: 1, end: 1, peak: 0.5 }), '#94582f'));
  let frets = '';
  for (let i = 0; i < 17; i++) {
    const y = 0 - 82 * ((1 - Math.pow(0.9, i + 1)) / (1 - Math.pow(0.9, 17)));
    frets += brush([[-3.2, y], [0, y - 0.15], [3.2, y]], 0.55, rnd, { start: 0.9, end: 0.9, peak: 0.5, count: 4 });
  }
  paint(dr, frets, '#e3d3ad');
  const head = tremble(runs([[-3.8, -82], [3.8, -82], [3.4, -101], [-3.4, -101]], 3), rnd, 0.15);
  form(dr, head, { base: '#5a2e18', light: '#86502c', shade: '#3a1c0c' }, [-1, 0], [0.8, 0]);
  let pegs = '';
  let knobs = '';
  for (const [s, y] of [[-1, -86], [-1, -91], [-1, -96], [-1, -100], [1, -88.4], [1, -93.4], [1, -98.4]] as const) {
    pegs += brush([[s * 3.4, y], [s * 6, y - 0.2], [s * 8.6, y - 0.4]], 1.3, rnd, { start: 1, end: 0.9, peak: 0.5, count: 4 });
    knobs += ellipse(s * 9.6, y - 0.4, 1.5, 1.4);
  }
  paint(dr, pegs, '#3c2414');
  paint(dr, knobs, '#7a4626');
  let strings = '';
  for (const [a, b] of [[-1.3, -0.9], [0, 0], [1.3, 0.9]] as const) strings += brush([[a, 59], [(a + b) / 2, -12], [b, -84]], 0.32, rnd, { start: 1, end: 1, peak: 0.5, count: 4 });
  paint(dr, strings, '#f6f0e2', 0.9);
  dr.add('</g>');
  // a red tassel tied at its head, hanging straight down
  const [tx, ty] = toCanvas([3.6, -82]);
  paint(dr, brush([[tx, ty], [tx + 0.6, ty + 3.4], [tx + 0.4, ty + 6]], 0.8, rnd, { start: 1, end: 1, peak: 0.5 }), '#d9a43e');
  paint(dr, ellipse(tx + 0.4, ty + 6.6, 1.5, 1.3), '#d9a43e');
  let tassel = '';
  for (let i = 0; i < 7; i++) tassel += touch(tx + 0.4 + (i - 3) * 0.55, ty + 11.6 + Math.abs(i - 3) * -0.3, 9 - Math.abs(i - 3) * 0.6, 0.55, 90 + (i - 3) * 4);
  paint(dr, tassel, '#b8333a');
}
