/**
 * A hand holding a phone upright, its screen toward us, for the front page's panel about the phone apps, traced from the
 * owner's reference: the palm behind the phone's lower half, the thumb resting up along its right edge, the four
 * fingers wrapped round its left edge so only their pads show, and the wrist leaving at the lower right in the red knit
 * sleeve (hand-paint.ts). Two layers on one frame: `back` (the hand, the sleeve and the phone, its screen dark) and
 * `front` (the finger pads over the bezel and the camera island), so an app can lay something live on the screen
 * (`HAND_PHONE_SCREEN`) between them; nothing of the hand crosses the glass.
 */
import { Drawing, n, prefixFor, type Pt } from './svg.js';
import { SKIN, flat, knitSleeve, smooth } from './hand-paint.js';

/** The panel's frame in drawing units, square. */
export const HAND_PHONE_VIEW = { w: 320, h: 320 } as const;

/** The phone: its centre, its lean (degrees, negative to the left), its size and its corners' radius. */
const PHONE = { cx: 136, cy: 112, turn: -2, w: 92, h: 188, r: 15 } as const;
/** The black bezel round the glass. */
const BEZEL = 3.6;

/**
 * Where the screen is, in the panel's units: a box `w` by `h` with corners of radius `r`, centred on (`cx`, `cy`) and
 * turned `turn` degrees about its centre, is exactly the glass.
 */
export const HAND_PHONE_SCREEN = {
  cx: PHONE.cx,
  cy: PHONE.cy,
  w: PHONE.w - BEZEL * 2,
  h: PHONE.h - BEZEL * 2,
  r: PHONE.r - BEZEL,
  turn: PHONE.turn,
} as const;

/** The phone's black, the light along its metal edge, the dark glass, and the island and buttons. */
const INK = { body: '#101517', edge: '#47535a', glass: '#0b1013', island: '#030506', button: '#20282c' } as const;

/** Where the light falls from, in the phone's own frame: the upper left. */
const LIGHT: Pt = [-0.6, -0.8];

/** The hand is traced in the reference's own pixels, where the phone spans 315 to 612 across and 95 to 700 down. */
const REF = { cx: 463.5, cy: 397.5, k: PHONE.h / 605 } as const;
const at = (x: number, y: number): Pt => [(x - REF.cx) * REF.k, (y - REF.cy) * REF.k];
const traced = (points: readonly Pt[]): string => smooth(points.map(([x, y]) => at(x, y)));

/** A rounded rectangle centred on (`x`, `y`). */
const box = (x: number, y: number, w: number, h: number, r: number, fill: string): string =>
  `<rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" fill="${fill}"/>`;

/** The middle, ring and little fingers' pads, each just over the bezel's outer edge and never reaching the glass. */
const PADS: readonly (readonly Pt[])[] = [
  [[248, 392], [256, 366], [279, 357], [305, 358], [319, 372], [320, 404], [316, 432], [296, 445], [268, 445], [251, 428]],
  [[246, 500], [253, 471], [276, 458], [303, 457], [317, 469], [318, 505], [313, 535], [294, 550], [266, 549], [249, 530]],
  [[258, 601], [264, 573], [283, 561], [305, 561], [318, 574], [319, 605], [314, 632], [297, 647], [276, 647], [261, 627]],
];

/**
 * The hand behind the phone: the palm and the thumb resting up its right edge in one piece, with the wrist and arm
 * running on under the sleeve; the web between the thumb and the phone a shade step down, the palm behind; the index
 * finger tucked behind the phone's edge; and, a shade step down, each lower finger's side above its pad.
 */
function hand(): string {
  // The palm and thumb in one piece, the thumb its own digit: up the phone's right edge it touches the phone only near
  // its tip, then parts from it, the background showing between, down to the web where it joins the palm.
  const palm = traced([
    [636, 238],
    [652, 241],
    [664, 255],
    [676, 283],
    [697, 321],
    [716, 357],
    [732, 397],
    [750, 446],
    [763, 481],
    [769, 512],
    [770, 565],
    [770, 640],
    [772, 702],
    [785, 731],
    [820, 771],
    [860, 830],
    [900, 900],
    [960, 1010],
    [1010, 1110],
    [700, 1110],
    [640, 975],
    [615, 900],
    [596, 856],
    [577, 818],
    [550, 787],
    [511, 757],
    [470, 726],
    [436, 701],
    [430, 640],
    [540, 560],
    [604, 514],
    [614, 500],
    [623, 480],
    [633, 460],
    [640, 442],
    [642, 420],
    [642, 390],
    [641, 374],
    [636, 361],
    [629, 349],
    [621, 338],
    [616, 325],
    [613, 310],
    [613, 285],
    [615, 268],
    [618, 255],
    [625, 244],
  ]);
  // The web between the thumb and the phone, where the palm behind it shows a shade step down; it runs a little under
  // the thumb, which is drawn over it, so no seam shows between them.
  const wedge = traced([
    [600, 394],
    [613, 397],
    [626, 407],
    [640, 418],
    [646, 440],
    [638, 462],
    [627, 483],
    [616, 504],
    [600, 510],
  ]);
  const index = traced([
    [251, 270],
    [262, 252],
    [283, 244],
    [305, 247],
    [324, 254],
    [324, 338],
    [300, 326],
    [275, 309],
    [255, 292],
  ]);
  const sides = PADS.map((pad) => flat(traced(pad.map(([x, y]) => [x + 15, y - 9] as Pt)), SKIN.shade)).join('');
  return flat(wedge, SKIN.shade) + flat(palm, SKIN.face) + sides + flat(index, SKIN.face);
}

/** The phone: its buttons, its black body with light along the metal edge, and the dark glass. */
function phone(dr: Drawing): string {
  const { w, h, r } = PHONE;
  let out = '';
  // The volume buttons on the left edge and the side button on the right, standing just proud of it, above the thumb.
  for (const [x, y, len] of [[-w / 2, -46, 16], [-w / 2, -24, 16], [w / 2, -68, 24]] as const) {
    out += box(x, y, 3.4, len, 1.4, INK.button);
  }
  const body =
    `M${n(-w / 2 + r)} ${n(-h / 2)}H${n(w / 2 - r)}A${n(r)} ${n(r)} 0 0 1 ${n(w / 2)} ${n(-h / 2 + r)}V${n(h / 2 - r)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(w / 2 - r)} ${n(h / 2)}H${n(-w / 2 + r)}A${n(r)} ${n(r)} 0 0 1 ${n(-w / 2)} ${n(h / 2 - r)}V${n(-h / 2 + r)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(-w / 2 + r)} ${n(-h / 2)}Z`;
  out += `<path d="${body}" fill="${INK.body}"/>`;
  // The metal edge catches the light along the top and the left.
  out += `<g clip-path="url(#${dr.clip(body)})"><path d="M-400 -400H400V400H-400Z${body}" fill="${INK.edge}" fill-rule="evenodd" transform="translate(${n(-LIGHT[0] * 1.3)} ${n(-LIGHT[1] * 1.3)})"/></g>`;
  const s = HAND_PHONE_SCREEN;
  out += box(0, 0, s.w, s.h, s.r, INK.glass);
  return out;
}

export interface HandPhoneOptions {
  /** `back`: the hand, the sleeve and the phone with its screen dark; `front`: the finger pads and the island over it. */
  part: 'back' | 'front';
  idPrefix?: string;
}

/** One layer of the hand holding the phone on the panel's frame (`HAND_PHONE_VIEW`), clear all round. It is decoration. */
export function handPhoneSvg(opts: HandPhoneOptions): string {
  const dr = new Drawing(prefixFor(opts.idPrefix, 'hand-phone', opts.part));
  if (opts.part === 'back') {
    // The sleeve sits on the wrist where the reference's frame ends, its arm leaving down and a little to the right.
    dr.add(hand() + knitSleeve(dr, at(758, 905), -27, 0.9) + phone(dr));
  } else if (opts.part === 'front') {
    const s = HAND_PHONE_SCREEN;
    // The camera island at the top of the glass, over whatever the screen shows.
    dr.add(box(0, -s.h / 2 + 10, 26, 7.6, 3.8, INK.island));
    dr.add(PADS.map((pad) => flat(traced(pad), SKIN.face)).join(''));
  } else {
    throw new RangeError(`art: no hand-phone part called ${String(opts.part)}`);
  }
  const { defs, body } = dr.parts();
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HAND_PHONE_VIEW.w} ${HAND_PHONE_VIEW.h}" aria-hidden="true">${defs}` +
    `<g transform="translate(${n(PHONE.cx)} ${n(PHONE.cy)}) rotate(${n(PHONE.turn)})">${body}</g></svg>`
  );
}
