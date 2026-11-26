/**
 * A hand holding a phone upright, its screen toward us, for the front page's panel about the phone apps: a right hand as
 * its owner sees it, rising from the lower right out of a knit sleeve, the phone resting in its palm, four fingertips
 * curled round its left edge and the thumb laid over its right. Flat cut-outs lit from the upper left, one shade step and
 * one light step on each form. Two layers on one frame: `back` (sleeve, hand and phone, its screen dark) and `front` (the
 * fingertips, the thumb and the camera island), so an app can lay something live on the screen (`HAND_PHONE_SCREEN`)
 * between them.
 */
import { Drawing, n, prefixFor, type Pt } from './svg.js';

/** The panel's frame in drawing units, square. */
export const HAND_PHONE_VIEW = { w: 320, h: 320 } as const;

/** The phone: its centre, its lean (degrees, negative to the left), its size and its corners' radius. */
const PHONE = { cx: 134, cy: 116, turn: -8, w: 92, h: 188, r: 15 } as const;
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

interface Tones {
  shade: string;
  face: string;
  light: string;
}

/** The skin: its shade, face and light, the darker line of a crease, and the nails a step lighter. */
const SKIN = { shade: '#c08663', face: '#dca784', light: '#eec5a2', crease: '#a5694a', nail: '#ebc3a8' } as const;
/** The knit sleeve: a warm madder red, its ribbing a step darker. */
const KNIT = { shade: '#7e3428', face: '#9c4434', light: '#b45a45', rib: '#6f2c22' } as const;
/** The phone's black, the light along its metal edge, the dark glass, and the island and buttons. */
const INK = { body: '#101517', edge: '#47535a', glass: '#0b1013', island: '#030506', button: '#20282c' } as const;

/** Where the light falls from, in the phone's own frame: the upper left. */
const LIGHT: Pt = [-0.6, -0.8];

/** A closed outline through `points`, smoothed into one flowing curve. */
function smooth(points: readonly Pt[]): string {
  const m = points.length;
  const at = (i: number): Pt => points[((i % m) + m) % m]!;
  let d = `M${n(at(0)[0])} ${n(at(0)[1])}`;
  for (let i = 0; i < m; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${n(b[0] + (c[0] - a[0]) / 6)} ${n(b[1] + (c[1] - a[1]) / 6)} ${n(c[0] - (e[0] - b[0]) / 6)} ${n(c[1] - (e[1] - b[1]) / 6)} ${n(c[0])} ${n(c[1])}`;
  }
  return `${d}Z`;
}

/** An open curve through `points`, for a crease or a rib. */
function line(points: readonly Pt[]): string {
  let d = `M${n(points[0]![0])} ${n(points[0]![1])}`;
  for (let i = 1; i < points.length; i++) {
    const [a, b, c, e] = [points[Math.max(0, i - 2)]!, points[i - 1]!, points[i]!, points[Math.min(points.length - 1, i + 1)]!];
    d += `C${n(b[0] + (c[0] - a[0]) / 6)} ${n(b[1] + (c[1] - a[1]) / 6)} ${n(c[0] - (e[0] - b[0]) / 6)} ${n(c[1] - (e[1] - b[1]) / 6)} ${n(c[0])} ${n(c[1])}`;
  }
  return d;
}

/** A rounded rectangle centred on (`x`, `y`). */
const box = (x: number, y: number, w: number, h: number, r: number, fill: string): string =>
  `<rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" fill="${fill}"/>`;

/**
 * A matte form lit from the upper left: its face, the shade along its far side (where the face, moved toward the light,
 * leaves the form uncovered), and a soft light along its near edge. `reach` is how wide each step is.
 */
function matte(dr: Drawing, d: string, tones: Tones, reach: number, lightReach = reach * 0.45): string {
  const clip = dr.clip(d);
  const move = (k: number): string => ` transform="translate(${n(LIGHT[0] * k)} ${n(LIGHT[1] * k)})"`;
  return (
    `<g clip-path="url(#${clip})">` +
    `<path d="${d}" fill="${tones.shade}"/>` +
    `<path d="${d}" fill="${tones.face}"${move(reach)}/>` +
    `<path d="M-400 -400H400V400H-400Z${d}" fill="${tones.light}" fill-rule="evenodd"${move(-lightReach)}/>` +
    `</g>`
  );
}

/**
 * The palm and forearm in one piece, behind the phone: the heel of the hand and the inside of the wrist below it, the
 * ball of the thumb past its right edge, and the palm's edge past its left, under the fingers.
 */
function hand(dr: Drawing): string {
  const outline = smooth([
    [-40, 60],
    [-54, 70],
    [-58, 90],
    [-55, 114],
    [-42, 136],
    [-18, 156],
    [-2, 176],
    [20, 214],
    [50, 270],
    [80, 360],
    [200, 340],
    [124, 222],
    [90, 178],
    [74, 160],
    [72, 140],
    [76, 116],
    [70, 96],
    [56, 78],
    [44, 64],
  ]);
  let out = matte(dr, outline, SKIN, 4.2);
  // On the skin alone: the phone's own shade on the palm it rests in, a step down from the skin, just below and right of
  // it; the line round the ball of the thumb; and the crease of the wrist, faint, where the hand bends back.
  const { w, h, r } = PHONE;
  const crease = (points: readonly Pt[], width: number, opacity: number): string =>
    `<path d="${line(points)}" fill="none" stroke="${SKIN.crease}" stroke-width="${n(width)}" stroke-linecap="round" opacity="${n(opacity)}"/>`;
  out +=
    `<g clip-path="url(#${dr.clip(outline)})"><rect x="${n(3 - w / 2)}" y="${n(4.5 - h / 2)}" width="${w}" height="${h}" rx="${r}" fill="${SKIN.shade}" opacity="0.85"/>` +
    crease([[40, 98], [30, 122], [28, 146], [36, 160]], 1.3, 0.38) +
    crease([[-20, 172], [22, 176], [62, 166], [96, 156]], 1.2, 0.3) +
    `</g>`;
  return out;
}

/** The sleeve: a knit cuff just above the wrist, ribbed along the arm, and the sleeve beyond it out of the picture. */
function sleeve(dr: Drawing): string {
  const cuff = smooth([
    [-8, 200],
    [36, 184],
    [76, 168],
    [98, 160],
    [111, 166],
    [120, 182],
    [156, 254],
    [196, 340],
    [230, 420],
    [40, 440],
    [14, 330],
    [-16, 222],
  ]);
  let out = matte(dr, cuff, KNIT, 5, 2.4);
  // The ribs run along the arm from the cuff's edge.
  let ribs = '';
  for (let i = 0; i < 11; i++) {
    const t = (i + 0.5) / 11;
    const top: Pt = [-10 + t * 120, 206 - t * 44 - Math.sin(t * Math.PI) * 3];
    ribs += line([top, [top[0] + 12, top[1] + 22], [top[0] + 22, top[1] + 40]]);
  }
  out += `<g clip-path="url(#${dr.clip(cuff)})"><path d="${ribs}" fill="none" stroke="${KNIT.rib}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/></g>`;
  return out;
}

/** The phone: its buttons, its black body with light along the metal edge, and the dark glass. */
function phone(dr: Drawing): string {
  const { w, h, r } = PHONE;
  let out = '';
  // The volume buttons on the left edge and the side button on the right, standing just proud of it.
  for (const [x, y, len] of [[-w / 2, -46, 16], [-w / 2, -24, 16], [w / 2, -34, 26]] as const) {
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

/** One fingertip curled round the phone's left edge: where along the edge, how thick, and how far onto the glass it reaches. */
function fingertip(dr: Drawing, y: number, thick: number, reach: number, tilt: number): string {
  const edge = -PHONE.w / 2;
  const r = thick / 2;
  const [x0, x1] = [edge - 15, edge + reach];
  const outline = smooth([
    [x0 + 3, y - r * 0.94],
    [x0 + (x1 - x0) * 0.55, y - r + tilt * 0.5],
    [x1 - r * 0.5, y - r * 0.8 + tilt],
    [x1, y - r * 0.06 + tilt],
    [x1 - r * 0.42, y + r * 0.76 + tilt],
    [x0 + (x1 - x0) * 0.55, y + r * 0.96 + tilt * 0.5],
    [x0 + 2, y + r * 0.9],
    [x0 - r * 0.3, y],
  ]);
  let out = matte(dr, outline, SKIN, 2.8);
  // The nail, on the top of the tip where it rests on the glass, a step lighter than the skin.
  out += `<ellipse cx="${n(x1 - r * 0.56)}" cy="${n(y + tilt * 0.8)}" rx="${n(r * 0.34)}" ry="${n(r * 0.46)}" fill="${SKIN.nail}"/>`;
  return out;
}

/** The thumb, from the ball of the thumb past the phone's right edge, laid over the glass toward its middle, its nail at the tip. */
function thumb(dr: Drawing): string {
  const outline = smooth([
    [53, 122],
    [46, 102],
    [39, 84],
    [33, 70],
    [31, 60],
    [34, 52],
    [42, 50],
    [49, 56],
    [59, 70],
    [67, 88],
    [72, 106],
    [74, 126],
    [64, 136],
  ]);
  let out = matte(dr, outline, SKIN, 3.2);
  // The nail near the tip, along the thumb, a step lighter than the skin.
  out += `<rect x="35" y="52.5" width="10.5" height="13" rx="5" fill="${SKIN.nail}" transform="rotate(-30 40 59)"/>`;
  // The crease across the knuckle, where the thumb bends.
  out += `<path d="${line([[45, 84], [51, 80], [58, 79]])}" fill="none" stroke="${SKIN.crease}" stroke-width="1.2" stroke-linecap="round" opacity="0.4"/>`;
  return out;
}

export interface HandPhoneOptions {
  /** `back`: the sleeve, the hand and the phone with its screen dark; `front`: the fingertips, thumb and island over it. */
  part: 'back' | 'front';
  idPrefix?: string;
}

/** One layer of the hand holding the phone on the panel's frame (`HAND_PHONE_VIEW`), clear all round. It is decoration. */
export function handPhoneSvg(opts: HandPhoneOptions): string {
  const dr = new Drawing(prefixFor(opts.idPrefix, 'hand-phone', opts.part));
  if (opts.part === 'back') {
    dr.add(hand(dr) + sleeve(dr) + phone(dr));
  } else if (opts.part === 'front') {
    const s = HAND_PHONE_SCREEN;
    // The camera island at the top of the glass, over whatever the screen shows.
    dr.add(box(0, -s.h / 2 + 10, 26, 7.6, 3.8, INK.island));
    for (const [y, thick, reach, tilt] of [[2, 21, 9, 1], [22.5, 21.5, 10, 1.2], [43, 20, 9, 1.4], [61.5, 17, 6.5, 1.6]] as const) {
      dr.add(fingertip(dr, y, thick, reach, tilt));
    }
    dr.add(thumb(dr));
  } else {
    throw new RangeError(`art: no hand-phone part called ${String(opts.part)}`);
  }
  const { defs, body } = dr.parts();
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HAND_PHONE_VIEW.w} ${HAND_PHONE_VIEW.h}" aria-hidden="true">${defs}` +
    `<g transform="translate(${n(PHONE.cx)} ${n(PHONE.cy)}) rotate(${n(PHONE.turn)})">${body}</g></svg>`
  );
}
