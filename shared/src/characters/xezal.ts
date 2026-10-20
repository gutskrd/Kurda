/**
 * Xezal: a young woman in a long burgundy Kurdish dress with wide hanging
 * sleeves, a gold coin necklace and a broad gold belt hung with coins, her
 * long black hair falling past her waist, her hands resting one by the other
 * in front of her.
 *
 * Drawn flat, in a few tones per colour and the odd soft gradient, with no
 * outlines: shapes meet edge to edge, as the rest of the app's art does.
 *
 * Her hair is in three parts so the head can nod without the long hair
 * swinging with it: the crown and the hair framing her face belong to the
 * head; the hair behind her shoulders and the two locks over her chest belong
 * to the body, and the head's hair overlaps both by enough that a small turn
 * never opens a gap.
 */
import type { Pt } from '../art/svg.js';
import { linearBox, n, radialBox } from '../art/svg.js';
import type { CharacterArt } from './types.js';
import type { Knot } from './pen.js';
import { alpha, beadsAlong, circle, clipDef, clipped, curve, ellipse, fill, line, mirror, oval, part, symmetric, taper } from './pen.js';
import { humanMouths } from './mouth.js';

const C = {
  hair: '#0e0c0d',
  sheen: '#34333a',
  skin: '#b97c60',
  skinLight: '#c2876a',
  skinShade: '#9c5c46',
  skinDeep: '#7c4433',
  blush: '#b9524c',
  white: '#f7eee8',
  iris: '#83563b',
  irisDeep: '#3e2318',
  lash: '#24140f',
  brow: '#5a3020',
  dress: '#550409',
  dressLight: '#5c060c',
  dressShade: '#430308',
  dressDeep: '#320206',
  shoe: '#45030a',
  gold: '#b4881f',
  goldLight: '#d8b04a',
  goldHi: '#f0d68a',
  goldShade: '#8a5d0c',
  goldDeep: '#5f3d05',
} as const;

/** Her face is drawn about this upright line. */
const AXIS = 143.5;

// ─────────────────────────────────────────────────────────────── the body

/** The hair that falls behind her shoulders: longer on her left, as it fell. */
const BACK_HAIR: Knot[] = [
  [143.5, 160],
  [104, 168],
  [90, 182],
  [84.5, 199],
  [77.5, 216],
  [70.5, 236],
  [62, 264],
  [53.5, 294],
  [46.5, 320],
  [42.6, 341],
  [43.5, 359],
  [48.5, 370.5],
  [57, 378, 0.8],
  [100, 385, 0],
  [200, 402, 0],
  [222, 399.5, 0.8],
  [233.5, 390],
  [243.5, 375.5],
  [250.2, 359],
  [252.2, 341],
  [249, 321],
  [242.5, 298],
  [234.5, 274],
  [225.5, 250],
  [216.5, 229],
  [208.5, 210],
  [202.5, 190],
  [195, 172],
  [183, 162],
];

/** The dress, neckline to hem; the V at the front is cut into it. */
const DRESS: Knot[] = [
  [117.5, 230.5, 0],
  [106, 232],
  [93, 235.5],
  [83.5, 241],
  [76.5, 250],
  [70.5, 265],
  [65, 284],
  [60, 306],
  [56.3, 327],
  [54.2, 346],
  [54.5, 364],
  [56, 382],
  [57.8, 402],
  [59, 445],
  [59.2, 505],
  [57.8, 560],
  [54, 590],
  [49, 626],
  [44, 670],
  [40, 706],
  [36.8, 731],
  [37.5, 741.5, 0.6],
  [43.5, 745.8, 0],
  [244.5, 745.8, 0],
  [250.3, 741.5, 0.6],
  [250.4, 731],
  [248, 700],
  [244, 650],
  [239.8, 600],
  [235, 556],
  [230.5, 520],
  [227, 482],
  [224.8, 446],
  [222.6, 412],
  [223, 396],
  [227.5, 380],
  [233, 365],
  [235.8, 348],
  [234.6, 328],
  [230.8, 307],
  [225.5, 285],
  [219, 263],
  [211.5, 247.5],
  [202, 238.5],
  [189, 233.5],
  [176, 231],
  [169.5, 230.5, 0],
  [143.5, 276, 0],
];

/** Her left sleeve hangs in shadow down her side, and the dress beneath it stays dark to the hem. */
const LEFT_SHADE: Knot[] = [
  [72, 425],
  [84, 404],
  [100, 398],
  [114.5, 404],
  [114, 440],
  [110.5, 480],
  [106, 540],
  [100, 600],
  [95, 650],
  [90, 700],
  [86.5, 745.8, 0],
  [43.5, 745.8, 0],
  [37.5, 741.5, 0.6],
  [36.8, 731],
  [40, 706],
  [44, 670],
  [49, 626],
  [54, 592],
  [58.6, 562],
  [62.6, 530],
  [63.6, 495],
  [64.4, 462],
  [66.6, 440],
];

/**
 * Her right sleeve catches the light; the dress in its shadow, and the dress
 * below where it ends, are dark.
 */
const RIGHT_SHADE: Knot[] = [
  [163.5, 423],
  [166.5, 442],
  [172, 490],
  [178, 530],
  [183.5, 570],
  [185.5, 600],
  [186.5, 650],
  [187.5, 700],
  [190, 745.8, 0],
  [244.5, 745.8, 0],
  [250.3, 741.5, 0.6],
  [250.4, 731],
  [248, 700],
  [244, 650],
  [240.6, 610],
  [236, 585],
  [228, 591],
  [219.5, 595, 0],
  [211.5, 583],
  [202, 566],
  [197, 546],
  [190, 521],
  [181.5, 496],
  [176, 471],
  [170.5, 443],
  [167.5, 423],
];

/** The lock of hair over her left shoulder (the viewer's left), ending behind the belt. */
const LOCK_LEFT: Knot[] = [
  [84, 226],
  [111.5, 226, 0.5],
  [111.5, 300],
  [111, 345],
  [105, 362],
  [96, 371],
  [90.5, 372.5],
  [87, 362],
  [85.5, 345],
  [80.5, 330],
  [77.5, 310],
  [79.2, 285],
  [82.5, 258],
  [83.3, 240],
];

const LOCK_RIGHT: Knot[] = [
  [175, 226, 0.5],
  [202, 226],
  [203.3, 245],
  [205, 270],
  [207.3, 296],
  [207.2, 318],
  [204, 336],
  [199.5, 352],
  [190, 358],
  [178, 356],
  [175.2, 340],
  [175.2, 280],
];

/** Light along single strands: tapered so each fades in and out like a highlight on hair. */
const STRANDS_BODY: readonly (readonly Pt[])[] = [
  [
    [97, 238],
    [93.5, 270],
    [89, 300],
    [86.5, 326],
  ],
  [
    [90.5, 244],
    [86, 270],
    [81.8, 298],
  ],
  [
    [102, 242],
    [100, 280],
    [96.5, 315],
    [94.5, 336],
  ],
  [
    [193.5, 238],
    [197, 270],
    [200.5, 300],
    [202, 320],
  ],
  [
    [186, 240],
    [188, 280],
    [190, 334],
  ],
  [
    [199, 244],
    [203, 268],
    [205, 292],
  ],
];
const STRANDS_HEAD: readonly (readonly Pt[])[] = [
  [
    [98.5, 178],
    [96, 204],
    [94, 228],
  ],
  [
    [106.5, 188],
    [105, 210],
    [103.5, 228],
  ],
  [
    [188.5, 172],
    [191.5, 200],
    [193.5, 228],
  ],
  [
    [181.5, 188],
    [183, 210],
    [184, 228],
  ],
];

/** Light along single strands of hair: fine lines, round at the ends. */
function strands(list: readonly (readonly Pt[])[]): string {
  return line(list.map((s) => curve(s.map(([x, y]) => [x, y] as const), false)).join(''), C.sheen, 1.2, ' stroke-opacity="0.8"');
}

/** A gold coin: a bright rim round a struck face, and a small boss in the middle. */
function coins(list: readonly (readonly [number, number, number])[]): string {
  const rim = list.map(([x, y, r]) => oval(x, y, r)).join('');
  const face = list.map(([x, y, r]) => oval(x, y + r * 0.04, r * 0.74)).join('');
  const boss = list.map(([x, y, r]) => oval(x - r * 0.12, y - r * 0.1, r * 0.3)).join('');
  // the lower half of the rim, turned from the light
  const shade = list.map(([x, y, r]) => `M${n(x - r)},${n(y)}a${n(r)},${n(r)} 0 0 0 ${n(2 * r)},0a${n(r)},${n(r * 0.86)} 0 0 1 ${n(-2 * r)},0z`).join('');
  return (
    fill(rim, C.goldLight) +
    fill(shade, C.goldShade, alpha(0.55)) +
    fill(face, C.gold) +
    fill(boss, C.goldLight, alpha(0.7))
  );
}

function necklace(): string {
  // the two strings of beads from behind her neck down to the first coins
  const strings = curve([[120.2, 227.6], [119.2, 249], [122.4, 270.4]], false) + curve([[166.8, 227.6], [167.8, 249], [164.6, 270.4]], false);
  const links: Pt[] = [
    [125.6, 285.4],
    [161.2, 285.4],
    [135.6, 298.6],
    [151, 298.6],
    [143.3, 296.6],
  ];
  return (
    beadsAlong(strings, C.goldShade, 3.4, 3.4) +
    beadsAlong(strings, C.goldLight, 2.6, 3.4) +
    fill(links.map(([x, y]) => oval(x, y, 1.5)).join(''), C.goldLight) +
    coins([
      [121.9, 277.2, 6.6],
      [164.8, 277.2, 6.6],
      [129.5, 292.4, 6.4],
      [157.2, 292.4, 6.4],
      [143.3, 306.6, 8.8],
    ])
  );
}

/** The belt: a tall middle boss between two engraved plates, with wings flaring out and up at either end. */
function belt(panel: string): string {
  // drawn a little inside their edges: the rim's stroke brings them out to full size
  const wingL: Knot[] = [
    [97.6, 347.8, 0.3],
    [112.6, 352.6, 0],
    [112.6, 368.4, 0],
    [101.8, 366.2, 0.3],
    [99.6, 358],
  ];
  const plateL: Knot[] = [
    [113, 342.2, 0.4],
    [116.4, 339.8],
    [123.5, 340.6],
    [130, 339.6],
    [136, 338, 0],
    [136, 370.8, 0],
    [128.5, 372.2],
    [120, 370.6],
    [113.4, 371.4, 0.4],
  ];
  const boss: Knot[] = symmetric(
    [
      [144, 333.6],
      [139.2, 335.2],
      [136.4, 340.6],
      [135.6, 354],
      [136.6, 367],
      [139.8, 372],
      [144, 374.2],
    ],
    144,
  );
  const pendants: [number, number, number][] = [
    [101.6, 380, 6.3],
    [114.6, 386.2, 6.3],
    [128.6, 392.6, 6.3],
    [143, 398.6, 6.3],
  ];
  const chain = (x: number, y: number): string => `M${n(x)},${n(y + 2.4)}v3.1`;
  const plates = curve(plateL) + curve(mirror(plateL, 144)) + curve(wingL) + curve(mirror(wingL, 144));
  const piece = (d: string): string => `<path d="${d}" fill="url(#${panel})" stroke="${C.goldLight}" stroke-width="2.6" stroke-linejoin="round"/>`;
  const rings = oval(124.8, 355.4, 6.4, 7.6) + oval(163.2, 355.4, 6.4, 7.6) + oval(144, 354.6, 4.8, 12.6);
  return (
    // the shade the belt throws on the dress
    fill(curve([[112, 360], [144, 356], [176, 360], [172, 376], [144, 381], [116, 376]]), C.dressDeep, alpha(0.4)) +
    // each coin hangs from two beads
    beadsAlong(chain(101.6, 368) + chain(114.6, 374) + chain(128.6, 380.4) + chain(143, 386.2) + chain(158.6, 374.2), C.goldLight, 3, 3.1) +
    coins(pendants) +
    // the last pendant hangs on a hook, half hidden by her hand
    line(curve([[158.6, 378], [161.8, 382], [158.2, 387.6], [154, 392]], false), C.goldLight, 2.3) +
    // each piece a sunken, engraved panel inside a raised rim of bright gold
    piece(plates) +
    piece(curve(boss)) +
    fill(rings, C.goldLight) +
    fill(oval(124.8, 355.4, 4.6, 5.6) + oval(163.2, 355.4, 4.6, 5.6) + oval(144, 354.6, 3.1, 10.4), C.gold) +
    fill(oval(124.8, 355.4, 2.2, 2.6) + oval(163.2, 355.4, 2.2, 2.6) + oval(144, 348.2, 1.7, 3.2) + oval(144, 361, 1.7, 3.2), C.goldShade) +
    // beading down either side of the boss, and a stud in each wing
    beadsAlong('M138.9,338.5V372M149.1,338.5V372', C.goldHi, 1.5, 2.75) +
    fill(oval(105.4, 358, 1.5) + oval(182.6, 358, 1.5) + oval(144, 337.8, 1.2), C.goldHi) +
    // light along the top edge of each piece
    line(curve([[113, 340.2], [123.5, 340], [134.4, 338.4]], false) + curve([[153.6, 338.4], [164.5, 340], [175, 340.2]], false), C.goldHi, 0.9) +
    line(curve([[137, 338.6], [144, 333.2], [151, 338.6]], false) + curve([[97.6, 347.6], [112, 352.4]], false) + curve([[190.4, 347.6], [176, 352.4]], false), C.goldHi, 0.8)
  );
}

const HAND_LEFT: Knot[] = [
  [71.2, 402.7],
  [75.7, 398.2],
  [82, 396.4],
  [87.5, 397.7],
  [92, 401],
  [95.7, 406.4],
  [99, 412.7],
  [101.2, 420],
  [101.6, 425.6, 0.6],
  [99.4, 427.3],
  [95.7, 425.5],
  [92, 421],
  [89.8, 415.5],
  [89.4, 412.3, 0],
  [88.9, 416.4],
  [90.3, 421.8],
  [94, 428.2],
  [98.5, 433.6],
  [101.2, 438.2],
  [102.1, 440.5, 0.6],
  [100.4, 441.9],
  [100.3, 444.5],
  [98.9, 446.4, 0.6],
  [94, 445.6],
  [88.5, 444.6],
  [83, 442.7],
  [77.5, 440],
  [73, 435.5],
  [70.3, 429],
  [68.5, 420],
  [67.4, 411.8],
  [68, 406.4],
];

/** Her other hand, open, the fingers pointing down and in: each finger is its own tongue of the outline. */
const HAND_RIGHT: Knot[] = [
  [138.4, 393.6],
  [143.6, 389.8],
  [151, 389.6],
  [158, 391.4],
  [164.2, 395],
  [167.4, 400.6],
  [167.5, 407.8],
  [165.4, 415],
  [161, 422.6],
  [156.4, 428.4],
  [152.6, 433],
  [149.8, 436.4],
  [147.6, 437.8, 0.6],
  [145.8, 436.8],
  [146.6, 433.4],
  [149.6, 428.4],
  [153, 423.4, 0],
  [148.6, 428.6],
  [145, 433.6],
  [142.4, 437.6],
  [139.8, 439.8],
  [137, 440.2, 0.6],
  [135.2, 439.4],
  [135.6, 436.8],
  [138.6, 431],
  [142, 425],
  [145.4, 418.8, 0],
  [141.4, 424.6],
  [137.2, 430.6],
  [133.6, 436],
  [131.6, 438.8],
  [129.2, 439.6, 0.6],
  [127.4, 438.2],
  [128, 434.8],
  [131.6, 428.6],
  [135.6, 422.6],
  [139.2, 417.8, 0],
  [134.6, 422.4],
  [130.4, 426.8],
  [126.6, 430.4],
  [124.4, 432, 0.6],
  [123.6, 430],
  [125.6, 426],
  [129, 420.4],
  [132.4, 415.4],
  [134.4, 412.6, 0],
  [130.4, 413.2],
  [127, 413],
  [125.2, 411.4, 0.6],
  [126.6, 409],
  [130.2, 406.6],
  [134, 403.4],
  [136.8, 399.4],
];

function hands(skin: string): string {
  return (
    fill(curve(HAND_LEFT) + curve(HAND_RIGHT), `url(#${skin})`) +
    // her curled fingers, one behind another
    line(
      curve([[76.6, 429], [82.4, 435.6], [88.5, 441]], false) + curve([[81, 426.4], [87.6, 433.2], [94, 439]], false) + curve([[85.6, 433], [91.6, 438.6], [97.5, 442.6]], false),
      C.skinShade,
      0.7,
      ' stroke-opacity="0.55"',
    )
  );
}

function shoes(): string {
  const left: Knot[] = [
    [93.5, 744, 0],
    [86.5, 748.2],
    [77, 753.2],
    [70.2, 757.2],
    [68, 760.8],
    [71.4, 763.8],
    [85, 765.2],
    [100.5, 765.4],
    [107.6, 762.8],
    [110.8, 760.8, 0.4],
    [112.4, 766.6, 0.3],
    [116.2, 768],
    [119.6, 767, 0.3],
    [120.6, 757],
    [121.6, 744, 0],
  ];
  const right: Knot[] = [
    [173.2, 744, 0],
    [171.6, 755],
    [172.6, 763.4],
    [178.2, 767.6],
    [192, 768.2],
    [199.6, 765.2],
    [200.6, 759],
    [197.8, 752],
    [193.4, 744, 0],
  ];
  return fill(curve(left) + curve(right), C.shoe) + line(curve([[73, 758.5], [84, 755.5], [92, 750.5]], false) + curve([[177, 751], [182, 759], [190.5, 762]], false), C.dressLight, 1.1, ' stroke-opacity="0.8"');
}

function body(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const NECK: Knot[] = [
    [125.2, 196],
    [124.9, 215],
    [124, 223.5],
    [120.5, 228.4],
    [115, 232],
    [143.5, 282, 0],
    [172, 232],
    [166.5, 228.4],
    [163, 223.5],
    [162.1, 215],
    [161.8, 196],
  ];
  return part(
    [
      linearBox(id('dress'), [
        [0, C.dressShade],
        [0.2, C.dress],
        [0.5, C.dressLight],
        [0.86, C.dress],
        [1, C.dressShade],
      ], 0, 0, 1, 0),
      linearBox(id('neck'), [
        [0, C.skinDeep],
        [0.4, C.skinShade],
        [1, C.skin],
      ]),
      linearBox(id('lshade'), [
        [0, C.dressDeep, 0.75],
        [0.78, C.dressShade, 0.9],
        [1, C.dressShade, 0.35],
      ], 0, 0, 1, 0),
      linearBox(id('rshade'), [
        [0, C.dressShade, 0.5],
        [0.2, C.dressShade, 0.95],
        [1, C.dressDeep, 0.8],
      ], 0, 0, 1, 0),
      linearBox(id('panel'), [
        [0, C.goldShade],
        [0.55, C.gold],
        [1, C.goldShade],
      ]),
      linearBox(id('hand'), [
        [0, C.skin],
        [1, C.skinLight],
      ], 0, 0, 0.4, 1),
    ],
    [
      fill(curve(BACK_HAIR), C.hair),
      shoes(),
      fill(curve(NECK), `url(#${id('neck')})`),
      fill(curve(DRESS), `url(#${id('dress')})`),
      fill(curve(LEFT_SHADE), `url(#${id('lshade')})`),
      fill(curve(RIGHT_SHADE), `url(#${id('rshade')})`),
      necklace(),
      fill(curve(LOCK_LEFT) + curve(LOCK_RIGHT), C.hair),
      strands(STRANDS_BODY),
      belt(id('panel')),
      hands(id('hand')),
    ],
  );
}

// ─────────────────────────────────────────────────────────────── the head

/** The crown and the hair down either side of her face, to her shoulders. */
const HAIR_CAP: Knot[] = [
  [143.5, 106.4],
  [127.4, 109.2],
  [114.6, 115.6],
  [104.6, 124.6],
  [97.6, 136.4],
  [93.6, 150],
  [92, 164],
  [89.6, 180],
  [85.6, 196],
  [80.2, 212],
  [74.8, 226],
  [71.2, 234.5, 0.5],
  [90, 236.6],
  [111.6, 234.5, 0.5],
  [118, 229.2],
  [123.8, 222.5],
  [124.2, 208],
  [143.5, 200],
  [163, 208],
  [163.4, 222.5],
  [169.6, 229.2],
  [175.6, 234.5, 0.5],
  [197, 236.6],
  [216.6, 234.5, 0.5],
  [213.4, 226],
  [208.6, 212],
  [203.6, 196],
  [200, 180],
  [196.8, 164],
  [195, 150],
  [190.4, 136.4],
  [182.4, 124.6],
  [172.4, 115.6],
  [159.6, 109.2],
];

const FACE: Knot[] = symmetric(
  [
    [AXIS, 128],
    [124, 131.5],
    [113.2, 144],
    [112, 160],
    [112.2, 182],
    [112.7, 195, 0.7],
    [117.4, 205.2],
    [125.2, 213.4],
    [134, 218.2],
    [AXIS, 219.6],
  ],
  AXIS,
);

/** The hair over her forehead, parted in the middle and swept to either side. */
const FRINGE: Knot[] = [
  [107, 170],
  [112, 160.4],
  [116, 154.6],
  [122.6, 149],
  [130.4, 143.4],
  [137, 138.8],
  [141.4, 135.2],
  [143.5, 132.8, 0],
  [145.6, 135.2],
  [150, 138.8],
  [156.6, 143.4],
  [164.4, 149],
  [171, 154.6],
  [175, 160.4],
  [180, 170],
  [189, 140],
  [172, 112],
  [143.5, 103],
  [115, 112],
  [98, 140],
];

function head(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const brow = taper(
    [
      [116.4, 166.4],
      [120.8, 163],
      [126.6, 161.6],
      [132.4, 162.4],
      [136.6, 164.6],
    ],
    [0, 1.4, 1.8, 1.9, 1.3],
  );
  const browR = taper(
    [
      [170.6, 166.4],
      [166.2, 163],
      [160.4, 161.6],
      [154.6, 162.4],
      [150.4, 164.6],
    ],
    [0, 1.4, 1.8, 1.9, 1.3],
  );
  return part(
    [
      radialBox(id('face'), [
        [0, C.skinLight],
        [0.55, C.skin],
        [1, C.skinShade],
      ], 0.5, 0.42, 0.62),
      radialBox(id('blush'), [
        [0, C.blush, 0.4],
        [0.5, C.blush, 0.24],
        [1, C.blush, 0],
      ]),
    ],
    [
      fill(curve(HAIR_CAP), C.hair),
      strands(STRANDS_HEAD),
      fill(curve(FACE), `url(#${id('face')})`),
      ellipse(122, 188.6, 10, 7, `url(#${id('blush')})`),
      ellipse(165, 188.6, 10, 7, `url(#${id('blush')})`),
      // the nose: a shadow down one side, a lit tip and the soft line beneath it
      fill(taper([[138.4, 180], [138.9, 184.6], [139.6, 188.6], [140.8, 191]], [0, 1.3, 1.5, 0.6]), C.skinShade, alpha(0.45)),
      ellipse(143, 190, 2.2, 1.4, C.skinLight, alpha(0.6)),
      line(curve([[139.6, 192.2], [142.8, 193.5], [146.4, 192.4]], false), C.skinDeep, 0.9, ' stroke-opacity="0.45"'),
      fill(brow + browR, C.brow),
      fill(curve(FRINGE), C.hair),
    ],
  );
}

// ─────────────────────────────────────────────────────────────── the eyes

const EYE: Knot[] = [
  [117.4, 175.8, 0.2],
  [121.4, 171.8],
  [127.2, 170.4],
  [132.8, 171.8],
  [136.6, 175.8, 0.2],
  [132.4, 179.4],
  [127.2, 180.4],
  [121.6, 179.2],
];
/** Her eyes sit a touch either side of the face's middle, as drawn. */
const EYE_AXIS = 143.2;

function eyesOpen(p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const right = mirror(EYE, EYE_AXIS);
  const iris = (cx: number): string =>
    circle(cx, 175.6, 4.9, `url(#${id('iris')})`) + circle(cx, 175.6, 2.2, C.irisDeep) + circle(cx + 1.5, 173.8, 1.25, C.white);
  const lid = (flip: boolean): string => {
    const f = (pts: Pt[]): Pt[] => (flip ? pts.map(([x, y]) => [2 * EYE_AXIS - x, y] as Pt) : pts);
    return (
      taper(f([[117.2, 175.4], [121.4, 171.4], [127.2, 170], [132.8, 171.4], [136.7, 175.6]]), [1.3, 1.7, 1.6, 1.1, 0.3]) +
      taper(f([[118.2, 174], [116.4, 172.8], [115, 172]]), [1.2, 0.7, 0])
    );
  };
  const lower = (flip: boolean): string => {
    const xs: Pt[] = [[119.6, 178.6], [127.2, 180.7], [134.6, 178.8]];
    return curve((flip ? xs.map(([x, y]) => [2 * EYE_AXIS - x, y] as const) : xs) as Knot[], false);
  };
  return part(
    [
      radialBox(id('iris'), [
        [0, '#b07c52'],
        [0.6, C.iris],
        [1, C.irisDeep],
      ], 0.5, 0.62, 0.6),
      clipDef(id('eyeL'), curve(EYE)),
      clipDef(id('eyeR'), curve(right)),
    ],
    [
      fill(curve(EYE) + curve(right), C.white),
      clipped(id('eyeL'), iris(127.4)),
      clipped(id('eyeR'), iris(159)),
      line(lower(false) + lower(true), C.lash, 0.6, ' stroke-opacity="0.35"'),
      fill(lid(false) + lid(true), C.lash),
    ],
  );
}

function eyesClosed(): string {
  const lash = (flip: boolean): string => {
    const f = (pts: Pt[]): Pt[] => (flip ? pts.map(([x, y]) => [2 * EYE_AXIS - x, y] as Pt) : pts);
    return (
      taper(f([[117.4, 175.6], [122, 178.2], [127.2, 179.1], [132.4, 178.2], [136.5, 175.8]]), [1.1, 1.6, 1.7, 1.3, 0.3]) +
      taper(f([[118.4, 176.2], [116.4, 175.4], [115, 174.6]]), [1.1, 0.7, 0])
    );
  };
  const crease = (flip: boolean): string => {
    const xs: Pt[] = [[119.6, 171.6], [127.2, 169.6], [134.6, 171.6]];
    return curve((flip ? xs.map(([x, y]) => [2 * EYE_AXIS - x, y] as const) : xs) as Knot[], false);
  };
  return part([], [line(crease(false) + crease(true), C.skinShade, 0.7, ' stroke-opacity="0.6"'), fill(lash(false) + lash(true), C.lash)]);
}

// ─────────────────────────────────────────────────────────────── together

export function drawXezal(p: string): CharacterArt {
  return {
    id: 'xezal',
    name: 'Xezal',
    viewBox: { x: 26, y: 98, w: 236, h: 678 },
    bust: { x: 78, y: 101, w: 131, h: 131 },
    headPivot: { x: AXIS, y: 216 },
    body: body(p),
    head: head(p),
    eyes: { open: eyesOpen(p), closed: eyesClosed() },
    mouths: humanMouths(
      {
        cx: 143.4,
        cy: 201.4,
        w: 8.3,
        upperLip: 0.13,
        lowerLip: 0.32,
        smile: 0.18,
        lip: '#a85b55',
        upperLipColour: '#9a524d',
        line: '#5a2623',
        inside: '#4a1513',
        teeth: '#fbf3ee',
        tongue: '#c76a66',
      },
      p,
    ),
    overlay: '',
  };
}
