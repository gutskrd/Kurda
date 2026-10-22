/**
 * Xezo: a young woman in a long burgundy Kurdish dress with wide hanging
 * sleeves, a gold coin necklace and a broad gold belt hung with coins, her
 * long black hair falling past her waist, her hands resting one by the other
 * in front of her.
 *
 * Drawn flat, each part one tone, with no outlines: the dress in two reds,
 * lit and shaded, the hair black with a few lighter strands, the skin one
 * warm brown with a blush on each cheek and a soft shade under the chin.
 *
 * Her hair is in three parts so her head can nod without the long hair
 * swinging with it: the crown and the hair framing her face belong to the
 * head; the hair behind her shoulders and the two locks over her chest belong
 * to the body. The head's hair reaches down over the tops of both, and lies
 * under her face as well as round it, so a small turn never opens a gap.
 */
import type { Pt } from '../art/svg.js';
import { linearAt, n, radialBox } from '../art/svg.js';
import type { CharacterArt } from './types.js';
import type { Knot } from './pen.js';
import { alpha, beadsAlong, circle, clipDef, clipped, curve, ellipse, fill, line, mirror, oval, part, symmetric, taper } from './pen.js';
import { humanMouths } from './mouth.js';

const C = {
  hair: '#060606',
  sheen: '#2d2c2f',
  skin: '#b8785f',
  chest: '#ad6f58',
  shade: '#a6604a',
  blush: '#a8574a',
  hand: '#b2715a',
  handGap: '#4a0306',
  white: '#fbd8c8',
  iris: '#7a4f33',
  irisLight: '#9c6c4b',
  pupil: '#2e1810',
  lid: '#40251a',
  brow: '#6c3d2b',
  dress: '#540403',
  dressShade: '#400403',
  shoe: '#480204',
  gold: '#b07c14',
  goldLight: '#cf9c34',
  goldHi: '#ecc868',
  goldShade: '#83560b',
  rose: '#c6825a',
  roseShade: '#7e3f26',
} as const;

// ─────────────────────────────────────────────────────────────── the body

/** The hair that falls behind her shoulders, from under the crown to below her elbows. */
const BACK_HAIR: Knot[] = [
  [93.2, 150.3, 0.4], [91, 165.1], [83.1, 194.4], [50.4, 302.9], [42.5, 333.4], [42.4, 347.9], [45.5, 360.9],
  [51.6, 373.1], [53.4, 376.4], [55.4, 379.8, 0.4], [57, 380.6], [58, 401.5, 0.4], [221, 403.6, 0.4], [222.6, 403.4],
  [223.2, 400], [224.6, 396.6], [227.6, 393.8], [235.7, 385.9], [243.1, 376.6], [247.5, 368.9], [250.4, 360.6], [252.3, 351.4],
  [252.6, 333.4], [249.5, 317.4], [245.5, 304.1], [205.9, 191.4], [196.8, 162.6], [194.5, 150.5, 0.4],
];

/** The dress, neckline to hem: the V at the front, the sleeves widening from the shoulders. */
const DRESS: Knot[] = [
  [111.6, 226.3], [82.9, 233.9], [78.4, 238.4], [76.3, 244], [72.9, 252], [69.2, 268], [65.9, 284], [57.9, 316],
  [53.6, 344], [53.4, 366], [54.2, 372], [55.6, 376], [56.6, 379.5], [56.2, 383], [56.2, 548], [55.1, 570],
  [51.6, 596], [38.1, 716], [37, 732], [37.6, 738.8], [39.8, 741.6], [43.6, 744], [50, 744.6], [236, 744.5], [243.6, 744], [247.6, 741],
  [249.6, 737.6], [248.3, 716], [229.7, 548], [221.4, 486], [221, 460], [222.9, 410], [222.4, 405], [221.8, 401], [223.2, 395.6],
  [223.7, 381.1], [234.3, 364], [238, 348], [238, 340], [236.5, 332], [227.4, 292], [213.5, 244], [209, 236.6],
  [206.6, 234], [175.6, 226.2], [169.6, 226.4, 0.4], [169.4, 236], [164.6, 238.4], [143.6, 274.6, 0.15],
  [122.6, 238.6], [118, 236], [117.6, 226.4, 0.4],
];


/** The shade down her left side: the sleeve hanging in shadow, and the skirt below it. */
const SHADE_LEFT: Knot[] = [
  [94.2, 387.2], [105.1, 387.5], [109.7, 393], [117.8, 394.5], [119.1, 396.9], [115.9, 436.1], [114.2, 440.1],
  [112.2, 457.6], [110.5, 487.1], [106.4, 513.4], [103.6, 555.4], [102, 561.6], [101, 578.4], [97.9, 597.9],
  [97.4, 621.9], [90.9, 672.6], [89.1, 702.9], [85.9, 722.4], [86.4, 744.6, 0], [43.6, 744], [39.8, 741.6],
  [37.6, 738.8], [37, 732], [51.6, 596], [55.1, 570], [59.4, 512], [62.3, 494.4], [64.6, 419.9], [65.7, 417.3], [90, 410],
  [94, 401.1],
];

/** The shade on her right: the skirt beside her, with a lit fold running down through it. */
const SHADE_RIGHT: Knot[] = [
  [165.5, 415.9], [162, 422.1], [163.8, 434.9], [163.5, 444.9], [169.6, 496.1], [169.7, 511.4], [173, 528.4],
  [174.5, 546.6], [176.5, 556.9], [178.4, 585.9], [180.9, 598.4], [184, 641.6], [190.6, 691.4], [191.4, 716.1],
  [194.8, 740.9], [196.2, 744.2], [199.9, 744.5, 0], [243.6, 744], [247.6, 741], [249.6, 737.6], [248.3, 716],
  [229.7, 548], [221.4, 486], [220.4, 482.2, 0.4], [219, 483.1], [220.1, 488.6], [217.4, 571.9], [215.9, 586.6],
  [214.4, 588.2, 0.4], [212.6, 586.6], [190.5, 526.1], [183.8, 510.6], [183.2, 502.6], [179.6, 495.1], [176, 480.6],
  [174, 453.9], [166.8, 416.5],
];

/** The sleeves where they fall from the shoulders, behind the hair; each lit only at the elbow. */
const SHADE_SHOULDER_LEFT: Knot[] = [
  [86, 236], [78.4, 238.4], [72.9, 252], [69.2, 268], [65.9, 284], [57.9, 316], [53.6, 344], [53.4, 366], [55.4, 370.3, 0.1], [56.5, 360.9],
  [60.2, 352.4], [66.1, 348], [71.4, 346.7], [75.1, 347], [81.3, 350.2], [85.1, 360.1], [87.9, 373.9],
  [91.8, 377.9, 0.4], [97.8, 370.3], [98.6, 366.4], [96.6, 364.7, 0.4], [92.6, 371.2], [90.4, 371], [88, 356],
  [88, 262],
];

const SHADE_SHOULDER_RIGHT: Knot[] = [
  [200, 236], [209, 236.6], [213.5, 244], [227.4, 292], [238, 340], [237.9, 348], [234.3, 363.5], [225.2, 378.4],
  [223.8, 394.4], [222.6, 395.9, 0.4], [220.8, 393.8], [223, 374.9], [218.3, 361.2], [215.5, 358.7], [203.9, 352.9],
  [200.1, 352.2], [193.7, 353], [192.3, 351.6, 0.4], [193, 350.3], [198.3, 348.7], [200, 344.6], [199, 260],
];

/** The two locks of hair that fall forward over her chest, each ending behind the belt. */
const LOCK_LEFT: Knot[] = [
  [91.2, 372.3, 0.4], [90.1, 371.8], [88.9, 368.2], [88.3, 361.2], [87.1, 357.8], [88.4, 344.8], [87.8, 340.1],
  [84.7, 334.9], [80.6, 324.5], [77.7, 312.1], [77.8, 304.9], [82.9, 268], [83.2, 258], [83.3, 250], [83.5, 240.4], [81.1, 238.7], [80.6, 237.4, 0.4], [85.1, 236], [111.1, 236],
  [112, 236.5], [112.1, 270.4], [112.6, 276.9], [111.8, 280.6], [112.4, 350.3], [111.5, 351.9], [110, 352.3],
  [103.5, 350.6], [98.3, 347.8], [96.9, 348], [96.3, 350.6], [97.1, 363.3], [97.6, 365.4], [96.4, 367.6],
];

const LOCK_RIGHT: Knot[] = [
  [175.5, 352.9, 0.4], [174.7, 350.9], [175.5, 336.1], [174.6, 304.9], [175.3, 284.9], [174.4, 273.1],
  [175.2, 260.4], [174.6, 249.1], [175.2, 247.1], [174.7, 243.9], [175.1, 237.4], [177.4, 236], [204.6, 236.3, 0.4],
  [205.4, 239.1], [203.3, 241.7], [203.5, 254.9], [205.1, 279.5], [206.9, 285.4], [208.2, 309.9], [206.4, 323],
  [202.1, 334.8], [202.1, 343.7], [198.1, 348.7], [196.7, 349.6], [192.5, 350.4, 0.4], [191.2, 347.9],
  [190.2, 347.6], [179.8, 352],
];

/** Light along single strands of hair: fine soft lines. Those on the crown move with her head. */
const STRANDS_HEAD: readonly (readonly Pt[])[] = [
  [
    [100.7, 181.9],
    [99.1, 200.1],
  ],
  [
    [98.7, 204.4],
    [97, 225],
    [95.9, 240],
  ],
  [
    [186.7, 176.9],
    [189.6, 205],
    [191.2, 228],
    [191.6, 240],
  ],
];

const STRANDS_BODY: readonly (readonly Pt[])[] = [
  [
    [92, 222],
    [89.3, 246],
    [86.5, 278],
    [87.6, 310.1],
  ],
  [
    [95.9, 240],
    [95.3, 262],
    [95.8, 289.2],
    [99.4, 331.6],
  ],
  [
    [107.6, 236],
    [106.1, 249.6],
    [105.3, 282.4],
    [106.5, 315.1],
  ],
  [
    [180.6, 236],
    [182, 250.9],
    [183, 286.6],
    [181, 322.4],
  ],
  [
    [191.6, 240],
    [192.4, 281],
    [188.3, 333.1],
  ],
  [
    [197.4, 236],
    [199.7, 249.2],
    [201.6, 281.5],
    [200, 313.9],
  ],
];

function strands(list: readonly (readonly Pt[])[]): string {
  return line(list.map((s) => curve(s.map(([x, y]) => [x, y] as const), false)).join(''), C.sheen, 1.2, ' stroke-opacity="0.7"');
}

/** Her neck and the skin of her chest down to the V, under the dress: a little darker toward the V. */
const NECK: Knot[] = [
  [115.4, 222, 0],
  [172, 222, 0],
  [172, 232],
  [143.6, 282, 0],
  [115.4, 232],
];

/**
 * Her shoes below the hem: the left a pointed heeled boot turned outward, the
 * right seen from the front. Each outline is smooth all the way round — sole,
 * arch and heel are one clean line, with no nicks where the edge turns — and
 * the tops reach up under the hem (the dress is drawn over them).
 */
const FOOT_LEFT: Knot[] = [
  [89.2, 739, 0], [133.6, 739, 0], [133.6, 756], [132.9, 761.6], [131.9, 765.6], [130.6, 767.9, 0.35],
  [125.2, 767.9, 0.35], [122.9, 765], [121.9, 761], [119.4, 759.3], [116.4, 760.8], [113.4, 763.3],
  [108.8, 765.9], [103, 767.5], [90, 768], [76.4, 767.8], [71.6, 766.7], [69.3, 764.2], [69.7, 761.9],
  [72.4, 759], [76.6, 755.9], [81.6, 752.4], [85.8, 749.4], [88.4, 746.6],
];

const FOOT_RIGHT: Knot[] = [
  [174.2, 739, 0], [201.2, 739, 0], [201.9, 746.4], [204, 753], [205.3, 759.4], [205.1, 764.2],
  [202.2, 767.2], [198.6, 767.9], [188.6, 768.1], [178.6, 767.8], [174.6, 766.4], [172.3, 764], [171.6, 761.2],
  [172.2, 755.6], [173.2, 750.2],
];

/** Her left hand, resting curled against the sleeve. */
const HAND_LEFT: Knot[] = [
  [98.8, 446.6], [92, 446.2], [85.8, 444], [79.6, 441.8], [74.1, 437.5], [71.2, 432.4], [68.4, 418.3],
  [67.5, 408.8], [68.9, 405.5], [72.2, 401.8], [75.5, 398.9], [78.8, 397.1], [84.3, 396.4], [90, 398.6],
  [93.9, 402.8], [97, 408.9], [101.7, 422.7], [101.6, 425.8], [99, 427.1], [96.5, 426.1], [94.9, 424],
  [90.6, 414.6, 0.3], [89, 415.6], [91.6, 424.5], [100.6, 435.3], [102.2, 439.2], [100.4, 442.6], [100.2, 445.1],
];

/** Her right hand, open, the fingers pointing down and in. */
const HAND_RIGHT: Knot[] = [
  [128.1, 440.1], [126.7, 438.3], [127.5, 434.9], [135.7, 424.1], [137.9, 419.9], [137.6, 419.4, 0.3],
  [136.9, 419.8], [128.6, 430.4], [126, 432.3], [123.6, 432.2], [123.1, 430.2], [124.2, 427.4], [133.7, 411.6, 0.3],
  [130.3, 413], [126.2, 413.1], [125.1, 412], [125.3, 409.6], [133, 402.3], [136.2, 397.9], [136.8, 396.6],
  [137.8, 393.2], [141.4, 392.4], [145.6, 390.8], [148.6, 388.6], [152.4, 389], [156.4, 390.6], [164.5, 394.9], [167.3, 399.5],
  [167.3, 407.4], [164.7, 414.8], [158.5, 425.1], [151.9, 433.5], [148.8, 436.4], [146.5, 437.5], [145.2, 436.9],
  [145.3, 435.4], [146.8, 432], [146.5, 431.3, 0.3], [139.9, 439.3], [137.2, 440.9], [135.2, 440.4], [134.7, 439.3],
  [134.9, 438.2], [140.3, 429.2], [140.4, 428.3, 0.3], [131.9, 438.5], [129.7, 440],
];

/** The dark between her fingers, where the dress shows through. */
const HAND_GAPS: readonly (readonly Pt[])[] = [
  [
    [89.6, 413.6],
    [90.4, 419],
    [91.6, 424.4],
  ],
  [
    [138.2, 419.2],
    [132.8, 426.2],
    [127.4, 433],
  ],
  [
    [142, 426.2],
    [137.8, 432.4],
    [133.6, 438.4],
  ],
  [
    [146.8, 431],
    [145.4, 433.6],
    [143.8, 436.2],
  ],
  [
    [134.4, 410.8],
    [133, 412.2],
    [131.6, 413.6],
  ],
];

/** Gold coins: a bright rim round a struck face with a ring pressed into it. */
function coins(list: readonly (readonly [number, number, number])[], rimColour: string): string {
  const rim = list.map(([x, y, r]) => oval(x, y, r)).join('');
  const face = list.map(([x, y, r]) => oval(x, y + r * 0.05, r * 0.78)).join('');
  const ring = list.map(([x, y, r]) => oval(x, y + r * 0.05, r * 0.5)).join('');
  return fill(rim, rimColour) + fill(face, C.gold) + `<path d="${ring}" fill="none" stroke="${C.goldShade}" stroke-width="0.7" stroke-opacity="0.6"/>`;
}

function necklace(): string {
  // the two strings of rosy beads, from behind her neck down to the first coins
  const strings = curve([[121.6, 227.6], [121, 249], [122.4, 268.6]], false) + curve([[167.4, 227.6], [167.4, 240], [165.6, 250], [164.2, 261], [163.4, 268.6]], false);
  const links: Pt[] = [
    [128.4, 283],
    [158.4, 283],
    [136.8, 299.2],
    [149.4, 299.2],
  ];
  return (
    beadsAlong(strings, C.roseShade, 4.2, 3.4) +
    beadsAlong(strings, C.rose, 3.6, 3.4) +
    fill(links.map(([x, y]) => oval(x, y, 1.6)).join(''), C.rose) +
    coins([
      [122, 277.4, 7.8],
      [164.2, 277.6, 7.9],
      [129.4, 292.6, 7.7],
      [156.4, 292.9, 7.8],
      [142.7, 307.6, 9.8],
    ], C.rose)
  );
}

/** The belt's outline: a tall boss in the middle, a plate either side, and wings that flare out and up at the ends. */
const BELT: Knot[] = [
  [97.2, 347.6, 0.3], [104, 350.8], [112.4, 353, 0.3], [112.4, 342.2, 0.3], [113.6, 340.8], [119.8, 339.8],
  [123.4, 338.2], [127, 339.2], [132.6, 339.2], [139.1, 335.2], [143.4, 334.2], [147.6, 335.3], [154.5, 339.3],
  [161.9, 339.5], [164.4, 338], [167.7, 339.9], [174, 341.1, 0.3], [174.6, 352.4, 0.3], [177.8, 352.7],
  [190.2, 347.5, 0.3], [191.6, 349.6], [191, 355.4], [190, 356.9, 0.4], [174.1, 370.7], [168.9, 371.5], [163.8, 373.4], [156.6, 373.2],
  [150.2, 375], [136.8, 375.8], [132.6, 373.4], [125, 374.4], [118.1, 371.8], [112.4, 369.4], [106.3, 368],
  [100.6, 369.4, 0.4], [97.3, 361.4], [96.3, 350.1],
];

/** The tall boss in the middle of the belt, raised above the plates. */
const BOSS: Knot[] = symmetric(
  [
    [143.6, 334.6],
    [139.4, 336.2],
    [136.6, 341.4],
    [135.8, 355],
    [136.8, 368],
    [139.8, 373.6],
    [143.6, 375.4],
  ],
  143.6,
);

function belt(metal: string, rim: string): string {
  const pendants: [number, number, number][] = [
    [101.2, 381.2, 6.4],
    [115, 386.8, 6.8],
    [127.8, 390.6, 6.8],
    [143.8, 392.8, 6.8],
  ];
  // each coin hangs from two beads
  const chain = (x: number, y: number): string => `M${n(x)},${n(y)}v3.2`;
  return (
    // the shade the belt throws on the dress
    fill(curve([[112, 362], [144, 358], [176, 362], [172, 377], [144, 381], [116, 377]]), C.dressShade, alpha(0.5)) +
    beadsAlong(chain(101.2, 370.4) + chain(115, 375.2) + chain(127.8, 378.4) + chain(143.8, 379.6), C.goldLight, 3, 3.2) +
    coins(pendants, C.goldLight) +
    // the metal, with a bright rim just inside its edge and where each wing meets its plate
    clipped(rim, fill('M95,332h98v46h-98z', `url(#${metal})`) + line(curve(BELT) + 'M112.4,352.6V369.6M174.6,352V371', C.goldLight, 2.4)) +
    // the engraving on each plate and wing, worked in a darker gold
    fill(oval(124.4, 356.4, 6.6, 7.4) + oval(162.8, 356.4, 6.6, 7.4) + oval(104.6, 359, 3.2, 4.2) + oval(182.6, 358, 3.2, 4.2), C.goldShade, alpha(0.7)) +
    fill(oval(124.4, 356.4, 4, 4.6) + oval(162.8, 356.4, 4, 4.6), C.gold) +
    fill(oval(124.4, 356.4, 1.6, 1.8) + oval(162.8, 356.4, 1.6, 1.8) + oval(104.6, 359, 1.2) + oval(182.6, 358, 1.2), C.goldHi) +
    // the boss: a bright rim, and inside it a long hollow with two studs
    fill(curve(BOSS), C.goldLight) +
    fill(oval(143.6, 355, 5.6, 17.2), C.gold) +
    fill(oval(143.6, 355, 3.4, 12.6), C.goldShade) +
    fill(oval(143.6, 348.6, 1.7, 2.8) + oval(143.6, 361.4, 1.7, 2.8), C.goldLight) +
    // light along the top edges
    line(curve([[114, 341.2], [123.4, 339.4], [133, 340.2]], false) + curve([[154.2, 340.4], [164.4, 339.2], [173, 342]], false), C.goldHi, 0.9) +
    line(curve([[98, 348.6], [104.4, 351.6], [111.6, 353.6]], false) + curve([[189.6, 348.6], [183.6, 351], [177.2, 353.6]], false), C.goldHi, 0.8)
  );
}

function body(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  return part(
    [
      linearAt(id('chest'), [
        [0, C.skin],
        [1, C.chest],
      ], 0, 226, 0, 270),
      linearAt(id('metal'), [
        [0, '#c4901c'],
        [0.45, C.gold],
        [1, '#956610'],
      ], 0, 334, 0, 376),
      clipDef(id('beltrim'), curve(BELT)),
      linearAt(id('hand'), [
        [0, C.hand],
        [1, '#c2826b'],
      ], 0, 396, 0, 446),
    ],
    [
      fill(curve(BACK_HAIR), C.hair),
      fill(curve(FOOT_LEFT) + curve(FOOT_RIGHT), C.shoe),
      fill(curve(NECK), `url(#${id('chest')})`),
      fill(curve(DRESS), C.dress),
      fill(curve(SHADE_LEFT) + curve(SHADE_RIGHT) + curve(SHADE_SHOULDER_LEFT) + curve(SHADE_SHOULDER_RIGHT), C.dressShade),
      necklace(),
      fill(curve(LOCK_LEFT) + curve(LOCK_RIGHT), C.hair),
      strands(STRANDS_BODY),
      belt(id('metal'), id('beltrim')),
      // her hands lighter toward the fingertips
      fill(curve(HAND_LEFT) + curve(HAND_RIGHT), `url(#${id('hand')})`),
      fill(HAND_GAPS.map((s) => taper(s, [0, 0.9, 0.9])).join(''), C.handGap, alpha(0.85)),
      // the fingers of her curled hand, one behind another
      line(curve([[76.4, 428.4], [83, 436.4], [90.4, 442.6]], false) + curve([[80.6, 422.8], [88, 431.6], [96.2, 438.6]], false), C.shade, 0.8, ' stroke-opacity="0.45"'),
    ],
  );
}

// ─────────────────────────────────────────────────────────────── the head

/**
 * The crown and the hair down either side of her face, to her shoulders,
 * parted in the middle. It runs on under her face, so the face is laid on
 * hair rather than beside it.
 */
const HAIR_CAP: Knot[] = [
  [146.1, 106.3], [154.9, 107.2], [164.3, 110.3], [172.8, 115.3], [181.5, 122.9], [188.7, 131.9], [192.7, 140.2],
  [197.2, 162.7], [223.7, 242.8, 0.4], [214, 242.9], [207.4, 238.7], [203.8, 240.4], [201.6, 243], [176, 242.6],
  [175.2, 241.8], [174.7, 229.7], [172.1, 227.5], [169.1, 227], [166.7, 225.1], [164.1, 226.1], [162.4, 225.3],
  [161.6, 211.6, 0.15], [161.7, 212.3], [126.5, 211.7, 0.4], [126, 223.6], [124, 225], [120.5, 225.6], [117.7, 228],
  [115.3, 228.2], [112.8, 229.5], [112, 233.4], [112, 241.8], [111.1, 242.8], [85.2, 243], [84, 242.4],
  [83.3, 239.9], [81.1, 239], [77.7, 240.3], [75.2, 242.8], [69.5, 242.6, 0.4], [69.2, 239.8], [89.9, 168.5],
  [92.4, 150.3], [94.2, 142.6], [97.3, 135.5], [101.1, 129.4], [108.6, 120.7], [115.4, 115.3], [125.2, 110.3],
  [135.6, 107.2],
];

/** Her face and neck, round-cheeked, down to just above the collar of her dress. */
const FACE: Knot[] = [
  [143.3, 132.8, 0.3], [144.2, 134.1], [149.6, 142], [155.7, 147.9], [162.9, 152.7], [174, 157.6], [174.8, 158.8],
  [175.3, 184.6], [174.8, 192.2], [173.5, 196.7], [170, 203.9], [163.5, 210.8], [163, 212.1], [163.3, 225.6],
  [164.1, 227.1, 0.15], [165.4, 225.2], [166.8, 225.1], [169, 227.2], [168.9, 227.9, 0.4], [126.1, 227.8],
  [125, 225.4], [125.1, 212.3], [116.3, 203.1], [113.7, 198.2], [112.2, 193.7], [111.3, 185.4], [111.8, 160.4],
  [113.1, 159.3], [124.2, 153.5], [130.9, 148.8], [137.6, 142.2],
];

/** The soft shade under her chin. */
const CHIN: Knot[] = [
  [160.8, 215.4, 0.4], [152.8, 223.7], [148.9, 225.8], [143.4, 226.5], [139, 225.8], [133.9, 223.2], [130.9, 221],
  [126.9, 215.5, 0.4], [137.1, 219.3], [143.4, 220.5], [147.8, 220.1], [151.5, 219.1], [159, 214.6],
];

/** Her brows: thin and gently arched, a little fuller toward the middle of the face. */
const BROW_LEFT: Pt[] = [
  [116.4, 164.4],
  [119.6, 162],
  [124, 160.9],
  [129, 161.3],
  [133.4, 162.8],
  [136.4, 164.6],
];
const BROW_RIGHT: Pt[] = [
  [170.4, 164.2],
  [167.6, 161.9],
  [163, 160.7],
  [158.4, 161.2],
  [153.6, 162.6],
  [149.6, 164.4],
];
const BROW_WIDTH = [0.3, 1.3, 1.8, 1.8, 1.4, 0.4];

function head(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  return part(
    [
      radialBox(id('blush'), [
        [0, C.blush, 0.42],
        [0.55, C.blush, 0.24],
        [1, C.blush, 0],
      ]),
    ],
    [
      fill(curve(HAIR_CAP), C.hair),
      strands(STRANDS_HEAD),
      fill(curve(FACE), C.skin),
      fill(curve(CHIN), C.shade, alpha(0.85)),
      ellipse(121.4, 188.6, 9, 6.6, `url(#${id('blush')})`),
      ellipse(165.4, 188.6, 9, 6.6, `url(#${id('blush')})`),
      // the nose: a soft shade down one side and a softer one beneath it
      fill(taper([[137.6, 177.4], [137.3, 183.4], [137.6, 188.4], [138.6, 190.6]], [0, 1.4, 1.7, 0.9]), C.shade, alpha(0.55)),
      fill(taper([[137.4, 190.4], [140.2, 191.3], [143.2, 190.9]], [0.3, 1.2, 0.3]), C.shade, alpha(0.5)),
      fill(taper(BROW_LEFT, BROW_WIDTH) + taper(BROW_RIGHT, BROW_WIDTH), C.brow),
    ],
  );
}

// ─────────────────────────────────────────────────────────────── the eyes

/** Her left eye's opening (on the viewer's left), round and open; the right is its mirror. */
const EYE: Knot[] = [
  [116.8, 174.8, 0.15],
  [119.6, 172.6],
  [123.6, 171.6],
  [128, 171.4],
  [132, 172.4],
  [135, 175, 0.15],
  [132.4, 177.8],
  [127.6, 178.9],
  [122, 178.4],
  [118.6, 176.6],
];

/** Her eyes sit either side of this upright line. */
const EYE_AXIS = 143.05;

/** The upper lid's dark line, and two short lashes at its outer end. */
const LID: Pt[] = [
  [115.8, 174.6],
  [119.2, 171.6],
  [124, 170.3],
  [129, 170.3],
  [133.2, 171.6],
  [135.8, 174.8],
];
const LASHES: readonly (readonly Pt[])[] = [
  [
    [117.4, 173.2],
    [115.6, 172.2],
    [114.4, 172],
  ],
];

const flip = (pts: readonly Pt[]): Pt[] => pts.map(([x, y]) => [2 * EYE_AXIS - x, y] as Pt);

function lids(): string {
  const one = (f: (p: readonly Pt[]) => readonly Pt[]): string =>
    taper(f(LID), [0.5, 1.5, 1.9, 1.8, 1.2, 0.3]) + LASHES.map((l) => taper(f(l), [0.8, 0.5, 0])).join('');
  return one((x) => x) + one(flip);
}

function eyesOpen(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const right = mirror(EYE, EYE_AXIS);
  const iris = (cx: number): string =>
    circle(cx, 174.8, 4.25, `url(#${id('iris')})`) + circle(cx, 174.8, 2, C.pupil) + circle(cx + 1.3, 173.2, 1.1, C.white);
  const lower: Pt[] = [
    [119.6, 177.6],
    [127.4, 179.4],
    [133.8, 177.4],
  ];
  return part(
    [
      radialBox(id('iris'), [
        [0, C.irisLight],
        [0.62, C.iris],
        [1, '#4a2c1c'],
      ]),
    ],
    [
      fill(curve(EYE) + curve(right), C.white),
      // each iris fits inside its eye, under the lid, so it needs no clip
      iris(126.9),
      iris(159.2),
      line(curve(lower.map(([x, y]) => [x, y] as const), false) + curve(flip(lower).map(([x, y]) => [x, y] as const), false), C.lid, 0.6, ' stroke-opacity="0.3"'),
      fill(lids(), C.lid),
    ],
  );
}

/** A blink: the eyes shut, the lash line curving down where the lids meet, the crease of each lid above it. */
function eyesClosed(): string {
  const shut: Pt[] = [
    [115.8, 174.4],
    [119.6, 176.6],
    [124, 177.8],
    [129, 177.8],
    [133.2, 176.6],
    [135.8, 174.6],
  ];
  const lashes: readonly (readonly Pt[])[] = [
    [
      [117.6, 175.6],
      [115.8, 175.6],
      [114.2, 175.2],
    ],
  ];
  const one = (f: (p: readonly Pt[]) => readonly Pt[]): string => taper(f(shut), [0.5, 1.4, 1.7, 1.6, 1.2, 0.4]) + lashes.map((l) => taper(f(l), [1, 0.6, 0])).join('');
  return part(
    [],
    [
      fill(one((x) => x) + one(flip), C.lid),
      line(curve(LID.map(([x, y]) => [x, y - 0.8] as const), false) + curve(flip(LID).map(([x, y]) => [x, y - 0.8] as const), false), C.shade, 0.7, ' stroke-opacity="0.6"'),
    ],
  );
}

/** Smiling eyes: shut, the lash line curved up along where the upper lid was, its lash still at the outer end. */
function eyesHappy(): string {
  const arc: Pt[] = LID.map(([x, y]) => [x, y + 2.2] as Pt);
  const lashes = LASHES.map((l) => l.map(([x, y]) => [x, y + 2.2] as Pt));
  const one = (f: (p: readonly Pt[]) => readonly Pt[]): string => taper(f(arc), [0.5, 1.4, 1.8, 1.7, 1.2, 0.3]) + lashes.map((l) => taper(f(l), [0.8, 0.5, 0])).join('');
  return part([], [fill(one((x) => x) + one(flip), C.lid)]);
}

// ─────────────────────────────────────────────────────────────── together

export function drawXezo(p: string): CharacterArt {
  return {
    id: 'xezo',
    name: 'Xezo',
    viewBox: { x: 26, y: 98, w: 236, h: 678 },
    bust: { x: 78, y: 101, w: 131, h: 131 },
    // head to hips: her hands at her belt, and the fall of her dress below it
    half: { x: 26, y: 98, w: 236, h: 362 },
    headPivot: { x: 143.5, y: 216 },
    body: body(p),
    head: head(p),
    eyes: { open: eyesOpen(p), closed: eyesClosed(), happy: eyesHappy() },
    mouths: humanMouths(
      {
        open: { left: [136.2, 201], right: [150.9, 201.6], top: 200.6, bottom: 203.9 },
        upperLip: 1.2,
        lowerLip: 3,
        sideLip: 1.8,
        middle: 0.5,
        colours: { lip: '#a0695a', line: '#7a4538', inside: '#5a1f1c', teeth: '#fbdcd0', tongue: '#cf7a70' },
      },
      p,
    ),
    overlay: '',
  };
}
