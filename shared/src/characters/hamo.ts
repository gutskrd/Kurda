/**
 * Hamo: a man in a traditional Kurdish suit — a camel jacket crossed over a
 * paler shirt, an olive sash wound at the waist, and wide trousers gathered
 * at the ankle — standing with his hands on his hips, his head turned a
 * little to one side, smiling under a full black moustache.
 *
 * Drawn flat, each part one tone, with a few shade shapes where the form
 * turns: his jaw, under his nose, inside his ear, the folds of the jacket,
 * sash and trousers. That is all the shading the suit has, so it is all the
 * drawing has.
 *
 * His head reaches down over his neck to just above the collar, the same
 * skin tone as the neck drawn beneath it, so the head can nod without a seam
 * showing where the two meet. His moustache is the overlay: it lies over the
 * mouth, so every mouth shape tucks its top under it, as a real mouth does.
 */
import type { Pt } from '../art/svg.js';
import { linearAt } from '../art/svg.js';
import type { CharacterArt } from './types.js';
import type { Knot } from './pen.js';
import { alpha, circle, clipDef, clipped, curve, fill, line, part, taper } from './pen.js';
import { humanMouths } from './mouth.js';

const C = {
  hair: '#3e2a19',
  skin: '#b66d55',
  shade: '#a15d46',
  fingers: '#c27c64',
  ear: '#ac6551',
  earShade: '#93533d',
  brow: '#4a2818',
  white: '#ecc6b5',
  iris: '#623622',
  pupil: '#2e160d',
  lash: '#3a1f14',
  crease: '#8a4f36',
  moustache: '#43281a',
  suit: '#9c6e3c',
  fold: '#865b30',
  shirt: '#b58f63',
  sash: '#524c26',
  sashFold: '#403b1b',
  shoe: '#402e1c',
} as const;

// ─────────────────────────────────────────────────────────────── the body

/** Jacket and sleeves in one piece, from the shoulders to the hips, its front opening over the shirt. */
const JACKET: Knot[] = [
  [145.3, 146.4], [159.7, 163.6], [165.6, 173.2], [165.7, 186.2], [171.1, 219.8], [173.7, 230.9], [176.8, 250.5],
  [178.3, 255.1], [178.5, 260.6], [181.6, 272.8], [183.8, 287.1], [185.4, 290.7], [187.7, 304.0],
  [188.9, 305.1, 0.4], [189.8, 304.5], [195.2, 248.9], [197.0, 236.6], [198.4, 217.0], [200.7, 199.1],
  [201.5, 189.1], [200.9, 169.9], [201.9, 166.9], [200.9, 163.3], [201.7, 160.3], [205.9, 158.7, 0.4],
  [205.7, 156.0, 0.4], [207.5, 155.2, 0.4], [209.8, 159.3], [213.9, 162.5], [225.7, 167.2], [243.4, 172.7],
  [251.5, 176.4], [258.1, 180.5], [270.0, 192.2], [277.7, 203.4], [289.7, 224.9], [300.4, 250.2], [303.6, 261.5],
  [303.9, 269.0], [300.2, 280.9], [290.6, 299.3], [281.0, 313.1], [266.9, 329.8], [264.8, 330.7], [260.2, 330.7],
  [253.1, 329.2], [242.4, 341.1], [241.2, 346.0], [247.3, 362.5], [247.4, 364.0], [246.4, 365.7],
  [105.5, 365.6, 0.4], [105.2, 364.1], [106.3, 359.4], [110.3, 348.4], [112.6, 344.3], [112.4, 338.5],
  [108.3, 334.0], [100.2, 336.6], [96.1, 335.6], [71.7, 314.2], [64.2, 306.1], [56.2, 295.6], [48.5, 283.1],
  [44.6, 275.0], [43.6, 271.3], [43.0, 262.4], [44.2, 253.3], [52.2, 226.6], [64.4, 201.1], [72.6, 188.8],
  [82.5, 180.4], [88.1, 176.7], [95.2, 173.3], [127.3, 163.4], [134.1, 160.0], [138.7, 154.6], [143.4, 147.0],
  [144.5, 146.1],
];

/** The spaces inside his bent arms, between sleeve and body. */
const GAP_LEFT: Knot[] = [
  [112.7, 292.5, 0.4], [110.2, 291.5], [89.8, 271.3], [90.3, 269.2], [102.2, 256.9], [103.6, 257.3], [104.9, 260.0],
  [110.4, 279.2], [112.8, 285.8], [113.8, 291.1],
];

const GAP_RIGHT: Knot[] = [
  [240.1, 295.3, 0.4], [239.0, 294.6], [238.7, 293.6], [240.8, 277.1], [243.7, 259.3], [244.3, 258.2],
  [245.5, 257.9], [257.8, 270.4], [258.3, 271.9], [243.3, 292.5],
];

/**
 * The shirt, its V-neck open at the throat, seen down the jacket's opening
 * to the sash. Only its neckline is its own edge: its sides run on under the
 * jacket, so no sliver can open where the two meet.
 */
const SHIRT: Knot[] = [
  [165.8, 171], [167, 170.9], [170.2, 172.2], [172.4, 174.2], [174, 176.6], [178.3, 186.1], [181.9, 191.2],
  [182.6, 193.8], [183.6, 194.3], [184.9, 193.3], [186.1, 189.7], [191.6, 179], [194.8, 170.4], [199, 166.4],
  [200.1, 165.9, 0.4], [203.4, 167.4], [204.6, 190], [200, 236], [194, 300], [189, 312, 0.4], [183, 300],
  [173, 236], [162.6, 190], [162.6, 172.4],
]

/** Wide trousers, full to the knee and gathered in at each ankle, the space between the legs left open. */
const TROUSERS: Knot[] = [
  [110.1, 350.3], [106.3, 359.4], [102.3, 373.9], [98.4, 393.3], [94.5, 422.6], [90.7, 468.6], [87.3, 533.6],
  [86.9, 565.9], [90.3, 604.8], [94.6, 624.6], [98.4, 636], [102.4, 644], [106.8, 650.6], [114.1, 658.5],
  [121.5, 663.4], [123.4, 665.9, 0.4], [138.9, 666], [149.3, 665.3], [158.3, 665.2, 0.4], [159.4, 663], [165.4, 657.2],
  [169.3, 650.4], [173.6, 635.7], [174.6, 626.2], [176.6, 560], [178.8, 490.9], [180.1, 470.9, 0.3], [181.6, 490.9],
  [183.4, 550], [185.2, 607.4], [186.9, 631.2], [190.7, 646.5], [194.9, 655.2], [198.4, 659.3], [204.8, 664.9, 0.4],
  [211.9, 665.4], [224.1, 665.3], [233.4, 666], [240.3, 665.8, 0.4], [241, 661.8], [249.7, 654.3], [257.9, 642.3],
  [262.1, 632.5], [266, 617.4], [269.1, 592.4], [269.9, 578.9], [266, 496.4], [261.9, 449], [258.1, 416.2],
  [254.2, 391.4], [247.3, 362.5], [243.4, 351.2], [243, 350, 0], [110.5, 350, 0],
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
    [126.8, 356],
    [123.4, 369.8],
    [120.4, 381.5],
    [119, 393.1],
  ],
  [
    [168.2, 357],
    [163.5, 376],
    [161.1, 394],
    [160.9, 411.9],
  ],
  [
    [214.6, 357],
    [220.5, 380.9],
    [223.6, 403.6],
    [223.5, 426.4],
  ],
  [
    [230.6, 356],
    [235, 370],
    [237.6, 382],
    [238.6, 393.9],
  ],
];

/** The sash, wound round twice; its ends run on under his hands, so no edge of it meets a hand's edge. */
const SASH: Knot[] = [
  [135.6, 320.4],
  [140.7, 318.3],
  [148, 317.9],
  [153.2, 316.2],
  [167.9, 316.8],
  [185.9, 317],
  [197.1, 316.5],
  [216.6, 313.8],
  [224.6, 314.6],
  [227.4, 318.6],
  [226.2, 332],
  [223.8, 349.4],
  [222.6, 352.2],
  [215.5, 354.6],
  [195.1, 357.4],
  [175.9, 357.5],
  [156.3, 355.2],
  [148.4, 354.4],
  [140.6, 344],
  [136, 329],
];

/** The sash's folds: dark lines where one turn of the cloth lies over the next. */
const SASH_FOLDS: readonly (readonly Pt[])[] = [
  [
    [141, 322.6],
    [165, 327.3],
    [180, 327.8],
    [195, 326.4],
    [214, 322],
  ],
  [
    [152, 332.2],
    [180, 334.8],
    [195, 333.8],
    [208.6, 331],
  ],
  [
    [157, 341],
    [180, 343.2],
    [195, 342.2],
    [206, 340.2],
  ],
];

/** His left hand (on the viewer's left), the fingers lying forward over the sash. */
const HAND_LEFT: Knot[] = [
  [108.8, 313.2], [114, 309.6], [120.4, 307], [128, 306.6], [136.1, 307.5], [143, 310.2], [149.4, 311.7],
  [151.6, 314.6, 0.4], [148.6, 317.3], [141, 317.7], [136.4, 318.4, 0.4], [136.6, 321.8], [140.7, 326.0],
  [157.3, 338.8], [156.8, 340.8], [157.8, 343.5, 0.4], [155.8, 344.4], [155.1, 345.4, 0.4], [156.8, 347.6],
  [156.8, 350.2], [155.0, 351.4], [151.0, 351.4, 0.4], [149.8, 354.7], [148.6, 355.4], [145.1, 355.3],
  [139.6, 353.5], [136.4, 355.7], [129.6, 353.8], [128.0, 351.9], [126.0, 351.1], [121.8, 346.6], [116.4, 342.7],
  [113.9, 342.0], [112.7, 342.9, 0.15], [112.6, 338.5], [108.9, 334.2], [107.2, 334.0], [101.0, 336.3],
  [99.1, 336.0, 0.4], [99.5, 335.1], [103.0, 333.1], [104.1, 329.3], [102.2, 322.1], [105.3, 319.2], [106.8, 315.4],
];

const HAND_RIGHT: Knot[] = [
  [247.1, 304.5], [254.6, 308.7], [258.4, 314.7], [258.6, 321], [257.4, 327.6, 0.4], [254, 328.6], [252.7, 328.9],
  [246.5, 336.4], [241.6, 340.8], [241.4, 343.9, 0.4], [239.2, 343.1], [228.7, 348.9], [225.6, 349], [222.9, 346.7],
  [216.3, 349.6], [213.5, 348.1], [212.9, 345, 0.4], [209.4, 344.7], [207.7, 341.3], [208.3, 338.6, 0.4], [204.7, 336.6],
  [204.9, 333.8], [211.7, 327.8], [220.8, 321.6], [224.2, 318.1], [226.6, 314.4, 0.4], [225.5, 313.2], [217.4, 313.3],
  [212.2, 311.4], [211.4, 309.7], [212.7, 307.1], [218, 305.2], [226, 304], [234, 303.2], [240.2, 303.6],
];

/** The lines between his fingers, where one lies against the next. */
const CREASES: readonly (readonly Pt[])[] = [
  [
    [139.6, 335.4],
    [147.4, 340.2],
    [155, 345],
  ],
  [
    [137.4, 343.4],
    [145, 347.6],
    [151.4, 351],
  ],
  [
    [130.8, 347.8],
    [135.6, 350.6],
    [139.8, 353],
  ],
  [
    [224, 328.6],
    [214, 334.8],
    [205.4, 340.4],
  ],
  [
    [227, 335.8],
    [218.6, 341.8],
    [210.6, 347.4],
  ],
  [
    [234, 339.4],
    [226.4, 344.6],
    [219.4, 349],
  ],
];

/**
 * His shoes: soft and low, cut down at the inner side where the ankle shows,
 * the toe of each turned out.
 */
const SHOE_LEFT: Knot[] = [
  [159.4, 677], [160, 688.1], [159.2, 695.8], [158.1, 697.7], [155, 698.9], [142.9, 699.4], [104.6, 699.2],
  [98.3, 697.9], [96.4, 695.5], [95.9, 690], [97.2, 686.5], [106.1, 678.7], [114.5, 672.9], [120.1, 669.9],
  [122.2, 667.8, 0.4], [137.9, 667.7, 0.4], [139.2, 668.7], [141.7, 674.9], [142.8, 675.9], [146.9, 676.6], [158.1, 675.6, 0.4],
];

const SHOE_RIGHT: Knot[] = [
  [277.6, 695.3], [276.8, 696.9], [275.1, 698], [269.4, 699.3], [209.5, 698.9], [205.5, 697.2], [203.9, 693.3],
  [203.2, 686.9], [203.9, 676.9, 0.4], [205.6, 675.4], [218.1, 676.4], [220.3, 675.9], [222.1, 674.2], [223.9, 668.8],
  [224.9, 668, 0.4], [242.6, 667.5], [249.2, 670.7], [253.8, 672.1], [273.5, 682.9], [277.7, 687.7],
];

/**
 * His neck: the same tone as his face, as wide as his jaw, running on down
 * under the collar. The head covers all of it but a thin band above the
 * collar; it is here so that band, and anything a nod uncovers, is skin.
 */
const NECK: Knot[] = [
  [149.4, 118],
  [149.4, 131],
  [149, 140],
  [148.9, 145.6],
  [148.2, 150, 0],
  [160, 168],
  [183.6, 198],
  [201.6, 168],
  [207.6, 156, 0],
  [207.4, 152.4],
  [209, 148],
  [212, 141],
  [214.6, 131],
  [214.8, 118],
];

const strokes = (list: readonly (readonly Pt[])[]): string => list.map((s) => curve(s.map(([x, y]) => [x, y] as const), false)).join('');

function body(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  return part(
    [
      linearAt(id('handL'), [
        [0, C.skin],
        [1, C.fingers],
      ], 112, 312, 152, 350),
      linearAt(id('handR'), [
        [0, C.skin],
        [1, C.fingers],
      ], 250, 308, 210, 346),
    ],
    [
      // the ankles, between cuff and shoe
      fill('M130,660h29.6v18h-29.6zM204.6,660h34.6v17.6h-34.6z', C.skin),
      fill(curve(SHOE_LEFT) + curve(SHOE_RIGHT), C.shoe),
      fill(curve(TROUSERS), C.suit),
      fill(curve(NECK), C.skin),
      fill(curve(SHIRT), C.shirt),
      `<path d="${curve(JACKET)}${curve(GAP_LEFT)}${curve(GAP_RIGHT)}" fill="${C.suit}" fill-rule="evenodd"/>`,
      fill(FOLDS.map((s) => taper(s, [0, 2.2, 0])).join(''), C.fold),
      // drawn over the jacket's hem, so they fall straight from the sash
      line(strokes(PLEATS), C.fold, 3.4),
      fill(curve(SASH), C.sash),
      line(strokes(SASH_FOLDS), C.sashFold, 1.5),
      // each hand lighter toward its fingertips, which lie forward over the sash
      fill(curve(HAND_LEFT), `url(#${id('handL')})`),
      fill(curve(HAND_RIGHT), `url(#${id('handR')})`),
      fill(CREASES.map((s) => taper(s, [0.3, 1.1, 0.4])).join(''), C.crease),
    ],
  );
}

// ─────────────────────────────────────────────────────────────── the head

/** His hair: full on top, a little wavy along the hairline, down to a short sideburn in front of his ear. */
const HAIR: Knot[] = [
  [176.6, 50.0], [186.1, 50.0], [200.6, 53.3], [205.3, 55.8], [210.9, 57.9], [215.0, 61.6], [216.6, 64.3],
  [217.5, 67.6], [218.1, 73.6], [219.7, 79.9], [219.2, 89.4], [218.1, 92.0], [217.5, 92.1], [217.0, 91.3],
  [216.0, 90.9], [214.4, 83.5], [212.6, 79.2], [210.9, 76.9], [208.9, 75.7], [206.9, 76.0], [202.6, 78.4],
  [192.4, 80.5], [169.7, 77.1], [167.0, 77.6], [163.5, 79.2], [160.6, 83.3], [159.9, 86.6], [159.7, 92.8],
  [155.9, 99.8], [155.3, 104.6], [154.9, 117.1], [153.9, 118.6], [151.9, 118.5, 0.4], [150.9, 112.4], [147.4, 104.8],
  [145.2, 103.4], [141.1, 102.7], [140.4, 102.2], [137.9, 84.1], [138.5, 79.1], [140.5, 72.9], [144.2, 68.3],
  [147.2, 65.9], [149.1, 61.3], [152.5, 57.3], [160.8, 53.2], [167.8, 51.4],
];

/** The ear on the side he is turned from, and the shade inside it. */
const EAR: Knot[] = [
  [149.5, 132.4, 0.15], [148.4, 131.9], [147.7, 130.2], [144.5, 128.9], [141.0, 125.4], [137.5, 116.1],
  [136.9, 112.4], [137.1, 108.4], [137.6, 106.7], [139.9, 103.0], [139.8, 97.7], [140.7, 96.1], [147.9, 96.0],
  [148.7, 96.4], [149.1, 103.1], [147.9, 104.3], [151.0, 112.6], [151.7, 118.1], [151.6, 118.9], [149.5, 120.6],
  [149.3, 122.1], [150.2, 123.4], [149.2, 128.4],
];

const EAR_SHADE: Knot[] = [
  [147.7, 121.4, 0.4], [145.4, 120.3], [144.9, 119.5], [144.6, 117.5], [146.1, 114.7], [144.4, 109.8],
  [143.1, 109.2, 0.4], [141.5, 112.9], [140.9, 113.2, 0.4], [140.3, 112.5], [140.1, 109.3], [140.6, 106.8],
  [141.3, 106.1], [144.5, 106.7], [145.8, 107.6], [146.8, 109.3], [148.6, 118.7],
];

const EAR_SHADE2: Knot[] = [
  [149.9, 110.7, 0.15], [149.3, 110.3], [147.1, 105.6], [144.4, 103.5], [144.4, 103.1, 0.4], [148.6, 103.0],
  [149.6, 103.5], [150.0, 104.9],
];

/** The shade along his jaw and under his chin, one band from below his ear round to the other side. */
const JAW: Knot[] = [
  [203.2, 162.6], [200.4, 164.0], [197.8, 167.7], [195.8, 168.9], [191.9, 168.7], [185.1, 169.5], [181.0, 168.9],
  [176.0, 167.1], [167.0, 159.6], [156.0, 147.6], [152.5, 141.6], [151.7, 138.5], [150.1, 136.0], [149.6, 133.4],
  [150.2, 130.1, 0.4], [151.4, 130.0, 0.4], [151.2, 131.5], [156.6, 143.5], [160.5, 148.1], [169.4, 153.7],
  [171.0, 155.3], [173.7, 156.4], [177.8, 159.8], [185.6, 162.0], [189.6, 162.1], [191.1, 161.5],
  [192.8, 158.4, 0.15], [195.2, 161.7], [197.2, 161.8], [202.1, 160.3], [203.2, 161.1],
];

/** The shade under his nose and down its far side. */
const NOSE_SHADE: Knot[] = [
  [205.9, 134.1], [205.5, 134.9], [203.4, 134.9], [198.3, 132.6], [194.4, 133.1], [189.6, 131.8], [183.1, 134.5],
  [182.2, 134.2], [182.0, 133.1], [182.6, 131.7], [185.6, 130.2], [185.5, 127.4], [186.6, 126.2], [189.3, 126.4],
  [194.7, 128.4], [198.1, 127.4], [198.6, 125.1], [198.0, 119.4], [198.8, 118.7, 0.4], [200.3, 120.9],
  [200.6, 126.2], [199.9, 129.8, 0.4], [205.5, 133.1],
];

/** His brows: thick and straight, a little heavier toward the middle. */
const BROW_LEFT: Knot[] = [
  [187.5, 100.6], [187.0, 101.6], [184.6, 102.9], [178.6, 102.4], [175.4, 102.7], [171.9, 101.9], [165.2, 101.9],
  [164.4, 101.2, 0.4], [164.9, 100.2], [167.2, 98.3], [173.9, 97.3], [178.6, 97.5], [184.9, 98.6], [186.8, 99.6],
];

const BROW_RIGHT: Knot[] = [
  [198.8, 101.6], [199.2, 100.3], [200.5, 99.3], [203.2, 98.4], [207.6, 98.0], [211.4, 98.0], [213.6, 98.5],
  [215.6, 99.7], [216.2, 101.4], [215.9, 102.3], [215.4, 102.5], [213.4, 102.1], [209.9, 102.2], [200.6, 103.3],
  [199.4, 103.0],
];

/**
 * His face and neck down to just above the collar, in one flat tone. Its top
 * runs hidden under his hair, a little inside the hair's outer edge, so no
 * skin shows round the hair; its bottom follows the collar.
 */
const FACE: Knot[] = [
  [150.4, 64],
  [160, 56],
  [176.5, 52.6],
  [195.6, 54.6],
  [209, 60.2],
  [214.6, 67],
  [215.8, 75],
  [217.4, 84],
  [219, 89.6],
  [216.8, 100.4],
  [216.1, 108.1],
  [216.6, 116.4],
  [215.9, 128.4],
  [212.9, 141.1],
  [209.8, 148],
  [208, 152.6],
  [206.9, 154.6, 0.3],
  [205.2, 156.9],
  [202.4, 160.7],
  [199.6, 164.7],
  [196.9, 166.8],
  [193.6, 169.4],
  [192, 174.5],
  [190.3, 178.3],
  [186.4, 186],
  [183.8, 191.6, 0.2],
  [179.5, 185.3],
  [175.9, 178.1],
  [173.7, 173.5],
  [170.5, 170.6],
  [167.5, 169.5],
  [163.9, 166.9],
  [161.8, 164.9],
  [159, 160],
  [155, 155.3],
  [151.8, 151.6],
  [149.3, 146.9],
  [148.3, 145.2, 0.3],
  [148.4, 138],
  [148.7, 131.6],
  [149.8, 127.5],
  [150.4, 121],
  [150.2, 110],
  [148.6, 100.5],
  [145.5, 97.5],
  [142.2, 92],
  [141, 84],
  [142.6, 75],
  [146, 69.4],
];

function head(): string {
  return part(
    [],
    [
      fill(curve(EAR), C.ear),
      fill(curve(EAR_SHADE) + curve(EAR_SHADE2), C.earShade),
      fill(curve(FACE), C.skin),
      fill(curve(JAW), C.shade, alpha(0.85)),
      // the nose: shade down its far side and under it
      fill(taper([[197.4, 104], [197.2, 110], [198.2, 117.4], [199.6, 122]], [0, 1.1, 1.5, 1.4]), C.shade, alpha(0.55)),
      fill(curve(NOSE_SHADE), C.shade, alpha(0.85)),
      fill(curve(HAIR), C.hair),
      fill(curve(BROW_LEFT) + curve(BROW_RIGHT), C.brow),
    ],
  );
}

// ─────────────────────────────────────────────────────────────── the eyes

/** Each eye's opening, from its outer corner round to its inner one; the head is turned, so the far eye is a little smaller. */
const EYE_LEFT: Knot[] = [
  [167.8, 109.4, 0.2],
  [170.6, 106.8],
  [175.4, 105.8],
  [180.2, 106.6],
  [183.3, 109.6, 0.2],
  [180, 112],
  [175.6, 112.7],
  [171, 111.8],
];

const EYE_RIGHT: Knot[] = [
  [199.8, 110, 0.2],
  [202.4, 107.2],
  [205.8, 106.2],
  [209.8, 106.8],
  [212.9, 109.4, 0.2],
  [210.4, 111.8],
  [206, 112.7],
  [202.2, 112],
];

/** Where each iris sits and how big it is; the far eye is a little smaller, the head being turned. */
const IRIS: readonly (readonly [number, number, number])[] = [
  [175, 108.6, 4],
  [205.4, 108.9, 3.6],
];

/** The upper lid's dark line along the top of an opening. */
function lid(eye: readonly Knot[], weight: number): string {
  const top = [eye[0], eye[1], eye[2], eye[3], eye[4]].map((k) => [(k as Knot)[0], (k as Knot)[1]] as Pt);
  return taper(top, [0.4 * weight, 1.1 * weight, 1.3 * weight, 1.1 * weight, 0.3 * weight]);
}

function eyesOpen(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const iris = ([x, y, r]: readonly [number, number, number]): string =>
    circle(x, y, r, C.iris) + circle(x, y, r * 0.48, C.pupil) + circle(x + r * 0.6, y - r * 0.24, r * 0.26, C.white);
  return part(
    [clipDef(id('eyeL'), curve(EYE_LEFT)), clipDef(id('eyeR'), curve(EYE_RIGHT))],
    [
      fill(curve(EYE_LEFT) + curve(EYE_RIGHT), C.white),
      clipped(id('eyeL'), iris(IRIS[0] as readonly [number, number, number])),
      clipped(id('eyeR'), iris(IRIS[1] as readonly [number, number, number])),
      fill(lid(EYE_LEFT, 1) + lid(EYE_RIGHT, 0.95), C.lash),
    ],
  );
}

/** A blink: the eyes shut along a dark lash line, the crease of each lid above it. */
function eyesClosed(): string {
  const shut = (eye: readonly Knot[]): Pt[] => [eye[0], eye[7], eye[6], eye[5], eye[4]].map((k) => [(k as Knot)[0], (k as Knot)[1] - 0.6] as Pt);
  const left = shut(EYE_LEFT);
  const right = shut(EYE_RIGHT);
  return part(
    [],
    [
      fill(taper(left, [0.5, 1.3, 1.5, 1.3, 0.4]) + taper(right, [0.4, 1.2, 1.4, 1.2, 0.4]), C.lash),
      line(curve(EYE_LEFT.slice(0, 5).map((k) => [k[0], k[1] - 0.4] as const), false) + curve(EYE_RIGHT.slice(0, 5).map((k) => [k[0], k[1] - 0.4] as const), false), C.shade, 0.8),
    ],
  );
}

/** His moustache: full and thick across his lip, tapering to points that turn down past the corners of his mouth. */
const MOUSTACHE: Knot[] = [
  [171, 137.9, 0.15],
  [174.6, 136.4],
  [178.6, 134.5],
  [189.4, 129.7],
  [194.4, 131.1],
  [197.4, 130.5],
  [199.2, 130.9],
  [207.4, 135],
  [212, 137.9, 0.15],
  [210.1, 138],
  [204.4, 138.4],
  [194.4, 137.5],
  [190.9, 138],
  [179.9, 138.4],
  [174.9, 138.3],
];

export function drawHamo(p: string): CharacterArt {
  return {
    id: 'hamo',
    name: 'Hamo',
    viewBox: { x: 34, y: 42, w: 278, h: 664 },
    bust: { x: 118, y: 44, w: 134, h: 134 },
    headPivot: { x: 181, y: 160 },
    body: body(p),
    head: head(),
    eyes: { open: eyesOpen(p), closed: eyesClosed() },
    mouths: humanMouths(
      {
        corners: [
          [181.8, 140.2],
          [206, 138.8],
        ],
        open: { left: [184.4, 139], right: [201.3, 139.2], top: 138.2, bottom: 142.9 },
        upperLip: 1,
        lowerLip: 3.1,
        middle: 0.53,
        colours: { upperLip: '#94523f', lowerLip: '#985a45', line: '#5a2a1e', inside: '#4a1a12', teeth: '#f3d8cc', tongue: '#c0695c' },
      },
      p,
    ),
    overlay: fill(curve(MOUSTACHE), C.moustache),
  };
}
