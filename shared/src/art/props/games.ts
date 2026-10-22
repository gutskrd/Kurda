/**
 * The pictures Hevalo shows on the games badges' — letter tiles, a tembûr, a key pressed fast, a scroll written without a slip, headphones, a pinwheel, a golden heart, a puzzle piece and a nightingale — drawn whole with the pen
 * (pen.ts), in the style of the secrets (pictures.ts).
 */
import { circ, glint, line, n, path, stroke } from '../pen.js';
import type { Pen, Picture } from '../pen.js';

// ─────────────────────────────────────────────────────────────── helpers

/** Every point of a path written with M, L, C, Q and Z, scaled by kx, ky (a negative kx mirrors it), turned `deg` degrees about 0,0 and then moved by dx, dy. */
function turn(d: string, deg: number, dx = 0, dy = 0, kx = 1, ky = Math.abs(kx)): string {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => {
    const [u, v] = [Number(x) * kx, Number(y) * ky];
    return `${n(u * c - v * s + dx)},${n(u * s + v * c + dy)}`;
  });
}

/** A box with rounded corners, written so that it can be turned. */
const rr = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${n(x + r)},${n(y)}L${n(x + w - r)},${n(y)}Q${n(x + w)},${n(y)} ${n(x + w)},${n(y + r)}` +
  `L${n(x + w)},${n(y + h - r)}Q${n(x + w)},${n(y + h)} ${n(x + w - r)},${n(y + h)}` +
  `L${n(x + r)},${n(y + h)}Q${n(x)},${n(y + h)} ${n(x)},${n(y + h - r)}` +
  `L${n(x)},${n(y + r)}Q${n(x)},${n(y)} ${n(x + r)},${n(y)}Z`;

/** An ellipse of four curves, written so that it can be turned. */
function oval(cx: number, cy: number, rx: number, ry: number): string {
  const [kx, ky] = [rx * 0.552, ry * 0.552];
  return (
    `M${n(cx - rx)},${n(cy)}C${n(cx - rx)},${n(cy - ky)} ${n(cx - kx)},${n(cy - ry)} ${n(cx)},${n(cy - ry)}` +
    `C${n(cx + kx)},${n(cy - ry)} ${n(cx + rx)},${n(cy - ky)} ${n(cx + rx)},${n(cy)}` +
    `C${n(cx + rx)},${n(cy + ky)} ${n(cx + kx)},${n(cy + ry)} ${n(cx)},${n(cy + ry)}` +
    `C${n(cx - kx)},${n(cy + ry)} ${n(cx - rx)},${n(cy + ky)} ${n(cx - rx)},${n(cy)}Z`
  );
}

// ─────────────────────────────────────────────────────────────── the pictures

/** Word battles won: four glossy letter tiles, K, E, V and A, one white, one gold and two green, set close together in a square. */
function letterTiles(p: Pen): string {
  const out: string[] = [];
  const green = p.box([[0, '#d4ffa8'], [0.5, '#5fcf5a'], [1, '#2a9446']]);
  // where each tile lies and how it is turned, its letter, its face, its depth and the deep tone round it
  const tiles: [number, number, number, string, string, string, string][] = [
    [-9.6, -9.4, -4, 'M-3.4,-6L-3.4,3.2M-3.4,-0.8L3.6,-6M-1.2,-2.3L3.6,3.2', p.box([[0, '#ffffff'], [0.55, '#f4f0fc'], [1, '#cdc2ea']]), '#a796d2', '#3d2f6b'],
    [9.8, -9.8, 3, 'M3.4,-6L-3.2,-6L-3.2,3.2L3.4,3.2M-3.2,-1.4L2.2,-1.4', p.box([[0, '#fff6c4'], [0.5, '#ffd23f'], [1, '#f0a10c']]), '#c27a0a', '#6e3e04'],
    [-9.8, 9.6, 2, 'M-4,-6L0,3.2L4,-6', green, '#1f7a3a', '#11502a'],
    [9.6, 9.4, -3, 'M-4,3.2L0,-6L4,3.2M-2.5,0L2.5,0', green, '#1f7a3a', '#11502a'],
  ];
  const gloss: string[] = [];
  const [k = '', e = '', v = '', a = ''] = tiles.map(([x, y, deg, letter, face, side, ink]) => {
    // the tile's depth below its face, then the face, and the light along its top
    out.push(path(turn(rr(-8.2, -8.4, 16.4, 16.8, 3.4), deg, x, y), side, stroke(ink, 1.2)));
    out.push(path(turn(rr(-8.2, -8.4, 16.4, 14, 3.4), deg, x, y), face));
    gloss.push(turn('M-6.6,-2.4C-6.8,-5.6 -5.8,-6.9 -3.2,-6.9L3.6,-6.9C-0.8,-6 -4.4,-4.8 -6.6,-2.4Z', deg, x, y));
    return turn(letter, deg, x, y);
  });
  if (!p.tiny) out.push(path(gloss.join(''), '#ffffff', ' fill-opacity="0.75"'));
  // the letters: dark on the white and the gold, white over their shadow on the green
  out.push(line(k, '#3d2f6b', 2.5));
  out.push(line(e, '#7a4504', 2.5));
  if (!p.tiny) out.push(line(turn(v + a, 0, 0, 0.7), '#11502a', 2.5, ' stroke-opacity="0.8"'));
  out.push(line(v + a, '#ffffff', 2.5));
  if (p.fine) out.push(path(`${glint(-17.6, -18, 1.8)}${glint(18.6, -1.4, 1.3)}`, '#ffffff'));
  return out.join('');
}

/** Rhymes matched: a tembûr, the long-necked lute, its pear-shaped body of mulberry wood with a sound hole, its long fretted neck and the pegs at its head. */
function tembur(p: Pen): string {
  const out: string[] = [];
  const ink = '#4a2008';
  const at = (d: string): string => turn(d, 36, 1, -0.4);
  const peg = (y: number, side: number): string => turn('M-1.8,-0.4L-3.4,-0.45C-4,-1.35 -7,-1.4 -7,0C-7,1.4 -4,1.35 -3.4,0.45L-1.8,0.4Z', 0, 0, y, side);
  // the pegs at its head, and the head
  const pegs = peg(-18.2, 1) + peg(-19.8, -1) + peg(-21.6, 1) + peg(-23, -1);
  out.push(path(at(pegs), p.box([[0, '#fff3d0'], [1, '#c08850']]), stroke(ink, 0.8)));
  out.push(path(at('M-2.1,-16.6L-2.4,-23.2Q0,-24.8 2.4,-23.2L2.1,-16.6Z'), '#7a3a14', stroke(ink, 1.1)));
  // the body: the carved bowl, and the board over it
  const bowl = 'M-2.4,1.4C-5.6,4.4 -9.2,8.8 -9.2,14.4C-9.2,20 -5,23.6 0,23.6C5,23.6 9.2,20 9.2,14.4C9.2,8.8 5.6,4.4 2.4,1.4Z';
  const board = 'M-1.8,3.2C-4.6,5.8 -7.8,9.6 -7.8,14.4C-7.8,19 -4.4,22.1 0,22.1C4.4,22.1 7.8,19 7.8,14.4C7.8,9.6 4.6,5.8 1.8,3.2Z';
  out.push(path(at(bowl), p.round([[0, '#e8945a'], [0.55, '#9a4a1c'], [1, '#5a2008']], -13, 3, 22), stroke(ink, 1.2)));
  out.push(path(at(board), p.round([[0, '#fff2cc'], [0.5, '#f4bc6a'], [1, '#c87a34']], -13, 3, 23)));
  // the neck laid over the board, its frets, the sound hole, the bridge and the strings' tail
  out.push(path(at(rr(-2, -17, 4, 22.6, 0.9)), p.line([[0, '#c87a40'], [1, '#5a2a0e']], 2.9, -6.5, 6.1, -4.1), stroke(ink, 1.1)));
  const frets = [-14.4, -11.6, -9, -6.6, -4.4, -2.4].map((y) => `M-2,${y}L2,${y}`).join('');
  if (!p.tiny) out.push(line(at(frets), '#f6e2b8', 0.55));
  out.push(path(at(oval(0, 10.4, 1.9, 1.9)), '#3a1606', stroke('#f6c27a', 1.2)));
  out.push(path(at(rr(-3.2, 17.2, 6.4, 1.6, 0.6) + oval(0, 21.2, 1.4, 0.8)), '#5a2a0e'));
  if (!p.tiny) {
    out.push(line(at('M-0.7,-16.8L-0.5,21M0.7,-16.8L0.5,21'), '#fff8e6', 0.35, ' stroke-opacity="0.9"'));
    out.push(path(at('M-7,15.6C-7.2,11.6 -5.2,7.8 -2.4,5C-3.8,8.4 -5.4,11.8 -7,15.6Z'), '#ffffff', ' fill-opacity="0.65"'));
    out.push(line(at('M-1.2,-16L-1.2,4'), '#ffffff', 0.5, ' stroke-opacity="0.45"'));
  }
  if (p.fine) out.push(path(`${glint(-14.6, -6.6, 1.8)}${glint(13.4, 12.6, 1.3)}`, '#ffffff'));
  return out.join('');
}

/** Fast fingers: a key of the keyboard struck in a hurry, speed streaking behind it and a spark of lightning at its corner. */
function fastKey(p: Pen): string {
  const out: string[] = [];
  const ink = '#2e1a6e';
  // the streaks it leaves behind
  const streaks = 'M-9.6,-7.6L-19.4,-8.6Q-20.6,-7.3 -19.4,-6L-9.6,-5Z M-10.6,0.6L-20,0Q-21.2,1.3 -20,2.6L-10.6,3.2Z M-9.8,8.6L-17.6,8.2Q-18.8,9.5 -17.6,10.8L-9.8,11.2Z';
  const edge = p.line([[0, '#4a2fa8'], [1, '#4a2fa8', 0]], -9.6, 0, -19, 0);
  out.push(path(streaks, p.line([[0, '#ffffff'], [1, '#e6dcff', 0]], -9.6, 0, -20, 0), stroke(edge, 0.8)));
  // the key: its skirt widening to the foot, its top face dished into it
  const skirt = 'M-5.8,-13.6H12.4C14.2,-13.6 15,-12.6 15.2,-11L16.4,11.6C16.6,14.4 15,16 12.4,16H-6.4C-9,16 -10.6,14.4 -10.4,11.6L-9.2,-11C-9,-12.6 -8.2,-13.6 -5.8,-13.6Z';
  const top = 'M-7.6,-9C-7.6,-11.2 -6.4,-12.2 -4.2,-12.2H10.8C13,-12.2 14,-11.2 14,-9V3.6C14,5.8 12.8,7 10.6,7H-4C-6.2,7 -7.6,5.8 -7.6,3.6Z';
  out.push(path(skirt, p.line([[0, '#cbb8ff'], [0.5, '#7b5ce0'], [1, '#3f22a0']], 0, -14, 0, 16), stroke(ink, 1.2)));
  if (!p.tiny) out.push(line('M-7.4,4.6L-9.6,14.4M13.6,4.6L15.6,14.4', ink, 0.7, ' stroke-opacity="0.5"'));
  out.push(path(top, p.round([[0, '#ffffff'], [0.55, '#f1ecfb'], [1, '#c4b6ea']], -3, -9, 24), stroke(ink, 0.9)));
  if (!p.tiny) out.push(path('M-6.2,-7.6C-6.2,-9.8 -5.2,-10.8 -3.2,-10.8H3.6C-1.2,-10 -4.4,-8.8 -6.2,-5.6Z', '#ffffff', ' fill-opacity="0.85"'));
  // its letter
  out.push(line('M1.6,-7.6V2.4M1.6,-1.4L7.6,-7.6M3.6,-3.2L7.8,2.4', '#4a2fa8', 2.4));
  // the spark
  const bolt = 'M14.2,-20.4L8.6,-11.6L12.4,-11.8L9.8,-4.6L18.8,-14.6L14.6,-14.2L18,-20.4Z';
  out.push(path(bolt, p.box([[0, '#fffbd0'], [0.5, '#ffd21f'], [1, '#f08c0c']]), stroke('#7a4204', 1)));
  if (p.fine) out.push(path(`${glint(-15.6, -14.6, 1.6)}${glint(-6, 18.2, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** A seal's edge: a circle scalloped all the way round, `bumps` times. */
function rosette(cx: number, cy: number, r: number, bumps: number): string {
  const pt = (a: number, far: number): string => `${n(cx + Math.cos(a) * far)},${n(cy + Math.sin(a) * far)}`;
  const step = (Math.PI * 2) / bumps;
  return `M${pt(0, r * 0.9)}${Array.from({ length: bumps }, (_, i) => `Q${pt(step * (i + 0.5), r * 1.1)} ${pt(step * (i + 1), r * 0.9)}`).join('')}Z`;
}

/** Written without a slip: a scroll of parchment half unrolled, neat lines of writing on it and a round green seal on it, ticked in white. */
function scroll(p: Pen): string {
  const out: string[] = [];
  const ink = '#6a3a14';
  // the sheet, and the thin roll of what is left of it at its foot
  out.push(path('M-12.2,-13H12.2V15.6H-12.2Z', p.box([[0, '#fffaf0'], [0.55, '#f8e4b6'], [1, '#e0b46e']]), stroke(ink, 1.2)));
  out.push(path('M-12.4,14.4H12.2C14,14.4 14,18.8 12.2,18.8H-12.4C-14.2,18.8 -14.2,14.4 -12.4,14.4Z', p.line([[0, '#fff4d8'], [1, '#b8844a']], 0, 14, 0, 19), stroke(ink, 1)));
  out.push(path('M-12.4,14.4C-14.2,14.4 -14.2,18.8 -12.4,18.8C-11.6,18.8 -11.3,17.8 -11.3,16.6C-11.3,15.4 -11.6,14.4 -12.4,14.4Z', '#f2cf92', stroke(ink, 0.8)));
  if (!p.tiny) {
    // the shade the roll throws on the sheet, and the sheet's own down its far edge
    out.push(path('M-12.2,-11.6H12.2V-8.6C4,-10 -4,-10 -12.2,-8.6Z M12.2,-9V14.4H10C10.6,8 10.6,-2 10,-9Z', '#b8844a', ' fill-opacity="0.35"'));
    // the writing, line under line
    out.push(line('M-8.6,-6H-1.4M0.8,-6H8.4M-8.6,-2H3.4M5.6,-2H8.4M-8.6,2H-3.2M-1,2H8.4M-8.6,6H0.4M-8.6,10H-3.8', '#7a4a2a', 1.2));
  }
  // the roll at the top, its two ends curled
  const roll = p.line([[0, '#fff8e0'], [0.4, '#f6d8a0'], [1, '#b07a40']], 0, -19, 0, -11.2);
  out.push(path('M-13.4,-19H13.4C16,-19 16,-11.2 13.4,-11.2H-13.4C-16,-11.2 -16,-19 -13.4,-19Z', roll, stroke(ink, 1.2)));
  out.push(path('M-13.4,-19C-16,-19 -16,-11.2 -13.4,-11.2C-12,-11.2 -11.6,-13 -11.6,-15.1C-11.6,-17.2 -12,-19 -13.4,-19Z', '#f2cf92', stroke(ink, 0.9)));
  if (!p.tiny) {
    out.push(line('M-13.6,-15.2C-13.6,-16.4 -12.6,-16.6 -12.4,-15.4C-12.2,-14 -13.8,-13.4 -14.4,-14.8C-15,-16.4 -14,-17.8 -12.8,-17.6', ink, 0.6));
    out.push(path('M-11,-17.8H11C8,-16.8 -6,-16.8 -11,-17.8Z', '#ffffff', ' fill-opacity="0.8"'));
  }
  // the seal
  out.push(path(rosette(7.4, 9.4, 6.8, 14), p.round([[0, '#c8f7a0'], [0.45, '#3fbf5a'], [1, '#1a7a3a']], 4.6, 6.4, 10), stroke('#0f4a24', 1.1)));
  if (!p.tiny) out.push(line(circ(7.4, 9.4, 4.4), '#0f4a24', 0.6, ' stroke-opacity="0.45"'));
  out.push(line('M4.8,9.6L6.7,11.6L10.2,7.2', '#ffffff', 1.9));
  if (p.fine) out.push(path(`${glint(-16.8, -4.6, 1.6)}${glint(16.4, -6.4, 1.2)}${glint(3.6, 5.6, 0.9)}`, '#ffffff'));
  return out.join('');
}

/** Listening well: a pair of headphones, glossy violet, soft cushions on their cups and the waves of the sound between them. */
function headphones(p: Pen): string {
  const out: string[] = [];
  const ink = '#24116e';
  const shell = p.round([[0, '#d6ccff'], [0.45, '#7a5cf5'], [1, '#3a1fa8']], -9, -12, 32);
  // the cushion under the band, the band over the top
  out.push(line('M-11.6,-2.6A12.2,12.2 0 0 1 11.6,-2.6', ink, 3.6));
  out.push(line('M-11.6,-2.6A12.2,12.2 0 0 1 11.6,-2.6', '#e2dafc', 2));
  out.push(path('M-17,4V0A17,17 0 0 1 17,0V4H13.2V0A13.2,13.2 0 0 0 -13.2,0V4Z', shell, stroke(ink, 1.2)));
  if (!p.tiny) out.push(line('M-14.8,-3.4C-13.2,-9.8 -7.6,-14 -1.6,-14.8', '#ffffff', 1.1, ' stroke-opacity="0.7"'));
  // the cups and their cushions
  out.push(path(rr(-20.2, 2.6, 9.4, 16, 4.4) + rr(10.8, 2.6, 9.4, 16, 4.4), shell, stroke(ink, 1.2)));
  const cushion = p.line([[0, '#ffffff'], [0.6, '#ddd4fa'], [1, '#9a88d4']], -8, 4, 8, 17);
  out.push(path(rr(-12.4, 4.2, 4.4, 12.8, 2.2) + rr(8, 4.2, 4.4, 12.8, 2.2), cushion, stroke(ink, 0.9)));
  const shine = 'M-18.6,12.4C-18.8,8 -17.8,5.4 -15.4,4.4C-16.6,7 -17.2,9.6 -18.6,12.4Z M12.6,10.4C12.6,7.6 13.2,5.6 14.6,4.4C13.8,6.4 13.4,8.4 12.6,10.4Z';
  if (!p.tiny) out.push(path(shine, '#ffffff', ' fill-opacity="0.7"'));
  // the sound
  const waves = 'M-5.6,7.4Q-3.6,10.6 -5.6,13.8M-2.8,5.4Q0.4,10.6 -2.8,15.8M5.6,7.4Q3.6,10.6 5.6,13.8M2.8,5.4Q-0.4,10.6 2.8,15.8';
  out.push(line(waves, '#0f5a8a', 2.4));
  out.push(line(waves, '#7ff0ff', 1.2));
  if (p.fine) out.push(path(`${glint(-17.6, -14.6, 1.6)}${glint(17.6, -13.4, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** Every game tried: a paper pinwheel of four blades, blue, red, green and yellow, each curling up from its fold to the pin, on its stick. */
function pinwheel(p: Pen): string {
  const out: string[] = [];
  const [cx, cy, spin] = [0.6, -3.8, 10];
  // the stick behind it
  out.push(line('M0.6,-3.8L-1.6,19.8', '#5a2e0e', 3.4));
  out.push(line('M0.6,-3.8L-1.6,19.8', p.line([[0, '#f6d8a8'], [1, '#b0703a']], -3, 0, 2, 0), 1.8));
  const blades: [number, string, string, string, string][] = [
    [0, '#d6efff', '#4aa6ff', '#1a4fc0', '#0f2f80'],
    [90, '#ffd6da', '#ff5468', '#c41838', '#6a0a1e'],
    [180, '#e2ffc8', '#56d44f', '#1f8a3a', '#0f4a20'],
    [270, '#fff8c8', '#ffd21f', '#e88a0c', '#7a4204'],
  ];
  // the four flat blades out to their tips, then the folds curling up from them to the pin
  for (const [deg, , mid, dark, ink] of blades) {
    out.push(path(turn('M0,0L0,-16.6L9.8,-6.8Z', deg + spin, cx, cy), p.box([[0, mid], [1, dark]]), stroke(ink, 1.1)));
  }
  for (const [deg, light, , , ink] of blades) {
    out.push(path(turn('M0,0C3.2,-2.4 6.6,-4.6 9.8,-6.8C14.4,-3.2 10.6,2.2 0,0Z', deg + spin, cx, cy), light, stroke(ink, 0.9)));
  }
  if (!p.tiny) {
    out.push(path(blades.map(([deg]) => turn('M2.6,-4.6L1.4,-12.6L6,-7.4Z', deg + spin, cx, cy)).join(''), '#ffffff', ' fill-opacity="0.4"'));
    out.push(line(blades.map(([deg]) => turn('M4,-2.2C7,-3.4 9.4,-4.4 10.6,-4', deg + spin, cx, cy)).join(''), '#ffffff', 0.9, ' stroke-opacity="0.85"'));
  }
  // the pin
  out.push(path(circ(cx, cy, 2.6), p.roundBox([[0, '#ffffff'], [0.6, '#ffe08a'], [1, '#c88a10']], 0.35, 0.3, 0.7), stroke('#6a3a04', 0.9)));
  if (p.fine) out.push(path(`${glint(-15.6, 12.6, 1.6)}${glint(16.4, 12.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** Fair play: a heart of polished gold, its rim bevelled and its face raised and glossy, a sparkle at its shoulder. */
function goldHeart(p: Pen): string {
  const out: string[] = [];
  const ink = '#8a4a06';
  const heart =
    'M0,18C-6,13.2 -18.6,6 -18.6,-4.6C-18.6,-11.6 -13.8,-15.6 -8.8,-15.6C-4.8,-15.6 -2,-13.2 0,-9.6' +
    'C2,-13.2 4.8,-15.6 8.8,-15.6C13.8,-15.6 18.6,-11.6 18.6,-4.6C18.6,6 6,13.2 0,18Z';
  const face =
    'M0,14.8C-5.2,10.6 -15.6,4.6 -15.6,-4.2C-15.6,-9.6 -12,-12.6 -8.4,-12.6C-5.2,-12.6 -2.6,-10.6 0,-6.6' +
    'C2.6,-10.6 5.2,-12.6 8.4,-12.6C12,-12.6 15.6,-9.6 15.6,-4.2C15.6,4.6 5.2,10.6 0,14.8Z';
  // the rim, lit on the side toward the light, and the raised face inside it
  out.push(path(heart, p.line([[0, '#fff6c4'], [0.4, '#ffc93a'], [1, '#b8640a']], -10, -14, 10, 16), stroke(ink, 1.3)));
  const gold = p.round([[0, '#fffbe0'], [0.35, '#ffe066'], [0.75, '#f7b52c'], [1, '#d88a10']], -6, -8, 24);
  out.push(path(face, gold, stroke('#c27a0a', 0.6, ' stroke-opacity="0.7"')));
  if (!p.tiny) {
    // the face's shade away from the light, and its gloss
    out.push(path('M14.2,-5C14.2,3.4 5.6,9.4 0,13.4C4.4,8.6 11.6,3.6 14.2,-5Z', '#c2650a', ' fill-opacity="0.4"'));
    out.push(path('M-13.4,-3.6C-14,-8.4 -11.6,-11.4 -8,-11.4C-10.6,-9.8 -12.2,-7.4 -13.4,-3.6Z', '#ffffff', ' fill-opacity="0.95"'));
    out.push(path(circ(-6.6, -8.4, 1.2), '#ffffff', ' fill-opacity="0.9"'));
  }
  // the sparkle
  out.push(path(glint(14.2, -14.4, 5.6), '#ffffff', stroke('#e8a21c', 0.6)));
  if (p.fine) out.push(path(`${glint(-17.4, 13.4, 1.6)}${glint(19, -0.6, 1.1)}`, '#ffffff'));
  return out.join('');
}

/** The day's riddle solved: a glossy blue puzzle piece, the last one, turned a little as it is set in place, a sparkle beside it. */
function puzzlePiece(p: Pen): string {
  const out: string[] = [];
  const ink = '#0f2a6a';
  const piece =
    'M-15.2,-8.6Q-15.2,-10 -13.8,-10L-6.4,-10C-6.4,-10 -8.6,-12.4 -8,-15.2C-7.2,-19.8 4.2,-19.8 5,-15.2C5.6,-12.4 3.4,-10 3.4,-10L11.2,-10Q12.6,-10 12.6,-8.6' +
    'L12.6,-1.6C12.6,-1.6 15,-3.6 17.6,-2.6C21.4,-1.2 21.4,5.4 17.6,6.8C15,7.8 12.6,5.8 12.6,5.8L12.6,13.6Q12.6,15 11.2,15L-13.8,15Q-15.2,15 -15.2,13.6' +
    'L-15.2,6.4C-15.2,6.4 -12.8,8.4 -10.2,7.4C-6.6,6 -6.6,-0.4 -10.2,-1.8C-12.8,-2.8 -15.2,-0.8 -15.2,-0.8Z';
  const at = (d: string, dx = 0, dy = 0): string => turn(d, 6, 0.8 + dx, 1.2 + dy);
  // its thickness, then its face
  out.push(path(at(piece, 0.6, 2.4), '#2146ae', stroke(ink, 1.2)));
  out.push(path(at(piece), p.round([[0, '#d6eeff'], [0.4, '#5aa8ff'], [0.8, '#2a6ae0'], [1, '#1c48b8']], -9, -10, 30), stroke(ink, 1.2)));
  if (!p.tiny) {
    // the shade along its far edges, the light along its near ones
    out.push(path(at('M11.2,-8.4L11.2,13.6L-13.6,13.6C-4,12.6 6.4,12 9.6,9.6C10.8,4 10.8,-3 11.2,-8.4Z'), '#123a9a', ' fill-opacity="0.35"'));
    const light = 'M-13.8,-1.8L-13.8,-8.2Q-13.8,-8.8 -13,-8.8L-7,-8.8C-10,-7.6 -12.4,-5.2 -13.8,-1.8Z M-6.8,-15C-6.4,-17.6 -2.4,-18.6 0.6,-18C-2.6,-17.2 -5.2,-16.4 -6.8,-15Z';
    out.push(path(at(light), '#ffffff', ' fill-opacity="0.85"'));
  }
  out.push(path(glint(-15.2, -15.4, 4.6), '#ffffff', stroke('#c27a0a', 0.5)));
  if (p.fine) out.push(path(`${glint(17.6, 13.6, 1.6)}${glint(-17.8, 11.4, 1.1)}`, '#ffffff'));
  return out.join('');
}

/** Rhymes found: a nightingale singing on a twig, its head thrown back and its beak open, a gold note rising from its song. */
function nightingale(p: Pen): string {
  const out: string[] = [];
  const ink = '#3e1e0a';
  // it faces Hevalo: drawn mirrored
  const at = (d: string): string => turn(d, 0, 0.4, 2, -1.16);
  const twig = 'M19.6,18.2C10,16.4 -4,16.8 -19.6,15';
  out.push(line(twig, ink, 3.2));
  out.push(line(twig, '#a8703e', 1.6));
  const leaves = 'M-14.6,15.4C-17.4,14.4 -19.4,11.6 -18.6,9.6C-16.2,10.4 -14.6,12.8 -14.6,15.4Z M9.4,17.4C10.4,15 12.8,13.8 14.8,14.4C14.4,16.8 12.2,18 9.4,17.4Z';
  out.push(path(leaves, p.box([[0, '#d4ffa8'], [0.5, '#5fcf5a'], [1, '#2a8f44']]), stroke('#14532d', 0.7)));
  // the tail, the legs, then the bird
  const brown = p.box([[0, '#e8a060'], [1, '#7a3e1a']]);
  out.push(path(at('M-7.4,4.4L-15,8.2C-16.4,9.6 -15.8,11.8 -13.6,11.8L-5.6,9.6Z'), brown, stroke(ink, 1)));
  out.push(line(at('M0.4,10.6L-0.2,13.2M4.2,9.6L4.6,12.4'), '#b8665a', 1.3));
  const body =
    'M-9.6,6.6C-10.8,1.4 -6.6,-3.2 -1.2,-3.6C0.2,-7.6 3.4,-10.6 7.2,-10.6C10.6,-10.6 12.6,-8.2 12.4,-5.4' +
    'C12.2,-3 11,-1 10.6,1.2C9.8,7 5.8,11 0,11.4C-4.6,11.6 -8.6,10 -9.6,6.6Z';
  out.push(path(at(body), p.round([[0, '#eec290'], [0.5, '#b07440'], [1, '#6a3a18']], 0, -9, 22), stroke(ink, 1.2)));
  // its pale breast, and the wing folded on its side
  const breast = 'M10.6,-2.4C10.6,3.6 7.4,9.4 1.4,10.8C-2.6,11.6 -6.2,10.6 -8,8.6C-2.6,8.8 3.2,6.2 6,1C7.2,-0.8 8.6,-2 10.6,-2.4Z';
  const wing = 'M5.4,-0.8C2.4,-3.2 -4.2,-2.6 -7.4,1.4C-8.8,3.4 -10,5.2 -12,6.6C-8,7.4 -3,6.8 0.6,5C3.2,3.6 4.8,1.6 5.4,-0.8Z';
  out.push(path(at(breast), '#fbe8c8'));
  out.push(path(at(wing), brown, stroke(ink, 0.8)));
  if (!p.tiny) out.push(line(at('M2.8,0.4C-0.6,0.2 -4.4,2 -7.4,4.8M1.4,2.6C-1.6,3 -4.6,4.4 -6.6,6'), '#f4d6a8', 0.6, ' stroke-opacity="0.75"'));
  // the beak open in song, and the eye ringed in pale
  out.push(path(at('M11,-8.2L17.2,-11.4L12.4,-5.4Z M12,-4.6L16.8,-5.6L11.4,-3Z'), '#6a4434', stroke(ink, 0.5)));
  out.push(path(circ(-9.4, -5.6, 2.35), '#fff3dc'));
  out.push(path(circ(-9.6, -5.6, 1.45), '#1d0e04'));
  out.push(path(circ(-10, -6.1, 0.55), '#ffffff'));
  const light = 'M2.4,-8C3.8,-9.8 6,-10.6 8.2,-10C6,-9.6 4.2,-9 2.4,-8Z M-8.4,1.6C-7,-1 -4.6,-2.6 -1.8,-2.8C-4.4,-1.6 -6.4,-0.2 -8.4,1.6Z';
  if (!p.tiny) out.push(path(at(light), '#ffffff', ' fill-opacity="0.6"'));
  // its note, rising
  const gold = p.box([[0, '#fff3a0'], [0.5, '#ffc21f'], [1, '#c27a0a']]);
  out.push(path(turn(oval(0, 0, 2.5, 1.85), -22, -14.6, -14.2), gold, stroke('#7a4a04', 0.9)));
  out.push(path('M-12.3,-14.6V-20C-11.4,-18.2 -9.2,-17.6 -8.4,-15.4C-9.4,-16.4 -10.4,-16.6 -11.2,-16.6V-14.6Z', gold, stroke('#7a4a04', 0.9)));
  if (p.fine) out.push(path(`${glint(15.4, -8.6, 1.6)}${glint(4.6, -15.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

export const GAMES: Readonly<Record<string, Picture>> = {
  peyvzan: letterTiles,
  helbestvan: tembur,
  bilez: fastKey,
  rastnivis: scroll,
  guhdar: headphones,
  hemereng: pinwheel,
  dilpak: goldHeart,
  mamik: puzzlePiece,
  bilbil: nightingale,
};
