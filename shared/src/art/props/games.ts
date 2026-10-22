/**
 * The pictures Hevalo shows on the games badges' — letter tiles, a tembûr, a key pressed fast, a scroll written without a slip, headphones, a pinwheel, a golden heart, a puzzle piece and a nightingale — drawn whole with the pen
 * (pen.ts), in the style of the secrets (pictures.ts).
 */
import { circ, glint, line, n, path, stroke } from '../pen.js';
import type { Pen, Picture } from '../pen.js';

// ─────────────────────────────────────────────────────────────── helpers

/** Every point of a path written with M, L, C, Q and Z, turned `deg` degrees about 0,0 and then moved by dx, dy. */
function turn(d: string, deg: number, dx = 0, dy = 0): string {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${n(Number(x) * c - Number(y) * s + dx)},${n(Number(x) * s + Number(y) * c + dy)}`);
}

/** A box with rounded corners, written so that it can be turned. */
const rr = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${n(x + r)},${n(y)}L${n(x + w - r)},${n(y)}Q${n(x + w)},${n(y)} ${n(x + w)},${n(y + r)}L${n(x + w)},${n(y + h - r)}Q${n(x + w)},${n(y + h)} ${n(x + w - r)},${n(y + h)}` +
  `L${n(x + r)},${n(y + h)}Q${n(x)},${n(y + h)} ${n(x)},${n(y + h - r)}L${n(x)},${n(y + r)}Q${n(x)},${n(y)} ${n(x + r)},${n(y)}Z`;

/** An ellipse of four curves, written so that it can be turned. */
function oval(cx: number, cy: number, rx: number, ry: number): string {
  const [kx, ky] = [rx * 0.552, ry * 0.552];
  return (
    `M${n(cx - rx)},${n(cy)}C${n(cx - rx)},${n(cy - ky)} ${n(cx - kx)},${n(cy - ry)} ${n(cx)},${n(cy - ry)}C${n(cx + kx)},${n(cy - ry)} ${n(cx + rx)},${n(cy - ky)} ${n(cx + rx)},${n(cy)}` +
    `C${n(cx + rx)},${n(cy + ky)} ${n(cx + kx)},${n(cy + ry)} ${n(cx)},${n(cy + ry)}C${n(cx - kx)},${n(cy + ry)} ${n(cx - rx)},${n(cy + ky)} ${n(cx - rx)},${n(cy)}Z`
  );
}

// ─────────────────────────────────────────────────────────────── the pictures

/** Word battles won: four glossy letter tiles, K, E, V and A, one white, one gold and two green, set close together in a square. */
function letterTiles(p: Pen): string {
  const out: string[] = [];
  const white = { face: p.box([[0, '#ffffff'], [0.55, '#f4f0fc'], [1, '#cdc2ea']]), side: '#a796d2', ink: '#3d2f6b', mark: '#3d2f6b', under: '#ffffff' };
  const gold = { face: p.box([[0, '#fff6c4'], [0.5, '#ffd23f'], [1, '#f0a10c']]), side: '#c27a0a', ink: '#6e3e04', mark: '#7a4504', under: '#fff3b0' };
  const green = { face: p.box([[0, '#d4ffa8'], [0.5, '#5fcf5a'], [1, '#2a9446']]), side: '#1f7a3a', ink: '#11502a', mark: '#ffffff', under: '#11502a' };
  const tile = (cx: number, cy: number, deg: number, letter: string, k: typeof white): void => {
    const at = (d: string): string => turn(d, deg, cx, cy);
    // the tile's depth below its face, then the face
    out.push(path(at(rr(-8.2, -8.4, 16.4, 16.8, 3.4)), k.side, stroke(k.ink, 1.2)));
    out.push(path(at(rr(-8.2, -8.4, 16.4, 14, 3.4)), k.face, stroke(k.ink, 0.6, ' stroke-opacity="0.5"')));
    if (!p.tiny) {
      out.push(path(at('M-6.6,-2.4C-6.8,-5.6 -5.8,-6.9 -3.2,-6.9L3.6,-6.9C-0.8,-6 -4.4,-4.8 -6.6,-2.4Z'), '#ffffff', ' fill-opacity="0.75"'));
      out.push(line(at(turn(letter, 0, 0, -0.7)), k.under, 2.5, ' stroke-opacity="0.8"'));
    }
    out.push(line(at(turn(letter, 0, 0, -1.4)), k.mark, 2.5));
  };
  tile(-9.6, -9.4, -4, 'M-3.4,-4.6L-3.4,4.6M-3.4,0.6L3.6,-4.6M-1.2,-0.9L3.6,4.6', white);
  tile(9.8, -9.8, 3, 'M3.4,-4.6L-3.2,-4.6L-3.2,4.6L3.4,4.6M-3.2,0L2.2,0', gold);
  tile(-9.8, 9.6, 2, 'M-4,-4.6L0,4.6L4,-4.6', green);
  tile(9.6, 9.4, -3, 'M-4,4.6L0,-4.6L4,4.6M-2.5,1.4L2.5,1.4', green);
  if (p.fine) out.push(path(`${glint(-17.6, -18, 1.8)}${glint(18.6, -1.4, 1.3)}`, '#ffffff'));
  return out.join('');
}

/** Rhymes matched: a tembûr, the long-necked lute, its pear-shaped body of mulberry wood with a sound hole, its long fretted neck and the pegs at its head. */
function tembur(p: Pen): string {
  const out: string[] = [];
  const ink = '#4a2008';
  const at = (d: string): string => turn(d, 38, 0.6, 0.4);
  // the neck, fretted, the pegbox and its pegs
  out.push(path(at(rr(-1.9, -17.6, 3.8, 23, 0.9)), p.line([[0, '#b8703a'], [1, '#5a2a0e']], -12, -12, 0, -6), stroke(ink, 1.1)));
  out.push(line(at('M-2.3,-19.4L-5.4,-19.4M-2.4,-22.2L-5.2,-22.6M2.3,-20.8L5.4,-20.8'), ink, 1.4));
  out.push(path(at('M-2,-17.2L-2.5,-22.6Q0,-24.4 2.5,-22.6L2,-17.2Z'), p.line([[0, '#c8804a'], [1, '#6a3010']], -12, -18, 16, -18), stroke(ink, 1.1)));
  out.push(path(at(oval(-6.3, -19.4, 1.6, 1.15) + oval(-6.1, -22.8, 1.6, 1.15) + oval(6.3, -20.8, 1.6, 1.15)), p.box([[0, '#fff3d0'], [1, '#c89a5a']]), stroke(ink, 0.8)));
  if (!p.tiny) out.push(line(at('M-1.9,-15.2L1.9,-15.2M-1.9,-12.8L1.9,-12.8M-1.9,-10.6L1.9,-10.6M-1.9,-8.6L1.9,-8.6M-1.9,-6.8L1.9,-6.8M-1.9,-5.1L1.9,-5.1M-1.9,-3.6L1.9,-3.6M-1.9,-2.2L1.9,-2.2'), '#f6e2b8', 0.5));
  // the body: the carved bowl, and the board over it
  const bowl = 'M-2.2,2C-5.2,4.8 -8.6,9 -8.6,14.4C-8.6,19.8 -4.8,23.4 0,23.4C4.8,23.4 8.6,19.8 8.6,14.4C8.6,9 5.2,4.8 2.2,2Z';
  const board = 'M-1.7,3.8C-4.3,6.2 -7.2,9.8 -7.2,14.4C-7.2,18.8 -4,21.9 0,21.9C4,21.9 7.2,18.8 7.2,14.4C7.2,9.8 4.3,6.2 1.7,3.8Z';
  out.push(path(at(bowl), p.round([[0, '#e08a48'], [0.6, '#9a4a1c'], [1, '#5a2008']], -12, 2, 20), stroke(ink, 1.2)));
  out.push(path(at(board), p.round([[0, '#fff0c8'], [0.5, '#f4bc6a'], [1, '#c87a34']], -13, 1, 22)));
  // the end of the neck on the board, the sound hole, the bridge and the strings' tail
  out.push(path(at(rr(-1.9, 2, 3.8, 3.6, 0.9)), '#7a3a14', stroke(ink, 0.8)));
  out.push(path(at(oval(0, 10.2, 2.9, 2.9)), '#e8a050', stroke('#8a4a1c', 0.7)));
  out.push(path(at(oval(0, 10.2, 1.8, 1.8)), '#3a1606'));
  out.push(path(at(rr(-3.2, 17, 6.4, 1.6, 0.6)), '#5a2a0e'));
  out.push(path(at(oval(0, 21, 1.4, 0.8)), '#5a2a0e'));
  if (!p.tiny) {
    out.push(line(at('M-0.6,-17.4L-0.5,20.6M0.6,-17.4L0.5,20.6'), '#fff8e6', 0.35, ' stroke-opacity="0.9"'));
    out.push(path(at('M-6.4,15.6C-6.6,11.6 -4.8,8 -2.2,5.4C-3.6,8.6 -5,11.8 -6.4,15.6Z'), '#ffffff', ' fill-opacity="0.65"'));
    out.push(line(at('M-1.1,-16.4L-1.1,1.4'), '#ffffff', 0.5, ' stroke-opacity="0.45"'));
  }
  if (p.fine) out.push(path(`${glint(-14.6, -6.6, 1.8)}${glint(13.4, 12.6, 1.3)}`, '#ffffff'));
  return out.join('');
}

/** Fast fingers: a key of the keyboard struck in a hurry, speed streaking behind it and a spark of lightning at its corner. */
function fastKey(p: Pen): string {
  const out: string[] = [];
  const ink = '#2e1a6e';
  // the streaks it leaves behind
  out.push(path('M-9.6,-7.6L-19.4,-8.6Q-20.6,-7.3 -19.4,-6L-9.6,-5Z M-10.6,0.6L-20,0Q-21.2,1.3 -20,2.6L-10.6,3.2Z M-9.8,8.6L-17.6,8.2Q-18.8,9.5 -17.6,10.8L-9.8,11.2Z', p.line([[0, '#ffffff'], [1, '#ffffff', 0]], -9.6, 0, -20, 0)));
  // the key: its skirt widening to the foot, its top face dished into it
  out.push(path('M-5.8,-13.6H12.4C14.2,-13.6 15,-12.6 15.2,-11L16.4,11.6C16.6,14.4 15,16 12.4,16H-6.4C-9,16 -10.6,14.4 -10.4,11.6L-9.2,-11C-9,-12.6 -8.2,-13.6 -5.8,-13.6Z', p.line([[0, '#cbb8ff'], [0.5, '#7b5ce0'], [1, '#3f22a0']], 0, -14, 0, 16), stroke(ink, 1.2)));
  if (!p.tiny) out.push(line('M-7.4,4.6L-9.6,14.4M13.6,4.6L15.6,14.4', ink, 0.7, ' stroke-opacity="0.5"'));
  out.push(path('M-7.6,-9C-7.6,-11.2 -6.4,-12.2 -4.2,-12.2H10.8C13,-12.2 14,-11.2 14,-9V3.6C14,5.8 12.8,7 10.6,7H-4C-6.2,7 -7.6,5.8 -7.6,3.6Z', p.round([[0, '#ffffff'], [0.55, '#f1ecfb'], [1, '#c4b6ea']], -3, -9, 24), stroke(ink, 0.9)));
  if (!p.tiny) out.push(path('M-6.2,-7.6C-6.2,-9.8 -5.2,-10.8 -3.2,-10.8H3.6C-1.2,-10 -4.4,-8.8 -6.2,-5.6Z', '#ffffff', ' fill-opacity="0.85"'));
  // its letter
  out.push(line('M1.6,-7.6V2.4M1.6,-1.4L7.6,-7.6M3.6,-3.2L7.8,2.4', '#4a2fa8', 2.4));
  // the spark
  out.push(path('M14.2,-20.4L8.6,-11.6L12.4,-11.8L9.8,-4.6L18.8,-14.6L14.6,-14.2L18,-20.4Z', p.box([[0, '#fffbd0'], [0.5, '#ffd21f'], [1, '#f08c0c']]), stroke('#7a4204', 1)));
  if (p.fine) out.push(path(`${glint(-15.6, -14.6, 1.6)}${glint(-6, 18.2, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** A scrollbound four-sided star of a seal: 14 scallops round a circle. */
function rosette(cx: number, cy: number, r: number, bumps: number): string {
  const pt = (a: number, rr2: number): string => `${n(cx + Math.cos(a) * rr2)},${n(cy + Math.sin(a) * rr2)}`;
  const step = (Math.PI * 2) / bumps;
  return `M${pt(0, r * 0.9)}${Array.from({ length: bumps }, (_, i) => `Q${pt(step * (i + 0.5), r * 1.1)} ${pt(step * (i + 1), r * 0.9)}`).join('')}Z`;
}

/** Written without a slip: a scroll of parchment half unrolled, neat lines of writing on it and a round green seal on it, ticked in white. */
function scroll(p: Pen): string {
  const out: string[] = [];
  const ink = '#6a3a14';
  // the sheet, its foot curling under
  out.push(path('M-12.2,-13H12.2V12.6C12.2,14.6 11.2,15.8 9.4,16.4L-12.2,16.4Z', p.box([[0, '#fffaf0'], [0.55, '#f8e4b6'], [1, '#e0b46e']]), stroke(ink, 1.2)));
  out.push(path('M-12.2,13.4C-14.6,13.4 -15.4,17.6 -12.6,18.4H9.2C11.4,18.4 12.2,16.4 12.2,14.4C11.4,16 10.4,16.4 9,16.4H-11.6C-12.8,16.4 -12.8,14.4 -12.2,13.4Z', p.line([[0, '#f4d49a'], [1, '#b8844a']], 0, 13, 0, 18.4), stroke(ink, 1)));
  if (!p.tiny) {
    // the shade the roll throws on the sheet
    out.push(path('M-12.2,-11.6H12.2V-8.6C4,-10 -4,-10 -12.2,-8.6Z', '#b8844a', ' fill-opacity="0.35"'));
    // the writing, line under line
    out.push(line('M-8.6,-6H-1.4M0.8,-6H8.4M-8.6,-2H3.4M5.6,-2H8.4M-8.6,2H-3.2M-1,2H8.4M-8.6,6H0.4M-8.6,10H-3.8', '#7a4a2a', 1.2));
  }
  // the roll at the top, its two ends curled
  out.push(path('M-13.4,-19H13.4C16,-19 16,-11.2 13.4,-11.2H-13.4C-16,-11.2 -16,-19 -13.4,-19Z', p.line([[0, '#fff8e0'], [0.4, '#f6d8a0'], [1, '#b07a40']], 0, -19, 0, -11.2), stroke(ink, 1.2)));
  out.push(path(`M-13.4,-19C-16,-19 -16,-11.2 -13.4,-11.2C-12,-11.2 -11.6,-13 -11.6,-15.1C-11.6,-17.2 -12,-19 -13.4,-19Z`, '#f2cf92', stroke(ink, 0.9)));
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
  // the band over the top, and the sliders down to the cups
  out.push(path('M-17,4V0A17,17 0 0 1 17,0V4H13.2V0A13.2,13.2 0 0 0 -13.2,0V4Z', shell, stroke(ink, 1.2)));
  if (!p.tiny) out.push(line('M-14.8,-3.4C-13.2,-9.8 -7.6,-14 -1.6,-14.8', '#ffffff', 1.1, ' stroke-opacity="0.7"'));
  // the cups and their cushions
  out.push(path(rr(-20.2, 2.6, 9.4, 16, 4.4) + rr(10.8, 2.6, 9.4, 16, 4.4), shell, stroke(ink, 1.2)));
  out.push(path(rr(-12.4, 4.2, 4.4, 12.8, 2.2) + rr(8, 4.2, 4.4, 12.8, 2.2), p.line([[0, '#ffffff'], [0.6, '#ddd4fa'], [1, '#9a88d4']], -8, 4, 8, 17), stroke(ink, 0.9)));
  if (!p.tiny) out.push(path('M-18.6,12.4C-18.8,8 -17.8,5.4 -15.4,4.4C-16.6,7 -17.2,9.6 -18.6,12.4Z M12.6,10.4C12.6,7.6 13.2,5.6 14.6,4.4C13.8,6.4 13.4,8.4 12.6,10.4Z', '#ffffff', ' fill-opacity="0.7"'));
  // the sound
  const waves = 'M-5.6,7.4Q-3.6,10.6 -5.6,13.8M-2.8,5.4Q0.4,10.6 -2.8,15.8M5.6,7.4Q3.6,10.6 5.6,13.8M2.8,5.4Q-0.4,10.6 2.8,15.8';
  out.push(line(waves, '#0f5a8a', 2.4));
  out.push(line(waves, '#7ff0ff', 1.2));
  if (p.fine) out.push(path(`${glint(-17.6, -14.6, 1.6)}${glint(17.6, -13.4, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** Every game tried: a paper pinwheel of four blades, blue, red, green and yellow, pinned to its stick. */
function pinwheel(p: Pen): string {
  const out: string[] = [];
  const [cx, cy] = [0.4, -4.4];
  // the stick behind it
  out.push(line('M0.4,-4.4L-2.4,19.8', '#5a2e0e', 3.4));
  out.push(line('M0.4,-4.4L-2.4,19.8', p.line([[0, '#f6d8a8'], [1, '#b0703a']], -3, 0, 2, 0), 1.8));
  const blades: [number, string, string, string, string][] = [
    [0, '#c6e8ff', '#3f9cff', '#1a4fc0', '#0f2f80'],
    [90, '#ffc8cc', '#ff4a5e', '#c41838', '#6a0a1e'],
    [180, '#d8ffb8', '#4fcf4a', '#1f8a3a', '#0f4a20'],
    [270, '#fff6b8', '#ffd21f', '#e88a0c', '#7a4204'],
  ];
  for (const [deg, light, mid, dark, ink] of blades) {
    // the blade, and the fold of it curling back to the pin
    out.push(path(turn('M0,0L-1,-15.6C4,-15.8 10.4,-13.6 13.2,-9.4C8.6,-7 4,-3.8 0,0Z', deg, cx, cy), p.box([[0, light], [0.55, mid], [1, dark]]), stroke(ink, 1.1)));
    out.push(path(turn('M0,0L-1,-15.6C2.4,-11.6 4,-7.4 3.6,-3Z', deg, cx, cy), dark, stroke(ink, 0.7)));
    if (!p.tiny) out.push(path(turn('M1.6,-4.6L1.2,-13.4C4,-13 7.6,-11.8 9.6,-9.8C6.8,-8.4 4,-6.6 1.6,-4.6Z', deg, cx, cy), '#ffffff', ' fill-opacity="0.35"'));
  }
  // the pin
  out.push(path(circ(cx, cy, 2.6), p.roundBox([[0, '#ffffff'], [0.6, '#ffe08a'], [1, '#c88a10']], 0.35, 0.3, 0.7), stroke('#6a3a04', 0.9)));
  if (p.fine) out.push(path(`${glint(-15.6, 12.6, 1.6)}${glint(16.4, 12.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** Fair play: a heart of polished gold, glossy and full, a sparkle at its shoulder. */
function goldHeart(p: Pen): string {
  const out: string[] = [];
  const ink = '#8a4a06';
  const heart = 'M0,18C-6,13.2 -18.6,6 -18.6,-4.6C-18.6,-11.6 -13.8,-15.6 -8.8,-15.6C-4.8,-15.6 -2,-13.2 0,-9.6C2,-13.2 4.8,-15.6 8.8,-15.6C13.8,-15.6 18.6,-11.6 18.6,-4.6C18.6,6 6,13.2 0,18Z';
  out.push(path(heart, p.round([[0, '#fffbe0'], [0.3, '#ffe066'], [0.7, '#f7b52c'], [1, '#c8700a']], -7, -9, 28), stroke(ink, 1.3)));
  if (!p.tiny) {
    // its shade away from the light, the bevel round its face, its gloss
    out.push(path('M16.8,-6.4C17.6,4 6,11.6 0,16C4.6,10.4 13.4,4.4 16.8,-6.4Z', '#b85e06', ' fill-opacity="0.45"'));
    out.push(line('M0,13.6C-5,9.6 -14.6,4 -14.6,-4.2C-14.6,-9.4 -11.4,-12 -8.4,-12C-5.4,-12 -2.6,-10 0,-6C2.6,-10 5.4,-12 8.4,-12C11.4,-12 14.6,-9.4 14.6,-4.2C14.6,4 5,9.6 0,13.6Z', '#fff6c4', 0.8, ' stroke-opacity="0.6"'));
    out.push(path('M-15.6,-3.4C-16.4,-8.8 -13.4,-13 -9,-13.2C-12,-11.4 -13.8,-8.2 -15.6,-3.4Z', '#ffffff', ' fill-opacity="0.95"'));
    out.push(path(circ(-8.2, -9.6, 1.4), '#ffffff', ' fill-opacity="0.9"'));
    out.push(path('M3.4,11.4C7.6,8.4 11.6,5.2 13.6,1.4C12.6,5.8 8.6,9.2 3.4,11.4Z', '#fff3b0', ' fill-opacity="0.6"'));
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
  out.push(path(at(piece, 0.6, 2.4), '#1a3c9a', stroke(ink, 1.2)));
  out.push(path(at(piece), p.round([[0, '#d6eeff'], [0.4, '#5aa8ff'], [0.8, '#2a6ae0'], [1, '#1c48b8']], -9, -10, 30), stroke(ink, 1.2)));
  if (!p.tiny) {
    // the shade along its far edges, the light along its near ones
    out.push(path(at('M11.2,-8.4L11.2,13.6L-13.6,13.6C-4,12.6 6.4,12 9.6,9.6C10.8,4 10.8,-3 11.2,-8.4Z'), '#123a9a', ' fill-opacity="0.35"'));
    out.push(path(at('M-13.8,-1.8L-13.8,-8.2Q-13.8,-8.8 -13,-8.8L-7,-8.8C-10,-7.6 -12.4,-5.2 -13.8,-1.8Z M-6.8,-15C-6.4,-17.6 -2.4,-18.6 0.6,-18C-2.6,-17.2 -5.2,-16.4 -6.8,-15Z'), '#ffffff', ' fill-opacity="0.85"'));
  }
  out.push(path(glint(-15.2, -15.4, 4.6), '#ffffff', stroke('#c27a0a', 0.5)));
  if (p.fine) out.push(path(`${glint(17.6, 13.6, 1.6)}${glint(-17.8, 11.4, 1.1)}`, '#ffffff'));
  return out.join('');
}

/** Rhymes found: a nightingale on a twig, singing with its head thrown back, a gold note rising from its song. */
function nightingale(p: Pen): string {
  const out: string[] = [];
  const ink = '#3e1e0a';
  // the twig and its leaves
  out.push(line('M-20,16C-10,14.2 4,14.6 20,12.2M11,13.6C13.4,11.4 15.4,10.4 18,10.2', ink, 3.2));
  out.push(line('M-20,16C-10,14.2 4,14.6 20,12.2M11,13.6C13.4,11.4 15.4,10.4 18,10.2', p.line([[0, '#c88a52'], [1, '#7a4a22']], 0, 12, 0, 17), 1.6));
  out.push(path('M-12.6,15.2C-15.6,16.6 -16.4,19.4 -14.6,20.6C-12.4,19.4 -11.4,17 -12.6,15.2Z M17.6,10.4C18.6,7.4 21,6 22.6,6.6C22.4,9 20.4,10.6 17.6,10.4Z', p.box([[0, '#d4ffa8'], [0.5, '#5fcf5a'], [1, '#2a8f44']]), stroke('#14532d', 0.7)));
  // the tail, the legs, then the bird
  out.push(path('M-7.6,4.6L-18.8,9.6C-19.8,11.4 -18.8,13.4 -16.6,13L-5.6,9.6Z', p.line([[0, '#f0a060'], [1, '#a8461c']], -18, 9, -6, 7), stroke(ink, 1)));
  out.push(line('M0.4,10.6L-0.2,14.2M4.2,9.6L4.6,13.4', '#b8665a', 1.3));
  const body = 'M-9.6,6.6C-10.8,1.4 -6.6,-3.2 -1.2,-3.6C0.2,-7.6 3.4,-10.6 7.2,-10.6C10.6,-10.6 12.6,-8.2 12.4,-5.4C12.2,-3 11,-1 10.6,1.2C9.8,7 5.8,11 0,11.4C-4.6,11.6 -8.6,10 -9.6,6.6Z';
  out.push(path(body, p.round([[0, '#e8bc84'], [0.5, '#b07440'], [1, '#6a3a18']], -2, -8, 22), stroke(ink, 1.2)));
  // its pale breast
  out.push(path('M10.6,-2.4C10.6,3.6 7.4,9.4 1.4,10.8C-2.6,11.6 -6.2,10.6 -8,8.6C-2.6,8.8 3.2,6.2 6,1C7.2,-0.8 8.6,-2 10.6,-2.4Z', p.box([[0, '#fff8ea'], [1, '#e8c89a']]), stroke(ink, 0.5, ' stroke-opacity="0.4"')));
  // the wing folded on its side
  out.push(path('M5.4,-0.8C2.4,-3.2 -4.2,-2.6 -7.4,1.4C-8.8,3.4 -10,5.2 -12,6.6C-8,7.4 -3,6.8 0.6,5C3.2,3.6 4.8,1.6 5.4,-0.8Z', p.box([[0, '#c88e56'], [1, '#6e4020']]), stroke(ink, 0.8)));
  if (!p.tiny) out.push(line('M2.8,0.4C-0.6,0.2 -4.4,2 -7.4,4.8M1.4,2.6C-1.6,3 -4.6,4.4 -6.6,6', '#f4d6a8', 0.6, ' stroke-opacity="0.75"'));
  // the beak open in song, and the eye ringed in pale
  out.push(path('M11.4,-7.4L17,-11.2L12.2,-5.6Z', '#5a3a2a', stroke(ink, 0.5)));
  out.push(path('M11.8,-4.8L16.4,-5.8L11.4,-3.4Z', '#7a5240', stroke(ink, 0.5)));
  out.push(path(circ(8.4, -6.6, 2), '#fff3dc'));
  out.push(path(circ(8.6, -6.6, 1.25), '#1d0e04'));
  out.push(path(circ(8.2, -7, 0.45), '#ffffff'));
  if (!p.tiny) out.push(path('M2.4,-8C3.8,-9.8 6,-10.6 8.2,-10C6,-9.6 4.2,-9 2.4,-8Z M-8.4,1.6C-7,-1 -4.6,-2.6 -1.8,-2.8C-4.4,-1.6 -6.4,-0.2 -8.4,1.6Z', '#ffffff', ' fill-opacity="0.6"'));
  // its note, rising
  const gold = p.box([[0, '#fff3a0'], [0.5, '#ffc21f'], [1, '#c27a0a']]);
  out.push(path(turn(oval(0, 0, 2.6, 1.9), -22, 13.8, -12.6), gold, stroke('#7a4a04', 0.9)));
  out.push(path('M15.4,-13.2V-20.4C16.4,-18.4 18.8,-17.6 19.6,-15.2C18.6,-16.4 17.4,-16.6 16.6,-16.6V-13.2Z', gold, stroke('#7a4a04', 0.9)));
  if (p.fine) out.push(path(`${glint(-15.4, -6.6, 1.6)}${glint(-4.6, -14.6, 1.2)}`, '#ffffff'));
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
