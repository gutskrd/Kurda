/**
 * The pictures Hevalo shows on the friends and events badges' — two hearts, a gift, a lantern, a letter, the Newroz fire, a pen, a speech bubble with a heart, fireworks, and a pomegranate — drawn whole with the pen
 * (pen.ts), in the style of the secrets (pictures.ts).
 */
import { circ, ell, glint, line, n, path, stroke } from '../pen.js';
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

const HEART = 'M0,15.4C-8,10 -16.4,4.2 -16.4,-4C-16.4,-10.2 -12,-13.6 -7.8,-13.6C-4.4,-13.6 -1.6,-11.8 0,-8.8C1.6,-11.8 4.4,-13.6 7.8,-13.6C12,-13.6 16.4,-10.2 16.4,-4C16.4,4.2 8,10 0,15.4Z';

/** light, body, shade, and the deep line round it */
type Hue = readonly [string, string, string, string];
const RED: Hue = ['#ffc2cc', '#ff3d5e', '#b80c2c', '#6a0820'];
const ROSE: Hue = ['#fff0f7', '#ff9ccb', '#d84a90', '#8a1c56'];

/** A glossy heart at (x, y), `s` of the whole, leaning `turn` degrees: lit on its left lobe, shaded round its right side and point, a gloss on it. */
function heart(p: Pen, x: number, y: number, s: number, turn: number, [light, body, shade, ink]: Hue): string {
  const m = mover(x, y, s, turn);
  const [gx, gy] = m.pt(-7, -8);
  const out = [path(m.d(HEART), p.round([[0, light], [0.35, body], [0.85, shade], [1, shade]], gx, gy, 26 * s), stroke(ink, 1.2))];
  if (!p.tiny) {
    out.push(path(m.d('M15.8,-8.6C16.4,-7.2 16.4,-5.6 16.4,-4C16.4,4.2 8,10 0,15.4C-3.4,13.1 -6.6,10.8 -9.4,8.3C-1.4,10.6 9.8,4.4 13.4,-2.4C14.6,-4.6 15.4,-6.6 15.8,-8.6Z'), shade, ' fill-opacity="0.6"'));
    out.push(line(m.d('M13.6,-0.4C10.8,5.4 5.8,9.8 1.2,12.8'), light, 0.9, ' stroke-opacity="0.6"'));
    const [hx, hy] = m.pt(-4.4, -10.8);
    out.push(path(m.d('M-13.6,-3.4C-14.4,-8 -11.4,-11.4 -7.6,-11.4C-10.2,-9.6 -12.2,-7 -13.6,-3.4Z') + circ(hx, hy, 1.5 * s), '#ffffff', ' fill-opacity="0.92"'));
    out.push(path(m.d('M6.2,-11.2C8.6,-12 11.2,-11.4 12.8,-9.6C10.6,-10.2 8.4,-10.4 6.2,-11.2Z'), '#ffffff', ' fill-opacity="0.6"'));
  }
  return out.join('');
}

/** Friends: two glossy hearts side by side, a pink one leaning on a red one. */
function hearts(p: Pen): string {
  const out = [heart(p, 5.6, -4.8, 0.66, 14, ROSE), heart(p, -4.2, 4, 0.76, -12, RED)];
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
  const lid = mover(-14.6, -1.6, 1, -7, -14.6, -1.6);
  // the light inside, showing under the lid
  const [ax, ay] = lid.pt(-14.4, -1.6);
  const [bx, by] = lid.pt(14.4, -1.6);
  out.push(path(`M-14.4,0.6L${n(ax)},${n(ay)}L${n(bx)},${n(by)}L14.4,0.6Z`, p.line([[0, '#fffbe0'], [1, '#ffc93a']], 0, -5, 0, 1)));
  // the box, its shade, and the ribbon down it
  out.push(path('M-14.4,0H14.4V15.2C14.4,17.2 13,18.6 11,18.6H-11C-13,18.6 -14.4,17.2 -14.4,15.2Z', paper, stroke(ink, 1.2)));
  if (!p.tiny) out.push(path('M8.6,0.6H13.8V15.2C13.8,16.8 12.8,18 11,18H7.2C8.8,12.4 9.2,6 8.6,0.6Z', ink, ' fill-opacity="0.25"'));
  out.push(path('M-2.8,0H2.8V18.6H-2.8Z', ribbon, stroke(deep, 0.8)));
  // the lid, its top and the ribbon over it
  out.push(path(lid.d('M-16.6,-7.8L-13.6,-10.8L13.6,-10.8L16.6,-7.8Z'), '#d8b4ff', stroke(ink, 1)));
  out.push(path(lid.d('M-16.6,-7.8L16.6,-7.8L16.6,-3.6C16.6,-2.4 15.8,-1.6 14.6,-1.6L-14.6,-1.6C-15.8,-1.6 -16.6,-2.4 -16.6,-3.6Z'), paper, stroke(ink, 1.2)));
  out.push(path(lid.d('M-2.8,-7.8L2.8,-7.8L2.8,-1.6L-2.8,-1.6Z M-2.8,-7.8L-2.4,-10.8L2.4,-10.8L2.8,-7.8Z'), ribbon, stroke(deep, 0.8)));
  if (!p.tiny) {
    out.push(line(`${lid.d('M-14.8,-6.4L-5,-6.4')}M-12.4,2.6V14.6`, '#ffffff', 1.1, ' stroke-opacity="0.7"'));
  }
  // the bow: its tails, its two loops and the knot
  const tail = 'M-1.8,-9.6L-8.8,-2.2L-6,-2.8L-5.2,0L1,-8.2Z';
  out.push(path(lid.d(tail + mirror(tail)), ribbon, stroke(deep, 0.8)));
  const loop = 'M-0.6,-10.8C-3.6,-14.6 -9.4,-20 -14,-18.8C-17.8,-17.8 -17.4,-12.8 -13.6,-11.4C-10,-10.2 -4.6,-10.4 -0.6,-10.8Z';
  out.push(path(lid.d(loop + mirror(loop)), p.box([[0, '#ff8a9c'], [0.5, '#f0284e'], [1, '#a00a28']], 0.2, 0, 0.8, 1), stroke(deep, 1)));
  if (!p.tiny) {
    const fold = 'M-2.6,-11.8C-5.6,-14.6 -10,-17.4 -12.8,-16.6C-14.8,-16 -14.4,-13.6 -12.2,-12.8C-9.4,-12 -5.8,-11.8 -2.6,-11.8Z';
    out.push(path(lid.d(fold + mirror(fold)), deep, ' fill-opacity="0.45"'));
    out.push(path(lid.d('M-15.4,-14.4C-15.2,-16.8 -12.6,-17.8 -9.8,-16.8C-12,-16.8 -13.8,-15.8 -15.4,-14.4Z'), '#ffffff', ' fill-opacity="0.75"'));
  }
  out.push(path(lid.d('M-3.2,-13.6C-1.6,-14.6 1.6,-14.6 3.2,-13.6C3.8,-11.8 3.8,-9.6 3.2,-8.2C1.6,-7.4 -1.6,-7.4 -3.2,-8.2C-3.8,-9.6 -3.8,-11.8 -3.2,-13.6Z'), ribbon, stroke(deep, 1)));
  if (p.fine) out.push(path(`${glint(17.6, -1.6, 2.6)}${glint(-17.4, -14.6, 1.8)}${glint(13.6, -17.4, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** The host's lantern, lit for the guests: brass, its dome pierced with stars, a warm flame glowing in its glass and its light all round it. */
function lantern(p: Pen): string {
  const out: string[] = [];
  const ink = '#6a3a06';
  const brass = p.box([[0, '#fff0b0'], [0.35, '#f2c048'], [0.75, '#c27a12'], [1, '#8a4e08']], 0, 0, 1, 0);
  out.push(path(circ(0, 2, 20), p.round([[0, '#fff3b0', 0.8], [0.5, '#ffc94a', 0.3], [1, '#ffc94a', 0]], 0, 2, 20)));
  // the ring it hangs by, the dome and its rim
  out.push(line('M-3.2,-15.4C-3.4,-20.6 3.4,-20.6 3.2,-15.4', ink, 2.8));
  out.push(line('M-3.2,-15.4C-3.4,-20.6 3.4,-20.6 3.2,-15.4', '#ffd76a', 1.2));
  out.push(path('M-9.6,-9.6C-9.2,-13.2 -5,-15.8 0,-15.8C5,-15.8 9.2,-13.2 9.6,-9.6Z', brass, stroke(ink, 1.1)));
  // the glass, glowing, and the flame in it
  out.push(path('M-9.6,-6.8C-11.6,-1.6 -11.6,5 -9.2,10.4H9.2C11.6,5 11.6,-1.6 9.6,-6.8Z', p.round([[0, '#ffffff'], [0.25, '#fff3a0'], [0.65, '#ffb52e'], [1, '#e0700a']], 0, 3.4, 12.6), stroke('#8a4206', 0.9)));
  out.push(path('M0,-4.4C2.8,-1 4.6,2 4.6,4.8C4.6,7.6 2.6,9.4 0,9.4C-2.6,9.4 -4.6,7.6 -4.6,4.8C-4.6,2 -2.8,-1 0,-4.4Z', p.line([[0, '#ff4a1a'], [1, '#ffb02a']], 0, -4.4, 0, 9.4)));
  out.push(path('M0,0.6C1.4,2.4 2.4,4 2.4,5.6C2.4,7.2 1.4,8.2 0,8.2C-1.4,8.2 -2.4,7.2 -2.4,5.6C-2.4,4 -1.4,2.4 0,0.6Z', '#fffbe0'));
  // the frame's bars before the glass
  out.push(line('M-5.6,-6.8C-6.6,-1.6 -6.6,5 -5.4,10.4M5.6,-6.8C6.6,-1.6 6.6,5 5.4,10.4', ink, 1.8));
  if (!p.tiny) out.push(line('M-8.4,-4.4C-9.4,-0.6 -9.4,3.8 -8.2,7.8', '#ffffff', 1.1, ' stroke-opacity="0.85"'));
  // the rim, the base and its foot
  out.push(path('M-12.2,-10.6H12.2C13,-10.6 13.4,-10 13.4,-9.2V-8.2C13.4,-7.4 13,-6.8 12.2,-6.8H-12.2C-13,-6.8 -13.4,-7.4 -13.4,-8.2V-9.2C-13.4,-10 -13,-10.6 -12.2,-10.6Z', brass, stroke(ink, 1.1)));
  out.push(path('M-9.4,14.2H9.4L10.8,17.4C11,18.2 10.6,18.6 9.8,18.6H-9.8C-10.6,18.6 -11,18.2 -10.8,17.4Z', brass, stroke(ink, 1.1)));
  out.push(path('M-12.6,10.4H12.6C13.4,10.4 13.8,11 13.8,11.8V12.8C13.8,13.6 13.4,14.2 12.6,14.2H-12.6C-13.4,14.2 -13.8,13.6 -13.8,12.8V11.8C-13.8,11 -13.4,10.4 -12.6,10.4Z', brass, stroke(ink, 1.1)));
  out.push(path(circ(0, -16.2, 1.8), brass, stroke(ink, 0.9)));
  if (!p.tiny) {
    out.push(path(`${circ(-4.4, -11.8, 0.8)}${circ(0, -12.6, 0.9)}${circ(4.4, -11.8, 0.8)}`, '#5a2a04'));
    out.push(path('M-7.4,-10.4C-6.6,-12.8 -4,-14.4 -1.2,-14.8C-3.6,-13.6 -5.6,-12.2 -7.4,-10.4Z', '#ffffff', ' fill-opacity="0.8"'));
    out.push(line('M-11.6,-8.6H-4M-11.8,12.2H-4', '#ffffff', 0.8, ' stroke-opacity="0.8"'));
  }
  if (p.fine) out.push(path(`${glint(15.6, -12.6, 2.2)}${glint(-15.4, 4.6, 1.6)}${glint(14.6, 8.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** A letter to a friend: a pink envelope, its flap sealed with a heart pressed in red wax. */
function letter(p: Pen): string {
  const out: string[] = [];
  const ink = '#a8306a';
  out.push(path('M-16.2,-12.4H16.2C17.8,-12.4 18.8,-11.4 18.8,-9.8V10.2C18.8,11.8 17.8,12.8 16.2,12.8H-16.2C-17.8,12.8 -18.8,11.8 -18.8,10.2V-9.8C-18.8,-11.4 -17.8,-12.4 -16.2,-12.4Z', p.box([[0, '#fff0f6'], [0.5, '#ffbcd8'], [1, '#f088b4']], 0.2, 0, 0.8, 1), stroke(ink, 1.2)));
  if (!p.tiny) {
    // the folds of the lower flaps, and the flap's shadow on them
    out.push(line('M-17.8,11.8L-4.4,1.6M17.8,11.8L4.4,1.6', ink, 0.7, ' stroke-opacity="0.6"'));
    out.push(path('M-18,-10.6L-2.6,3C-1.2,4.2 1.2,4.2 2.6,3L18,-10.6V-7.4L2.8,5.8C1.2,7.2 -1.2,7.2 -2.8,5.8L-18,-7.4Z', ink, ' fill-opacity="0.25"'));
  }
  // the flap
  out.push(path('M-18.2,-11.2C-18.4,-11.8 -17.6,-12.4 -16.2,-12.4H16.2C17.6,-12.4 18.4,-11.8 18.2,-11.2L2.6,2.6C1.2,3.8 -1.2,3.8 -2.6,2.6Z', p.line([[0, '#fff8fb'], [1, '#ffb0d2']], 0, -12, 0, 3), stroke(ink, 0.9)));
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
  out.push(path(`${pts.join('')}${first}Z`, p.round([[0, '#ff9a9a'], [0.45, '#e0203c'], [1, '#8a0a22']], -2.6, 0.4, 9.6), stroke('#5a0414', 1)));
  if (!p.tiny) out.push(path(circ(0, 3, 4.8), '#a00c26', ' fill-opacity="0.55"'));
  const seal = mover(0, 3.3, 0.24);
  out.push(path(seal.d(HEART), '#ff4d68', stroke('#6a0618', 0.5)));
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
    if (!p.tiny) parts.push(line(f('M-15.4,-1.4C-14.6,-1.4 -14.6,1.4 -15.4,1.4M-9.6,1.2L4,0.8M-2,-1.2L10.6,-1.4'), bark, 0.6, ' stroke-opacity="0.6"'));
    if (!p.tiny) parts.push(line(f('M-12.6,-2.2L12.6,-2.2'), '#ffb04a', 0.9, ' stroke-opacity="0.8"'));
    return parts.join('');
  };
  // its glow, the log behind, the flames, and the log before them
  out.push(path(circ(0, -1, 20), p.round([[0, '#ffd27a', 0.7], [0.55, '#ff9a3a', 0.25], [1, '#ff9a3a', 0]], 0, -1, 20)));
  out.push(logs(mover(1.4, 13, 1, -17), false));
  out.push(path('M0,12C-8.2,12 -13.4,7.2 -13.4,0.8C-13.4,-4 -11.2,-7.8 -9.6,-11.8C-8.4,-8.4 -6.8,-6.2 -4.8,-5.4C-5.4,-11.4 -2.6,-16.4 1.4,-20C0.4,-15.2 2.6,-11.4 4.8,-8.8C6.6,-10.4 8.2,-12.4 8.8,-14.6C12,-10.4 13.4,-5.6 13.4,-0.8C13.4,6.6 8.2,12 0,12Z', p.line([[0, '#ff3a1a'], [0.5, '#ff6a1a'], [1, '#ffa42a']], 0, -20, 0, 12), stroke('#a81c0a', 1.2)));
  out.push(path('M0,12C-5.8,12 -9.4,8.4 -9.4,3.6C-9.4,-0.4 -7.4,-3.2 -5.8,-6.2C-5,-3.6 -3.8,-2 -2.4,-1.4C-2.8,-6.4 -0.6,-10.6 2.4,-13.6C1.8,-9.6 3.4,-6.4 5.4,-4.4C6.4,-5.4 7,-6.8 7.2,-8.2C8.8,-5.6 9.4,-2.4 9.4,1C9.4,7.6 5.6,12 0,12Z', p.line([[0, '#ff9a1a'], [1, '#ffd23a']], 0, -14, 0, 12)));
  out.push(path('M0,12C-3.8,12 -5.8,9.6 -5.8,6.4C-5.8,3 -3.4,0.2 -1.4,-3.4C-0.6,-0.6 1.2,1.2 2.6,2.4C3.4,1.6 3.8,0.4 3.8,-0.8C5.2,1.2 5.8,3.6 5.8,6C5.8,9.6 3.6,12 0,12Z', '#fff6c8'));
  out.push(logs(mover(-1.4, 13, 1, 17), true));
  // sparks flying up
  if (!p.tiny) out.push(path(`${circ(-11.6, -15.4, 1.1)}${circ(11.6, -18.2, 0.9)}${circ(15.6, -8.6, 0.8)}${circ(-15.8, -5.6, 0.7)}${circ(5.6, -19, 0.6)}`, '#ffe066', stroke('#e0500a', 0.4)));
  if (p.fine) out.push(path(`${glint(-6.6, -17.6, 1.6)}${glint(16.6, -14.6, 1.4)}${glint(-17.2, -12, 1.1)}`, '#ffffff'));
  return out.join('');
}

/** The day of the Kurdish language: a gold nib of a fountain pen, scrolls engraved on it and a heart for its breathing hole, a drop of blue ink falling from its point. */
function nib(p: Pen): string {
  const out: string[] = [];
  const deep = '#7a4a04';
  const gold = p.box([[0, '#fff6c6'], [0.4, '#ffcd3c'], [1, '#c27a0a']], 0, 0, 1, 0.3);
  // the pen's lacquered end and its gold ring
  out.push(path('M-6.2,-20H6.2C6.8,-20 7.2,-19.6 7.2,-19L7.6,-14.2H-7.6L-7.2,-19C-7.2,-19.6 -6.8,-20 -6.2,-20Z', p.box([[0, '#8a7cff'], [0.4, '#4a36c8'], [1, '#1e1260']], 0, 0, 1, 0), stroke('#140a40', 1.1)));
  out.push(path('M-8.2,-14.6H8.2V-11.6H-8.2Z', gold, stroke(deep, 1)));
  // the nib, its shaded half, its engraving, its heart and its slit
  out.push(path('M-7.4,-11.6H7.4C9.4,-8.6 10.2,-5.2 9.6,-2C8.8,2.4 4.6,6.6 0,11C-4.6,6.6 -8.8,2.4 -9.6,-2C-10.2,-5.2 -9.4,-8.6 -7.4,-11.6Z', gold, stroke(deep, 1.2)));
  if (!p.tiny) {
    out.push(path('M0,-11.6H7.4C9.4,-8.6 10.2,-5.2 9.6,-2C8.8,2.4 4.6,6.6 0,11Z', '#a8640a', ' fill-opacity="0.35"'));
    out.push(line('M-6.4,-9.6C-3.6,-8.6 -3,-5.6 -5.2,-4.4C-6.8,-3.6 -8,-5 -7,-6M6.4,-9.6C3.6,-8.6 3,-5.6 5.2,-4.4C6.8,-3.6 8,-5 7,-6', deep, 0.6, ' stroke-opacity="0.75"'));
    out.push(path('M-7.8,-9.4C-9,-6.4 -9,-3 -7.6,0.2C-6.6,2.4 -5,4.2 -3.2,6C-5.6,3.2 -7.2,0.4 -7.6,-2.6C-7.9,-5 -7.8,-7.2 -7.8,-9.4Z', '#ffffff', ' fill-opacity="0.7"'));
    out.push(line('M-5.2,-18.8L-5.6,-15.4', '#ffffff', 1, ' stroke-opacity="0.6"'));
  }
  out.push(path(mover(0, -1.4, 0.17).d(HEART), '#4a2604'));
  out.push(line('M0,1.4V10.4', '#4a2604', 0.8));
  // the drop of ink
  out.push(path('M0,12.6C1.6,14.8 3.8,16.2 3.8,18C3.8,19.8 2.1,20.6 0,20.6C-2.1,20.6 -3.8,19.8 -3.8,18C-3.8,16.2 -1.6,14.8 0,12.6Z', p.round([[0, '#cfe6ff'], [0.4, '#3f8cff'], [1, '#1b3fae']], -1.4, 16.4, 5.6), stroke('#0f1f6a', 0.9)));
  if (!p.tiny) out.push(path('M-2.4,18.2C-2.4,17 -1.6,15.8 -0.8,15.2C-1.2,16.2 -1.4,17.2 -1.2,18.4Z', '#ffffff', ' fill-opacity="0.85"'));
  if (p.fine) out.push(path(`${glint(13.6, -8.6, 2.4)}${glint(-13.6, 6.6, 1.6)}${glint(9.4, 14.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** The mother tongue: a white speech bubble, soft and round, with a red heart in it. */
function speech(p: Pen): string {
  const out: string[] = [];
  out.push(path('M0,-16.4C10.8,-16.4 19,-10 19,-2C19,6.2 10.8,12.4 0,12.4C-2.6,12.4 -5,12 -7.2,11.4C-9.4,14.4 -12.8,16.8 -16.6,18C-14.6,15.4 -13.4,12.4 -13.2,9.4C-17,6.8 -19,2.6 -19,-2C-19,-10 -10.8,-16.4 0,-16.4Z', p.round([[0, '#ffffff'], [0.55, '#f7f4ff'], [0.85, '#e4dcf4'], [1, '#cdbfe8']], -5, -8, 26), stroke('#4a2f5c', 1.3)));
  if (!p.tiny) {
    out.push(path('M18.2,-5.6C18.7,-4.4 19,-3.2 19,-2C19,6.2 10.8,12.4 0,12.4C-2.6,12.4 -5,12 -7.2,11.4C-5,11.2 -2.4,10.8 0,10.4C9.6,9 16.6,3.4 18.2,-5.6Z', '#b9a8dc', ' fill-opacity="0.6"'));
    out.push(path(ell(-6, -10.4, 8, 3.4), p.roundBox([[0, '#ffffff', 0.95], [1, '#ffffff', 0]])));
  }
  out.push(heart(p, 0, -1.6, 0.52, 0, RED));
  if (p.fine) out.push(path(`${glint(17.4, -15.6, 2.4)}${glint(-17.6, -13.6, 1.6)}${glint(12.6, 15.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** A burst of fireworks at (x, y): `count` streaks flying out to `r`, white-hot at its heart into its colour, each streak ending in a spark. */
function burst(p: Pen, x: number, y: number, r: number, count: number, turn: number, [hot, light, mid, ink]: Hue, sparks: boolean): string {
  const rays: string[] = [];
  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = ((turn + (i * 360) / count) * Math.PI) / 180;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const at = (d: number, side: number): string => `${n(x + c * d - s * side)},${n(y + s * d + c * side)}`;
    const w = r * 0.085;
    rays.push(`M${at(r * 0.22, 0)}L${at(r * 0.72, w)}Q${at(r * 0.92, w * 0.6)} ${at(r * 0.92, 0)}Q${at(r * 0.92, -w * 0.6)} ${at(r * 0.72, -w)}Z`);
    dots.push(circ(x + c * r * 1.08, y + s * r * 1.08, r * 0.07));
  }
  const out = [path(rays.join(''), p.round([[0, hot], [0.4, light], [1, mid]], x, y, r), stroke(ink, 0.5))];
  if (sparks && !p.tiny) out.push(path(dots.join(''), light));
  out.push(path(circ(x, y, r * 0.2), hot));
  return out.join('');
}

const GOLD_BURST: Hue = ['#ffffff', '#fff3a0', '#ffb21f', '#a85a06'];
const PINK_BURST: Hue = ['#ffffff', '#ffc2e6', '#ff3d9e', '#8a1056'];
const AQUA_BURST: Hue = ['#ffffff', '#c8f6ff', '#2fb8f0', '#0e4a8a'];

/** The new year: fireworks bursting, gold, pink and blue, the trails of their rockets fading below them. */
function fireworks(p: Pen): string {
  const out: string[] = [];
  if (!p.tiny) {
    out.push(line('M5.6,20C4.8,12 3.8,5 3,-2', p.line([[0, '#fff3a0', 0], [1, '#fff3a0', 0.9]], 0, 20, 0, -2), 1.4));
    out.push(line('M14.4,20C13.6,17 13,14.6 12.6,12', p.line([[0, '#c8f6ff', 0], [1, '#c8f6ff', 0.9]], 0, 20, 0, 12), 1.2));
  }
  out.push(burst(p, -10.4, -9.6, 8, 10, 8, PINK_BURST, false));
  out.push(burst(p, 12.6, 9.6, 7.4, 10, 0, AQUA_BURST, false));
  out.push(burst(p, 3, -3.6, 14.6, 14, -6, GOLD_BURST, true));
  if (p.fine) out.push(path(`${glint(-16.6, 6.6, 2)}${glint(17.6, -15.6, 1.8)}${glint(-4.6, 16.6, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** A thin crescent: the circle about (x, y) of radius `r` with the circle `cut`, moved by (dx, dy), taken out of it. */
function crescent(x: number, y: number, r: number, dx: number, dy: number, cut: number): string {
  // where the two circles meet
  const d = Math.hypot(dx, dy);
  const a = (r * r - cut * cut + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r * r - a * a));
  const [mx, my] = [x + (dx * a) / d, y + (dy * a) / d];
  const [p1, p2] = [`${n(mx + (h * dy) / d)},${n(my - (h * dx) / d)}`, `${n(mx - (h * dy) / d)},${n(my + (h * dx) / d)}`];
  return `M${p1}A${n(r)},${n(r)} 0 1 0 ${p2}A${n(cut)},${n(cut)} 0 0 1 ${p1}Z`;
}

/** Yalda, the longest night: a pomegranate broken open on its ruby seeds, under a crescent moon and a star. */
function pomegranate(p: Pen): string {
  const out: string[] = [];
  const ink = '#4e0616';
  // the moon and the star
  out.push(path(crescent(-13.2, -13.2, 5.6, 3, -2.2, 4.8), p.box([[0, '#fffbe0'], [0.6, '#ffe27a'], [1, '#e8a21c']]), stroke('#8a5206', 0.9)));
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = (-90 + i * 36) * (Math.PI / 180);
    const r = i % 2 === 0 ? 3.8 : 1.6;
    return `${n(14.8 + Math.cos(a) * r)},${n(-14.8 + Math.sin(a) * r)}`;
  });
  out.push(path(`M${star.join('L')}Z`, '#fff3a0', stroke('#8a5206', 0.7)));
  // the crown, then the fruit
  out.push(path('M-2.6,-8.4L-3,-12.6L-6.6,-15.4L-2,-14.8L1.4,-18.6L4.8,-14.8L9.4,-15.4L5.8,-12.6L5.4,-8.4Z', p.box([[0, '#ff8a7a'], [0.5, '#c8202e'], [1, '#6e0a1e']]), stroke(ink, 1)));
  out.push(path('M1.4,-9.4C9.8,-9.4 15.8,-3.2 15.8,4.6C15.8,12.6 9.6,18.8 1.4,18.8C-6.8,18.8 -13,12.6 -13,4.6C-13,-3.2 -7,-9.4 1.4,-9.4Z', p.round([[0, '#ffa08a'], [0.35, '#ec3a3a'], [0.75, '#b0122e'], [1, '#7a0a24']], -4.6, -3, 22), stroke(ink, 1.2)));
  if (!p.tiny) {
    out.push(path('M-12.4,8C-10.4,14 -4.6,18 1.4,18.2C-4.8,16.8 -9.6,13.2 -12.4,8Z', ink, ' fill-opacity="0.35"'));
    out.push(path('M-10.6,-0.4C-9.6,-4.6 -5.6,-7.6 -1,-8C-4.8,-6.2 -7.8,-3.6 -10.6,-0.4Z', '#ffffff', ' fill-opacity="0.75"'));
  }
  // where it is broken open: its pale pith, and the seeds packed in it
  out.push(path('M-2.8,2.6C0.6,-2.6 8.4,-3.8 12.6,0.4C15.8,3.6 15.6,9.8 11.6,13.6C7.6,17.2 0.6,17.2 -2.4,13C-4.6,9.8 -4.8,5.8 -2.8,2.6Z', p.box([[0, '#fff6e6'], [1, '#f2c4a0']]), stroke('#8a2a2a', 0.8)));
  out.push(path('M-1.2,3.4C1.8,-0.8 8.2,-1.8 11.6,1.6C14.2,4.4 14,9.4 10.8,12.4C7.4,15.4 1.6,15.4 -0.8,12C-2.6,9.4 -2.8,6 -1.2,3.4Z', '#6a0a22'));
  const seeds: [number, number][] = [[2.6, 2.4], [6.2, 1.4], [9.8, 2.2], [0.8, 6], [4.4, 5.4], [8, 5.2], [11.6, 5.8], [1.4, 9.8], [5, 9], [8.6, 9], [11.4, 9.8], [3.6, 12.8], [7.2, 12.6], [10, 12.6]];
  out.push(path(seeds.map(([x, y]) => circ(x, y, 1.9)).join(''), p.line([[0, '#ff4a6a'], [1, '#c00c34']], 0, 0, 0, 15), stroke('#5a0418', 0.4)));
  if (!p.tiny) out.push(path(seeds.map(([x, y]) => circ(x - 0.6, y - 0.6, 0.6)).join(''), '#ffffff', ' fill-opacity="0.9"'));
  if (p.fine) out.push(path(`${glint(-16.4, 6.6, 1.8)}${glint(-5.6, -16.6, 1.4)}${glint(17.6, -4.6, 1.2)}`, '#ffffff'));
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
