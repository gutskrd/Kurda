/**
 * Hamo: a man in a traditional Kurdish suit — a camel jacket crossed over a
 * paler shirt, an olive sash wound at the waist, and wide trousers gathered
 * at the ankle — standing with his hands on his hips, his head turned a
 * little to one side, smiling under a black moustache.
 *
 * Drawn flat with soft shade, in the same manner as the app's other art. His
 * moustache is the overlay: it lies over the mouth, so every mouth shape can
 * tuck its top under it, as a real mouth does.
 */
import type { Pt } from '../art/svg.js';
import { linearAt, linearBox, radialBox } from '../art/svg.js';
import type { CharacterArt } from './types.js';
import type { Knot } from './pen.js';
import { alpha, circle, clipDef, clipped, curve, fill, line, part, taper } from './pen.js';
import { humanMouths } from './mouth.js';

const C = {
  hair: '#3d2616',
  hairLight: '#573823',
  skin: '#b56e57',
  skinLight: '#c27c62',
  skinShade: '#9d5944',
  skinDeep: '#83452f',
  white: '#f1e5de',
  iris: '#6a3e2a',
  irisDeep: '#2f1a10',
  lash: '#2b1910',
  brow: '#3b2216',
  moustache: '#271810',
  moustacheLight: '#45291b',
  jacket: '#a0703c',
  jacketLight: '#ad7c46',
  jacketShade: '#8b5e2f',
  jacketDeep: '#714b22',
  pleat: '#875b2e',
  shirt: '#c09a68',
  shirtShade: '#a68252',
  sash: '#4c4823',
  sashLight: '#605c30',
  sashDeep: '#373418',
  shoe: '#3d2a19',
  shoeLight: '#58402a',
} as const;

// ─────────────────────────────────────────────────────────────── the body

/** Jacket and sleeves in one piece, the V of the shirt cut from its front and the space inside each bent arm cut through. */
const JACKET: Knot[] = [
  [146, 146.5],
  [139, 152.5],
  [127, 161.5],
  [112, 169.5],
  [96, 175.5],
  [84, 182],
  [74.6, 189.6],
  [67, 200],
  [61, 213],
  [56, 227.5],
  [51.5, 242],
  [47.6, 255.5],
  [45.6, 265.5],
  [46.8, 274.6],
  [51.6, 283.4],
  [57.8, 293],
  [64.4, 301.4],
  [72, 309],
  [80.4, 316.4],
  [88.6, 323],
  [97.4, 329],
  [104.6, 334.6],
  [111.6, 339.6, 0.4],
  [110.6, 350],
  [108.1, 362, 0],
  [245, 362, 0],
  [244, 352],
  [242.6, 344, 0.4],
  [249.6, 338.4],
  [253.6, 333.4],
  [259, 326.6],
  [266.6, 320.4],
  [272.6, 315.6],
  [277.6, 311],
  [282.4, 305.4],
  [287, 298.6],
  [291.4, 291],
  [295.4, 283],
  [298.8, 275.4],
  [300.6, 266],
  [299.8, 256.6],
  [297.2, 247.6],
  [293.4, 238],
  [289, 228],
  [284, 218],
  [278, 208],
  [271, 198],
  [262.6, 189],
  [250.4, 180.6],
  [236.4, 173.6],
  [222, 168],
  [210, 163.2],
  [204, 160],
  [200.8, 169, 0],
  [188, 307.5, 0],
  [165.2, 169, 0],
  [158, 158],
  [152, 150.6],
];

const GAP_LEFT: Knot[] = [
  [101.5, 253.5, 0.3],
  [109, 264],
  [112, 276],
  [115.4, 288],
  [115, 297.4, 0.3],
  [108, 291],
  [99, 283],
  [91.6, 276],
  [87.6, 270, 0.4],
  [92, 263.4],
  [97, 258],
];

const GAP_RIGHT: Knot[] = [
  [245, 254, 0.3],
  [252, 260],
  [259.6, 270, 0.4],
  [255.6, 278],
  [249, 285],
  [242, 293],
  [235.6, 298.6, 0.3],
  [237, 288],
  [239.4, 276],
  [240.6, 264],
];

/** Wide trousers, full to the knee and gathered in at each ankle, the space between the legs left open. */
const TROUSERS: Knot[] = [
  [110.2, 354, 0.5],
  [107.4, 365],
  [103.6, 377],
  [100.6, 392],
  [97.4, 412],
  [95, 440],
  [92.4, 478],
  [90, 512],
  [88.6, 545],
  [88.4, 578],
  [90, 600],
  [93.4, 616],
  [98.2, 630],
  [104, 642],
  [111, 652.6],
  [117.6, 660],
  [123, 664.4, 0.6],
  [142.5, 667.4],
  [160.4, 663.6, 0.6],
  [165.4, 656],
  [168.6, 645],
  [170.8, 625],
  [172, 600],
  [173.4, 560],
  [174.8, 520],
  [176.2, 480],
  [177.6, 464],
  [179.6, 459.6, 0.5],
  [181.8, 464],
  [183.4, 480],
  [184.6, 520],
  [185.8, 560],
  [187, 600],
  [188.8, 625],
  [191, 645],
  [194, 656],
  [199.4, 664.6, 0.6],
  [217, 667],
  [230.6, 665.6, 0.6],
  [239.4, 661.4],
  [248, 654],
  [255.4, 643.4],
  [261.4, 630],
  [264.8, 612],
  [266, 590],
  [265.8, 560],
  [264.6, 530],
  [262.8, 500],
  [260.4, 470],
  [258, 445],
  [255.6, 420],
  [253, 400],
  [250, 384],
  [246.6, 370],
  [243.4, 354, 0.5],
];

/** The jacket's own folds: the seam where each sleeve meets the body, and the crease inside each elbow. */
const FOLDS: readonly (readonly Pt[])[] = [
  [
    [117.6, 213],
    [114.6, 231],
    [111.2, 249],
  ],
  [
    [74, 259.6],
    [81, 265.4],
    [88.6, 273],
  ],
  [
    [246, 205],
    [247.6, 227],
    [248.6, 248],
  ],
  [
    [272.4, 257.6],
    [266, 264],
    [259.2, 272.4],
  ],
];

/** The pleats that fall from the sash, two to each leg: pressed tucks, the inner pair longer. */
const PLEATS: readonly (readonly Pt[])[] = [
  [
    [127.6, 356],
    [124.4, 373],
    [119, 391],
  ],
  [
    [168.6, 358],
    [165.4, 384],
    [160.8, 410],
  ],
  [
    [215, 357],
    [219.6, 391],
    [223.4, 424],
  ],
  [
    [230.6, 355],
    [235.6, 373],
    [239.2, 391],
  ],
];

/** Where each trouser leg is drawn in at the ankle: short creases running up from the cuff. */
const GATHERS: readonly (readonly Pt[])[] = [
  [
    [128, 664],
    [124.6, 655],
    [120.4, 647],
  ],
  [
    [139, 666],
    [137.6, 655],
    [135.4, 646],
  ],
  [
    [151, 665.4],
    [152.4, 656],
    [153, 647],
  ],
  [
    [208, 665.4],
    [206.6, 656],
    [205.4, 648],
  ],
  [
    [220, 666.4],
    [221.6, 656],
    [223.6, 647],
  ],
  [
    [231, 664.6],
    [235, 656],
    [239.6, 648],
  ],
];

const HAND_RIGHT: Knot[] = [
  [236, 304.4],
  [228, 305.2],
  [218, 306.4],
  [212, 307.8],
  [210.4, 309.6, 0.6],
  [213.2, 311.8],
  [220, 312.6],
  [227.4, 313.2, 0.5],
  [221, 318.6],
  [213, 325.4],
  [207, 331],
  [204.2, 334.8, 0.6],
  [206.4, 337.4, 0.5],
  [205.2, 341],
  [205.8, 344.4, 0.6],
  [209.6, 346, 0.5],
  [211.6, 348],
  [214.4, 349.4, 0.6],
  [218.8, 348.8, 0.5],
  [222.6, 349.8],
  [226.2, 349, 0.6],
  [233.4, 344.6],
  [241, 338],
  [248, 332],
  [254, 328],
  [258.4, 321],
  [257.6, 313],
  [254, 308.6],
  [246, 305],
];

/** The lines between his fingers, where one lies against the next. */
const FINGERS: readonly (readonly Pt[])[] = [
  [
    [226.4, 328.6],
    [216, 333.4],
    [207.4, 337.6],
  ],
  [
    [229, 333.6],
    [219, 340],
    [210.6, 345.8],
  ],
  [
    [232, 338.6],
    [225.6, 343.6],
    [219.6, 348.6],
  ],
  [
    [232, 313.8],
    [228.2, 313.6],
    [221.6, 312.8],
  ],
];

/** His left hand is his right one turned about the middle of his waist, sitting a little lower. */
const turn = (pts: readonly (readonly [number, number, number?])[]): Knot[] =>
  pts.map((k) => [363.5 - k[0], k[1] + 5, k[2] ?? 1] as const).reverse();

function hands(skin: string): string {
  const lines = FINGERS.map((f) => taper(f, [0, 1.1, 0.5])).join('') + FINGERS.map((f) => taper(turn(f).map(([x, y]) => [x, y] as Pt), [0.5, 1.1, 0])).join('');
  return fill(curve(HAND_RIGHT) + curve(turn(HAND_RIGHT)), `url(#${skin})`) + fill(lines, C.skinDeep, alpha(0.6));
}

function shoes(): string {
  const left: Knot[] = [
    [141, 667, 0],
    [128, 667],
    [117.4, 668.6],
    [108.6, 673.4],
    [100.4, 680.4],
    [96, 686],
    [95.4, 693.6],
    [98.4, 697.6, 0.5],
    [157.6, 697.8, 0.5],
    [160.4, 692],
    [160.4, 676, 0],
  ];
  const right: Knot[] = [
    [224, 667, 0],
    [240, 667.4],
    [251, 671.4],
    [261.4, 678.2],
    [272.4, 684.8],
    [277.6, 690.6],
    [276.4, 695.8],
    [271.4, 697.8, 0.5],
    [205.6, 697.8, 0.5],
    [203.6, 691],
    [203.8, 676, 0],
  ];
  return (
    fill(curve(left) + curve(right), C.shoe) +
    // the light along the top of each shoe, and the sole beneath
    line(curve([[101, 681.6], [110, 674], [121, 670]], false) + curve([[226, 669.6], [244, 671.4], [262, 679.6]], false), C.shoeLight, 1.6) +
    line(`M98.4,697L157.6,697M205.6,697L271.4,697`, '#2a1c10', 1.4)
  );
}

function body(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const NECK: Knot[] = [
    [158, 140],
    [161.6, 158],
    [164.6, 168],
    [166.4, 174, 0],
    [183, 198, 0],
    [200, 172, 0],
    [203.4, 162],
    [207, 145],
  ];
  const SHIRT: Knot[] = [
    [165, 167, 0],
    [174, 170],
    [183, 190, 0],
    [192, 172],
    [201, 167, 0],
    [200.4, 200],
    [192, 290],
    [188, 308, 0],
    [181.6, 290],
    [170, 220],
  ];
  const SASH: Knot[] = [
    [130, 318.4],
    [158, 320.4],
    [182, 320.6],
    [206, 318.4],
    [232, 313],
    [232, 332],
    [226, 351, 0.6],
    [210, 354.4],
    [181, 356.6],
    [160, 355.6],
    [148, 353.6, 0.6],
    [136, 336],
  ];
  // the folds of the sash: each a lit ridge with its shadow just below it
  const folds = [327.4, 335.6, 343.8].map((y, k) => [
    [136 + k * 1.5, y],
    [160, y + 1.8 + k * 0.3],
    [182, y + 2],
    [205, y + 0.2 + k * 0.4],
    [228 - k * 0.5, y - 4.2 + k * 0.6],
  ] as const);
  const ridge = (dy: number): string => folds.map((f) => curve(f.map(([x, y]) => [x, y + dy] as const), false)).join('');
  return part(
    [
      // one light across jacket and trousers, so where one ends and the other begins never shows
      linearAt(id('suit'), [
        [0, C.jacketShade],
        [0.17, C.jacket],
        [0.5, C.jacketLight],
        [0.83, C.jacket],
        [1, C.jacketShade],
      ], 44, 0, 302, 0),
      linearBox(id('neck'), [
        [0, '#8e4f38'],
        [1, '#a5604a'],
      ]),
      linearBox(id('shirt'), [
        [0, C.shirtShade],
        [0.3, C.shirt],
      ]),
      linearBox(id('sash'), [
        [0, C.sashLight],
        [0.5, C.sash],
        [1, C.sashDeep],
      ]),
      linearBox(id('hand'), [
        [0, C.skinLight],
        [1, C.skin],
      ]),
    ],
    [
      shoes(),
      // the ankles, between cuff and shoe
      fill(curve([[141, 662, 0], [160, 662, 0], [160.4, 677, 0], [141, 677, 0]]) + curve([[204.6, 662, 0], [224, 662, 0], [224, 676, 0], [204.6, 676, 0]]), C.skinLight),
      fill(curve(TROUSERS), `url(#${id('suit')})`),
      // the inside of each leg, turned from the light
      fill(
        taper([[173.4, 470], [170.6, 520], [167.8, 600], [164.6, 640], [161.2, 656]], [0, 9, 9, 6, 0]) +
          taper([[186, 470], [188.8, 520], [191.2, 600], [195.2, 640], [198.4, 656]], [0, 9, 9, 6, 0]),
        C.jacketShade,
        alpha(0.5),
      ),
      fill(GATHERS.map((s) => taper(s, [1.3, 1, 0])).join(''), C.jacketDeep, alpha(0.5)),
      fill(curve(NECK), `url(#${id('neck')})`),
      fill(curve(SHIRT), `url(#${id('shirt')})`),
      `<path d="${curve(JACKET)}${curve(GAP_LEFT)}${curve(GAP_RIGHT)}" fill="url(#${id('suit')})" fill-rule="evenodd"/>`,
      fill(FOLDS.map((s) => taper(s, [0, 2, 0])).join(''), C.jacketDeep, alpha(0.7)),
      // the shadow each lapel throws on the shirt
      fill(taper([[167.6, 176], [175, 230], [184.4, 292]], [2.4, 1.6, 0]) + taper([[199, 178], [194, 240], [189.4, 296]], [2, 1.2, 0]), C.shirtShade, alpha(0.8)),
      // drawn over the jacket's hem, so they fall straight from the sash
      line(PLEATS.map((s) => curve(s.map(([x, y]) => [x, y] as const), false)).join(''), C.pleat, 3.6),
      fill(curve(SASH), `url(#${id('sash')})`),
      line(ridge(0), C.sashLight, 1.6),
      line(ridge(1.8), C.sashDeep, 1, ' stroke-opacity="0.7"'),
      hands(id('hand')),
    ],
  );
}

// ─────────────────────────────────────────────────────────────── the head

/** His hair: full and rounded on top, a little wavy along the hairline, and down to a short sideburn in front of his ear. */
const HAIR: Knot[] = [
  [180, 48.4],
  [196, 50],
  [207, 54.6],
  [214, 62],
  [217.4, 72],
  [218.6, 82],
  [217.8, 89],
  [215.6, 95.6, 0.3],
  [212.6, 84.6],
  [206.4, 78.4],
  [196, 80.2],
  [186, 78.4],
  [176, 79.8],
  [168, 78.8],
  [163, 83.6],
  [160.4, 91],
  [157.6, 100],
  [155, 109],
  [153.6, 116.6, 0.3],
  [150.4, 112],
  [146.4, 104.4],
  [141, 98.6],
  [139.4, 88],
  [140.4, 76],
  [143.6, 67],
  [149.4, 59.6],
  [157.4, 53.6],
  [167.4, 49.8],
];

const FACE: Knot[] = [
  [160, 82],
  [190, 74],
  [212, 80],
  [216.2, 96],
  [216.4, 112],
  [215, 125],
  [211.8, 138.4],
  [206.8, 150],
  [200.2, 158.4],
  [193.4, 161],
  [186.8, 160],
  [175, 155.8],
  [163.4, 148.4],
  [151.8, 138.4],
  [146, 128.4],
  [148, 110],
  [152, 92],
];

const EAR: Knot[] = [
  [147.6, 103],
  [142, 102.8],
  [138, 106],
  [136.6, 112],
  [137.6, 120],
  [141.6, 126.8],
  [147, 129.4],
  [150, 120],
];

function head(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  return part(
    [
      // the light lies on the crown of his hair and falls off toward the sides
      radialBox(id('hair'), [
        [0, C.hairLight],
        [0.75, C.hair],
      ], 0.55, 0.12, 0.75),
      radialBox(id('face'), [
        [0, C.skin],
        [0.7, C.skin],
        [1, C.skinShade],
      ], 0.62, 0.4, 0.72),
    ],
    [
      fill(curve(EAR), C.skinShade),
      fill(curve([[145.4, 107], [141, 109], [140.6, 116], [143.4, 122.6], [146.4, 124]], false) + 'z', C.skinDeep, alpha(0.55)),
      fill(curve(FACE), `url(#${id('face')})`),
      // the shade along his jaw on the side turned away
      fill(curve([[147, 126], [153.6, 137.6], [164, 147.6], [176, 154.8], [188, 159.6], [176, 152], [163, 142.4], [153.4, 132]]), C.skinShade, alpha(0.4)),
      // the chin's small cleft
      fill(taper([[192.6, 152.4], [193.2, 155.4], [193, 158]], [0, 1, 0]), C.skinDeep, alpha(0.5)),
      // the nose: its shaded side, its tip and the soft shadow under it
      fill(taper([[194.4, 106], [196.6, 115], [198, 122.6], [197.6, 127.4]], [0, 2, 2.2, 0.8]), C.skinShade, alpha(0.75)),
      fill(curve([[184.4, 127.6], [187.4, 124.6], [192.4, 124], [197.6, 125.8], [198.6, 128.6], [193.4, 130.6], [187.6, 130.2]]), C.skinShade, alpha(0.55)),
      fill(curve(HAIR), `url(#${id('hair')})`),
      fill(
        taper([[163.4, 103.2], [169.4, 99.6], [176.6, 98], [183.6, 98.6], [188.6, 100.4]], [0, 3.2, 3.8, 3.8, 3.2]) +
          taper([[199.4, 100.8], [204.6, 98.6], [210.6, 98.2], [216.2, 100.2]], [3.4, 3.6, 3, 0]),
        C.brow,
      ),
    ],
  );
}

// ─────────────────────────────────────────────────────────────── the eyes

/** His eyes: the upper lids lowered a little over the iris, a calm and friendly look. */
const EYE_LEFT: Knot[] = [
  [168, 110.4, 0.2],
  [171.6, 107.6],
  [176.4, 106.8],
  [181, 107.4],
  [184.4, 109.8, 0.2],
  [180.8, 112.2],
  [176, 113],
  [171.4, 112.4],
];

const EYE_RIGHT: Knot[] = [
  [200, 109.8, 0.2],
  [203.4, 107.4],
  [207.6, 106.8],
  [211.2, 107.6],
  [213.6, 110, 0.2],
  [210.8, 112.2],
  [206.6, 112.8],
  [202.6, 112.2],
];

function eyesOpen(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const iris = (cx: number): string =>
    circle(cx, 110, 3.8, `url(#${id('iris')})`) + circle(cx, 110, 1.8, C.irisDeep) + circle(cx + 1.2, 108.8, 0.9, C.white);
  return part(
    [
      radialBox(id('iris'), [
        [0, '#8f5a3b'],
        [0.65, C.iris],
        [1, C.irisDeep],
      ], 0.5, 0.62, 0.6),
      clipDef(id('eyeL'), curve(EYE_LEFT)),
      clipDef(id('eyeR'), curve(EYE_RIGHT)),
    ],
    [
      fill(curve(EYE_LEFT) + curve(EYE_RIGHT), C.white),
      clipped(id('eyeL'), iris(176.6)),
      clipped(id('eyeR'), iris(207.2)),
      // the upper lids: a firm dark line, and the fold of the lid above it
      fill(
        taper([[167.6, 110.6], [171.4, 107.2], [176.4, 106.2], [181.4, 106.8], [184.8, 109.6]], [0.6, 1.6, 1.8, 1.6, 0.5]) +
          taper([[199.6, 109.8], [203.2, 106.8], [207.6, 106.2], [211.6, 107], [214, 110]], [0.5, 1.6, 1.7, 1.5, 0.5]),
        C.lash,
      ),
      line(curve([[169.6, 106], [176.4, 103.8], [183, 105.6]], false) + curve([[201.4, 105.4], [207.6, 103.8], [212.8, 105.8]], false), C.skinDeep, 0.8, ' stroke-opacity="0.5"'),
      line(curve([[170.4, 112.4], [176, 113.8], [182, 112.4]], false) + curve([[202, 112.2], [206.6, 113.4], [211.6, 112.2]], false), C.skinDeep, 0.6, ' stroke-opacity="0.45"'),
    ],
  );
}

function eyesClosed(): string {
  return part(
    [],
    [
      fill(
        taper([[167.6, 110.4], [171.8, 112.2], [176.4, 112.8], [181, 112.2], [184.8, 110]], [0.6, 1.6, 1.8, 1.5, 0.5]) +
          taper([[199.6, 110], [203.4, 112], [207.4, 112.6], [211.4, 112], [214, 110]], [0.5, 1.5, 1.7, 1.5, 0.5]),
        C.lash,
      ),
      line(curve([[169.6, 106.6], [176.4, 105.2], [183, 106.4]], false) + curve([[201.4, 106.2], [207.6, 105.2], [212.8, 106.6]], false), C.skinDeep, 0.8, ' stroke-opacity="0.5"'),
    ],
  );
}

/** His moustache: full in the middle, tapering to points that turn down past the corners of his mouth. */
function moustache(): string {
  const shape: Knot[] = [
    [172.2, 138.6, 0.2],
    [175.6, 135],
    [180.4, 132.4],
    [186, 130.8],
    [191.8, 130.2],
    [197.6, 130.8],
    [203.8, 132.2],
    [209.8, 134.8],
    [214.6, 138.4, 0.2],
    [209, 137.8],
    [203.4, 137.4],
    [197.6, 137.6],
    [192.4, 138.2],
    [187, 137.6],
    [181.6, 137.4],
    [176.4, 137.8],
  ];
  return part(
    [],
    [
      fill(curve(shape), C.moustache),
      line(curve([[180, 133.8], [186, 132], [191.8, 131.6], [198, 132.2], [204, 133.6]], false), C.moustacheLight, 0.9),
    ],
  );
}

export function drawHamo(p: string): CharacterArt {
  return {
    id: 'hamo',
    name: 'Hamo',
    viewBox: { x: 34, y: 42, w: 278, h: 664 },
    bust: { x: 121, y: 44, w: 134, h: 134 },
    headPivot: { x: 186, y: 158 },
    body: body(p),
    head: head(p),
    eyes: { open: eyesOpen(p), closed: eyesClosed() },
    mouths: humanMouths(
      {
        cx: 192.6,
        cy: 140,
        w: 9.6,
        upperLip: 0.08,
        lowerLip: 0.26,
        smile: 0.14,
        lip: '#9f5848',
        upperLipColour: '#8f4c3e',
        line: '#4f2419',
        inside: '#46170f',
        teeth: '#f8efe8',
        tongue: '#bd665a',
      },
      p,
    ),
    overlay: moustache(),
  };
}
