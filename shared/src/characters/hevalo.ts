/**
 * Hevalo: the app's deer, standing on all four legs and facing forward —
 * the same deer as the app icon, from the antlers to the freckles on his
 * cheeks, now with a body.
 *
 * His head is drawn on the icon's own grid (512 across), so the two can be
 * laid one over the other and stay the same face. The body is drawn on a
 * smaller grid, where the head is 0.29 of that size, because its slim legs
 * are easier to place there; `at` brings it onto the head's grid.
 *
 * Unlike the people, the deer is lit like a soft toy: round radial light on
 * the head and the eyes, which is how the icon is painted. His mouth is a
 * deer's, a small line under the nose; it opens beneath the nose and the nose
 * is the overlay, so every shape tucks its top under it.
 */
import type { Viseme } from '../lipsync/visemes.js';
import type { Pt } from '../art/svg.js';
import { linearAt, linearBox, n, radialBox } from '../art/svg.js';
import type { CharacterArt } from './types.js';
import type { Knot } from './pen.js';
import { alpha, clipDef, clipped, curve, ellipse, fill, line, mirror, oval, part, symmetric, taper } from './pen.js';

const C = {
  fur: '#be7b41',
  furLight: '#c98b4c',
  furShade: '#ad6835',
  furDeep: '#99572b',
  patch: '#cf9560',
  bridge: '#dca35e',
  bridgeLight: '#e5bb7b',
  muzzle: '#ecc791',
  muzzleEdge: '#dca874',
  freckle: '#e2ae76',
  cream: '#f2d5a8',
  earIn: '#f2d3a6',
  earTuft: '#dcae80',
  antler: '#4f3029',
  antlerLight: '#6e4a40',
  antlerDeep: '#3a1c1d',
  white: '#ffffff',
  whiteEdge: '#f2d4ae',
  pupil: '#4f2a23',
  nose: '#4a2a24',
  noseLight: '#8a655b',
  mouth: '#4a2822',
  lip: '#d4a070',
  tongue: '#d98477',
  teeth: '#fbf1e6',
  neck: '#b0733d',
  body: '#c68c50',
  thigh: '#b97f46',
  shin: '#a86f3c',
  edge: '#8f5a2c',
  hind: '#935d34',
  bibTop: '#d9b582',
  bib: '#e7c899',
  hoof: '#73503a',
  hoofLight: '#8a6447',
  hoofDeep: '#4e3324',
  hindHoof: '#472e21',
} as const;

/** His face is drawn about this upright line, in the icon's measure; his eyes sit a hair to one side of it, as in the icon. */
const AXIS = 255;
const EYE_AXIS = 253.5;

/** A point on the body's smaller grid, brought onto the head's. */
const at = (x: number, y: number): Pt => [(x - 118.55) / 0.29, (y - 183.8) / 0.29];
const atK = (pts: readonly (readonly [number, number, number?])[]): Knot[] => pts.map(([x, y, r]) => [...at(x, y), r ?? 1] as const);

// ─────────────────────────────────────────────────────────────── the body

/** Neck, chest and front legs as one outline, down to the hooves; the neck runs on up behind the head. */
const FRONT: Knot[] = atK([
  [223.0, 331.6], [242.7, 376.7], [247.5, 393.1], [248.9, 402.5], [249.2, 409.1], [247.6, 425.8], [244.7, 436.6],
  [241.7, 444.5], [236.7, 468.8], [228.2, 500.9], [227.4, 507.3], [228.6, 516.2], [228.6, 521.4], [227.7, 526.3],
  [225.1, 532.5], [224.2, 536.8], [222.2, 564.4], [222.1, 585.6], [224.3, 597.1], [224.1, 608.6], [227.6, 615.0],
  [229.1, 620.9], [228.2, 623.1], [225.3, 624.6], [223.6, 624.5], [220.6, 622.6, 0.4], [218.6, 624.7],
  [217.2, 624.9], [211.2, 622.4], [208.2, 619.6], [208.2, 604], [207.4, 600], [207.8, 596], [209.8, 588],
  [210.3, 580], [212.2, 576], [212.1, 556], [211.9, 552], [210.6, 548], [210.4, 536], [209.2, 532], [206.9, 528],
  [205.6, 520], [206.4, 512], [207.7, 508], [208.1, 504], [207.6, 488], [206.8, 484], [206.8, 476],
  [204.4, 454.2, 0.4], [199, 453], [193.4, 452.6], [187.8, 453], [182.6, 454.2, 0.4], [181.4, 464], [179.1, 504],
  [179.6, 508], [180.8, 512], [181.7, 520], [181.3, 524], [177.3, 536], [177.6, 548], [175.7, 552], [175.6, 556],
  [175.6, 576], [177.4, 580], [177.2, 584], [177.7, 588], [179.6, 596], [179.7, 600], [179.1, 604], [179.6, 610],
  [179.4, 619.1], [178.4, 621.0], [171.8, 624.6], [168.7, 625.0], [167.4, 623.3], [166.4, 623.0], [163.9, 624.5],
  [162.4, 624.7], [159.7, 623.4], [158.5, 621.8], [159.5, 616.6], [163.7, 608.0], [163.3, 598.4], [165.2, 586.6],
  [165.1, 564.4], [163.0, 534.7], [159.7, 525.0], [158.9, 520.8], [158.9, 514.8], [160.1, 508.6], [160.0, 504.2],
  [149.3, 462.3], [145.6, 444.5], [142.4, 436.0], [139.4, 425.4], [138.2, 416.1], [138.0, 405.9], [139.5, 393.6],
  [142.2, 382.6], [163.0, 331.9], [164.6, 326.5], [166, 300, 0.4], [220, 300, 0.4], [220.8, 312],
]);

/** The hind legs, seen between the front legs, a shade darker; they run on under the front legs so no gap opens at their edges. */
const HIND_LEFT: Knot[] = atK([
  [180.3, 450, 0.4], [180.1, 460], [179.4, 464], [178.3, 480], [177.1, 504], [177.6, 508], [178.8, 512],
  [179.7, 520], [179.3, 524], [175.3, 536], [175.1, 540], [175.6, 548], [177.3, 552], [177.7, 556], [177.8, 572],
  [177.4, 576], [175.4, 580], [175.2, 584], [177.6, 596], [177.1, 606, 0.4], [187.9, 606, 0.4], [187.9, 604],
  [186.9, 600], [189.2, 592], [186.9, 580], [186.3, 564], [187.3, 540], [187.9, 532], [189.6, 520], [189.7, 512],
  [184.9, 496], [184.7, 492], [187.2, 472], [190.1, 456], [190.1, 450, 0.4],
]);

const HIND_RIGHT: Knot[] = atK([
  [206.6, 450, 0.4], [206.6, 456], [208.8, 476], [208.8, 484], [209.6, 488], [210.1, 504], [209.7, 508],
  [208.4, 512], [207.6, 520], [208.9, 528], [211.2, 532], [212.4, 536], [212.7, 540], [212.6, 548], [210.1, 552],
  [209.8, 560], [209.9, 576], [212.3, 580], [212.3, 584], [211.8, 588], [209.8, 596], [209.4, 600],
  [210.2, 606, 0.4], [199.6, 606, 0.4], [200.3, 600], [198.6, 592], [198.9, 588], [201.1, 576], [201.2, 564],
  [199.7, 536], [198.2, 520], [198.2, 512], [199.9, 504], [202.4, 496], [202.7, 492], [201.4, 480], [197.6, 456],
  [197.6, 450, 0.4],
]);

/** The cream of his chest and belly, from under the chin to between the legs. */
const BIB: Knot[] = atK([
  [190, 455.8], [181.5, 452.7], [178.3, 449.6], [172.4, 441.4], [168.2, 433.7], [165.1, 425.7], [163.1, 418.2],
  [161.9, 409.5], [159.3, 409.8, 0.4], [159.4, 392.7], [161.1, 376.3], [165, 356.9], [169.6, 341], [176, 334.6],
  [192.8, 332.6], [209.6, 334.6], [216, 341], [221, 357.1], [225.9, 383.9], [227.9, 408.3, 0.4], [224.5, 407.8],
  [222.9, 420.1], [219.8, 430.2], [215.8, 439.7], [211.4, 446], [205.9, 452.5], [197.5, 456.1], [192.6, 454.7],
]);

/** The front hooves, cloven, the split showing at the toe. */
const HOOF_LEFT: Knot[] = atK([
  [161.5, 624.1], [159.1, 622.5], [158.9, 619.7], [161.2, 612.9], [164.4, 608.5], [168.6, 607.3], [173.3, 608.1],
  [178.0, 611.1], [178.9, 613.2], [179.8, 613.8, 0.4], [179.0, 615.6], [179.0, 619.9], [177.4, 621.7],
  [170.6, 624.9], [168.6, 624.8], [166.8, 623.0], [163.3, 624.4],
]);

const HOOF_RIGHT: Knot[] = atK([
  [228.3, 622.7], [224.6, 624.5], [220.4, 622.6, 0.4], [218.6, 624.5], [217.6, 624.8], [209.9, 621.5],
  [208.2, 619.2], [208.1, 615.0], [204.9, 613.1, 0.15], [208.6, 612.8, 0.4], [208.7, 611.2], [207.6, 608.9],
  [208.1, 606.2, 0.4], [208.9, 606.2], [209.8, 607.4], [209.6, 610.1], [210.2, 610.7, 0.4], [216.9, 607.3],
  [219.3, 607.3], [223.5, 608.8], [227.8, 615.8], [228.9, 619.7],
]);

/** The hind hooves, darker, half hidden behind the front legs. */
const HIND_HOOF_LEFT: Knot[] = atK([
  [179.9, 613.7], [178.9, 613.2], [178.2, 610.9], [178.1, 607.4], [179.8, 604.5], [180.2, 600.6], [181.6, 600.0],
  [183.3, 600.5], [186.6, 603.0], [187.6, 605.7], [187.9, 608.8], [186.1, 611.2], [181.4, 613.5],
]);

const HIND_HOOF_RIGHT: Knot[] = atK([
  [207.3, 613.7], [201.2, 611.2], [199.6, 609.1], [199.6, 606.7], [200.7, 603.3], [205.9, 600.0], [206.9, 600.7],
  [208.1, 606.4], [207.6, 608.8], [208.8, 610.6], [208.5, 612.8],
]);

function body(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const [, neck] = at(0, 318);
  const [left] = at(137, 0);
  const [right] = at(249, 0);
  const [, foot] = at(0, 610);
  const [, bibTop] = at(0, 333);
  const [, bibMid] = at(0, 368);
  const [, hoofTop] = at(0, 606);
  const [, hoofEnd] = at(0, 626);
  return part(
    [
      // the fur darkens from the chest to the hooves, as it does in the light from above
      linearAt(id('fur'), [
        [0, C.neck],
        [0.22, C.body],
        [0.47, C.body],
        [0.6, C.thigh],
        [0.64, C.shin],
        [1, C.shin],
      ], 0, neck, 0, foot),
      linearAt(id('side'), [
        [0, C.edge, 0.55],
        [0.16, C.edge, 0],
        [0.84, C.edge, 0],
        [1, C.edge, 0.55],
      ], left, 0, right, 0),
      clipDef(id('torso'), `M${n(at(120, 0)[0])},${n(at(0, 290)[1])}H${n(at(266, 0)[0])}V${n(at(0, 470)[1])}H${n(at(120, 0)[0])}z`),
      clipDef(id('figure'), curve(FRONT)),
      radialBox(id('neckside'), [
        [0, C.edge, 0.6],
        [1, C.edge, 0],
      ]),
      radialBox(id('chin'), [
        [0, C.edge, 0.5],
        [1, C.edge, 0],
      ]),
      // the cream fades in from the neck's own colour, so the bib has no hard top
      linearAt(id('bib'), [
        [0, C.neck],
        [0.45, C.bibTop],
        [1, C.bib],
      ], 0, bibTop, 0, bibMid),
      linearAt(id('hoof'), [
        [0, C.hoofLight],
        [0.4, C.hoof],
        [1, C.hoofDeep],
      ], 0, hoofTop, 0, hoofEnd),
    ],
    [
      fill(curve(HIND_LEFT) + curve(HIND_RIGHT), C.hind),
      fill(curve(HIND_HOOF_LEFT) + curve(HIND_HOOF_RIGHT), C.hindHoof),
      fill(curve(FRONT), `url(#${id('fur')})`),
      // the sides of the body and neck turn from the light; the legs below are lit evenly
      clipped(id('torso'), fill(curve(FRONT), `url(#${id('side')})`)),
      // each side of the neck in shade, softly
      clipped(id('figure'), ellipse(at(166.6, 0)[0], at(0, 332)[1], 34, 92, `url(#${id('neckside')})`) + ellipse(at(219.4, 0)[0], at(0, 332)[1], 34, 92, `url(#${id('neckside')})`)),
      // the shadow the head throws on the neck
      ellipse(at(192.6, 0)[0], at(0, 321)[1], 86, 44, `url(#${id('chin')})`),
      fill(curve(BIB), `url(#${id('bib')})`),
      fill(curve(HOOF_LEFT) + curve(HOOF_RIGHT), `url(#${id('hoof')})`),
      // the split between the two toes of each hoof
      fill(taper(atK([[166.6, 616], [166.8, 620], [166.9, 623.4]]).map(([x, y]) => [x, y] as Pt), [0, 3, 4]) + taper(atK([[219, 616], [218.8, 620], [218.6, 623.6]]).map(([x, y]) => [x, y] as Pt), [0, 3, 4]), C.hoofDeep),
    ],
  );
}

// ─────────────────────────────────────────────────────────────── the head

const ANTLER: Knot[] = [
  [159.6, 160],
  [158.6, 134],
  [138, 130],
  [114.6, 124],
  [92.6, 112.4],
  [78.6, 96.4],
  [70.8, 74],
  [66.4, 50],
  [65.6, 27],
  [70, 9.6],
  [82.7, 2.2],
  [96, 2],
  [107.7, 7.7],
  [113.5, 19.2],
  [113.5, 34.6],
  [111.6, 46],
  [113.5, 55.8],
  [119, 61.2, 0.5],
  [126.6, 54],
  [128.8, 38.5],
  [134.6, 28.8],
  [146, 26],
  [161.5, 30.8],
  [169, 42.3],
  [171, 57.7],
  [165.4, 71],
  [155.8, 80.8],
  [152.4, 86.6],
  [157.7, 92.3],
  [167.3, 94, 0.5],
  [177, 86.5],
  [182.7, 75],
  [192.3, 69.2],
  [205.8, 69.2],
  [217.3, 77],
  [222.3, 90.4],
  [219, 105.8],
  [209.6, 117.3],
  [200.6, 125.6],
  [198.4, 134],
  [200, 160],
];

/** Light along the upper edge of each tine, as the icon shows it. */
const ANTLER_LIGHT: readonly (readonly Pt[])[] = [
  [
    [74, 60],
    [72.4, 30],
    [80, 10.6],
    [95, 7.4],
  ],
  [
    [131.6, 44],
    [138, 32.6],
    [152, 31.4],
  ],
  [
    [184.2, 84],
    [192, 74.4],
    [206, 74.6],
  ],
  [
    [86, 96],
    [108, 113.6],
    [140, 122.4],
  ],
];

const EAR: Knot[] = [
  [140, 172],
  [134, 164],
  [126.5, 156],
  [121, 147],
  [113, 138],
  [100, 128.6],
  [86, 120],
  [70, 113.6],
  [48, 108.4],
  [22, 106.6],
  [8, 108.6, 0.7],
  [1.6, 116, 0.7],
  [1.2, 132],
  [2.4, 150],
  [5.4, 166],
  [10.4, 181],
  [17, 194],
  [25, 206],
  [35.6, 217],
  [48, 225.6],
  [63, 232.6],
  [80, 237.4],
  [100, 240],
  [118, 236],
  [128, 210],
  [138, 185],
];

const EAR_IN: Knot[] = [
  [15.4, 127],
  [38.5, 124.6],
  [65.4, 130.6],
  [88.5, 146],
  [102, 165.4],
  [107.7, 188.5],
  [107.4, 209.6],
  [103.4, 222.4],
  [88.5, 225],
  [65.4, 215.4],
  [42.3, 196],
  [27, 173],
  [17.3, 150],
];

const EAR_TUFT: Knot[] = [
  [66, 172.4, 0],
  [88, 177.4],
  [79.6, 183.6, 0],
  [94.4, 189],
  [83.4, 196.6, 0],
  [98, 202],
  [106.4, 207.6, 0],
  [105.6, 186],
  [96, 172],
  [82, 168],
];

const HEAD: Knot[] = symmetric(
  [
    [AXIS, 137],
    [228, 139.4],
    [203, 145],
    [180, 153],
    [160, 162.6],
    [143, 173],
    [128, 188],
    [114, 208],
    [105, 228],
    [100, 248],
    [97.6, 268],
    [97, 288],
    [98.4, 310],
    [101.4, 330],
    [105.6, 348],
    [111.6, 364],
    [119, 378],
    [127.6, 391],
    [138.6, 403],
    [150, 414],
    [163, 425.4],
    [180, 436.4],
    [197, 446.4],
    [215, 454.4],
    [234, 459.4],
    [AXIS, 461],
  ],
  AXIS,
  // the icon's head is a touch fuller on its right side; the face inside it stays centred
).map(([x, y, r]) => [x > AXIS ? AXIS + (x - AXIS) * 1.016 : AXIS - (AXIS - x) * 1.005, y, r ?? 1] as const);

const MUZZLE: Knot[] = symmetric(
  [
    [AXIS, 348],
    [228, 352],
    [207.6, 364],
    [194, 383],
    [189.4, 404],
    [193.6, 425],
    [204.6, 442],
    [222, 454.6],
    [AXIS, 460.4],
  ],
  AXIS,
);

/** Light freckles on each cheek, as on the icon. */
const FRECKLES: readonly (readonly [number, number, number, number, number])[] = [
  [130.4, 345, 7.4, 5.4, -28],
  [162.4, 362, 7.4, 5, -18],
  [143.4, 371.6, 5.8, 4.8, -20],
];

function freckles(): string {
  const one = ([x, y, rx, ry, deg]: readonly [number, number, number, number, number], flip: boolean): string => {
    const cx = flip ? 2 * AXIS - x : x;
    return ellipse(cx, y, rx, ry, C.freckle, ` transform="rotate(${flip ? -deg : deg} ${cx} ${y})"`);
  };
  return FRECKLES.map((f) => one(f, false) + one(f, true)).join('');
}

function head(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const antlers = curve(ANTLER) + curve(mirror(ANTLER, AXIS));
  const ears = curve(EAR) + curve(mirror(EAR, AXIS));
  const earsIn = curve(EAR_IN) + curve(mirror(EAR_IN, AXIS));
  const tufts = curve(EAR_TUFT) + curve(mirror(EAR_TUFT, AXIS));
  const lights = ANTLER_LIGHT.map((s) => taper(s, s.map((_, i) => (i === 0 || i === s.length - 1 ? 0 : 6)))).join('');
  const lightsR = ANTLER_LIGHT.map((s) => taper(s.map(([x, y]) => [2 * AXIS - x, y] as Pt), s.map((_, i) => (i === 0 || i === s.length - 1 ? 0 : 6)))).join('');
  return part(
    [
      linearBox(id('antler'), [
        [0, C.antlerLight],
        [0.35, C.antler],
        [1, C.antlerDeep],
      ]),
      radialBox(id('ear'), [
        [0, C.furLight],
        [0.6, C.fur],
        [1, C.furDeep],
      ], 0.6, 0.5, 0.62),
      radialBox(id('head'), [
        [0, C.furLight],
        [0.55, C.fur],
        [0.85, C.furShade],
        [1, C.furDeep],
      ], 0.5, 0.55, 0.62),
      radialBox(id('patch'), [
        [0, C.patch],
        [0.8, C.patch],
        [1, C.patch, 0],
      ]),
      radialBox(id('bridge'), [
        [0, C.bridgeLight],
        [0.45, C.bridge],
        [0.75, C.bridge, 0.6],
        [1, C.bridge, 0],
      ], 0.5, 0.62, 0.5),
      radialBox(id('muzzle'), [
        [0, C.muzzle],
        [0.65, C.muzzle],
        [1, C.muzzleEdge],
      ], 0.5, 0.45, 0.6),
    ],
    [
      fill(antlers, `url(#${id('antler')})`),
      fill(lights + lightsR, C.antlerLight, alpha(0.55)),
      fill(ears, `url(#${id('ear')})`),
      fill(earsIn, C.earIn),
      fill(tufts, C.earTuft),
      fill(curve(HEAD), `url(#${id('head')})`),
      ellipse(EYE_AXIS - 76, 281, 64, 71, `url(#${id('patch')})`),
      ellipse(EYE_AXIS + 76, 281, 64, 71, `url(#${id('patch')})`),
      ellipse(AXIS, 318, 60, 128, `url(#${id('bridge')})`),
      fill(curve(MUZZLE), `url(#${id('muzzle')})`),
      freckles(),
    ],
  );
}

// ─────────────────────────────────────────────────────────────── the eyes

function eyesOpen(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  return part(
    [
      // each eye is brightest toward the nose and fades to cream at its outer side
      radialBox(id('whiteL'), [
        [0, C.white],
        [0.55, C.white],
        [0.78, '#f8ead9'],
        [0.92, '#efd7bd'],
        [1, '#e5c6a5'],
      ], 0.6, 0.48, 0.62),
      radialBox(id('whiteR'), [
        [0, C.white],
        [0.55, C.white],
        [0.78, '#f8ead9'],
        [0.92, '#efd7bd'],
        [1, '#e5c6a5'],
      ], 0.4, 0.48, 0.62),
    ],
    [
      ellipse(EYE_AXIS - 76, 281, 53.4, 60.6, `url(#${id('whiteL')})`),
      ellipse(EYE_AXIS + 76, 281, 53.4, 60.6, `url(#${id('whiteR')})`),
      ellipse(EYE_AXIS - 60, 281.6, 22, 34, C.pupil),
      ellipse(EYE_AXIS + 60, 281.6, 22, 34, C.pupil),
      // the light in each eye, on the same side of both, as one light falls on them
      fill(oval(184.4, 266.6, 10.4) + oval(305.4, 266.6, 10.4), C.white),
    ],
  );
}

/** A blink: the lids down over each eye, in the fur's own light colour, closed along a soft dark line. */
function eyesClosed(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const lid = (cx: number): string =>
    taper(
      [
        [cx - 46, 292],
        [cx - 25, 307],
        [cx, 312],
        [cx + 25, 307],
        [cx + 46, 292],
      ],
      [2, 6.4, 7.4, 6.4, 2],
    );
  return part(
    [
      radialBox(id('lid'), [
        [0, C.patch],
        [0.8, C.patch],
        [1, '#dba06a'],
      ], 0.5, 0.4, 0.55),
    ],
    [
      ellipse(EYE_AXIS - 76, 281, 54.4, 61.6, `url(#${id('lid')})`),
      ellipse(EYE_AXIS + 76, 281, 54.4, 61.6, `url(#${id('lid')})`),
      fill(lid(EYE_AXIS - 76) + lid(EYE_AXIS + 76), C.pupil),
    ],
  );
}

// ─────────────────────────────────────────────────────────────── the mouth

/** The nose: drawn over the mouth, so every mouth begins under it. */
function nose(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const shape: Knot[] = symmetric(
    [
      [AXIS, 361.8],
      [242.9, 362.3],
      [228, 364.6],
      [218.6, 367.3],
      [213, 371.6],
      [210.4, 378.6],
      [210.6, 386],
      [211.8, 391.6],
      [214.2, 396.6],
      [218.8, 402.4],
      [232.4, 414],
      [246.8, 421],
      [AXIS, 422.6],
    ],
    AXIS,
  );
  return part(
    [
      linearBox(id('nose'), [
        [0, '#5c3830'],
        [1, '#3c221d'],
      ]),
    ],
    [fill(curve(shape), `url(#${id('nose')})`), ellipse(AXIS, 373.6, 25, 7.6, C.noseLight, alpha(0.85))],
  );
}

/**
 * The deer's mouth line: down from the nose, then a soft curve out to either
 * side, as one round-ended stroke. `y` is where the line leaves the middle,
 * `hw` how far out it reaches, `dip` how far its middle sags below the
 * middle, and `lift` how far the corners turn back up.
 */
function mouthLine(y: number, hw: number, dip: number, lift: number, width = 5.2): string {
  const side = (k: number): Knot[] => [
    [AXIS + k * hw, y + dip * 0.6 - lift],
    [AXIS + k * hw * 0.82, y + dip],
    [AXIS + k * hw * 0.5, y + dip * 0.95],
    [AXIS + k * hw * 0.18, y + dip * 0.45],
  ];
  const d = curve([...side(-1), [AXIS, y, 0], ...side(1).reverse()], false);
  return line(`M${AXIS},414V${y}${d}`, C.mouth, width);
}

interface DeerOpening {
  /** half the opening's width, where its corners sit, and how far down it reaches */
  hw: number;
  corner: number;
  bottom: number;
  /** a round mouth (o, u) instead of one that opens beneath the mouth line */
  round?: boolean;
  /** how high the tongue comes; `tip` lifts it to the teeth */
  tongue: number;
  tip?: boolean;
  /** how much of the upper and lower front teeth shows */
  teeth?: number;
  lower?: number;
}

/**
 * Measured as the people's are, against each other: `a` the widest and
 * deepest, `o` round, `u` small and pushed forward, `i` spread with the
 * teeth showing, `etc` the teeth nearly together, `l` the tongue lifted.
 */
const DEER_OPEN: Record<Exclude<Viseme, 'rest' | 'mbp' | 'fv'>, DeerOpening> = {
  a: { hw: 46, corner: 437, bottom: 486, tongue: 16 },
  e: { hw: 43, corner: 435, bottom: 468, tongue: 11, teeth: 12 },
  i: { hw: 44, corner: 432, bottom: 458, tongue: 0, teeth: 12, lower: 9 },
  o: { hw: 23, corner: 447, bottom: 472, round: true, tongue: 9 },
  u: { hw: 13, corner: 444, bottom: 458, round: true, tongue: 0 },
  etc: { hw: 39, corner: 434, bottom: 455, tongue: 0, teeth: 11, lower: 9 },
  l: { hw: 37, corner: 435, bottom: 467, tongue: 22, tip: true, teeth: 10 },
};

const TOP = 429;

function deerOpen(o: DeerOpening, clipId: string): string {
  const { hw, corner, bottom } = o;
  const hole: Knot[] = o.round
    ? [
        [AXIS, TOP],
        [AXIS + hw, corner],
        [AXIS, bottom],
        [AXIS - hw, corner],
      ]
    : [
        [AXIS, TOP, 0.4],
        [AXIS + hw * 0.5, corner + 2],
        [AXIS + hw, corner, 0.4],
        [AXIS + hw * 0.6, bottom - (bottom - corner) * 0.2],
        [AXIS, bottom],
        [AXIS - hw * 0.6, bottom - (bottom - corner) * 0.2],
        [AXIS - hw, corner, 0.4],
        [AXIS - hw * 0.5, corner + 2],
      ];
  const d = curve(hole);
  const inner = [fill(`M${AXIS - hw - 6},${TOP - 12}h${2 * hw + 12}v${bottom - TOP + 24}h${-2 * hw - 12}z`, C.mouth)];
  if (o.tongue > 0) {
    const t = o.tip
      ? curve([
          [AXIS - hw * 0.8, bottom + 10],
          [AXIS - hw * 0.45, bottom - o.tongue * 0.6],
          [AXIS, TOP + (o.teeth ?? 0) + 4],
          [AXIS + hw * 0.45, bottom - o.tongue * 0.6],
          [AXIS + hw * 0.8, bottom + 10],
        ])
      : oval(AXIS, bottom + o.tongue * 0.25, hw * 0.62, o.tongue);
    inner.push(fill(t, C.tongue));
  }
  if (o.teeth) {
    // two small front teeth under the nose, parted down the middle
    inner.push(fill(`M${AXIS - 19},${TOP - 10}h38v${10 + o.teeth}h-38z`, C.teeth), line(`M${AXIS},${TOP}v${o.teeth}`, C.whiteEdge, 2));
  }
  if (o.lower) inner.push(fill(`M${AXIS - 17},${bottom + 10}v${-10 - o.lower}h34v${10 + o.lower}z`, C.teeth));
  // the lip round the opening, in the muzzle's shaded tone
  const lip = o.round ? oval(AXIS, (TOP + bottom) / 2 + 1, hw + 5.5, (bottom - TOP) / 2 + 5.5) : curve([[AXIS - hw - 3, corner - 1], [AXIS, bottom + 6], [AXIS + hw + 3, corner - 1]]);
  return part(
    [clipDef(clipId, d)],
    [fill(lip, C.lip), clipped(clipId, inner.join('')), o.round ? line(`M${AXIS},414V${TOP + 1}`, C.mouth, 5.2) : mouthLine(TOP, hw + 3, corner - TOP + 1, 0, 4.6)],
  );
}

function deerMouths(p: string): Record<Viseme, string> {
  const id = (v: Viseme): string => `${p}mouth-${v}`;
  return {
    rest: mouthLine(428, 43.5, 9.4, 3.4),
    // pressed: the line drawn straighter and firmer, the chin pushed up beneath it
    mbp: mouthLine(429, 36, 3, -1, 6.4) + line(curve([[AXIS - 16, 441], [AXIS, 443.4], [AXIS + 16, 441]], false), C.lip, 3),
    // the lower lip drawn up under the front teeth
    fv: part(
      [],
      [
        fill(curve([[AXIS - 22, 433], [AXIS, 429], [AXIS + 22, 433], [AXIS + 18, 447], [AXIS, 450], [AXIS - 18, 447]]), C.mouth),
        fill(`M${AXIS - 14},428h28v13h-28z`, C.teeth),
        line(`M${AXIS},430V441`, C.whiteEdge, 2),
        fill(curve([[AXIS - 25, 440], [AXIS, 437.4], [AXIS + 25, 440], [AXIS + 16, 450], [AXIS, 452], [AXIS - 16, 450]]), C.lip),
        mouthLine(429, 38, 5, 0, 4.8),
      ],
    ),
    l: deerOpen(DEER_OPEN.l, id('l')),
    etc: deerOpen(DEER_OPEN.etc, id('etc')),
    a: deerOpen(DEER_OPEN.a, id('a')),
    e: deerOpen(DEER_OPEN.e, id('e')),
    i: deerOpen(DEER_OPEN.i, id('i')),
    o: deerOpen(DEER_OPEN.o, id('o')),
    u: deerOpen(DEER_OPEN.u, id('u')),
  };
}

export function drawHevalo(p: string): CharacterArt {
  return {
    id: 'hevalo',
    name: 'Hevalo',
    viewBox: { x: -14, y: -14, w: 540, h: 1556 },
    bust: { x: -15, y: -16, w: 540, h: 540 },
    headPivot: { x: AXIS, y: 446 },
    body: body(p),
    head: head(p),
    eyes: { open: eyesOpen(p), closed: eyesClosed(p) },
    mouths: deerMouths(p),
    overlay: nose(p),
  };
}
