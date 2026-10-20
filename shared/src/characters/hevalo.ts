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
import { linearBox, radialBox } from '../art/svg.js';
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
  body: '#c8955c',
  bodyShade: '#a8713f',
  leg: '#b78450',
  legLow: '#a87243',
  legBehind: '#976539',
  bib: '#ebc794',
  bibLight: '#f3d9ae',
  hoof: '#6b4733',
  hoofLight: '#8c6650',
  hoofDeep: '#4e3122',
} as const;

/** His face is drawn about this upright line, in the icon's measure; his eyes sit a hair to one side of it, as in the icon. */
const AXIS = 255;
const EYE_AXIS = 253.5;

/** A point on the body's smaller grid, brought onto the head's. */
const at = (x: number, y: number): Pt => [(x - 118.55) / 0.29, (y - 183.8) / 0.29];
const atK = (pts: readonly (readonly [number, number, number?])[]): Knot[] => pts.map(([x, y, r]) => [...at(x, y), r ?? 1] as const);

// ─────────────────────────────────────────────────────────────── the body

/**
 * Neck, chest and front legs as one outline, so the legs grow out of the
 * chest with no seam; the space between the legs is part of the outline.
 */
const FIGURE: Knot[] = atK([
  [165.4, 300],
  [165, 330],
  [163.2, 343],
  [157, 354],
  [150, 363.4],
  [144.6, 374],
  [141, 385],
  [138.8, 397],
  [138.2, 408],
  [139, 420],
  [141.2, 431],
  [144.4, 441.4],
  [147.4, 452],
  [150, 462],
  [153, 480],
  [156.6, 498],
  [158.6, 506],
  [158.4, 516],
  [160.8, 528],
  [164, 537],
  [164.6, 550],
  [165, 570],
  [165.4, 590],
  [164.6, 609, 0],
  [176.6, 609, 0],
  [176, 590],
  [175.6, 570],
  [175.6, 550],
  [176.4, 536],
  [179, 526],
  [180.8, 516],
  [179.6, 505],
  [178.4, 496],
  [177.6, 488],
  [179, 470],
  [181.4, 459],
  [186, 456.2],
  [192.5, 457.2],
  [199, 456.2],
  [204.4, 459],
  [207, 470],
  [208.4, 488],
  [207, 500],
  [204.8, 505],
  [204.6, 516],
  [206.2, 526],
  [209.6, 536],
  [211, 550],
  [210.4, 570],
  [209.6, 590],
  [209.8, 609, 0],
  [222.8, 609, 0],
  [222.4, 590],
  [222, 570],
  [222.6, 545],
  [224.2, 532],
  [226.4, 522],
  [227.6, 516],
  [227.4, 504],
  [230, 490],
  [233.6, 477],
  [236.8, 462],
  [239.6, 452],
  [240.6, 441.4],
  [243.8, 431],
  [246, 420],
  [246.8, 408],
  [246.2, 397],
  [244, 385],
  [240.4, 374],
  [235, 363.4],
  [228, 354],
  [221.8, 343],
  [220, 330],
  [219.6, 300],
]);

const HIND_LEFT: Knot[] = atK([
  [176.6, 445],
  [189, 445],
  [189.4, 470],
  [186.6, 500],
  [188.8, 520],
  [187.6, 545],
  [186.2, 570],
  [185.6, 592],
  [186.6, 602],
  [178, 602],
  [177.2, 570],
  [176.2, 545],
  [176, 500],
  [176.4, 470],
]);

const HIND_RIGHT: Knot[] = atK([
  [196, 445],
  [208.4, 445],
  [208.6, 470],
  [209, 500],
  [208.2, 520],
  [209.6, 545],
  [209.2, 570],
  [208.4, 592],
  [207.4, 602],
  [198.6, 602],
  [199.4, 570],
  [199.8, 545],
  [197, 520],
  [199.2, 500],
  [196.2, 470],
]);

/** The cream of his chest and belly, from under the chin to between the legs. */
const BIB: Knot[] = atK([
  [174, 332],
  [192.5, 328],
  [211, 332],
  [217.2, 346],
  [221.2, 358],
  [224.6, 372],
  [226.2, 390],
  [225.6, 406],
  [222.6, 423],
  [217, 438],
  [210, 449],
  [200.6, 455.4],
  [192.5, 457],
  [184.4, 455.4],
  [175, 449],
  [168, 438],
  [162.6, 423],
  [159.6, 406],
  [159.4, 390],
  [161, 372],
  [164.2, 358],
  [168, 346],
]);

/** A cloven hoof: two toes side by side under the fetlock, the split between them showing. */
function hoof(x: number, y: number, w: number, h: number): string {
  return curve(
    atK([
      [x - w * 0.36, y],
      [x + w * 0.36, y],
      [x + w * 0.5, y + h * 0.5],
      [x + w * 0.5, y + h * 0.86],
      [x + w * 0.3, y + h],
      [x + w * 0.06, y + h * 0.96],
      [x, y + h * 0.58],
      [x - w * 0.06, y + h * 0.96],
      [x - w * 0.3, y + h],
      [x - w * 0.5, y + h * 0.86],
      [x - w * 0.5, y + h * 0.5],
    ]),
  );
}

function body(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const [cx, cy] = at(192.5, 322);
  return part(
    [
      linearBox(id('fig'), [
        [0, C.body],
        [0.47, C.body],
        [0.64, C.leg],
        [1, C.legLow],
      ]),
      linearBox(id('side'), [
        [0, C.bodyShade, 0.75],
        [0.2, C.bodyShade, 0],
        [0.8, C.bodyShade, 0],
        [1, C.bodyShade, 0.75],
      ], 0, 0, 1, 0),
      linearBox(id('bib'), [
        [0, C.patch],
        [0.22, C.bib],
        [0.6, C.bibLight],
        [1, C.bib],
      ]),
      radialBox(id('chin'), [
        [0, C.furDeep, 0.55],
        [1, C.furDeep, 0],
      ]),
      linearBox(id('hoof'), [
        [0, C.hoofLight],
        [0.45, C.hoof],
        [1, C.hoofDeep],
      ]),
    ],
    [
      fill(curve(HIND_LEFT) + curve(HIND_RIGHT), C.legBehind),
      fill(hoof(183.4, 598.4, 9.6, 12.6) + hoof(203.2, 598.4, 9.6, 12.6), C.hoofDeep),
      fill(curve(FIGURE), `url(#${id('fig')})`),
      fill(curve(FIGURE), `url(#${id('side')})`),
      // the neck is darker down either side, where it turns from the light
      fill(
        curve(atK([[165.4, 302], [173, 302], [171.6, 322], [169.4, 338], [164.4, 350], [163.6, 336], [165, 320]])) +
          curve(atK([[219.6, 302], [212, 302], [213.4, 322], [215.6, 338], [220.6, 350], [221.4, 336], [220, 320]])),
        C.bodyShade,
        alpha(0.55),
      ),
      fill(curve(BIB), `url(#${id('bib')})`),
      // the shadow the head throws on the neck
      ellipse(cx, cy, 86, 44, `url(#${id('chin')})`),
      fill(hoof(169.6, 605.4, 19, 20) + hoof(217.4, 605.4, 19, 20), `url(#${id('hoof')})`),
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
);

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
      // each eye's glow sits toward its outer side, where the light is
      radialBox(id('whiteL'), [
        [0, C.white],
        [0.62, '#fdf7f0'],
        [0.88, '#f6e2cd'],
        [1, C.whiteEdge],
      ], 0.42, 0.47, 0.6),
      radialBox(id('whiteR'), [
        [0, C.white],
        [0.62, '#fdf7f0'],
        [0.88, '#f6e2cd'],
        [1, C.whiteEdge],
      ], 0.58, 0.47, 0.6),
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
      [AXIS, 360],
      [234, 361.4],
      [217, 365.6],
      [210, 372.4],
      [209.6, 381],
      [213.6, 392],
      [222, 403.6],
      [233.6, 413.6],
      [245, 420],
      [AXIS, 421.8],
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
