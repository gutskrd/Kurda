/**
 * The pictures Hevalo shows on the friends and events badges' — two hearts, a gift, a lantern, a letter, the Newroz fire, a pen, a speech bubble with a heart, fireworks, and a pomegranate — drawn whole with the pen
 * (pen.ts), in the style of the secrets (pictures.ts).
 */
import { circ, ell, glint, line, n, path, stroke, through } from '../pen.js';
import type { Pen, Picture } from '../pen.js';

const PAIR = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;

/** A path of M, L, C, Q and Z moved whole: scaled by `s` and turned `turn` degrees about (ox, oy), and that point set at (x, y). */
function mover(x: number, y: number, s = 1, turn = 0, ox = 0, oy = 0): { pt: (u: number, v: number) => [number, number]; d: (d: string) => string } {
  const a = (turn * Math.PI) / 180;
  const [c, si] = [Math.cos(a) * s, Math.sin(a) * s];
  const pt = (u: number, v: number): [number, number] => [x + (u - ox) * c - (v - oy) * si, y + (u - ox) * si + (v - oy) * c];
  return { pt, d: (d) => d.replace(PAIR, (_, u: string, v: string) => pt(Number(u), Number(v)).map(n).join(',')) };
}

/** The same path seen in a mirror, its left for its right. */
const mirror = (d: string): string => d.replace(PAIR, (_, x: string, y: string) => `${n(-Number(x))},${y}`);

/** Round dots at the points, each the round end of a stroke too short to see: a whole scatter of them in one line. */
const dots = (pts: readonly (readonly [number, number])[]): string => pts.map(([x, y]) => `M${n(x)},${n(y)}h0.1`).join('');

const HEART = 'M0,15.4C-8,10 -16.4,4.2 -16.4,-4C-16.4,-10.2 -12,-13.6 -7.8,-13.6C-4.4,-13.6 -1.6,-11.8 0,-8.8C1.6,-11.8 4.4,-13.6 7.8,-13.6C12,-13.6 16.4,-10.2 16.4,-4C16.4,4.2 8,10 0,15.4Z';

/** light, body, shade, and the deep line round it */
type Hue = readonly [string, string, string, string];
const RED: Hue = ['#ffc2cc', '#ff3d5e', '#b80c2c', '#6a0820'];
const ROSE: Hue = ['#ffeef7', '#ff8cc4', '#d43c86', '#86164f'];

/** A glossy heart at (x, y), `s` of the whole, leaning `turn` degrees: lit on its left lobe, shaded round its right side and point, a gloss on it. */
function heart(p: Pen, x: number, y: number, s: number, turn: number, [light, body, shade, ink]: Hue): string {
  const m = mover(x, y, s, turn);
  const [gx, gy] = m.pt(-7, -8);
  const out = [path(m.d(HEART), p.round([[0, light], [0.35, body], [0.9, shade]], gx, gy, 26 * s), stroke(ink, 1.2))];
  if (!p.tiny) {
    const side = 'M15.8,-8.6C16.4,-7.2 16.4,-5.6 16.4,-4C16.4,4.2 8,10 0,15.4C-3.4,13.1 -6.6,10.8 -9.4,8.3C-1.4,10.6 9.8,4.4 13.4,-2.4C14.6,-4.6 15.4,-6.6 15.8,-8.6Z';
    out.push(path(m.d(side), shade, ' fill-opacity="0.6"'));
    out.push(line(m.d('M13.6,-0.4C10.8,5.4 5.8,9.8 1.2,12.8'), light, 0.9, ' stroke-opacity="0.6"'));
    const [hx, hy] = m.pt(-4.4, -10.8);
    out.push(path(m.d('M-13.6,-3.4C-14.4,-8 -11.4,-11.4 -7.6,-11.4C-10.2,-9.6 -12.2,-7 -13.6,-3.4Z') + circ(hx, hy, 1.5 * s), '#ffffff', ' fill-opacity="0.92"'));
    out.push(path(m.d('M6.2,-11.2C8.6,-12 11.2,-11.4 12.8,-9.6C10.6,-10.2 8.4,-10.4 6.2,-11.2Z'), '#ffffff', ' fill-opacity="0.6"'));
  }
  return out.join('');
}

/** Friends: two glossy hearts side by side, a pink one leaning on a red one. */
function hearts(p: Pen): string {
  const out = [heart(p, 5.6, -4.8, 0.68, 14, ROSE), heart(p, -4.2, 4, 0.76, -12, RED)];
  if (p.fine) out.push(path(`${glint(15.6, 9.6, 2.6)}${glint(-15.6, -12.4, 1.8)}${glint(11.4, -17, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** A gift: a box wrapped in violet paper, a red ribbon round it tied in a full bow, its lid lifted a little on the light inside. */
function gift(p: Pen): string {
  const out: string[] = [];
  const ink = '#3a1478';
  const deep = '#6a0818';
  const paper = p.box([[0, '#e6ccff'], [0.4, '#a46cf6'], [1, '#5a26b4']], 0.1, 0, 0.9, 1);
  const ribbon = p.box([[0, '#ffa0ae'], [0.45, '#ff2d55'], [1, '#a80c2a']], 0, 0, 1, 0);
  const lid = mover(-14.6, -1.6, 1, -5, -14.6, -1.6);
  // the light inside, showing under the lid
  const [ax, ay] = lid.pt(-14.4, -1.6);
  const [bx, by] = lid.pt(14.4, -1.6);
  out.push(path(`M-14.4,0.6L${n(ax)},${n(ay)}L${n(bx)},${n(by)}L14.4,0.6Z`, p.line([[0, '#fffbe0'], [1, '#ffc93a']], 0, -4, 0, 1)));
  // the box, its shade, and the ribbon down it
  out.push(path('M-14.4,0H14.4V15.2C14.4,17.2 13,18.6 11,18.6H-11C-13,18.6 -14.4,17.2 -14.4,15.2Z', paper, stroke(ink, 1.2)));
  if (!p.tiny) out.push(path('M8.6,0.6H13.8V15.2C13.8,16.8 12.8,18 11,18H7.2C8.8,12.4 9.2,6 8.6,0.6Z', ink, ' fill-opacity="0.25"'));
  out.push(path('M-2.8,0H2.8V18.6H-2.8Z', ribbon, stroke(deep, 0.8)));
  // the lid, its top and the ribbon over it
  out.push(path(lid.d('M-16.6,-7.8L-13.6,-10.8L13.6,-10.8L16.6,-7.8Z'), '#d8b4ff', stroke(ink, 1)));
  out.push(path(lid.d('M-16.6,-7.8L16.6,-7.8L16.6,-3.6C16.6,-2.4 15.8,-1.6 14.6,-1.6L-14.6,-1.6C-15.8,-1.6 -16.6,-2.4 -16.6,-3.6Z'), paper, stroke(ink, 1.2)));
  out.push(path(lid.d('M-2.8,-7.8L2.8,-7.8L2.8,-1.6L-2.8,-1.6Z M-2.8,-7.8L-2.4,-10.8L2.4,-10.8L2.8,-7.8Z'), ribbon, stroke(deep, 0.8)));
  if (!p.tiny) out.push(line(`${lid.d('M-14.8,-6.4L-5,-6.4')}M-12.4,2.6V14.6`, '#ffffff', 1.1, ' stroke-opacity="0.7"'));
  // the bow: its tails falling from the knot, its two loops, and the knot
  const tails = 'M-2.6,-10C-3.6,-8.2 -4.6,-6.4 -7.2,-4.2L-4.9,-4.3L-4.2,-2C-2,-4.4 -1,-6.8 0.2,-9.2Z M2.6,-10C3.4,-8.4 4.8,-6.8 7.6,-5.2L5.3,-4.7L4.9,-2.4C2.6,-4.4 1,-6.6 -0.2,-9.2Z';
  out.push(path(lid.d(tails), ribbon, stroke(deep, 0.8)));
  const loop = 'M-0.6,-10.8C-3.6,-14.6 -9.4,-20 -14,-18.8C-17.8,-17.8 -17.4,-12.8 -13.6,-11.4C-10,-10.2 -4.6,-10.4 -0.6,-10.8Z';
  out.push(path(lid.d(loop + mirror(loop)), p.box([[0, '#ff8a9c'], [0.5, '#f0284e'], [1, '#a00a28']], 0.2, 0, 0.8, 1), stroke(deep, 1)));
  if (!p.tiny) {
    const fold = 'M-2.6,-11.8C-5.6,-14.6 -10,-17.4 -12.8,-16.6C-14.8,-16 -14.4,-13.6 -12.2,-12.8C-9.4,-12 -5.8,-11.8 -2.6,-11.8Z';
    out.push(path(lid.d(fold + mirror(fold)), deep, ' fill-opacity="0.45"'));
    out.push(path(lid.d('M-15.4,-14.4C-15.2,-16.8 -12.6,-17.8 -9.8,-16.8C-12,-16.8 -13.8,-15.8 -15.4,-14.4Z'), '#ffffff', ' fill-opacity="0.75"'));
  }
  out.push(path(lid.d('M-3.2,-13.6C-1.6,-14.6 1.6,-14.6 3.2,-13.6C3.8,-11.8 3.8,-9.6 3.2,-8.2C1.6,-7.4 -1.6,-7.4 -3.2,-8.2C-3.8,-9.6 -3.8,-11.8 -3.2,-13.6Z'), ribbon, stroke(deep, 1)));
  if (p.fine) out.push(path(`${glint(17.8, -2.6, 2.6)}${glint(-17.4, -14.6, 1.8)}${glint(13.6, -17.4, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** The host's lantern, lit for the guests: brass, its dome pierced, a warm flame glowing in its glass and its light all round it. */
function lantern(p: Pen): string {
  const out: string[] = [];
  const ink = '#6a3a06';
  const brass = p.line([[0, '#fff0b0'], [0.35, '#f2c048'], [0.75, '#c27a12'], [1, '#8a4e08']], -13, 0, 13, 0);
  out.push(path(circ(0, 2, 20), p.round([[0, '#fff3b0', 0.85], [0.5, '#ffc94a', 0.3], [1, '#ffc94a', 0]], 0, 2, 20)));
  // the ring it hangs by, the dome and its rim
  out.push(path('M-3.6,-15.4C-3.8,-21.8 3.8,-21.8 3.6,-15.4L2.2,-15.4C2.4,-19.8 -2.4,-19.8 -2.2,-15.4Z', brass, stroke(ink, 0.9)));
  out.push(path('M-9.6,-9.6C-9.2,-13.2 -5,-15.8 0,-15.8C5,-15.8 9.2,-13.2 9.6,-9.6Z', brass, stroke(ink, 1.1)));
  out.push(path('M-12.4,-10.6H12.4Q13.4,-10.6 13.4,-9.6V-7.8Q13.4,-6.8 12.4,-6.8H-12.4Q-13.4,-6.8 -13.4,-7.8V-9.6Q-13.4,-10.6 -12.4,-10.6Z', brass, stroke(ink, 1.1)));
  // the glass, glowing, and the flame in it
  out.push(path('M-9.6,-6.8C-11.6,-1.6 -11.6,5 -9.2,10.4H9.2C11.6,5 11.6,-1.6 9.6,-6.8Z', p.round([[0, '#ffffff'], [0.3, '#fff1a0'], [1, '#f08a1a']], 0, 3.4, 12.6), stroke('#8a4206', 0.9)));
  out.push(path('M0,-4.4C2.8,-1 4.6,2 4.6,4.8C4.6,7.6 2.6,9.4 0,9.4C-2.6,9.4 -4.6,7.6 -4.6,4.8C-4.6,2 -2.8,-1 0,-4.4Z', p.line([[0, '#ff4a1a'], [1, '#ffb02a']], 0, -4.4, 0, 9.4)));
  out.push(path('M0,0.6C1.4,2.4 2.4,4 2.4,5.6C2.4,7.2 1.4,8.2 0,8.2C-1.4,8.2 -2.4,7.2 -2.4,5.6C-2.4,4 -1.4,2.4 0,0.6Z', '#fffbe0'));
  // the frame's bars before the glass, the base and its foot
  out.push(line('M-5.6,-6.8C-6.6,-1.6 -6.6,5 -5.4,10.4M5.6,-6.8C6.6,-1.6 6.6,5 5.4,10.4', ink, 1.8));
  out.push(path('M-9.4,14.2H9.4L10.8,17.4Q11.2,18.6 9.8,18.6H-9.8Q-11.2,18.6 -10.8,17.4Z', brass, stroke(ink, 1.1)));
  out.push(path('M-12.8,10.4H12.8Q13.8,10.4 13.8,11.4V13.2Q13.8,14.2 12.8,14.2H-12.8Q-13.8,14.2 -13.8,13.2V11.4Q-13.8,10.4 -12.8,10.4Z', brass, stroke(ink, 1.1)));
  if (!p.tiny) {
    out.push(line(dots([[-4.4, -11.8], [0, -12.8], [4.4, -11.8]]), '#5a2a04', 1.7));
    out.push(path('M-7.4,-10.4C-6.6,-12.8 -4,-14.4 -1.2,-14.8C-3.6,-13.6 -5.6,-12.2 -7.4,-10.4Z', '#ffffff', ' fill-opacity="0.8"'));
    out.push(line('M-8.4,-4.4C-9.4,-0.6 -9.4,3.8 -8.2,7.8M-11.6,-8.7H-4M-11.8,12.3H-4', '#ffffff', 0.9, ' stroke-opacity="0.8"'));
  }
  if (p.fine) out.push(path(`${glint(15.6, -12.6, 2.2)}${glint(-15.4, 4.6, 1.6)}${glint(14.6, 8.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** A letter to a friend: a pink envelope, its flap sealed with a heart pressed in red wax. */
function letter(p: Pen): string {
  const out: string[] = [];
  const ink = '#a8306a';
  const envelope = 'M-16.2,-12.4H16.2C17.8,-12.4 18.8,-11.4 18.8,-9.8V10.2C18.8,11.8 17.8,12.8 16.2,12.8H-16.2C-17.8,12.8 -18.8,11.8 -18.8,10.2V-9.8C-18.8,-11.4 -17.8,-12.4 -16.2,-12.4Z';
  out.push(path(envelope, p.box([[0, '#fff0f6'], [0.5, '#ffbcd8'], [1, '#f088b4']], 0.2, 0, 0.8, 1), stroke(ink, 1.2)));
  if (!p.tiny) {
    // the folds of the lower flaps, and the flap's shadow on them
    out.push(line('M-17.8,11.8L-4.4,1.6M17.8,11.8L4.4,1.6', ink, 0.7, ' stroke-opacity="0.6"'));
    out.push(path('M-18,-10.6L-2.6,3C-1.2,4.2 1.2,4.2 2.6,3L18,-10.6V-7.4L2.8,5.8C1.2,7.2 -1.2,7.2 -2.8,5.8L-18,-7.4Z', ink, ' fill-opacity="0.25"'));
  }
  // the flap
  const flap = 'M-18.2,-11.2C-18.4,-11.8 -17.6,-12.4 -16.2,-12.4H16.2C17.6,-12.4 18.4,-11.8 18.2,-11.2L2.6,2.6C1.2,3.8 -1.2,3.8 -2.6,2.6Z';
  out.push(path(flap, p.line([[0, '#fff8fb'], [1, '#ffb0d2']], 0, -12, 0, 3), stroke(ink, 0.9)));
  if (!p.tiny) out.push(line('M-14.6,-10.8L-5.6,-2.8', '#ffffff', 1, ' stroke-opacity="0.8"'));
  // the seal: a pool of red wax, the heart pressed into it
  const lobes = 9;
  const pts: string[] = [];
  for (let i = 0; i < lobes; i++) {
    const a = ((i * 360) / lobes - 80) * (Math.PI / 180);
    const b = (((i + 0.5) * 360) / lobes - 80) * (Math.PI / 180);
    const [r0, r1] = [6.3 + (i % 3) * 0.2, 7.4 - (i % 2) * 0.4];
    pts.push(`${i === 0 ? 'M' : ''}${n(Math.cos(a) * r0)},${n(3 + Math.sin(a) * r0)}Q${n(Math.cos(b) * r1)},${n(3 + Math.sin(b) * r1)} `);
  }
  const first = pts[0]?.split('Q')[0]?.slice(1) ?? '';
  if (!p.tiny) out.push(path(circ(0.6, 4.2, 7.2), '#5a0414', ' fill-opacity="0.25"'));
  out.push(path(`${pts.join('')}${first}Z`, p.round([[0, '#ff9a9a'], [0.45, '#e0203c'], [1, '#8a0a22']], -2.6, 0.4, 9.6), stroke('#5a0414', 1)));
  if (!p.tiny) out.push(path(circ(0, 3, 4.8), '#a00c26', ' fill-opacity="0.55"'));
  out.push(path(mover(0, 3.3, 0.24).d(HEART), '#ff4d68', stroke('#6a0618', 0.5)));
  if (!p.tiny) out.push(path('M-5.6,0.6C-5,-1.8 -3,-3.4 -0.6,-3.6C-2.6,-2.6 -4.2,-1.2 -5.6,0.6Z', '#ffffff', ' fill-opacity="0.75"'));
  if (p.fine) out.push(path(`${glint(16.4, -16.4, 2.6)}${glint(-16.6, 16.2, 1.6)}`, '#ffffff'));
  return out.join('');
}

/** Newroz: the new year's fire, its flames leaping from crossed logs and sparks flying up from it. */
function bonfire(p: Pen): string {
  const out: string[] = [];
  const bark = '#3e1a06';
  const wood = p.box([[0, '#e0a464'], [0.5, '#9a5a26'], [1, '#5e2c0e']], 0, 0, 0, 1);
  const log = 'M-14.6,-2.9L14.6,-2.9C16.2,-2.9 17.2,-1.5 17.2,0C17.2,1.5 16.2,2.9 14.6,2.9L-14.6,2.9C-16.2,2.9 -17.2,1.5 -17.2,0C-17.2,-1.5 -16.2,-2.9 -14.6,-2.9Z';
  const end = 'M-15.4,-2.9C-14.3,-2.9 -13.5,-1.6 -13.5,0C-13.5,1.6 -14.3,2.9 -15.4,2.9C-16.5,2.9 -17.3,1.6 -17.3,0C-17.3,-1.6 -16.5,-2.9 -15.4,-2.9Z';
  const logs = (m: { d: (d: string) => string }, flip: boolean): string => {
    const f = (d: string): string => m.d(flip ? mirror(d) : d);
    const parts = [path(f(log), wood, stroke(bark, 1.1)), path(f(end), '#f2c98e', stroke(bark, 0.8))];
    if (p.fine) parts.push(line(f('M-15.4,-1.4C-14.6,-1.4 -14.6,1.4 -15.4,1.4M-9.6,1.2L4,0.8M-2,-1.2L10.6,-1.4'), bark, 0.6, ' stroke-opacity="0.6"'));
    if (!p.tiny) parts.push(line(f('M-12.6,-2.2L12.6,-2.2'), '#ffb04a', 0.9, ' stroke-opacity="0.8"'));
    return parts.join('');
  };
  // its glow, the log behind, the flames, and the log before them
  out.push(path(circ(0, -1, 20), p.round([[0, '#ffd27a', 0.7], [0.55, '#ff9a3a', 0.25], [1, '#ff9a3a', 0]], 0, -1, 20)));
  out.push(logs(mover(1.4, 13, 1, -17), false));
  const outer =
    'M0,12C-8.2,12 -13.4,7.2 -13.4,0.8C-13.4,-4 -11.2,-7.8 -9.6,-11.8C-8.4,-8.4 -6.8,-6.2 -4.8,-5.4C-5.4,-11.4 -2.6,-16.4 1.4,-20' +
    'C0.4,-15.2 2.6,-11.4 4.8,-8.8C6.6,-10.4 8.2,-12.4 8.8,-14.6C12,-10.4 13.4,-5.6 13.4,-0.8C13.4,6.6 8.2,12 0,12Z';
  const middle =
    'M0,12C-5.8,12 -9.4,8.4 -9.4,3.6C-9.4,-0.4 -7.4,-3.2 -5.8,-6.2C-5,-3.6 -3.8,-2 -2.4,-1.4C-2.8,-6.4 -0.6,-10.6 2.4,-13.6' +
    'C1.8,-9.6 3.4,-6.4 5.4,-4.4C6.4,-5.4 7,-6.8 7.2,-8.2C8.8,-5.6 9.4,-2.4 9.4,1C9.4,7.6 5.6,12 0,12Z';
  const core = 'M0,12C-3.8,12 -5.8,9.6 -5.8,6.4C-5.8,3 -3.4,0.2 -1.4,-3.4C-0.6,-0.6 1.2,1.2 2.6,2.4C3.4,1.6 3.8,0.4 3.8,-0.8C5.2,1.2 5.8,3.6 5.8,6C5.8,9.6 3.6,12 0,12Z';
  out.push(path(outer, p.line([[0, '#ff3a1a'], [0.5, '#ff6a1a'], [1, '#ffa42a']], 0, -20, 0, 12), stroke('#a81c0a', 1.2)));
  out.push(path(middle, p.line([[0, '#ff9a1a'], [1, '#ffd23a']], 0, -14, 0, 12)));
  out.push(path(core, '#fff6c8'));
  out.push(logs(mover(-1.4, 13, 1, 17), true));
  // sparks flying up, each an ember with a hot heart
  if (!p.tiny) {
    const sparks = dots([[-11.6, -15.4], [11.6, -18.2], [15.6, -8.6], [-15.8, -5.6], [5.6, -19.2], [-6.6, -18.4]]);
    out.push(line(sparks, '#ff7a1a', 2.4), line(sparks, '#fff3a0', 1.1));
  }
  if (p.fine) out.push(path(`${glint(-6.6, -17.6, 1.6)}${glint(16.6, -14.6, 1.4)}${glint(-17.2, -12, 1.1)}`, '#ffffff'));
  return out.join('');
}

/**
 * The day of the Kurdish language: the gold nib of a fountain pen, engraved round its edge, a heart for its breathing hole, a drop of
 * blue ink falling from its point.
 */
function nib(p: Pen): string {
  const out: string[] = [];
  const deep = '#7a4a04';
  const gold = p.box([[0, '#fff6c6'], [0.4, '#ffcd3c'], [1, '#c27a0a']], 0, 0, 1, 0.3);
  // the pen's lacquered end and its gold ring
  out.push(path('M-8,-20H8L7,-15.4H-7Z', p.box([[0, '#8a7cff'], [0.4, '#4a36c8'], [1, '#1e1260']], 0, 0, 1, 0), stroke('#140a40', 1.1)));
  out.push(path('M-8.6,-15.8H8.6V-13H-8.6Z', gold, stroke(deep, 1)));
  // the nib, its shaded half, its engraving, its heart and its slit
  const body = 'M-7.8,-13H7.8C9.6,-10.4 10.8,-7.4 10.6,-4.6C10.4,-0.6 7.2,3.4 3.6,7.2C2,8.8 0.9,10.6 0,12.8C-0.9,10.6 -2,8.8 -3.6,7.2C-7.2,3.4 -10.4,-0.6 -10.6,-4.6C-10.8,-7.4 -9.6,-10.4 -7.8,-13Z';
  out.push(path(body, gold, stroke(deep, 1.2)));
  if (!p.tiny) {
    out.push(path('M0,-13H7.8C9.6,-10.4 10.8,-7.4 10.6,-4.6C10.4,-0.6 7.2,3.4 3.6,7.2C2,8.8 0.9,10.6 0,12.8Z', '#a8640a', ' fill-opacity="0.35"'));
    out.push(line('M-6,-11C-7.6,-8.6 -8.3,-6.2 -8.1,-4C-7.6,-1 -5.2,1.6 -2,3.2M6,-11C7.6,-8.6 8.3,-6.2 8.1,-4C7.6,-1 5.2,1.6 2,3.2', deep, 0.6, ' stroke-opacity="0.7"'));
    out.push(path('M-8.5,-10.8C-9.6,-8 -9.9,-5.2 -9.2,-2.6C-8.3,0.4 -6.3,3 -3.8,5.4C-6,2.6 -7.6,-0.2 -8.1,-3C-8.5,-5.6 -8.5,-8.2 -8.5,-10.8Z', '#ffffff', ' fill-opacity="0.75"'));
    out.push(line('M-6.2,-18.8L-5.8,-16.4', '#ffffff', 1, ' stroke-opacity="0.6"'));
  }
  if (p.fine) {
    // a little sun engraved above the heart
    const rays = Array.from({ length: 10 }, (_, i) => {
      const a = (i * 36 * Math.PI) / 180;
      return `M${n(Math.cos(a) * 1.8)},${n(-6.6 + Math.sin(a) * 1.8)}L${n(Math.cos(a) * 3)},${n(-6.6 + Math.sin(a) * 3)}`;
    });
    out.push(line(`${circ(0, -6.6, 1.2)}${rays.join('')}`, deep, 0.5, ' stroke-opacity="0.7"'));
  }
  out.push(path(mover(0, 1, 0.15).d(HEART), '#4a2604'));
  out.push(line('M0,3V12.6', '#4a2604', 0.8));
  // the drop of ink
  const drop = 'M0,13.8C1.8,15.8 3.8,17 3.8,18.6C3.8,20 2,20.8 0,20.8C-2,20.8 -3.8,20 -3.8,18.6C-3.8,17 -1.8,15.8 0,13.8Z';
  out.push(path(drop, p.round([[0, '#cfe6ff'], [0.4, '#3f8cff'], [1, '#1b3fae']], -1.2, 17, 5), stroke('#0f1f6a', 0.9)));
  if (!p.tiny) out.push(path('M-2.3,18.8C-2.3,17.8 -1.6,16.8 -0.8,16.3C-1.1,17.2 -1.3,18 -1.1,19Z', '#ffffff', ' fill-opacity="0.85"'));
  if (p.fine) out.push(path(`${glint(13.6, -8.6, 2.4)}${glint(-13.6, 6.6, 1.6)}${glint(9.4, 14.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** The mother tongue: a white speech bubble, soft and round, with a red heart in it. */
function speech(p: Pen): string {
  const out: string[] = [];
  const bubble =
    'M0,-16.4C10.8,-16.4 19,-10 19,-2C19,6.2 10.8,12.4 0,12.4C-2.6,12.4 -5,12 -7.2,11.4C-9.4,14.4 -12.8,16.8 -16.6,18' +
    'C-14.6,15.4 -13.4,12.4 -13.2,9.4C-17,6.8 -19,2.6 -19,-2C-19,-10 -10.8,-16.4 0,-16.4Z';
  out.push(path(bubble, p.round([[0, '#ffffff'], [0.55, '#f7f4ff'], [0.85, '#e4dcf4'], [1, '#cdbfe8']], -5, -8, 26), stroke('#4a2f5c', 1.3)));
  if (!p.tiny) {
    out.push(path('M18.2,-5.6C18.7,-4.4 19,-3.2 19,-2C19,6.2 10.8,12.4 0,12.4C-2.6,12.4 -5,12 -7.2,11.4C-5,11.2 -2.4,10.8 0,10.4C9.6,9 16.6,3.4 18.2,-5.6Z', '#b9a8dc', ' fill-opacity="0.6"'));
    out.push(path(ell(-6, -10.4, 8, 3.4), p.roundBox([[0, '#ffffff', 0.95], [1, '#ffffff', 0]])));
  }
  out.push(heart(p, 0, -1.6, 0.52, 0, RED));
  if (p.fine) out.push(path(`${glint(17.4, -15.6, 2.4)}${glint(-17.6, -13.6, 1.6)}${glint(12.6, 15.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/**
 * A burst of fireworks at (x, y): `count` streaks flying out to `r`, long and short by turns, white-hot at its heart into its colour;
 * `edged`, drawn round in its deep colour, with a spark beyond each long streak.
 */
function burst(p: Pen, x: number, y: number, r: number, count: number, turn: number, [hot, light, mid, ink]: Hue, edged: boolean): string {
  const rays: string[] = [];
  const ends: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = ((turn + (i * 360) / count) * Math.PI) / 180;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const [k0, k1] = i % 2 === 0 ? [0.16, 0.84] : [0.38, 0.62];
    rays.push(`M${n(x + c * r * k0)},${n(y + s * r * k0)}L${n(x + c * r * k1)},${n(y + s * r * k1)}`);
    if (i % 2 === 0) ends.push([x + c * r, y + s * r]);
  }
  // the greatest edged in its own deep colour, so it shows on a light page as well as on the night
  const out = edged ? [line(rays.join(''), ink, r * 0.1 + 1)] : [];
  out.push(line(rays.join(''), p.round([[0, hot], [0.35, light], [1, mid]], x, y, r), r * 0.1));
  if (edged && !p.tiny) out.push(line(dots(ends), mid, r * 0.12, ` stroke-opacity="0.9"`));
  out.push(path(circ(x, y, r * 0.17), hot));
  return out.join('');
}

const GOLD_BURST: Hue = ['#ffffff', '#ffe866', '#ff9200', '#a85006'];
const PINK_BURST: Hue = ['#ffffff', '#ffa6d6', '#ff2486', '#8a1056'];
const AQUA_BURST: Hue = ['#ffffff', '#a6efff', '#1496e6', '#0e4a8a'];

/** The new year: fireworks bursting, gold, pink and blue, the sparks of a rocket's trail below them. */
function fireworks(p: Pen): string {
  const out: string[] = [];
  out.push(path(circ(2, -2, 20), p.round([[0, '#fff6d0', 0.75], [0.5, '#ffcf6a', 0.25], [1, '#ffcf6a', 0]], 2, -2, 20)));
  if (!p.tiny) out.push(line('M5.6,20.4C4.8,17 4.2,14.4 3.8,11.6', '#ffe866', 1.2, ' stroke-dasharray="0.1 2.2"'));
  out.push(burst(p, 1.8, -1.6, 17, 20, 9.5, GOLD_BURST, true));
  out.push(burst(p, 14.2, -13.8, 6.6, 12, 8, PINK_BURST, false));
  out.push(burst(p, 12.8, 13.2, 7.2, 12, 0, AQUA_BURST, false));
  if (p.fine) out.push(path(`${glint(-16.6, 8.6, 2)}${glint(-13.6, -15.6, 1.8)}${glint(-4.6, 16.6, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** Whether a point lies inside a closed outline (its corners, in order). */
function within(pts: readonly [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A crown's outline: up its neck, then round its sepals, notch to tip to
 * notch, each edge bowed a little away from the crown's middle (`c`) so a
 * sepal is curved and pointed, like a flame; then down its neck again.
 */
function sepalsAround(c: [number, number], pts: [number, number][]): string {
  let d = `M${n(pts[0]![0])},${n(pts[0]![1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [[x0, y0], [x1, y1]] = [pts[i - 1]!, pts[i]!];
    const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
    const len = Math.hypot(mx - c[0], my - c[1]) || 1;
    const bow = i === 1 || i === pts.length - 1 ? 0 : 0.45;
    d += `Q${n(mx + ((mx - c[0]) / len) * bow)},${n(my + ((my - c[1]) / len) * bow)} ${n(x1)},${n(y1)}`;
  }
  return `${d}Z`;
}

/** A closed outline smoothed through its corners, as a path. */
const round = (pts: [number, number][]): string => `M${n(pts[0]![0])},${n(pts[0]![1])}${through([...pts, pts[0]!])}Z`;

/**
 * Yalda, the longest night, when pomegranates are shared: two, traced from
 * the sketch. Behind, a whole one, its shoulder rising to the crown at its top
 * left, the crown a star of sepals round a dark eye. In front, one broken
 * open, its crown tall and leaning right: a thin rind on its near side, a
 * thick one where it turns away and along its foot, and inside it seeds
 * packed right up to the rind, parted down the middle under the crown.
 */
function pomegranate(p: Pen): string {
  const out: string[] = [];
  const ink = '#4e0616';
  const skin = (cx: number, cy: number, r: number) =>
    p.round([[0, '#ff9a92'], [0.35, '#e43448'], [0.75, '#a8122e'], [1, '#6e0a22']], cx - r * 0.38, cy - r * 0.4, r * 1.5);
  const sepals = p.box([[0, '#f0606a'], [0.45, '#b81630'], [1, '#6a0a1e']]);

  // the whole one behind: down its shoulder from the crown, round its foot, back (behind the other) and along its top
  const back: [number, number][] = [
    [-12.5, -12.4], [-15.6, -9.8], [-17.7, -7.3], [-18.9, -4.4], [-19.15, -1.4], [-18.9, 1.6], [-18.1, 4.1], [-16.6, 6.7],
    [-14.4, 8.8], [-11.4, 10.4], [-7.6, 11.1], [-3, 10], [2.6, 5.4], [5.8, -2.6], [5.6, -7], [4.35, -8.55], [2.6, -10.7],
    [0.5, -12.1], [-2.2, -13.35], [-5, -13.95], [-7.2, -13.7],
  ];
  out.push(path(round(back), skin(-8, -2, 13), stroke(ink, 1)));
  if (!p.tiny) out.push(path('M-17.4,-4.6C-16.6,-7.8 -14.6,-10.2 -11.8,-11.4C-14,-9.4 -15.6,-7.2 -17.4,-4.6Z', '#ffffff', ' fill-opacity="0.7"'));
  // its crown: a short neck, and the star of sepals round its dark eye
  out.push(
    path(
      sepalsAround(
        [-9.9, -15.6],
        [
          [-12.2, -12.3], [-11.7, -14.8], [-14.2, -15.9], [-11.9, -16.3], [-13.1, -18.7], [-10.9, -17.1], [-10, -19.5], [-9, -17.1],
          [-7, -18.8], [-8, -16.4], [-6.2, -15.4], [-8.2, -14.8], [-7.4, -12.6],
        ],
      ),
      sepals,
      stroke(ink, 0.8),
    ),
  );
  out.push(path(ell(-9.9, -16, 1.5, 0.6), '#3a0410'));
  if (p.fine) out.push(line('M-10.6,-15.9V-17M-9.9,-16V-17.4M-9.2,-15.9V-17', '#e8a0a0', 0.3));

  // the open one in front: round its near side and its foot, up the far side to the crown
  const front: [number, number][] = [
    [-0.55, -4.35], [-3.85, -1.95], [-5.55, 0.45], [-6.85, 4.05], [-7, 8.8], [-6.15, 12.45], [-4.45, 14.85], [-1.6, 16.9],
    [1.2, 18.2], [5.5, 18.85], [9.2, 18.95], [12.75, 17.65], [16.35, 14.65], [18.15, 11.25], [18.75, 7.6], [18.45, 4.05],
    [17.65, 1.65], [16.05, -0.75], [13.2, -3.2], [11.9, -3.9], [8.4, -4.9], [5.3, -5.5], [2.4, -5.3],
  ];
  out.push(path(round(front), skin(6, 6, 13), stroke(ink, 1)));
  // where it is broken open: the rind thin on this side, thick where it turns away and along its foot
  const open: [number, number][] = [
    [-0.4, -3.9], [-3.5, -1.6], [-5.15, 0.8], [-6.4, 4.4], [-6.55, 8.6], [-5.75, 12.4], [-3.95, 14.8], [-0.5, 16.9],
    [4.5, 17.9], [9.5, 16.9], [13.4, 14.3], [15.3, 9.6], [15.4, 3.6], [13.6, -1.3], [11.5, -3.5], [8.5, -4.2], [5.4, -4.8], [2.2, -4.7],
  ];
  out.push(path(round(open), '#6a0418', stroke('#e8a490', 0.4)));
  if (!p.tiny) {
    // the seeds, packed right up to the rind, row on row and each nudged off its row; none in the pale fold down the middle
    const seeds: [number, number][] = [];
    const gap = 2.05;
    const fold = (x: number, y: number) => y < 7.5 && Math.abs(x - (5.7 - 0.05 * (y + 4))) < 0.5 + 0.04 * (7.5 - y);
    for (let row = 0, y = -4.2; y <= 18.5; row++, y += gap * 0.87) {
      for (let col = 0, x = -7 + (row % 2) * (gap / 2); x <= 16; col++, x += gap) {
        const k = (row * 7 + col * 13) % 5;
        const [sx, sy] = [x + (k - 2) * 0.14, y + (((row + col) % 3) - 1) * 0.18];
        const room = [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].every(([dx, dy]) => within(open, sx + dx!, sy + dy!));
        if (room && !fold(sx, sy)) seeds.push([Math.round(sx * 10) / 10, Math.round(sy * 10) / 10]);
      }
    }
    // the fold under the crown, pale and narrowing as it goes down
    out.push(path('M4.9,-4.6C5.2,-1 5,3 5.3,7.4C5.6,3 6.4,-1 6.9,-4.4Z', '#f2c8b2'));
    // seeds of two sizes, as they grow
    const ruby = p.line([[0, '#ff5a78'], [1, '#c40c34']], 0, -4, 0, 18);
    out.push(line(dots(seeds.filter((_, i) => i % 3 !== 1)), ruby, 2.05));
    out.push(line(dots(seeds.filter((_, i) => i % 3 === 1)), ruby, 1.6));
    if (p.fine) out.push(line(dots(seeds.map(([x, y]) => [x - 0.4, y - 0.4])), '#ffffff', 0.5, ' stroke-opacity="0.85"'));
    // the rind's light, round the side that turns away
    out.push(line('M16.2,-0.2C17.6,2 18,5.2 17.6,8.6', '#ffffff', 0.7, ' stroke-opacity="0.6"'));
  } else {
    out.push(path(round(open), '#d8203e'));
  }
  // its crown, tall, leaning right: a neck flaring into pointed sepals, the dark of its eye between them
  out.push(
    path(
      sepalsAround(
        [9.4, -8],
        [[5.3, -5.3], [5.2, -7.4], [4.7, -10.9], [6.4, -8.3], [7.9, -12.3], [9.4, -8.9], [11, -11], [12, -8.8], [14.6, -10.4], [12.8, -6.8], [12.2, -3.9]],
      ),
      sepals,
      stroke(ink, 0.8),
    ),
  );
  out.push(path(ell(9.3, -8.5, 2, 0.5), '#3a0410', ' transform="rotate(12 9.3 -8.5)"'));
  if (p.fine) out.push(line('M8.6,-8.7L8.4,-10M9.4,-8.5L9.5,-10.2M10.2,-8.3L10.6,-9.8', '#e8a0a0', 0.3));
  if (p.fine) out.push(path(`${glint(-17.2, 13.4, 1.8)}${glint(17.8, -9.6, 1.4)}`, '#ffffff'));
  return out.join('');
}

export const SOCIAL: Readonly<Record<string, Picture>> = {
  heval: hearts,
  diyari: gift,
  mevandar: lantern,
  name: letter,
  newroz: bonfire,
  'roja-ziman': nib,
  'zimane-dayike': speech,
  sersal: fireworks,
  yelda: pomegranate,
};
