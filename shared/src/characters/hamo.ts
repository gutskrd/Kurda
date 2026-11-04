/**
 * Hamo: a man in a traditional Kurdish suit — a dark brown jacket crossed
 * over a white shirt, a plain green pştên at the waist, wide trousers
 * gathered at the ankle, and brown shoes — standing with his hands on his
 * hips, his head turned a little to one side, smiling under a full black
 * moustache, his hair black like the reference’s.
 *
 * Drawn flat, each part one tone, with a few shade shapes where the form
 * turns: his jaw, under his nose, inside his ear, the folds of the jacket
 * and trousers. That is all the shading the suit has, so it is all the
 * drawing has; the pştên is one flat tone of green, as he asked for it.
 *
 * His head reaches down over his neck to just above the collar, the same
 * skin tone as the neck drawn beneath it, so the head can nod without a seam
 * showing where the two meet. His moustache is the overlay: it lies over the
 * mouth, so every mouth shape tucks its top under it, as a real mouth does.
 *
 * Who he is. Hamo is the warm uncle: steady, patient and easily pleased,
 * the one who laughs at his own stories. He chuckles with his whole face,
 * brows up and eyes shut, shoulders going; proud of his moustache, he gives
 * the near end of it a small lift when he is pleased with you. Puzzled, he
 * raises one brow and waits rather than frowning; a miss gets that brow and
 * a thoughtful look, never a cross word. His brows are straight bars, so his
 * feelings show in how high they sit and how they slant, not in any arch.
 */
import type { Pt } from '../art/svg.js';
import { n } from '../art/svg.js';
import type { BrowState, CharacterArt, RigPart } from './types.js';
import type { Knot } from './pen.js';
import { alpha, circle, clipDef, clipped, curve, fill, line, part, taper } from './pen.js';
import { humanMouths } from './mouth.js';

const C = {
  hair: '#1c1410',
  skin: '#b66d55',
  shade: '#a15d46',
  ear: '#ac6551',
  earShade: '#93533d',
  brow: '#241710',
  white: '#ecc6b5',
  iris: '#623622',
  pupil: '#2e160d',
  lash: '#2e1810',
  moustache: '#1f1510',
  suit: '#5b3b26',
  fold: '#452a18',
  shirt: '#f1ede4',
  sash: '#45502c',
  shoe: '#99572e',
} as const;

// ─────────────────────────────────────────────────────────────── the body

/** Jacket and sleeves in one piece, from the shoulders to the hips, its front opening over the shirt. */
const JACKET: Knot[] = [
  [145.3, 146.4], [159.7, 163.6], [165.6, 173.2], [165.7, 186.2], [171.1, 219.8], [173.7, 230.9], [176.8, 250.5],
  [178.3, 255.1], [178.5, 260.6], [181.6, 272.8], [183.8, 287.1], [185.4, 290.7], [188.0, 306.0],
  [188.9, 308.6, 0.3], [189.9, 306.2], [195.2, 248.9], [197.0, 236.6], [198.4, 217.0], [200.7, 199.1],
  [201.5, 189.1], [200.9, 169.9], [201.9, 166.9], [200.7, 162.5], [202.9, 157.9], [209.2, 153.2],
  [209.8, 159.3], [213.9, 162.5], [224.2, 165.0], [239.0, 170.0],
  [250.4, 175.0], [258.5, 180.0], [263.7, 185.0], [270.0, 192.2], [277.7, 203.4], [289.7, 224.9], [300.4, 250.2], [302.0, 261.5],
  [302.0, 269.0], [297.8, 280.9], [287.2, 299.3], [277.2, 313.1], [264.5, 328.5], [262, 329.5], [258, 329.6],
  [251, 329], [245.5, 332.5], [242.6, 337.5], [241.2, 343], [241.8, 347.5], [243.5, 351.4], [244.0, 352.6], [243.2, 353.3],
  [108.5, 353.2, 0.4], [108.7, 352.1], [109.3, 350.2], [110.3, 348.4], [112.6, 344.3], [112.4, 338.5],
  [110, 333.4], [103, 332.8], [97, 332], [75.5, 313.5], [68, 306.1], [59.5, 295.6], [51.5, 283.1],
  [46.5, 275.0], [45, 271.3], [44.2, 262.4], [44.2, 253.3], [52.2, 226.6], [64.4, 201.1], [72.6, 188.8],
  [81.8, 180.0], [90.4, 175.0], [101.3, 170.0], [117, 165.0], [131.3, 160.0], [138.7, 154.6], [143.4, 147.0],
  [144.5, 146.1],
];

/** The spaces inside his bent arms, between sleeve and body. */
const GAP_LEFT: Knot[] = [
  [102.5, 256.6, 0.3], [104.4, 258], [105.7, 262], [106.6, 266], [108, 270], [109.2, 274], [110.2, 278], [111.5, 282],
  [113, 286], [113.8, 290], [114.1, 292], [113.4, 293.8, 0.3], [111.8, 292], [109.4, 290], [105.5, 286], [101.4, 282],
  [97.2, 278], [93, 274], [90.6, 272], [89.6, 270, 0.5], [90.8, 268], [93.1, 266], [94.7, 264], [96.8, 262],
  [98.5, 260], [100.6, 258],
];

const GAP_RIGHT: Knot[] = [
  [245.3, 256.7, 0.3], [246.9, 258], [250.6, 262], [254.5, 266], [258.1, 270, 0.5], [258.1, 272], [256.5, 274],
  [253.7, 278], [250.7, 282], [247.8, 286], [244.6, 290], [241.5, 294], [240, 296], [238.8, 297.6, 0.3], [238, 296],
  [238.4, 294], [239.1, 290], [239.7, 286], [240.2, 282], [240.5, 278], [241.1, 274], [241.7, 270], [242.5, 266],
  [243.1, 262], [243.7, 258],
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

/**
 * Wide trousers, full to the knee and gathered in at each ankle, the space
 * between the legs left open. Their hips begin under his hands, as the
 * reference’s do, so the background shows in the notch under each cuff.
 */
const TROUSERS: Knot[] = [
  [110.1, 350.3], [106.3, 359.4], [102.3, 373.9], [98.4, 393.3], [94.5, 422.6], [90.7, 468.6], [87.3, 533.6],
  [86.9, 565.9], [92, 604.8], [97.5, 624.6], [101.5, 636], [107, 644], [114.5, 650.6], [120.5, 658.5],
  [123.5, 663.8], [123.2, 667.6, 0.4], [125.3, 667.6, 0.3], [125.6, 665.1, 0.3], [138.9, 665], [149.3, 664.6],
  [158.3, 664, 0.4], [159.4, 663], [165.4, 657.2], [169.3, 650.4], [173.6, 635.7], [174.6, 626.2], [176.6, 560],
  [178.8, 490.9], [180.1, 470.9, 0.3], [181.6, 490.9], [183.4, 550], [185.2, 607.4], [186.9, 631.2], [190.7, 646.5],
  [194.9, 655.2], [198.4, 659.3], [204.8, 664.4, 0.4], [206.6, 663.4], [211.9, 664.4], [224.1, 664.8],
  [233.4, 664.3], [240.3, 664, 0.4], [241, 661.8], [244, 654.3], [251.5, 642.3], [258, 632.5], [263.2, 617.4],
  [267.3, 592.4], [268.5, 578.9], [266, 496.4], [261.9, 449], [258.1, 416.2], [254.2, 391.4], [247.3, 362.5],
  [243.4, 351.2], [243, 350, 0], [110.5, 350, 0],
];

/**
 * The jacket's own folds: the seam where each sleeve meets the body and the
 * long crease down each forearm from the inside of the elbow to under the
 * hand. The cuffs carry no mark of their own, as the reference’s do not.
 */
const FOLDS: readonly (readonly Pt[])[] = [
  [
    [117.8, 221.9],
    [113.4, 232.5],
    [109.8, 242.9],
    [104.2, 253],
  ],
  [
    [249.2, 221],
    [248.7, 234],
    [247.4, 244],
    [246.4, 253.9],
  ],
  [
    [76.6, 261.6],
    [87, 273],
    [100, 285.6],
    [112, 295.6],
    [124, 305.2],
  ],
  [
    [272.4, 256.8],
    [265.3, 265.4],
    [258, 278.2],
    [251.3, 286.4],
    [244.6, 295],
    [239.6, 301],
  ],
];

/** The pleats that fall from the sash, two to each leg: pressed tucks, the inner pair longer. */
const PLEATS: readonly (readonly Pt[])[] = [
  [
    [126.8, 346],
    [123.4, 369.8],
    [120.4, 381.5],
    [119, 393.1],
  ],
  [
    [168.2, 347],
    [163.5, 376],
    [161.1, 394],
    [160.9, 411.9],
  ],
  [
    [214.6, 347],
    [220.5, 380.9],
    [223.6, 403.6],
    [223.5, 426.4],
  ],
  [
    [230.6, 346],
    [235, 370],
    [237.6, 382],
    [238.6, 393.9],
  ],
];

/** Where the pştên's top edge is at his sides, and how far it and every band in it bow down at the front: a little, as cloth round a waist does. */
const SASH_TOP = 314.5;

/**
 * How far each edge of the band bows down at the front, measured from the
 * reference: the top edge sags a little, the bottom edge twice as deep, so
 * the band curves full over the middle rather than lying as a flat ribbon.
 */
const SASH_BOW_TOP = 2.5;
const SASH_BOW_BOTTOM = 3;

/** How deep the wound cloth reaches below its top edge, measured between the reference’s hands: a thin band worn up at the waist, his fingers curling over its top edge. */
const SASH_DEPTH = 33;

/**
 * The pştên, wound round his waist from hip to hip in one flat green: its top
 * and bottom edges bow down together at the front, its ends run under his
 * hands and round his sides, where they follow the line of his hips.
 */
function sashOutline(bottom: number): string {
  const [t, b] = [SASH_TOP, bottom];
  // its ends keep inside the jacket's hem corners, which wrap round them
  return (
    `M112.4,${n(t + 2.5)}L116,${t}Q180,${n(t + SASH_BOW_TOP * 2)} 244,${t}H244.6L244,330L241,341.5L241,${n(b)}` +
    `Q180,${n(b + SASH_BOW_BOTTOM * 2)} 116,${n(b)}H111L112.4,338Z`
  );
}

/**
 * His left hand (on the viewer's left), the fingers lying forward over the
 * sash. Its outer edge is the reference’s: the wrist inside the cuff, the
 * heel receding under the cuff rather than reaching past it.
 */
const HAND_LEFT: Knot[] = [
  [108.8, 313.2], [114, 309.6], [120.4, 307], [128, 306.6], [136.1, 307.5], [143, 310.2], [149.4, 311.7],
  [151.6, 314.6, 0.4], [148.6, 317.3], [141, 317.7], [136.4, 318.4, 0.4], [136.6, 321.8], [140.7, 326.0],
  [157.8, 337], [159.3, 338.6], [159.5, 340.6], [158.4, 342.2], [156.9, 342.9, 0.3], [158.3, 344.2], [159.2, 346.2],
  [158.6, 348.4], [157, 349.6], [155.6, 350.1, 0.3], [151.0, 350.0, 0.4], [149.8, 352.2], [148.6, 352.8], [145.1, 352.7],
  [139.6, 351.2], [136.4, 352.6], [131.5, 351.0], [129.4, 349.6], [126.6, 347.2], [123, 343.6], [119.2, 339.8],
  [116.2, 336.4], [113.2, 332.6], [110.4, 328.6], [107.6, 324.6], [104.8, 320.2], [104.6, 316.6], [106.8, 314.6],
];

/** His right hand, foreshortened as the reference’s is: the thumb along the top of the sash, the wrist kept within the cuff. */
const HAND_RIGHT: Knot[] = [
  [247.1, 304.5], [253.5, 308.5], [256.8, 313.5], [256.6, 318.5], [254.4, 322.5], [250.6, 326.5], [247.2, 330], [243.6, 333.5],
  [239.2, 337.5], [234.4, 340.8], [229.8, 343.3], [226.4, 344.8, 0.4], [223.2, 344.4], [218.2, 345.2], [214.6, 344.6],
  [212.9, 343.6, 0.4], [209, 343.3], [206.4, 342.2], [205.8, 340.4], [207, 338.6],
  [208.3, 337.4, 0.4], [204.7, 335], [204.9, 332.6], [211.7, 327.2], [220.8, 321.4], [224.2, 318.1], [226.6, 314.4, 0.4], [225.5, 313.2], [217.4, 313.3],
  [212.2, 311.4], [211.4, 309.7], [212.7, 307.1], [218, 305.2], [226, 303.8], [232, 302.8], [236, 301.4], [238.4, 300.6], [240.2, 302.4], [243, 303.8],
];

/** The lines between his fingers, where one lies against the next. */
const CREASES: readonly (readonly Pt[])[] = [
  [
    [139.6, 334],
    [147.4, 338.6],
    [155, 343],
  ],
  [
    [137.4, 341.4],
    [145, 345.4],
    [151.4, 348.6],
  ],
  [
    [130.8, 345.6],
    [135.6, 348.2],
    [139.8, 350.4],
  ],
  [
    [224, 327],
    [214, 332.6],
    [205.4, 337.6],
  ],
  [
    [226, 332.6],
    [218, 337.8],
    [210.6, 342.4],
  ],
  [
    [231, 336.4],
    [224, 340.6],
    [218, 344],
  ],
];

/**
 * His shoes: soft and low, cut down at the inner side where the ankle shows,
 * the toe of each turned out.
 */
const SHOE_LEFT: Knot[] = [
  [159.4, 677], [160, 688.1], [159.2, 695.8], [158.1, 697.7], [155, 698.9], [142.9, 699.4], [104.6, 699.2],
  [98.3, 697.9], [96.4, 695.5], [95.9, 690], [97.2, 686.5], [104, 678.7], [110.5, 672.5], [115.5, 669.5],
  [122.2, 667.8, 0.4], [137.9, 667.7, 0.4], [139.2, 668.7], [141.7, 674.9], [142.8, 675.9], [146.9, 676.6], [158.1, 675.6, 0.4],
];

const SHOE_RIGHT: Knot[] = [
  [277.6, 695.3], [276.8, 696.9], [275.1, 698], [269.4, 699.3], [209.5, 698.9], [205.5, 697.2], [203.9, 693.3],
  [203.2, 686.9], [203.9, 676.9, 0.4], [205.6, 675.4], [218.1, 676.4], [220.3, 675.9], [222.1, 674.2], [223.9, 668.8],
  [224.9, 668, 0.4], [242.6, 667.5], [252.5, 670.2], [257.5, 672], [275, 682], [277.7, 687.7],
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

function body(): string {
  const sash = sashOutline(SASH_TOP + SASH_DEPTH);
  return part(
    [],
    [
      // the ankles, between cuff and shoe
      fill('M125,660h35v18h-35zM204.6,660h36.9v17.6h-36.9z', C.skin),
      fill(curve(SHOE_LEFT) + curve(SHOE_RIGHT), C.shoe),
      fill(curve(TROUSERS), C.suit),
      fill(curve(NECK), C.skin),
      fill(curve(SHIRT), C.shirt),
      `<path d="${curve(JACKET)}${curve(GAP_LEFT)}${curve(GAP_RIGHT)}" fill="${C.suit}" fill-rule="evenodd"/>`,
      fill(FOLDS.map((s) => taper(s, s.map((_, i) => (i === 0 || i === s.length - 1 ? 0.3 : 2.4)))).join(''), C.fold),
      // drawn over the jacket's hem, so they fall straight from the sash
      line(strokes(PLEATS), C.fold, 3.4),
      fill(sash, C.sash),
      // the hands lie over the pştên in the skin of his face, the fingers forward and the thumbs back
      fill(curve(HAND_LEFT) + curve(HAND_RIGHT), C.skin),
      fill(CREASES.map((s) => taper(s, [0.2, 0.8, 0.25])).join(''), C.shade),
    ],
  );
}

// ─────────────────────────────────────────────────────────────── the head

/** His hair: full on top, a little wavy along the hairline, the temples filled in as the reference’s are, down to a short sideburn in front of his ear. */
const HAIR: Knot[] = [
  [176.6, 50.0], [186.1, 50.0], [200.6, 53.3], [205.3, 55.8], [210.9, 57.9], [215.0, 61.6], [216.6, 64.3],
  [217.5, 67.6], [218.1, 73.6], [219.7, 79.9], [219.8, 84], [219.6, 87], [219.1, 90], [218.5, 92], [217.9, 94],
  [217.3, 95.3, 0.2], [216.4, 94], [216, 92], [215.6, 90], [215.2, 87.8], [214.8, 85.5], [214.1, 83.5], [213.1, 81.0], [211.3, 78.8], [209.0, 77.6], [206.9, 78.0], [202.6, 78.4],
  [192.4, 80.5], [169.7, 79.0], [166.6, 79.6], [162.6, 81.4], [159.6, 85.0], [158.9, 87.8], [159.0, 93.2],
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
  [200.4, 163.3], [199.1, 164.5], [197.8, 167.7], [195.8, 168.9], [191.9, 168.7], [185.1, 169.5], [181.0, 168.9],
  [176.0, 167.1], [167.0, 159.6], [156.0, 147.6], [152.5, 141.6], [151.7, 138.5], [150.1, 136.0], [149.6, 133.4],
  [150.2, 130.1, 0.4], [151.4, 130.0, 0.4], [151.2, 131.5], [156.6, 143.5], [160.5, 148.1], [169.4, 153.7],
  [171.0, 155.3], [173.7, 156.4], [177.8, 159.8], [185.6, 162.0], [189.6, 162.1], [191.1, 161.5],
  [193.2, 159.6], [195.2, 161.4], [197.2, 161.6], [199.6, 161.1], [200.2, 162],
];

/**
 * His nose, as the reference draws it: no line down the ridge and no edge
 * drawn round it, only a soft, broad shade on the far side of its lower half
 * where it rounds toward the tip, and a soft shadow under the tip that tucks
 * under the moustache, so the base is hidden the way the reference’s is.
 */
const NOSE_SIDE: Knot[] = [
  [196.8, 112.5, 0.5], [198.8, 115.5], [200.6, 119.5], [202.0, 123.5], [202.4, 126.6], [201.0, 128.0, 0.5], [199.0, 127.6],
  [197.4, 125.2], [196.4, 121], [196.2, 116],
];

const NOSE_BASE: Knot[] = [
  [193.0, 128.0, 0.5], [196.5, 127.4], [199.6, 127.6], [201.8, 128.8], [201.4, 131.4, 0.5], [198.0, 131.2], [194.6, 131.2],
  [192.6, 129.8],
];

/**
 * His brows, set straight as the owner asked: each a level bar the thickness
 * of a finger, blunt and a touch heavier at its inner end and tapering to a
 * point at the temple, its outer end a hair higher than its inner one, so
 * he looks steady rather than surprised. The far brow is the same bar
 * foreshortened, its tail running out toward the far temple.
 */
const BROW_LEFT: Knot[] = [
  [164.2, 99.2, 0.15], [165.0, 98.6], [170.0, 98.0], [176.0, 97.5], [182.0, 97.3], [188.6, 97.4],
  [189.4, 99.6, 0.5], [188.0, 101.6], [182.0, 101.3], [176.0, 100.9], [170.0, 100.4], [165.6, 99.9],
];

const BROW_RIGHT: Knot[] = [
  [198.9, 100.0, 0.5], [200.5, 97.8], [205.0, 97.2], [210.0, 97.0], [214.5, 97.3], [216.9, 98.6, 0.15],
  [214.6, 100.0], [210.0, 100.6], [205.0, 101.0], [200.8, 101.6],
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
  [218.3, 90],
  [217.7, 94],
  [217.4, 96],
  [217.1, 98.5],
  [217, 101],
  [216.6, 104],
  [216.1, 108.1],
  [216.6, 116.4],
  [215.9, 128.4],
  [212.9, 141.1],
  [209.8, 148],
  [208, 152.6],
  [206.4, 155.4],
  [203.9, 159.3],
  [200.9, 163.2],
  [197.4, 166.5],
  [193.6, 169.4],
  [192, 174.5],
  [190.3, 178.3],
  [186.4, 186],
  [183.8, 191.6, 0.2],
  [179.5, 185.3],
  [175.9, 178.1],
  [172.9, 172.9],
  [168.9, 169.3],
  [164.9, 166.6],
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

/**
 * How the brows sit for each state: each bar carried `dy` up or down (and
 * `dx` toward the nose), and its inner end a further `slant` beyond that,
 * fading to nothing at the temple, so a raised brow lifts most where a brow
 * does. The near brow (on the left as seen) moves the more, as the near
 * side of a turned face does.
 */
const BROW_MOVES: Readonly<Record<BrowState, { near: readonly [number, number, number]; far: readonly [number, number, number] }>> = {
  neutral: { near: [0, 0, 0], far: [0, 0, 0] },
  raised: { near: [0, -2.6, -0.5], far: [0, -2.2, -0.4] },
  // one brow up, most at its inner end, the other left where it is: the look that asks "really?"
  one: { near: [0, -1.3, -2.2], far: [0, 0, 0] },
  // both drawn down and in toward the nose, the inner ends lowest
  knit: { near: [0.9, 1.0, 1.3], far: [-0.8, 0.9, 1.1] },
};

/** The brows as they sit for `state`; at rest they are exactly as traced. */
function brows(state: BrowState): string {
  const moved = (knots: readonly Knot[], [dx, dy, slant]: readonly [number, number, number], inner: number, outer: number): Knot[] =>
    knots.map(([x, y, r]) => [x + dx, y + dy + slant * ((x - outer) / (inner - outer)), r ?? 1] as const);
  const m = BROW_MOVES[state];
  return fill(curve(moved(BROW_LEFT, m.near, 189.4, 164.2)) + curve(moved(BROW_RIGHT, m.far, 198.9, 216.9)), C.brow);
}

/** His head; without its brows (`withBrows` false), for a player that draws them as a layer of their own. */
function head(withBrows = true): string {
  return part(
    [],
    [
      fill(curve(EAR), C.ear),
      fill(curve(EAR_SHADE) + curve(EAR_SHADE2), C.earShade),
      fill(curve(FACE), C.skin),
      fill(curve(JAW), C.shade, alpha(0.85)),
      fill(curve(NOSE_SIDE), C.shade, alpha(0.18)),
      fill(curve(NOSE_BASE), C.shade, alpha(0.35)),
      fill(curve(HAIR), C.hair),
      ...(withBrows ? [brows('neutral')] : []),
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

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];

/** An eye's opening made `tall` times taller about its middle, the lids lifting and dropping as a startled eye's do. */
function opened(eye: readonly Knot[], tall: number): Knot[] {
  const ys = eye.map((k) => k[1]);
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  return eye.map(([x, y, r]) => [x, mid + (y - mid) * tall, r ?? 1] as const);
}

/**
 * The open eyes asked for: each its white, its iris in a clip of its own,
 * and the lash line of its upper lid. `tag` names the clips, so a part drawn
 * for one state never defines another's; `tall` opens them wider and `pupil`
 * shrinks the pupils, for a startled look.
 */
function eyesDrawn(p: string, tag: string, sides: readonly Side[], tall = 1, pupil = 0.48): string {
  const id = (side: Side): string => `${p}${tag}${side === 'left' ? 'L' : 'R'}`;
  const eye = (side: Side): Knot[] => opened(side === 'left' ? EYE_LEFT : EYE_RIGHT, tall);
  const iris = ([x, y, r]: readonly [number, number, number]): string =>
    circle(x, y, r, C.iris) + circle(x, y, r * pupil, C.pupil) + circle(x + r * 0.6, y - r * 0.24, r * 0.26, C.white);
  return part(
    sides.map((side) => clipDef(id(side), curve(eye(side)))),
    [
      fill(sides.map((side) => curve(eye(side))).join(''), C.white),
      // each iris in a group of its own, so it can look aside within its eye (`irisReach`)
      ...sides.map((side) => clipped(id(side), `<g data-iris="${side}">${iris(IRIS[side === 'left' ? 0 : 1] as readonly [number, number, number])}</g>`)),
      fill(sides.map((side) => lid(eye(side), side === 'left' ? 1 : 0.95)).join(''), C.lash),
    ],
  );
}

function eyesOpen(p: string): string {
  return eyesDrawn(p, 'eye', SIDES);
}

/** Startled: the eyes opened wide, the pupils small in them. */
function eyesWide(p: string): string {
  return eyesDrawn(p, 'wide', SIDES, 1.4, 0.4);
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

/** A smiling eye: shut, the lash line along where the upper lid was, curved up, the way eyes close when someone beams. */
function smilingEye(eye: readonly Knot[], weight: number): string {
  return taper(
    [eye[0], eye[1], eye[2], eye[3], eye[4]].map((k) => [(k as Knot)[0], (k as Knot)[1] + 1.8] as Pt),
    [0.4 * weight, 1.2 * weight, 1.5 * weight, 1.2 * weight, 0.4 * weight],
  );
}

function eyesHappy(): string {
  return part([], [fill(smilingEye(EYE_LEFT, 1) + smilingEye(EYE_RIGHT, 0.95), C.lash)]);
}

/** A wink: the near eye shut in a smile, the far one open and on you. */
function eyesWink(p: string): string {
  return eyesDrawn(p, 'wink', ['right']) + part([], [fill(smilingEye(EYE_LEFT, 1), C.lash)]);
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

/**
 * Where the near end of the moustache parts from the rest, for the lift he
 * gives it: an upright cut just inside the near lobe's root, and how far the
 * two pieces overlap there. Each piece is the whole moustache's own outline
 * inside a clip, so drawn together at rest they are the moustache to the
 * pixel, and the end can turn a little about its root with nothing opening
 * between them.
 */
const MOUSTACHE_CUT = 178.4;
const MOUSTACHE_LAP = 0.6;

function moustacheParts(p: string): { body: string; end: RigPart } {
  const whole = fill(curve(MOUSTACHE), C.moustache);
  const body = `${p}stacheBody`;
  const end = `${p}stacheEnd`;
  return {
    body: part([clipDef(body, `M${n(MOUSTACHE_CUT)},120H230V150H${n(MOUSTACHE_CUT)}z`)], [clipped(body, whole)]),
    end: {
      art: part([clipDef(end, `M160,120H${n(MOUSTACHE_CUT + MOUSTACHE_LAP)}V150H160z`)], [clipped(end, whole)]),
      pivot: { x: MOUSTACHE_CUT + MOUSTACHE_LAP / 2, y: 136.4 },
    },
  };
}

export function drawHamo(p: string): CharacterArt {
  return {
    id: 'hamo',
    name: 'Hamo',
    viewBox: { x: 34, y: 42, w: 278, h: 664 },
    bust: { x: 118, y: 44, w: 134, h: 134 },
    // head to hips: his hands on his sash, and the top of his trousers
    half: { x: 34, y: 42, w: 278, h: 360 },
    headPivot: { x: 181, y: 160 },
    body: body(),
    head: head(),
    eyes: { open: eyesOpen(p), closed: eyesClosed(), happy: eyesHappy(), wink: eyesWink(p), wide: eyesWide(p) },
    brows: { bare: head(false), states: { neutral: brows('neutral'), raised: brows('raised'), one: brows('one'), knit: brows('knit') } },
    moustache: moustacheParts(p),
    mouths: humanMouths(
      {
        open: { left: [184.4, 139], right: [201.3, 139.2], top: 138.2, bottom: 142.9 },
        upperLip: 1,
        lowerLip: 2.4,
        sideLip: 2,
        middle: 0.53,
        colours: { lip: '#85493a', line: '#5a2a1e', inside: '#4a1a12', teeth: '#f3d8cc', tongue: '#c0695c' },
      },
      p,
    ),
    overlay: fill(curve(MOUSTACHE), C.moustache),
    irisReach: 2.4,
    // his far eye, on the right, is the smaller: his face is turned a little to the left
    turned: 'left',
  };
}
