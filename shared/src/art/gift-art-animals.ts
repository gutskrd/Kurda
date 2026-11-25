/**
 * The animal gifts (gift-art.ts): a kitten asleep on a cushion, the pen pal pigeon on an almond branch, a partridge on
 * its rock, Hevalo in a spring meadow, a wild goat of the Zagros and a horse dressed for a wedding. The pigeon and Hevalo
 * are their own drawings (pigeon.ts, characters/hevalo.ts), never redrawn here.
 */
import { n, type Drawing, type Pt } from './svg.js';
import { characterSvg } from '../characters/index.js';
import { pigeon } from './pigeon.js';
import { along, band, blade, brush, ellipse, floor, form, lerp, outline, paint, polygon, roundish, runs, scaleAbout, shift, side, slab, streaks, touch, tremble, within, type Rnd, type Tone } from './gift-paint.js';

// ─────────────────────────────────────────────────────────────────── pisîk

const GINGER: Tone = { base: '#dd8944', light: '#f0ad6b', shade: '#b0602e' };
const CREAM: Tone = { base: '#f5e6cb', light: '#fffaf0', shade: '#dcc39f' };
const CUSHION: Tone = { base: '#2e5872', light: '#46779a', shade: '#1d3d53' };

export function pisik(dr: Drawing, rnd: Rnd): void {
  // the cushion: round, its top sewn round with a running stitch, a tassel at its corner
  const top = roundish(60, 89, 47, 14.5, rnd, { wobble: 0.025, count: 40 });
  floor(dr, rnd, 63, 99, 47, 12);
  paint(dr, outline(slab(top, 6.5)), CUSHION.shade);
  paint(dr, outline(top), CUSHION.base);
  side(dr, top, 2.2, 2.8, CUSHION.light, { grow: 0.97 });
  within(dr, outline(top), () => paint(dr, streaks(rnd, [14, 76, 106, 102], 30, 4, 9, 0.9), CUSHION.light, 0.3));
  let stitch = '';
  for (let i = 0; i < 44; i += 2) {
    const a0 = (i / 44) * Math.PI * 2;
    const a1 = ((i + 1) / 44) * Math.PI * 2;
    stitch += brush([[60 + 41 * Math.cos(a0), 89 + 10.6 * Math.sin(a0)], [60 + 41 * Math.cos(a1), 89 + 10.6 * Math.sin(a1)]], 0.8, rnd, { count: 4, start: 0.6, end: 0.6, peak: 0.5 });
  }
  paint(dr, stitch, '#e8d8b6');
  paint(dr, brush([[106, 93], [108.4, 97], [108, 103.6]], 2.2, rnd, { start: 0.6, end: 1, peak: 0.9 }), '#d9a443');
  paint(dr, ellipse(106.6, 93.4, 1.6, 1.4), '#b98426');

  // the kitten, curled with its back to the light: its body striped across, its hind leg
  const body = roundish(69, 72, 29, 18, rnd, { wobble: 0.04, rot: -5 });
  form(dr, body, GINGER, [-1.6, -2.6], [1.6, 2]);
  within(dr, outline(body), () => {
    let stripes = '';
    for (const [a, b] of [[[55, 56.6], [56.6, 63]], [[61.6, 54.8], [63, 62.2]], [[68.6, 54], [69, 60.4]], [[75.4, 54.4], [75.8, 62]], [[82.4, 57.2], [81, 63.2]], [[88.6, 62], [86, 67.8]]] as Array<[Pt, Pt]>) {
      stripes += brush([a, [(a[0] + b[0]) / 2 + (rnd() - 0.5), (a[1] + b[1]) / 2], b], 2 + rnd() * 0.8, rnd, { start: 0.9, end: 0.1, peak: 0.2 });
    }
    paint(dr, stripes, GINGER.shade);
    paint(dr, streaks(rnd, [42, 54, 98, 72], 30, -60, 3.4, 0.7), GINGER.light, 0.45);
    paint(dr, streaks(rnd, [44, 76, 98, 92], 18, -40, 3.4, 0.7), GINGER.shade, 0.35);
  });
  const haunch = roundish(85, 77, 13.6, 12, rnd, { wobble: 0.04 });
  form(dr, haunch, GINGER, [-1.6, -2.2], [1.2, 1.6]);
  within(dr, outline(haunch), () => {
    paint(dr, brush([[79, 68.5], [85, 66.6], [91, 70]], 2, rnd), GINGER.shade);
    paint(dr, brush([[78.4, 74], [85.4, 72.8], [92.6, 77]], 1.8, rnd), GINGER.shade);
  });
  // its head, laid on its paws and tipped toward us, its eyes shut
  dr.add('<g transform="rotate(-12 42 70)">');
  for (const [b0, tip, b1] of [[[30.6, 64.4], [29.4, 53], [40, 58.6]], [[44.4, 57.8], [52.4, 50.8], [53.8, 62]]] as Array<[Pt, Pt, Pt]>) {
    const ear = tremble(runs([b0, tip, b1], 1.4), rnd, 0.2);
    paint(dr, outline(ear), GINGER.base);
    side(dr, ear, 0.8, 0.8, GINGER.light);
    paint(dr, outline(scaleAbout(ear, (b0[0] + b1[0] + tip[0] * 1.4) / 3.4, (b0[1] + b1[1] + tip[1] * 1.4) / 3.4 + 1.2, 0.5)), '#e3a092');
  }
  const head = roundish(42, 70.5, 16, 13.4, rnd, { wobble: 0.03 });
  form(dr, head, GINGER, [-1.4, -2], [1.4, 1.6]);
  within(dr, outline(head), () => {
    let marks = '';
    for (const [a, b] of [[[37.8, 57.6], [38.6, 62.8]], [[42, 57], [42.2, 62.6]], [[46.2, 57.6], [45.4, 62.8]], [[26.4, 70], [32.4, 71.4]], [[57.4, 69.4], [52, 71]]] as Array<[Pt, Pt]>) {
      marks += brush([a, lerp(a, b, 0.5), b], 1.7, rnd, { start: 0.9, end: 0.15, peak: 0.25 });
    }
    paint(dr, marks, GINGER.shade);
    paint(dr, streaks(rnd, [28, 58, 56, 70], 14, -75, 2.8, 0.6), GINGER.light, 0.45);
    paint(dr, outline(roundish(42.4, 77.4, 7, 3.8, rnd, { wobble: 0.06 })), CREAM.base);
  });
  paint(dr, outline(tremble([[41, 73.8], [43.8, 73.6], [42.5, 75.4]], rnd, 0.15)), '#c47468');
  paint(dr, brush([[33.6, 69], [35.8, 70.2], [38.4, 69.6]], 0.75, rnd, { start: 0.4, end: 0.3, peak: 0.55 }), '#5a3426');
  paint(dr, brush([[45.8, 68.6], [48, 69.7], [50.6, 68.8]], 0.75, rnd, { start: 0.4, end: 0.3, peak: 0.55 }), '#5a3426');
  let whiskers = '';
  for (const [a, b] of [[[36, 76.4], [27.6, 74.4]], [[36, 77.6], [27.4, 78.2]], [[48.8, 76], [56.4, 73.4]], [[48.8, 77.2], [56.8, 77]]] as Array<[Pt, Pt]>) {
    whiskers += brush([a, lerp(a, b, 0.5), b], 0.42, rnd, { start: 1, end: 0.2 });
  }
  paint(dr, whiskers, '#fbf1df', 0.85);
  dr.add('</g>');
  // its front paws under its chin, and its tail curled round over them
  for (const [x, y] of [[37.4, 85.6], [48, 87]] as const) {
    const paw = roundish(x, y, 5.6, 3.4, rnd, { wobble: 0.03 });
    form(dr, paw, CREAM, [-1, -1.2], [0.8, 0.8]);
    paint(dr, brush([[x - 1.4, y + 0.4], [x - 1.2, y + 2.4]], 0.5, rnd) + brush([[x + 1.2, y + 0.4], [x + 1.4, y + 2.4]], 0.5, rnd), CREAM.shade);
  }
  const tail: Pt[] = [[98, 79], [95, 88.4], [81, 93], [63, 93.2], [49, 90.4], [39.6, 87.6]];
  const tailD = brush(tail, 8.6, rnd, { start: 0.85, end: 0.35, peak: 0.12, count: 28 });
  paint(dr, tailD, GINGER.base);
  within(dr, tailD, () => {
    paint(dr, brush(shift(tail, 0, -2.4), 2.4, rnd, { start: 0.6, end: 0.2, count: 24 }), GINGER.light);
    let rings = '';
    const spine = along(tail, 50);
    for (const t of [0.18, 0.34, 0.5, 0.66, 0.82]) {
      const p = spine[Math.round(t * 50)]!;
      rings += brush([[p[0] - 1.2, p[1] - 5], [p[0], p[1]], [p[0] + 0.6, p[1] + 5]], 2.2, rnd, { start: 0.4, end: 0.4, peak: 0.5 });
    }
    paint(dr, rings, GINGER.shade);
    paint(dr, brush(shift(tail, 0, 3), 2.4, rnd, { start: 0.6, end: 0.2, count: 24 }), GINGER.shade);
  });
}

// ──────────────────────────────────────────────────────────────────── kevok

const BARK: Tone = { base: '#7a5a44', light: '#a07c5e', shade: '#4f3828' };
const BLOSSOM = { petal: '#f9e8ec', shade: '#e2b5c2', heart: '#c4566a' };

/** An almond blossom about (cx, cy): five rounded petals and a red heart. */
function blossom(rnd: Rnd, cx: number, cy: number, r: number): [string, string, string] {
  let petals = '';
  let under = '';
  const turn0 = rnd() * 72;
  for (let i = 0; i < 5; i++) {
    const deg = turn0 + i * 72;
    const a = (deg * Math.PI) / 180;
    petals += touch(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r, r * 0.95, deg);
    under += touch(cx + Math.cos(a) * r * 0.5 + r * 0.1, cy + Math.sin(a) * r * 0.5 + r * 0.14, r, r * 0.95, deg);
  }
  return [under, petals, ellipse(cx, cy, r * 0.24, r * 0.24)];
}

export function kevok(dr: Drawing, rnd: Rnd): void {
  // a branch of almond in blossom
  const main: Pt[] = [[4, 98], [30, 94.6], [56, 96], [82, 92.6], [114, 86]];
  paint(dr, brush(main, 4.4, rnd, { start: 1, end: 0.35, peak: 0.05, count: 16 }), BARK.base);
  paint(dr, brush(shift(main, 0, -1.1), 1.3, rnd, { start: 1, end: 0.3, peak: 0.05, count: 12 }), BARK.light);
  paint(dr, brush(shift(main, 0.2, 1.4), 1.2, rnd, { start: 1, end: 0.3, peak: 0.05, count: 12 }), BARK.shade);
  let twigs = '';
  for (const t of [[[28, 94.6], [22, 86], [17, 78]], [[84, 92.4], [94, 99], [104, 103]], [[98, 89.6], [104, 80.6], [108, 72]], [[12, 97], [8, 106], [6, 112]]] as Pt[][]) {
    twigs += brush(t, 1.5, rnd, { start: 1, end: 0.3, peak: 0.05, count: 8 });
  }
  paint(dr, twigs, BARK.base);
  const flowers = (spots: ReadonlyArray<readonly [number, number, number]>): void => {
    let under = '';
    let petals = '';
    let hearts = '';
    for (const [x, y, r] of spots) {
      const [u, p, h] = blossom(rnd, x, y, r);
      under += u;
      petals += p;
      hearts += h;
    }
    paint(dr, under, BLOSSOM.shade);
    paint(dr, petals, BLOSSOM.petal);
    paint(dr, hearts, BLOSSOM.heart);
  };
  let buds = '';
  for (const [x, y] of [[16, 76], [109, 70.4], [6, 113]] as const) buds += outline(roundish(x, y, 1.8, 2.4, rnd, { count: 8, tremor: 0.15 }));
  paint(dr, buds, '#e79aac');
  let leaves = '';
  for (const [b, tip] of [[[22, 86], [16, 88]], [[104, 81], [111, 82]], [[94, 99], [96, 106]]] as Array<[Pt, Pt]>) leaves += outline(blade(b, tip, 2.6, { point: 0.8, count: 6 }));
  paint(dr, leaves, '#7f9a52');
  flowers([[20, 82, 4.2], [100, 101, 4.4], [106, 77, 4], [9, 104, 3.8]]);
  // the pen pal pigeon, a letter in her beak, her feet round the branch
  dr.add('<g transform="translate(51 95) scale(2.05)">');
  pigeon(dr, 'grey', 'perched', true, false);
  dr.add('</g>');
  flowers([[72, 95, 4.6], [38, 98, 3.8]]);
}

// ────────────────────────────────────────────────────────────────────── kew

const KEW = { back: '#a6998a', backLight: '#c3b6a4', breast: '#a5a8b8', breastLight: '#c2c5d2', belly: '#e0caa4', shade: '#76695c', throat: '#f4ead2' };

export function kew(dr: Drawing, rnd: Rnd): void {
  // a rock to stand on, lichened, with a tuft of grass
  const rock = tremble([[24, 106], [30, 97], [44, 93.4], [64, 92.4], [84, 94], [98, 99], [102, 106], [88, 109], [60, 110], [36, 109]], rnd, 0.5);
  paint(dr, outline(rock), '#b9b2a6');
  side(dr, rock, -2, -2.4, '#8e877c');
  side(dr, rock, 1.4, 2, '#d6d0c4');
  let lichen = '';
  for (let i = 0; i < 9; i++) lichen += outline(roundish(34 + rnd() * 56, 96 + rnd() * 10, 1 + rnd() * 1.6, 0.8 + rnd(), rnd, { count: 7, wobble: 0.2 }));
  paint(dr, lichen, '#c9b46c', 0.8);
  let grass = '';
  for (const a of [-0.6, -0.3, 0, 0.3, 0.55]) grass += brush([[96, 104], [96 + Math.sin(a) * 4, 98], [96 + Math.sin(a) * 7, 92]], 1, rnd, { start: 1, end: 0.05, count: 5 });
  paint(dr, grass, '#7d9a52');
  // its red legs
  let legs = '';
  for (const [x0, x1] of [[58, 56], [68, 70]] as const) legs += brush([[x0, 86], [x0 - 0.6, 90], [x1, 95]], 2, rnd, { start: 1, end: 0.8, peak: 0.5, count: 6 });
  legs += brush([[52, 95.4], [56, 95], [60, 95.6]], 1.1, rnd) + brush([[66, 95.6], [70, 95], [75, 95.8]], 1.1, rnd);
  paint(dr, legs, '#c9402e');
  // the bird: plump, head up, short tail down; a grey-brown back over a blue-grey breast and a buff belly
  const body = tremble([[24.4, 46], [30, 38.4], [38, 36.8], [44.6, 41], [49, 50], [60, 50.4], [76, 52.4], [88, 58], [96.4, 62], [100.6, 70], [92, 76], [80, 87], [64, 91.4], [48, 86], [40, 75], [34.4, 61], [30.4, 52.4], [26.4, 49.4]], rnd, 0.25);
  const skin = outline(body);
  paint(dr, skin, KEW.back);
  within(dr, skin, () => {
    paint(dr, outline(roundish(43, 70, 16, 20, rnd, { wobble: 0.06, rot: -14 })), KEW.breast);
    paint(dr, outline(roundish(68, 90, 24, 10, rnd, { wobble: 0.06 })), KEW.belly);
    paint(dr, streaks(rnd, [34, 58, 54, 84], 12, 70, 4, 0.6), KEW.breastLight, 0.6);
    // the bars down its flank: cream, black and chestnut, each a stroke of the brush
    for (let i = 0; i < 7; i++) {
      const x = 52 + i * 5;
      const y = 72 + Math.sin(i * 0.5) * 1.6;
      const bar = (dx: number, colour: string, w: number): void => paint(dr, brush([[x + dx, y - 4.4], [x + dx + 1.8, y + 2], [x + dx + 3.6, y + 7.4]], w, rnd, { start: 0.6, end: 0.2, peak: 0.4, count: 6 }), colour);
      bar(0, '#f1e3c4', 2.2);
      bar(1.4, '#2a2220', 1.4);
      bar(2.6, '#9a4e28', 1.4);
    }
    // the folded wing over the back, its feathers edged paler
    const wing = roundish(72, 61, 19, 8.6, rnd, { wobble: 0.06, rot: 12 });
    paint(dr, outline(wing), '#958776');
    let edges = '';
    for (let i = 0; i < 7; i++) edges += touch(60 + i * 4.4, 58 + i * 1.6 + (i % 2), 4.6, 0.8, 18);
    paint(dr, edges, KEW.backLight, 0.85);
    paint(dr, outline(roundish(99, 70, 4, 3.4, rnd, { count: 9 })), '#b4683a');
  });
  side(dr, body, -2.2, -2.6, KEW.shade, { grow: 0.99 });
  side(dr, body, 1.6, 1.8, KEW.backLight, { grow: 0.98 });
  // its face: a cream throat inside a black necklace that runs back through the eye, the eye ringed red, a red beak
  within(dr, skin, () => {
    paint(dr, outline(tremble([[27, 49.4], [31, 46.6], [37, 49], [39.4, 56], [37, 63], [31, 65], [29, 56]], rnd, 0.15)), KEW.throat);
    paint(dr, brush([[26.4, 44.6], [32, 44.4], [38.4, 47.4], [40.8, 55], [39, 63.4], [31.4, 67.4]], 2.3, rnd, { start: 0.6, end: 0.5, peak: 0.6, count: 14 }), '#26201e');
    paint(dr, outline(roundish(39, 38.6, 7, 3, rnd, { count: 10, rot: 15 })), KEW.backLight);
  });
  paint(dr, ellipse(32.6, 44.2, 2, 1.9), '#d8462e');
  paint(dr, ellipse(32.6, 44.2, 1.1, 1.1), '#1f1814');
  paint(dr, ellipse(32.2, 43.8, 0.35, 0.35), '#fbf3e4');
  paint(dr, outline(tremble([[29, 43.6], [22.8, 45.4], [23.6, 47], [28.6, 48.4]], rnd, 0.1)), '#cf3b2b');
}

// ────────────────────────────────────────────────────────────────────── ask

/**
 * Hevalo's own drawing with each of its gradients laid flat in a colour from its own stops, so the deer is the app's
 * deer exactly, painted as the gifts are. The ones that only darken an edge are left out.
 */
const HEVALO_FLAT: Readonly<Record<string, string>> = {
  fur: '#c48a4e',
  bib: '#e1bf8c',
  hoof: '#5e3f2c',
  antler: '#4f3029',
  earL: '#be7b41',
  earR: '#be7b41',
  head: '#be7b41',
  patch: '#cf9560',
  bridge: '#dca35e',
  muzzle: '#ecc791',
  white: '#fbf3e8',
  nose: '#4a2a22',
};

function hevaloFlat(prefix: string): string {
  const svg = characterSvg('hevalo', { crop: 'full', idPrefix: prefix });
  const inner = svg.slice(svg.indexOf('</title>') + '</title>'.length, svg.lastIndexOf('</svg>'));
  return inner
    .replace(/<(linear|radial)Gradient\b[\s\S]*?<\/\1Gradient>/g, '')
    .replace(/<defs><\/defs>/g, '')
    .replace(/url\(#([\w-]+)\)/g, (whole, id: string) => {
      const key = id.slice(id.lastIndexOf('-') + 1);
      if (Object.prototype.hasOwnProperty.call(HEVALO_FLAT, key)) return HEVALO_FLAT[key]!;
      return /^(side|neckside|chin)$/.test(key) ? 'none' : whole;
    });
}

const MEADOW: Tone = { base: '#8fae6a', light: '#b6cd8c', shade: '#6a8a4c' };

export function ask(dr: Drawing, rnd: Rnd): void {
  // a round of spring cut from paper behind him: pale sky, a far ridge with snow on it, green hills
  const disc = roundish(60, 56, 47, 46, rnd, { wobble: 0.02, tremor: 0.5, count: 36 });
  paint(dr, outline(disc), '#e3eadb');
  within(dr, outline(disc), () => {
    paint(dr, streaks(rnd, [14, 10, 106, 50], 14, -6, 18, 1.6), '#f2f4ea', 0.7);
    const ridge = tremble([[0, 62], [14, 50], [26, 54], [40, 40], [52, 50], [66, 44], [80, 36], [94, 48], [120, 46], [120, 120], [0, 120]], rnd, 0.4);
    paint(dr, outline(ridge), '#b4b3cc');
    within(dr, outline(ridge), () => paint(dr, polygon(tremble([[34, 46], [40, 39], [47, 45], [43, 44], [40, 47], [37, 45]], rnd, 0.2)) + polygon(tremble([[73, 42], [80, 35], [88, 42], [84, 41.4], [81, 44], [77, 42]], rnd, 0.2)), '#eef0f6'));
    paint(dr, outline(tremble([[0, 74], [20, 62], [42, 66], [62, 58], [86, 60], [104, 54], [120, 58], [120, 120], [0, 120]], rnd, 0.4)), MEADOW.light);
    paint(dr, outline(tremble([[0, 84], [26, 74], [56, 78], [84, 70], [120, 76], [120, 120], [0, 120]], rnd, 0.4)), MEADOW.base);
    let poplars = '';
    for (const [x, y, h] of [[20, 66, 12], [26, 68, 9], [96, 60, 11]] as const) poplars += outline(tremble(blade([x, y], [x, y - h], 3.2, { at: 0.4, point: 0.6, count: 6 }), rnd, 0.15));
    paint(dr, poplars, MEADOW.shade);
  });
  // Hevalo himself, standing in the grass
  const k = 0.0655;
  dr.add(`<g transform="translate(${n(60 - 256 * k)} ${n(10 + 14 * k)}) scale(${k})">${hevaloFlat(`${dr.prefix}hv`)}</g>`);
  // the meadow in front, deep in grass and spring flowers, hiding his hooves
  const meadow = tremble([[8, 102], [16, 92], [32, 88], [50, 91], [66, 89], [84, 90], [102, 88], [112, 96], [110, 108], [86, 113.4], [60, 114.6], [34, 113.4]], rnd, 0.5);
  paint(dr, outline(meadow), MEADOW.base);
  side(dr, meadow, 0, -2, MEADOW.shade);
  within(dr, outline(meadow), () => {
    let blades = '';
    for (let i = 0; i < 34; i++) {
      const x = 10 + rnd() * 100;
      const y = 92 + rnd() * 20;
      const lean = (rnd() - 0.5) * 4;
      blades += brush([[x, y + 3], [x + lean * 0.5, y - 2], [x + lean, y - 6]], 1, rnd, { start: 1, end: 0.05, count: 4 });
    }
    paint(dr, blades, MEADOW.light, 0.9);
  });
  let reds = '';
  let whites = '';
  let golds = '';
  for (const [x, y] of [[18, 95], [30, 99], [84, 96], [96, 101], [44, 105], [74, 106], [104, 94]] as const) reds += outline(roundish(x, y, 1.9, 1.5, rnd, { count: 7, tremor: 0.15 }));
  for (const [x, y] of [[24, 104], [36, 93], [90, 106], [64, 101], [100, 97]] as const) {
    whites += outline(roundish(x, y, 1.6, 1.3, rnd, { count: 7, tremor: 0.12 }));
    golds += ellipse(x, y, 0.5, 0.45);
  }
  paint(dr, reds, '#cf3f35');
  paint(dr, whites, '#fbf6ec');
  paint(dr, golds, '#e7a93a');
}

// ────────────────────────────────────────────────────────────────── pezkovî

const GOAT: Tone = { base: '#b6a284', light: '#d5c5a6', shade: '#86735a' };
const HORN: Tone = { base: '#8e7d66', light: '#bcab90', shade: '#5a4b3a' };
const STONE: Tone = { base: '#a9a398', light: '#cbc5b8', shade: '#7c766c' };

export function pezkovi(dr: Drawing, rnd: Rnd): void {
  // the ledge of the Zagros it stands on, broken into facets
  const ledge = tremble([[10, 110], [16, 100], [30, 95], [56, 93.4], [78, 94], [96, 97], [110, 104], [108, 112], [60, 114.4]], rnd, 0.5);
  paint(dr, outline(ledge), STONE.base);
  within(dr, outline(ledge), () => {
    paint(dr, polygon(tremble([[16, 100], [30, 95], [40, 104], [24, 112]], rnd, 0.3)) + polygon(tremble([[56, 93.4], [78, 94], [74, 103], [60, 101]], rnd, 0.3)), STONE.light);
    paint(dr, polygon(tremble([[78, 94], [96, 97], [110, 104], [92, 112], [74, 103]], rnd, 0.3)) + polygon(tremble([[40, 104], [60, 101], [62, 114], [36, 114]], rnd, 0.3)), STONE.shade);
  });
  let tufts = '';
  for (const [x, y] of [[20, 99], [102, 101]] as const) {
    for (const a of [-0.5, -0.15, 0.2, 0.5]) tufts += brush([[x, y], [x + Math.sin(a) * 2.4, y - 3], [x + Math.sin(a) * 4.4, y - 5.6]], 0.9, rnd, { start: 1, end: 0.05, count: 4 });
  }
  paint(dr, tufts, '#8a9a58');
  // the far legs, in shade
  let far = '';
  for (const pts of [[[46, 70], [47.6, 80], [47.4, 87], [46.4, 94]], [[78, 68], [82, 78], [81.4, 86], [78.6, 94]]] as Pt[][]) far += brush(pts, 5.4, rnd, { start: 1, end: 0.42, peak: 0.04, count: 10 });
  paint(dr, far, GOAT.shade);
  // the far horn, behind the head
  const hornLine: Pt[] = [[32.4, 31], [36, 18], [46, 8.6], [59, 7.6], [69, 14], [73, 22]];
  paint(dr, brush(shift(hornLine, 3, 0.6), 5, rnd, { start: 1, end: 0.12, peak: 0.02, count: 16 }), HORN.shade);
  // the body, neck and head as one, sandy grey with the dark lines a bezoar goat wears
  const goat = tremble([[34, 64], [30, 52], [27.4, 46], [21.4, 47.2], [17.6, 43.6], [20, 38.6], [26, 33.6], [32, 29], [36.4, 30.4], [40, 36], [45, 46], [52, 49.4], [62, 50.6], [72, 50.2], [81, 51], [85, 49.4], [88.4, 52.6], [91, 60], [89.6, 68], [85, 74.6], [76, 78], [64, 79.4], [52, 78.4], [42, 75.6], [36.4, 70.4]], rnd, 0.25);
  const hide = outline(goat);
  paint(dr, hide, GOAT.base);
  within(dr, hide, () => {
    paint(dr, outline(roundish(66, 78, 22, 6, rnd, { wobble: 0.08 })), '#e8dfcc');
    paint(dr, brush([[29, 46], [33, 56], [38, 66], [40, 74]], 3.2, rnd, { start: 0.5, end: 0.8, peak: 0.6, count: 10 }), '#4a3a2c');
    paint(dr, brush([[42, 73], [56, 72.4], [72, 73], [86, 71]], 2.2, rnd, { start: 0.4, end: 0.3, peak: 0.5, count: 10 }), '#4a3a2c');
    paint(dr, brush([[46, 49], [44, 58], [42, 68]], 2.2, rnd, { start: 0.3, end: 0.2, peak: 0.5, count: 8 }), '#5c4a38', 0.8);
    paint(dr, streaks(rnd, [36, 48, 90, 74], 26, 74, 5, 0.6), GOAT.light, 0.45);
  });
  side(dr, goat, -2, -2.4, GOAT.shade, { grow: 0.99 });
  side(dr, goat, 1.4, 1.8, GOAT.light, { grow: 0.98 });
  // the beard, the ear, the eye
  paint(dr, outline(tremble([[20.4, 46], [23.6, 47.4], [24.6, 53.6], [22.2, 52], [20.4, 49]], rnd, 0.15)), '#3e3024');
  paint(dr, outline(tremble(blade([37, 33], [45.4, 34.6], 3, { point: 0.9, count: 6 }), rnd, 0.1)), GOAT.shade);
  paint(dr, ellipse(28.6, 37.4, 1, 0.8), '#2a2018');
  paint(dr, ellipse(18.6, 42.4, 0.8, 0.6), '#3a2c22');
  // the near legs, dark down their fronts, and the hooves
  for (const pts of [[[39.6, 66], [38.4, 78], [37.6, 87], [38, 94]], [[84, 64], [89.6, 76], [88.4, 85], [85, 94]]] as Pt[][]) {
    paint(dr, brush(pts, 7, rnd, { start: 1, end: 0.34, peak: 0.04, count: 10 }), GOAT.base);
    paint(dr, brush(shift(pts.slice(1), -1, 0), 1.2, rnd, { start: 0.6, end: 0.8, peak: 0.5, count: 6 }), '#4a3a2c');
  }
  paint(dr, ellipse(38.4, 94.4, 2, 1.1) + ellipse(85.2, 94.4, 2, 1.1) + ellipse(46.6, 94.4, 1.8, 1) + ellipse(78.6, 94.4, 1.8, 1), '#2e241c');
  // the near horn: a long scimitar swept back, ridged with knots along its front
  const horn = brush(hornLine, 5.6, rnd, { start: 1, end: 0.1, peak: 0.02, count: 16 });
  paint(dr, horn, HORN.base);
  within(dr, horn, () => {
    paint(dr, brush(shift(hornLine, -0.9, -0.6), 1.6, rnd, { start: 1, end: 0.1, peak: 0.02, count: 12 }), HORN.light);
    let knots = '';
    for (const t of [0.08, 0.16, 0.24, 0.32, 0.4, 0.48, 0.56, 0.64]) {
      const p = along(hornLine, 50)[Math.round(t * 50)]!;
      const q = along(hornLine, 50)[Math.round(t * 50) + 1]!;
      const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
      knots += brush([[p[0] - Math.sin(a) * 3, p[1] + Math.cos(a) * 3], [p[0] + Math.sin(a) * 3, p[1] - Math.cos(a) * 3]], 0.8, rnd, { count: 4 });
    }
    paint(dr, knots, HORN.shade);
  });
}

// ───────────────────────────────────────────────────────────────────── hesp

const BAY: Tone = { base: '#8c4b2a', light: '#b26c3e', shade: '#5c2c16' };
const MANE = '#2c1b13';

export function hesp(dr: Drawing, rnd: Rnd): void {
  // the grass it stands on
  floor(dr, rnd, 62, 104, 44, 5);
  // the far legs, in shade
  let far = '';
  for (const pts of [[[53, 64], [54, 74], [55, 84], [55.6, 92], [55.6, 98]], [[80, 60], [84.4, 72], [85.4, 80], [83, 90], [81.6, 98]]] as Pt[][]) far += brush(pts, 8, rnd, { start: 1, end: 0.36, peak: 0.04, count: 12 });
  paint(dr, far, BAY.shade);
  paint(dr, ellipse(55.6, 99.6, 2.6, 1.4) + ellipse(81.4, 99.6, 2.6, 1.4), MANE);
  // the tail, falling in strands
  let tail = '';
  for (const [dx, w] of [[0, 4.6], [2.6, 3], [-1.6, 2.6]] as const) tail += brush([[94, 46], [99 + dx, 58], [99 + dx * 1.4, 72], [96 + dx, 84]], w, rnd, { start: 0.9, end: 0.1, peak: 0.25, count: 12 });
  paint(dr, tail, MANE);
  // body, neck and head: a bay with a deep chest, an arched neck and a fine head
  const horse = tremble([[44, 72], [40, 64], [38, 56], [33, 46], [29, 48.4], [20.6, 50.4], [16, 47.4], [16.6, 42], [22, 32], [27.6, 24], [31, 21], [32.4, 14], [35.4, 19.4], [40, 21.6], [48, 30], [56, 39], [66, 43.4], [78, 43], [88, 41], [95, 45.6], [97.4, 54], [95, 64], [90, 68.4], [82, 70.6], [70, 73], [56, 72.4]], rnd, 0.25);
  const coat = outline(horse);
  paint(dr, coat, BAY.base);
  within(dr, coat, () => paint(dr, streaks(rnd, [30, 30, 98, 72], 30, 20, 7, 0.7), BAY.light, 0.35));
  side(dr, horse, -2.4, -2.6, BAY.shade, { grow: 0.99 });
  side(dr, horse, 1.6, 1.8, BAY.light, { grow: 0.98 });
  // the blaze down its face, the eye, the nostril, the mane along its crest and the forelock
  within(dr, coat, () => paint(dr, brush([[29.6, 24.4], [24.4, 33], [19, 43]], 2.4, rnd, { start: 0.6, end: 1, peak: 0.6, count: 8 }), '#f3ead8'));
  paint(dr, ellipse(30, 30.6, 1.3, 1), '#1e120c');
  paint(dr, ellipse(18.4, 45.4, 1, 0.7), '#3a1e12');
  let mane = '';
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const root = lerp([33, 20], [54, 38], t);
    mane += brush([root, [root[0] + 3, root[1] + 3.6], [root[0] + 4.6, root[1] + 8.4 - t * 2]], 3, rnd, { start: 1, end: 0.1, peak: 0.1, count: 6 });
  }
  mane += brush([[32.6, 21], [29, 24], [27.6, 28]], 2, rnd, { start: 1, end: 0.1, count: 5 });
  paint(dr, mane, MANE);
  // the bridle: leather straps, a red tassel at the cheek and a string of blue beads on the brow, against the evil eye
  paint(dr, brush([[33.6, 22], [30.4, 31.6], [27.6, 42], [24, 49.4]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 8 }) + brush([[16.6, 44], [22, 43], [28, 41.6]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }), '#3a2218');
  let beads = '';
  for (let i = 0; i < 5; i++) beads += ellipse(26.8 + i * 1.5, 24 + i * 0.5, 0.75, 0.75);
  paint(dr, beads, '#3b8fc4');
  paint(dr, ellipse(27.8, 43.4, 1.3, 1.3), '#e0aa3e');
  let tassel = '';
  for (let i = 0; i < 5; i++) tassel += touch(27.4 + (i - 2) * 0.6, 48, 7, 0.6, 90 + (i - 2) * 6);
  paint(dr, tassel, '#c3302e');
  // the saddle cloth: a kilim thrown over its back, tasselled at the hem
  const cloth = tremble([[56, 40.4], [66, 43.6], [80, 43.2], [82, 54], [84, 64.4], [58, 66], [54.6, 54]], rnd, 0.3);
  paint(dr, outline(cloth), '#b5432f');
  within(dr, outline(cloth), () => {
    band(dr, scaleAbout(cloth, 69, 54, 1.2), scaleAbout(cloth, 69, 54, 0.84), '#2f3c68');
    let eyes = '';
    for (const [x, y] of [[62, 50], [69, 50.6], [76, 50.2], [64, 58.6], [72, 58.8]] as const) eyes += polygon([[x, y - 2.4], [x + 2.2, y], [x, y + 2.4], [x - 2.2, y]]);
    paint(dr, eyes, '#dea43f');
    paint(dr, streaks(rnd, [54, 40, 86, 66], 14, 86, 5, 0.5), '#d06a52', 0.4);
  });
  paint(dr, outline(roundish(68, 44.6, 10, 2.6, rnd, { count: 12 })), '#6e3a1e');
  let hem = '';
  for (let i = 0; i < 9; i++) hem += touch(58.6 + i * 3.1, 67.6 + (i % 2) * 0.4, 4, 0.8, 90);
  paint(dr, hem, '#e0aa3e');
  // the near legs: dark from the knee down, a white sock on one, the hooves
  for (const [pts, sock] of [[[[46, 62], [45.4, 74], [45, 84], [44.6, 92], [44.6, 98]], true], [[[88, 58], [92.6, 70], [93.4, 80], [90.6, 90], [89.6, 98]], false]] as Array<[Pt[], boolean]>) {
    const leg = brush(pts, 9, rnd, { start: 1, end: 0.34, peak: 0.04, count: 12 });
    paint(dr, leg, BAY.base);
    within(dr, leg, () => {
      paint(dr, brush(shift(pts.slice(0, 3), 1.6, 0), 2.4, rnd, { start: 0.2, end: 0.6, peak: 0.6, count: 8 }), BAY.shade);
      paint(dr, polygon([[30, pts[2]![1] + 2], [100, pts[2]![1] + 2], [100, 104], [30, 104]]), sock ? '#f3ead8' : MANE);
    });
  }
  paint(dr, ellipse(44.4, 99.4, 2.8, 1.5) + ellipse(89.4, 99.4, 2.8, 1.5), '#3a2a20');
}
