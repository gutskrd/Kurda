/**
 * Hamo: a man in a traditional Kurdish suit — a chestnut jacket crossed over
 * a cream shirt, a woven pştên wound at the waist in bands of colour and
 * small diamonds and crosses, wide trousers gathered at the ankle, and white
 * klaş — standing with his hands on his hips, his head turned a little to one
 * side, smiling under a full black moustache.
 *
 * Drawn flat, each part one tone, with a few shade shapes where the form
 * turns: his jaw, under his nose, inside his ear, the folds of the jacket,
 * sash and trousers. That is all the shading the suit has, so it is all the
 * drawing has; the pştên's weave is its only pattern.
 *
 * His head reaches down over his neck to just above the collar, the same
 * skin tone as the neck drawn beneath it, so the head can nod without a seam
 * showing where the two meet. His moustache is the overlay: it lies over the
 * mouth, so every mouth shape tucks its top under it, as a real mouth does.
 */
import type { Pt } from '../art/svg.js';
import { n } from '../art/svg.js';
import type { CharacterArt } from './types.js';
import type { Knot } from './pen.js';
import { alpha, circle, clipDef, clipped, curve, fill, line, part, taper } from './pen.js';
import { humanMouths } from './mouth.js';

const C = {
  hair: '#3e2a19',
  skin: '#b66d55',
  shade: '#a15d46',
  ear: '#ac6551',
  earShade: '#93533d',
  brow: '#4a2818',
  white: '#ecc6b5',
  iris: '#623622',
  pupil: '#2e160d',
  lash: '#3a1f14',
  moustache: '#43281a',
  suit: '#5c3a26',
  fold: '#45291a',
  shirt: '#f4ead8',
  sash: '#182248',
  shoe: '#ece2cf',
} as const;

// ─────────────────────────────────────────────────────────────── the body

/** Jacket and sleeves in one piece, from the shoulders to the hips, its front opening over the shirt. */
const JACKET: Knot[] = [
  [145.3, 146.4], [159.7, 163.6], [165.6, 173.2], [165.7, 186.2], [171.1, 219.8], [173.7, 230.9], [176.8, 250.5],
  [178.3, 255.1], [178.5, 260.6], [181.6, 272.8], [183.8, 287.1], [185.4, 290.7], [188.0, 306.0],
  [188.9, 308.6, 0.3], [189.9, 306.2], [195.2, 248.9], [197.0, 236.6], [198.4, 217.0], [200.7, 199.1],
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

/** Wide trousers, full to the knee and gathered in at each ankle, the space between the legs left open. */
const TROUSERS: Knot[] = [
  [110.1, 350.3], [106.3, 359.4], [102.3, 373.9], [98.4, 393.3], [94.5, 422.6], [90.7, 468.6], [87.3, 533.6],
  [86.9, 565.9], [90.3, 604.8], [94.6, 624.6], [98.4, 636], [102.4, 644], [106.8, 650.6], [114.1, 658.5],
  [121.8, 663.8], [123.2, 667.6, 0.4], [125.3, 667.6, 0.3], [125.6, 665.1, 0.3], [138.9, 665], [149.3, 664.6],
  [158.3, 664, 0.4], [159.4, 663], [165.4, 657.2], [169.3, 650.4], [173.6, 635.7], [174.6, 626.2], [176.6, 560],
  [178.8, 490.9], [180.1, 470.9, 0.3], [181.6, 490.9], [183.4, 550], [185.2, 607.4], [186.9, 631.2], [190.7, 646.5],
  [194.9, 655.2], [198.4, 659.3], [204.8, 664.4, 0.4], [206.6, 663.4], [211.9, 664.4], [224.1, 664.8],
  [233.4, 664.3], [240.3, 664, 0.4], [241, 661.8], [249.7, 654.3], [257.9, 642.3], [262.1, 632.5], [266, 617.4],
  [269.1, 592.4], [269.9, 578.9], [266, 496.4], [261.9, 449], [258.1, 416.2], [254.2, 391.4], [247.3, 362.5],
  [243.4, 351.2], [243, 350, 0], [110.5, 350, 0],
];

/**
 * The jacket's own folds: the seam where each sleeve meets the body, the
 * long crease down each forearm from the inside of the elbow to under the
 * hand, and the edge of each cuff.
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
  [
    [100.9, 325],
    [100.8, 329.1],
    [98.8, 332.6],
  ],
  [
    [261.2, 319.4],
    [261.4, 323.5],
    [261.8, 327.8],
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

/** Where the pştên's top edge is at his sides, and how far it and every band in it bow down at the front: a little, as cloth round a waist does. */
const SASH_TOP = 309.5;
const SASH_BOW = 2.5;

/** How far the pştên bows down at `x`: most at the front, none where it turns round his sides (a parabola, so each edge is one curve). */
const bow = (x: number): number => SASH_BOW * (1 - ((x - 180) / 64) ** 2);

/**
 * The pştên, wound round his waist from hip to hip: its top and bottom edges
 * bow down together at the front, its ends run under his hands and round his
 * sides, where they follow the line of his hips. It reaches below his hands,
 * so the whole of it shows from one side of him to the other: cloth he wears,
 * that his hands rest on, not a thing held out in front of him.
 */
function sashOutline(bottom: number): string {
  const [t, b] = [SASH_TOP, bottom];
  return (
    `M112.4,312L116,${t}Q180,${n(t + SASH_BOW * 2)} 244,${t}H244.6L241.6,341.5L241.6,348L247.3,362.5L248.4,${n(b)}` +
    `H244Q180,${n(b + SASH_BOW * 2)} 116,${n(b)}H104.2L106.3,359.4L110.3,348.4L112.4,340Z`
  );
}

/**
 * The pştên's weave, top to bottom: bands of colour, each with its own small
 * figure along it (diamonds, crosses, a zigzag, dots) as such sashes are
 * woven. The bands bow down at the front as cloth wound at the waist does,
 * so they wrap round him rather than lie flat across him.
 */
const WEAVE: readonly (readonly [number, string, ('diamond' | 'cross' | 'zigzag' | 'dots')?, string?])[] = [
  [5.5, '#24685d', 'diamond', '#b55e21'],
  [1.6, '#901b22'],
  [5.5, '#182248', 'cross', '#cbc1a7'],
  [4.6, '#b58021', 'diamond', '#901b22'],
  [1.4, '#cbc1a7'],
  [5, '#482149', 'zigzag', '#b55e21'],
  [4.6, '#2d6340', 'diamond', '#cfc9b6'],
  [1.4, '#cbc1a7'],
  [5.5, '#901b22', 'cross', '#b58021'],
  [4, '#182248', 'dots', '#cbc1a7'],
  [5, '#b55e21', 'diamond', '#182248'],
  [1.4, '#cbc1a7'],
  [5.5, '#24685d', 'cross', '#b58021'],
  [6.6, '#182248', 'diamond', '#b55e21'],
];

/** Whether a point lies inside an outline, taken as the polygon through its knots. */
function inside(knots: readonly Knot[], x: number, y: number): boolean {
  let within = false;
  for (let i = 0, j = knots.length - 1; i < knots.length; j = i++) {
    const [xi, yi] = knots[i]!;
    const [xj, yj] = knots[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) within = !within;
  }
  return within;
}

/** Whether his hands hide the whole of a small figure `r` across at a point of the weave. */
const hidden = (x: number, y: number, r: number): boolean =>
  [HAND_LEFT, HAND_RIGHT].some((hand) => [[x - r, y], [x + r, y], [x, y - r], [x, y + r]].every(([px, py]) => inside(hand, px!, py!)));

/** The weave, clipped to the pştên; its figures only where his hands leave them showing. */
function woven(): string {
  const out: string[] = [];
  let y = SASH_TOP;
  WEAVE.forEach(([h, colour, figure, ink], band) => {
    const [a, b] = [n(y), n(y + h)];
    out.push(fill(`M100,${a}H116Q180,${n(y + SASH_BOW * 2)} 244,${a}H254V${b}H244Q180,${n(y + h + SASH_BOW * 2)} 116,${b}H100Z`, colour));
    if (figure && ink) {
      const mid = y + h / 2;
      const r = n(h * 0.3);
      const along = Array.from({ length: 19 }, (_, i) => 116 + i * 7 + (band % 2) * 3.5)
        .map((x) => [x, mid + bow(x)] as const)
        .filter(([x, yy]) => !hidden(x, yy, h * 0.3))
        .map(([x, yy]) => [n(x), n(yy)] as const);
      if (figure === 'diamond') out.push(fill(along.map(([x, yy]) => `M${x},${yy}m0,-${r}l${r},${r}l-${r},${r}l-${r},-${r}Z`).join(''), ink));
      else if (figure === 'cross') out.push(line(along.map(([x, yy]) => `M${x},${yy}m-${r},0h${n(h * 0.6)}m-${r},-${r}v${n(h * 0.6)}`).join(''), ink, 0.9));
      else if (figure === 'zigzag') {
        // one line, broken where a hand lies over it
        const zig = Array.from({ length: 38 }, (_, i) => 114 + i * 3.5).map((x, i) => [x, mid + bow(x) + (i % 2 === 0 ? -h * 0.3 : h * 0.3)] as const);
        let d = '';
        let pen = false;
        for (const [x, yy] of zig) {
          if (hidden(x, yy, 0)) pen = false;
          else {
            d += `${pen ? 'L' : 'M'}${n(x)},${n(yy)}`;
            pen = true;
          }
        }
        out.push(line(d, ink, 0.9));
      } else out.push(line(along.map(([x, yy]) => `M${x},${yy}h0`).join(''), ink, 1.2));
    }
    y += h;
  });
  return out.join('');
}

/** Where his fingers press into the pştên, the cloth gathers: short creases running out from under each hand towards the middle. */
const GATHERS: readonly (readonly Pt[])[] = [
  [[154, 330.5], [163, 332], [173, 332.8]],
  [[155, 341.5], [164, 342.8], [174, 343.4]],
  [[205, 329], [196, 330.6], [187, 331.4]],
  [[208, 339.5], [199, 341], [190, 341.7]],
];

/**
 * The pştên's shade, kept inside it: a little along its bottom edge, where
 * the wound cloth turns under round him, and the creases his fingers make in
 * it. It is what makes it cloth worn at the waist, not a flat band.
 */
function sashShade(bottom: number): string {
  const strip = (from: number, to: number): string =>
    `M100,${n(from)}H116Q180,${n(from + SASH_BOW * 2)} 244,${n(from)}H254V${n(to)}H244Q180,${n(to + SASH_BOW * 2)} 116,${n(to)}H100Z`;
  return (
    fill(strip(bottom - 3.2, bottom), '#000', alpha(0.24)) +
    fill(GATHERS.map((s) => taper(s, [0.6, 1.6, 0.2])).join(''), '#000', alpha(0.38))
  );
}

/** His left hand (on the viewer's left), the fingers lying forward over the sash. */
const HAND_LEFT: Knot[] = [
  [108.8, 313.2], [114, 309.6], [120.4, 307], [128, 306.6], [136.1, 307.5], [143, 310.2], [149.4, 311.7],
  [151.6, 314.6, 0.4], [148.6, 317.3], [141, 317.7], [136.4, 318.4, 0.4], [136.6, 321.8], [140.7, 326.0],
  [157.8, 338], [159.3, 339.6], [159.5, 341.6], [158.4, 343.2], [156.9, 343.9, 0.3], [158.3, 345.2], [159.2, 347.4],
  [158.6, 349.8], [157, 351], [155.6, 351.5, 0.3], [151.0, 351.4, 0.4], [149.8, 354.7], [148.6, 355.4], [145.1, 355.3],
  [139.6, 353.5], [136.4, 355.7], [129.6, 353.8], [128.0, 351.9], [126.0, 351.1], [121.8, 346.6], [116.4, 342.7],
  [113.9, 342.0], [112.7, 342.9, 0.15], [112.6, 338.5], [108.9, 334.2], [107.2, 334.0], [101.0, 336.3],
  [99.1, 336.0, 0.4], [99.5, 335.1], [103.0, 333.1], [104.1, 329.3], [102.2, 322.1], [105.3, 319.2], [106.8, 315.4],
];

const HAND_RIGHT: Knot[] = [
  [247.1, 304.5], [254.6, 308.7], [258.4, 314.7], [258.6, 321], [259.6, 326.2], [263.4, 329.2], [265.2, 330.6, 0.4], [261, 331.3], [256.4, 329.6], [254, 328.6], [252.7, 328.9],
  [246.5, 336.4], [241.6, 340.8], [241.4, 343.9, 0.4], [239.2, 343.1], [228.7, 348.9], [225.6, 349], [222.9, 346.7],
  [216.3, 349.6], [213.5, 348.1], [212.9, 346, 0.4], [209, 345.6], [206.4, 344.4], [205.8, 342.4], [207, 340.6],
  [208.3, 339.4, 0.4], [204.7, 336.6], [204.9, 333.8], [211.7, 327.8], [220.8, 321.6], [224.2, 318.1], [226.6, 314.4, 0.4], [225.5, 313.2], [217.4, 313.3],
  [212.2, 311.4], [211.4, 309.7], [212.7, 307.1], [218, 305.2], [226, 303.8], [232, 302.8], [236, 301.4], [238.4, 300.6], [240.2, 302.4], [243, 303.8],
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
  const bottom = SASH_TOP + WEAVE.reduce((deep, [h]) => deep + h, 0);
  const sash = sashOutline(bottom);
  return part(
    [
      clipDef(id('sash'), sash),
    ],
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
      clipped(id('sash'), woven() + sashShade(bottom)),
      // the hands lie over the pştên in the skin of his face, the fingers forward and the thumbs back
      fill(curve(HAND_LEFT) + curve(HAND_RIGHT), C.skin),
      fill(CREASES.map((s) => taper(s, [0.2, 0.8, 0.25])).join(''), C.shade),
    ],
  );
}

// ─────────────────────────────────────────────────────────────── the head

/** His hair: full on top, a little wavy along the hairline, down to a short sideburn in front of his ear. */
const HAIR: Knot[] = [
  [176.6, 50.0], [186.1, 50.0], [200.6, 53.3], [205.3, 55.8], [210.9, 57.9], [215.0, 61.6], [216.6, 64.3],
  [217.5, 67.6], [218.1, 73.6], [219.7, 79.9], [219.8, 84], [219.6, 87], [219.1, 90], [218.5, 92], [217.9, 94],
  [217.3, 95.3, 0.2], [216.4, 94], [216, 92], [215.6, 90], [215, 87.5], [214.4, 84.5], [213.6, 82], [212.6, 79.2], [210.9, 76.9], [208.9, 75.7], [206.9, 76.0], [202.6, 78.4],
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
  [164.4, 101.2, 0.4], [165.4, 99.4], [167.4, 98.1], [170.4, 97.5], [173.4, 97.2], [176.4, 97.3], [179.4, 97.5],
  [182.4, 98], [185.2, 98.6], [187.6, 100.4, 0.4], [186.8, 102.2], [184.8, 102.7], [182, 102.1], [179, 101.5],
  [176, 101.2], [173, 101.2], [170, 101.4], [167, 101.8],
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

/** Smiling eyes: shut, the lash line along where the upper lid was, curved up, the way eyes close when someone beams. */
function eyesHappy(): string {
  const arc = (eye: readonly Knot[], weight: number): string =>
    taper(
      [eye[0], eye[1], eye[2], eye[3], eye[4]].map((k) => [(k as Knot)[0], (k as Knot)[1] + 1.8] as Pt),
      [0.4 * weight, 1.2 * weight, 1.5 * weight, 1.2 * weight, 0.4 * weight],
    );
  return part([], [fill(arc(EYE_LEFT, 1) + arc(EYE_RIGHT, 0.95), C.lash)]);
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
    // head to hips: his hands on his sash, and the top of his trousers
    half: { x: 34, y: 42, w: 278, h: 360 },
    headPivot: { x: 181, y: 160 },
    body: body(p),
    head: head(),
    eyes: { open: eyesOpen(p), closed: eyesClosed(), happy: eyesHappy() },
    mouths: humanMouths(
      {
        open: { left: [184.4, 139], right: [201.3, 139.2], top: 138.2, bottom: 142.9 },
        upperLip: 1,
        lowerLip: 2.4,
        sideLip: 2,
        middle: 0.53,
        colours: { lip: '#94594a', line: '#5a2a1e', inside: '#4a1a12', teeth: '#f3d8cc', tongue: '#c0695c' },
      },
      p,
    ),
    overlay: fill(curve(MOUSTACHE), C.moustache),
  };
}
