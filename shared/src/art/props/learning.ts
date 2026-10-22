/**
 * The pictures Hevalo shows on the learning badges' — a book open at its page, a speech bubble of words, a gold medal, the arrows of a review, a quill
 * in its ink, a compass, a dictionary, a bell and a pencil — drawn whole with the pen (pen.ts), in the style of the secrets (pictures.ts).
 */
import { circ, ell, glint, line, n, path, stroke } from '../pen.js';
import type { Pen, Picture } from '../pen.js';

const rad = (deg: number): number => (deg * Math.PI) / 180;
/** A point on a circle about cx,cy at `a` degrees, 0 to the right and turning clockwise. */
const on = (cx: number, cy: number, r: number, a: number): string => `${n(cx + Math.cos(rad(a)) * r)},${n(cy + Math.sin(rad(a)) * r)}`;
/** A star of `k` points about cx,cy, its first straight up, as a path. */
const star = (cx: number, cy: number, outer: number, inner: number, k = 5): string =>
  `M${Array.from({ length: k * 2 }, (_, i) => on(cx, cy, i % 2 === 0 ? outer : inner, -90 + (i * 180) / k)).join('L')}Z`;
/** A path drawn upright, turned `deg` degrees about 0,0 and moved to dx,dy: for a path of points only (M, L, C, Q, Z). */
const turned = (d: string, deg: number, dx: number, dy: number): string => {
  const [c, s] = [Math.cos(rad(deg)), Math.sin(rad(deg))];
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${n(+x * c - +y * s + dx)},${n(+x * s + +y * c + dy)}`);
};
/** A path's mirror image across the middle line. */
const mirror = (d: string): string => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${n(-x)},${y}`);

/** Lessons: a book lying open, its pages fanned, a red ribbon marking the place and a light rising off its pages. */
function book(p: Pen): string {
  const out: string[] = [];
  const ink = '#1b2f6e';
  const paper = '#9a7440';
  // the light rising off the pages
  out.push(path(ell(0, -9, 12, 10), p.round([[0, '#ffffff'], [0.3, '#fff6c8', 0.75], [1, '#fff6c8', 0]], 0, -8, 12)));
  // the cover, its edge showing round the pages
  out.push(path('M-20.2,-7V13.6C-13.2,12 -5.4,13 0,17.2C5.4,13 13.2,12 20.2,13.6V-7L0,-2Z', p.line([[0, '#7fb0ff'], [0.5, '#2f62d8'], [1, '#183c9e']], 0, -7, 0, 17), stroke(ink, 1.2)));
  // the ribbon, out from under the right page
  out.push(path('M6.2,8.6V19.6L8.6,17.4L11,19.6V8.2Z', p.box([[0, '#ff8a9a'], [0.5, '#ff2d55'], [1, '#a8102e']], 0, 0, 1, 0), stroke('#6a0818', 0.8)));
  // the fan of pages beneath, then the two lying open
  out.push(path('M0,-5.6C-4,-9.8 -11.4,-11.2 -18.4,-9V10.8C-12.4,9.6 -5,10.6 0,14.4C5,10.6 12.4,9.6 18.4,10.8V-9C11.4,-11.2 4,-9.8 0,-5.6Z', p.line([[0, '#fff6df'], [1, '#dcc08a']], 0, -6, 0, 14), stroke(paper, 1)));
  if (!p.tiny) out.push(line('M-17.6,9.2C-11.6,8.2 -4.8,9.2 0,12.6C4.8,9.2 11.6,8.2 17.6,9.2M-18,10C-12,9 -4.8,10 0,13.5C4.8,10 12,9 18,10', paper, 0.45, ' stroke-opacity="0.7"'));
  const left = 'M0,-6C-4,-10.4 -11.4,-11.8 -17.4,-10V8.2C-11.4,7 -4.6,8 0,11.6Z';
  out.push(path(left + mirror(left), p.line([[0, '#fffdf5'], [0.5, '#fbf0d6'], [1, '#e9d3a6']], -12, -10, 14, 12), stroke(paper, 0.9)));
  if (!p.tiny) {
    // the light on them, brightest at the fold
    out.push(path(ell(0, -3, 11, 9), p.round([[0, '#ffffff', 0.95], [1, '#ffffff', 0]], 0, -4, 11)));
    // the shade of the fold, and the lines of words on each page
    out.push(path('M0,-6C-1.4,-7.4 -2.8,-8.2 -4.2,-8.8V9C-2.6,9.6 -1.2,10.4 0,11.6C1.2,10.4 2.6,9.6 4.2,9V-8.8C2.8,-8.2 1.4,-7.4 0,-6Z', p.box([[0, '#c8a46a', 0], [0.5, '#c8a46a', 0.8], [1, '#c8a46a', 0]], 0, 0, 1, 0)));
    const words = 'M-15,-6.8C-11.6,-8 -8,-7.8 -5,-6.2M-15,-2.8C-11.6,-4 -8,-3.8 -5,-2.2M-15,1.2C-11.6,0 -8,0.2 -5,1.8M-15,5.2C-12.6,4.4 -10.4,4.4 -8.6,4.8';
    out.push(line(words + mirror(words), '#8f9cc8', 1, ' stroke-dasharray="3.4 1.6 1.8 1.6"'));
  }
  out.push(line('M0,-6V11.6', paper, 0.8));
  if (p.fine) out.push(path(`${glint(-10.6, -15.4, 1.8)}${glint(11.4, -16.2, 1.4)}${glint(1.4, -12.6, 1.1)}`, '#ffffff'));
  return out.join('');
}

/** My words: a speech bubble glossy as a sweet, lines of words in three colours in it and a gold sparkle at its corner. */
function bubble(p: Pen): string {
  const out: string[] = [];
  const ink = '#1d4fa8';
  const shape = 'M-12,-16H12C16.4,-16 19,-13.4 19,-9V1.6C19,6 16.4,8.6 12,8.6H-1L-10.2,16.4C-11,17 -11.8,16.4 -11.5,15.6L-9,8.6H-12C-16.4,8.6 -19,6 -19,1.6V-9C-19,-13.4 -16.4,-16 -12,-16Z';
  // its depth below it, then the bubble
  out.push(path(shape, '#3f72dc', `${stroke(ink, 1.3)} transform="translate(0 1.8)"`));
  out.push(path(shape, p.round([[0, '#ffffff'], [0.5, '#f2f7ff'], [0.8, '#cfe0fb'], [1, '#9dbcf0']], -8, -11, 30), stroke(ink, 1.3)));
  if (!p.tiny) {
    // its shade along the foot, and the gloss across its top
    out.push(path('M17.4,0.6C17.2,4.6 15,7 11.4,7H-11.4C-14.6,7 -16.6,5.4 -17.2,2.6C-13,4.6 12,4.6 17.4,0.6Z', '#8fb0ea', ' fill-opacity="0.45"'));
    out.push(path('M-16.6,-6.4C-16.6,-11.4 -14.4,-13.6 -10,-13.6H9C2,-12.6 -10,-10.6 -16.6,-6.4Z', '#ffffff'));
  }
  // the words, a light along each
  const words: [string, string, string, string][] = [
    ['M-12.4,-7.4H-3.6M0.4,-7.4H7.4', 'M-11.8,-8H-4.4M1,-8H6.6', '#3f7df0', '#b4d0ff'],
    ['M-12.4,-1.6H-7.4M-3.4,-1.6H11.6', 'M-11.8,-2.2H-8.2M-2.8,-2.2H10.8', '#ff5c9a', '#ffc6dc'],
    ['M-12.4,4.2H2', 'M-11.8,3.6H1.2', '#8a5cf0', '#d4c0ff'],
  ];
  for (const [d, lit, colour, light] of words) {
    out.push(line(d, colour, 2.8));
    if (!p.tiny) out.push(line(lit, light, 0.8));
  }
  // the sparkle
  out.push(path(glint(14.4, -14.4, 5.6), p.round([[0, '#fffbe0'], [0.5, '#ffd84a'], [1, '#f0a10c']], 13, -16, 6), stroke('#9a5a06', 0.8)));
  if (p.fine) out.push(path(`${glint(-17, 12.6, 1.6)}${glint(7.4, 13.4, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** Flawless: a gold medal with a star raised on its face, hung on a ribbon of red and white. */
function medal(p: Pen): string {
  const out: string[] = [];
  const ink = '#7a4a04';
  const red = p.box([[0, '#ff7a8a'], [0.55, '#e8243f'], [1, '#9a0e2a']]);
  // the ribbon's two ends crossing down to it, the right one behind
  out.push(path('M15.4,-20H7.4L-3.4,-4.6H4.6Z', red, stroke('#6a0818', 1)));
  out.push(path('M10.3,-20H12.5L1.7,-4.6H-0.5Z', '#e6dce8'));
  out.push(path('M-15.4,-20H-7.4L3.4,-4.6H-4.6Z', red, stroke('#6a0818', 1)));
  out.push(path('M-12.5,-20H-10.3L0.5,-4.6H-1.7Z', '#ffffff'));
  // the loop, the medal and its face sunk inside the rim
  const gold = p.round([[0, '#fffbe0'], [0.4, '#ffd84a'], [0.8, '#f0a10c'], [1, '#c27a0a']], -4, 0, 20);
  out.push(path('M-4.2,-7.8H4.2Q5.4,-7.8 5.4,-6.6V-4.4Q5.4,-3.2 4.2,-3.2H-4.2Q-5.4,-3.2 -5.4,-4.4V-6.6Q-5.4,-7.8 -4.2,-7.8Z', gold, stroke(ink, 0.9)));
  out.push(path(circ(0, 6.6, 13), gold, stroke(ink, 1.2)));
  if (!p.tiny) out.push(line(circ(0, 6.6, 11.4), '#fff3a0', 1, ' stroke-dasharray="0 2.2"'));
  out.push(path(circ(0, 6.6, 9.8), p.round([[0, '#e8950c'], [0.6, '#ffc93a'], [1, '#fff3a0']], -3, 3.6, 14), stroke(ink, 0.8)));
  // the star, raised: a darker facet on each point's far side
  out.push(path(star(0, 7, 7.8, 3.3), p.round([[0, '#fffbe0'], [0.55, '#ffd84a'], [1, '#f0a10c']], -2, 4, 9), stroke(ink, 0.9)));
  if (!p.tiny) {
    const tips = Array.from({ length: 5 }, (_, i) => `M0,7L${on(0, 7, 7.8, -90 + i * 72)}L${on(0, 7, 3.3, -54 + i * 72)}Z`).join('');
    out.push(path(tips, '#c27a0a', ' fill-opacity="0.4"'));
    out.push(path('M-11.4,2C-10.4,-2.4 -6.6,-5.4 -2.4,-6C-6,-4.4 -9,-1.6 -11.4,2Z', '#ffffff', ' fill-opacity="0.85"'));
  }
  if (p.fine) out.push(path(`${glint(10.6, -2.6, 2.2)}${glint(-12.4, 16.4, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** Review: two green arrows chasing each other round, glossy as glass, a light shining in the middle of them. */
function arrows(p: Pen): string {
  const out: string[] = [];
  const ink = '#125a2c';
  const [R, w, h, ahead] = [12.2, 3.6, 7.2, 34];
  // a band round the circle from a0 to a1, its head beyond a1, a notch cut in its tail
  const arrow = (a0: number, a1: number): string =>
    `M${on(0, 0, R + w, a0)}A${n(R + w)},${n(R + w)} 0 0 1 ${on(0, 0, R + w, a1)}L${on(0, 0, R + h, a1)}L${on(0, 0, R, a1 + ahead)}L${on(0, 0, R - h, a1)}L${on(0, 0, R - w, a1)}` +
    `A${n(R - w)},${n(R - w)} 0 0 0 ${on(0, 0, R - w, a0)}L${on(0, 0, R, a0 + 8)}Z`;
  const glow = p.round([[0, '#ffffff'], [0.3, '#fff6b0', 0.9], [1, '#c8ff9a', 0]], 0, 0, 7.6);
  out.push(path(circ(0, 0, 7.6), glow));
  const green = p.line([[0, '#d0ffa0'], [0.45, '#45c860'], [1, '#137a3a']], -12, -14, 12, 16);
  out.push(path(arrow(192, 312) + arrow(12, 132), green, stroke(ink, 1.2)));
  if (!p.tiny) {
    const arc = (r: number, a0: number, a1: number): string => `M${on(0, 0, r, a0)}A${n(r)},${n(r)} 0 0 1 ${on(0, 0, r, a1)}`;
    out.push(line(arc(R - w + 1, 206, 318) + arc(R + w - 1, 26, 138), ink, 1.4, ' stroke-opacity="0.3"'));
    out.push(line(arc(R + 1, 200, 296), '#ffffff', 1.4, ' stroke-opacity="0.85"'));
    out.push(line(arc(R + 1, 22, 118), '#ffffff', 1, ' stroke-opacity="0.45"'));
    out.push(path(glint(0, 0, 4), '#ffffff'));
  }
  if (p.fine) out.push(path(`${glint(-15.6, -15.6, 1.8)}${glint(16.4, 14.4, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** Storyteller: a white quill feather dipped in its little pot of ink. */
function quill(p: Pen): string {
  const out: string[] = [];
  const glassInk = '#141a4a';
  const goldInk = '#6a3a04';
  const gold = p.box([[0, '#fff3a0'], [0.5, '#f2b52a'], [1, '#a8640a']], 0, 0, 1, 0);
  // the pot of blue glass, its gold collar and the ink in its mouth
  out.push(path('M-11,6.2C-16.4,8 -18,12 -17.4,15.2C-16.6,18.8 -12,20.2 -5.4,20.2C1.2,20.2 5.8,18.8 6.6,15.2C7.2,12 5.6,8 0.2,6.2Z', p.round([[0, '#8fa8ff'], [0.4, '#3d55c8'], [1, '#141c58']], -11, 10, 16), stroke(glassInk, 1.2)));
  if (!p.tiny) out.push(path('M-15,13.2C-14.8,10.4 -13.2,8.6 -10.6,7.8C-12.4,9.6 -13.4,11.2 -13.8,13.6Z', '#ffffff', ' fill-opacity="0.8"'));
  out.push(path('M-10.8,3.2H0V6.6H-10.8Z', gold, stroke(goldInk, 0.9)));
  out.push(path(ell(-5.4, 3.2, 6.4, 2), gold, stroke(goldInk, 0.9)));
  out.push(path(ell(-5.4, 3.1, 4.6, 1.2), '#0e1238'));
  // the quill, leaning out of it
  const at = (d: string): string => turned(d, 30, -5.4, 3.2);
  const vane = 'M0,-2C-4,-4.4 -7.4,-9 -7.6,-13.6L-5.2,-13.6L-7.6,-16C-7.4,-20.8 -3.8,-24.8 2.2,-26.8C4,-23.2 4.6,-19.6 4,-16.4L2.4,-15.8L3.6,-14.4C2.8,-9.4 1.8,-5.4 0,-2Z';
  out.push(path(at(vane), p.box([[0, '#ffffff'], [0.6, '#f0ecff'], [1, '#bfb2e6']], 0, 0, 1, 1), stroke('#4a3a7a', 1.1)));
  if (!p.tiny) out.push(line(at('M-0.4,-7L-5,-10.6M-0.2,-11.4L-5.6,-15.4M0.4,-18L-4.4,-22.2M0.4,-9L3,-12.2M1,-19L3.8,-21.8'), '#b9addf', 0.6));
  const shaft = at('M0,1C-0.2,-8 0.2,-17 2,-25.4');
  out.push(line(shaft, '#4a3a7a', 1.8));
  out.push(line(shaft, '#f4ead6', 0.8));
  if (p.fine) out.push(path(`${glint(12.6, 6.4, 1.6)}${glint(-15.4, -2.4, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** Traveller: a brass compass on its ring, the needle red and white under the glass. */
function compass(p: Pen): string {
  const out: string[] = [];
  const ink = '#5a3606';
  const brass = p.round([[0, '#fff3c4'], [0.4, '#f2c24e'], [0.8, '#c9871e'], [1, '#8a5410']], -6, -6, 26);
  // the ring it hangs by, its knob, the case
  out.push(line(circ(0, -16.4, 2.8), ink, 3.4));
  out.push(line(circ(0, -16.4, 2.8), '#f2c24e', 1.6));
  out.push(path('M-3,-14.6H3V-11.6H-3Z', brass, stroke(ink, 0.9)));
  out.push(path(circ(0, 3, 16.4), brass, stroke(ink, 1.2)));
  if (!p.tiny) out.push(line(circ(0, 3, 14.6), ink, 0.6, ' stroke-opacity="0.5"'));
  // the dial, and the rose on it
  out.push(path(circ(0, 3, 12.8), p.round([[0, '#ffffff'], [0.7, '#fbf3df'], [1, '#e0cca0']], -3, -1, 15), stroke(ink, 0.9)));
  if (!p.tiny) {
    out.push(path(star(0, 3, 10.6, 2, 4), '#d6e2f2'));
    out.push(path('M0,-9.2L1.4,-7H-1.4Z', '#e8243f'));
  }
  // the needle: red to the north, white to the south, each half lit on one side
  const at = (d: string): string => turned(d, 40, 0, 3);
  out.push(path(at('M0,-10.6L-2.6,0L0,0Z'), '#ff6a7e'));
  out.push(path(at('M0,-10.6L2.6,0L0,0Z'), '#c8143a'));
  out.push(path(at('M0,10.6L-2.6,0L0,0Z'), '#ffffff'));
  out.push(path(at('M0,10.6L2.6,0L0,0Z'), '#c3c8dc'));
  out.push(path(at('M0,-10.6L2.6,0L0,10.6L-2.6,0Z'), 'none', stroke('#3a1a10', 0.8)));
  out.push(path(circ(0, 3, 1.8), brass, stroke(ink, 0.7)));
  // the glass over it
  if (!p.tiny) {
    out.push(path('M-10.6,-0.4C-9,-5 -4.6,-7.6 0.4,-7.6C-4,-6 -7.6,-3.6 -10.6,-0.4Z', '#ffffff', ' fill-opacity="0.85"'));
    out.push(line('M10.2,6.4C9.4,9.6 7.2,12 4.2,13.2', '#ffffff', 0.9, ' stroke-opacity="0.6"'));
  }
  if (p.fine) out.push(path(`${glint(-12.6, -9.4, 1.8)}${glint(13.4, 15.4, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** The Ê on the dictionary's cover, as the icons draw it (icons.ts): its stem and arms, and its hat. */
const E_HAT = 'M5,-2.5H-2.5V9.5H5M-2.5,3.5H3.5M-1.2,-5L0.8,-7.6L2.8,-5';

/** Dictionary: a thick red dictionary standing a little turned, a gold Ê on its cover and coloured tabs along its pages. */
function dictionary(p: Pen): string {
  const out: string[] = [];
  const ink = '#5a0a14';
  const paper = '#9a7440';
  // the back cover, its edge round the pages
  out.push(path('M-16,-12.4L-8.4,-18.6H13.8V12.8L6,19.2H-16Z', '#a8182c', stroke(ink, 1.2)));
  // the tabs, out of the pages' edge
  const tab = (y: number, fill: string, edge: string): string => path(`M10,${n(y)}H15.4Q16.6,${n(y)} 16.6,${n(y + 1.2)}V${n(y + 3.4)}Q16.6,${n(y + 4.6)} 15.4,${n(y + 4.6)}H10Z`, fill, stroke(edge, 0.8));
  out.push(tab(-12.4, '#ffd84a', '#8a5206'), tab(-5.4, '#5fd36a', '#14612f'), tab(1.6, '#5fb0ff', '#173f7a'));
  // the block of pages: its top and its edge
  out.push(path('M-15,-12.4L-8,-17.2H12.4V12.4L5,18.4V-12.4Z', p.line([[0, '#fffaf0'], [1, '#e2c99a']], 0, -17, 12, 18), stroke(paper, 0.8)));
  if (!p.tiny) out.push(line('M5.6,-12.8L12.4,-17.2M7.4,-13.6V17.6M9.4,-15V16M-11,-15H8.6', paper, 0.5, ' stroke-opacity="0.6"'));
  // the front cover, its spine to the left
  out.push(path('M-16,-12.4H4.6Q6.2,-12.4 6.2,-10.8V17.6Q6.2,19.2 4.6,19.2H-16Q-17.8,19.2 -17.8,17.4V-10.6Q-17.8,-12.4 -16,-12.4Z', p.round([[0, '#ff8a80'], [0.45, '#e8303c'], [1, '#961226']], -12, -8, 30), stroke(ink, 1.2)));
  out.push(line('M-14,-12V18.8', ink, 0.8, ' stroke-opacity="0.6"'));
  if (!p.tiny) out.push(line('M-16.2,-10.2V17.4', '#ffffff', 0.8, ' stroke-opacity="0.5"'));
  const gold = p.line([[0, '#fff3a0'], [0.5, '#ffc21f'], [1, '#c27a0a']], 0, -8, 0, 14);
  if (!p.tiny) out.push(line('M-11.2,-8.4H3.4V15.2H-11.2Z', gold, 0.8));
  // the Ê, in gold, edged deep
  const tf = ' transform="translate(-5.1 2.5) scale(0.95)"';
  out.push(line(E_HAT, '#5a2a04', 4, tf));
  out.push(line(E_HAT, gold, 2.4, tf));
  if (!p.tiny) out.push(path('M-16.2,-3.4V-9.8Q-16.2,-11 -15,-11H-6.4C-10.6,-9.6 -13.8,-7 -16.2,-3.4Z', '#ffffff', ' fill-opacity="0.45"'));
  if (p.fine) out.push(path(`${glint(15.4, -17.6, 1.8)}${glint(-17.6, 15.4, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** Bell, for listening and speaking: a golden bell ringing, a pink bow tied at its top. */
function bell(p: Pen): string {
  const out: string[] = [];
  const ink = '#7a4404';
  const gold = p.round([[0, '#fffbe0'], [0.35, '#ffe066'], [0.75, '#f2a516'], [1, '#b8700a']], -4, -5, 22);
  // the ringing
  const rings = 'M-12.6,-9.4C-15.2,-7.4 -16,-3.8 -15,-0.8M-16.2,-12.6C-19.8,-9.2 -20.6,-3.8 -18.8,0.2';
  out.push(line(rings + mirror(rings), ink, 3.6));
  out.push(line(rings + mirror(rings), '#fff3a0', 1.8));
  // the clapper, the bell and its lip
  out.push(path(circ(0, 15.4, 3), gold, stroke(ink, 1)));
  out.push(path('M0,-11.6C5.6,-11.6 8.6,-7.6 9.2,-1.6C9.8,4.6 11.4,8 15,10.4V12H-15V10.4C-11.4,8 -9.8,4.6 -9.2,-1.6C-8.6,-7.6 -5.6,-11.6 0,-11.6Z', gold, stroke(ink, 1.2)));
  if (!p.tiny) {
    out.push(path('M4.8,-9.6C8,-7 8.8,-3 9.2,1.6C9.8,6.6 11.6,9 14.4,10.6H10C7,8 6.6,4 6.4,-0.6C6.2,-4.6 5.8,-7.4 4.8,-9.6Z', '#c27a0a', ' fill-opacity="0.45"'));
    out.push(path('M-6,-4.4C-5.6,-8 -3.6,-10 -1,-10.4C-3,-8.4 -4,-6 -4.2,-3L-4.8,5.2C-5.6,2 -6.2,-1.4 -6,-4.4Z', '#ffffff', ' fill-opacity="0.85"'));
  }
  if (!p.tiny) out.push(line('M-10.4,5.4C-4,7.2 4,7.2 10.4,5.4', ink, 0.7, ' stroke-opacity="0.5"'));
  out.push(path('M-15.4,9.6H15.4C17.6,9.6 17.6,13.8 15.4,13.8H-15.4C-17.6,13.8 -17.6,9.6 -15.4,9.6Z', gold, stroke(ink, 1.1)));
  if (!p.tiny) out.push(line('M-14.6,11H6', '#ffffff', 0.8, ' stroke-opacity="0.7"'));
  // the bow: its loops, its tails and its knot
  const pink = p.box([[0, '#ffd0e2'], [0.55, '#ff6f9e'], [1, '#c8285e']]);
  const bowInk = '#8a1440';
  const loop = 'M-0.6,-13C-4,-18.8 -11.4,-19.8 -10.8,-15.2C-10.4,-11.8 -4.6,-11.6 -0.6,-13Z';
  const tail = 'M-1.2,-12.2L-6,-5.4L-3.4,-6L-2,-3.8L0.4,-11.6Z';
  out.push(path(tail + mirror(tail), pink, stroke(bowInk, 0.8)));
  out.push(path(loop + mirror(loop), pink, stroke(bowInk, 0.9)));
  out.push(path(ell(0, -12.8, 2.4, 2.2), pink, stroke(bowInk, 0.9)));
  if (p.fine) out.push(path(`${glint(-13.4, 16.4, 1.6)}${glint(12.6, -14.6, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** Pen, for answers written out: a yellow pencil writing a wavy blue line. */
function pencil(p: Pen): string {
  const out: string[] = [];
  const ink = '#6a3a04';
  // the line written
  const wave = 'M-19.4,14C-17.8,9.8 -15,9.8 -13.8,13C-12.6,16.2 -9,17 -6.2,15.4';
  out.push(line(wave, '#173f7a', 3.8));
  out.push(line(wave, '#3f8cff', 2.2));
  // the pencil, leaning on its point
  const at = (d: string): string => turned(d, 34, 4.4, -0.4);
  out.push(path(at('M-5.6,5.4L0,19.4L5.6,5.4Z'), '#ffd9a6', stroke(ink, 0.9)));
  out.push(path(at('M-2.4,13.2L0,19.4L2.4,13.2Q0,14.4 -2.4,13.2Z'), '#4a4658'));
  out.push(path(at('M-5.6,-10.4L-1.9,-10.4L-1.9,7.8Q-3.75,4.8 -5.6,7.2Z'), '#ffe45c'));
  out.push(path(at('M-1.9,-10.4L1.9,-10.4L1.9,7.8Q0,5 -1.9,7.8Z'), '#ffc21f'));
  out.push(path(at('M1.9,-10.4L5.6,-10.4L5.6,7.2Q3.75,4.8 1.9,7.8Z'), '#f09a0c'));
  out.push(path(at('M-5.2,-16.6L-5.2,-18C-5.2,-19.8 -4,-21 -2.2,-21L2.2,-21C4,-21 5.2,-19.8 5.2,-18L5.2,-16.6Z'), '#ff7aa8', stroke('#8a1a4a', 0.9)));
  out.push(path(at('M-5.6,-16.8L5.6,-16.8L5.6,-10.4L-5.6,-10.4Z'), '#c6cbe0', stroke('#3a4060', 0.9)));
  if (!p.tiny) {
    out.push(line(at('M-5.6,-14.6L5.6,-14.6M-5.6,-12.6L5.6,-12.6'), '#3a4060', 0.6));
    out.push(line(at('M-3.8,-8.6L-3.8,4.4'), '#ffffff', 1.1, ' stroke-opacity="0.85"'));
  }
  out.push(path(at('M0,19.4L-5.6,5.4L-5.6,-10.4L5.6,-10.4L5.6,5.4Z'), 'none', stroke(ink, 1.2)));
  if (p.fine) out.push(path(`${glint(-14.6, -6.6, 1.8)}${glint(-6.6, -13.4, 1.2)}`, '#ffffff'));
  return out.join('');
}

export const LEARNING: Readonly<Record<string, Picture>> = {
  ders: book,
  'peyven-min': bubble,
  bekemasi: medal,
  dubare: arrows,
  cirokbej: quill,
  rewi: compass,
  ferheng: dictionary,
  zengil: bell,
  penus: pencil,
};
