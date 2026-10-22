/**
 * The pictures Hevalo shows on the habit badges' (and the ranked ones' that are not a rank's stone) — a flame, a calendar, the sunrise, a wave, a swallow, a teapot, a flower of seven petals, a mountain with a flag, and a pin on the map — drawn whole with the pen
 * (pen.ts), in the style of the secrets (pictures.ts).
 */
import { circ, ell, glint, line, n, path, stroke } from '../pen.js';
import type { Pen, Picture } from '../pen.js';

/** A point `r` out from (cx, cy) at `deg` degrees, written short. */
const at = (cx: number, cy: number, r: number, deg: number): string => `${n(cx + Math.cos((deg * Math.PI) / 180) * r)},${n(cy + Math.sin((deg * Math.PI) / 180) * r)}`;

/** Fire, the longest streak: a lively flame in three tongues, deep orange outside, gold within and white at its heart, glowing. */
function fire(p: Pen): string {
  const out: string[] = [];
  const ink = '#8a1c0a';
  if (!p.tiny) out.push(path(circ(0, 4, 20.4), p.round([[0, '#ffe08a', 0.75], [0.55, '#ff9a3a', 0.28], [1, '#ff7a2a', 0]], 0, 4, 20.4)));
  // the outer flame, its shade on the side away from the light and the light along its other side
  const outer = 'M0,18.6C-9,18.6 -15.2,12.6 -15.2,4.6C-15.2,-1.4 -12.4,-5.4 -10.4,-11.4C-8.8,-7.4 -7.2,-5.2 -4.8,-4C-6.2,-10.4 -3,-16.4 3.4,-20.6' +
    'C1.6,-15.4 4.6,-11.4 8,-7.8C9.4,-9.6 9.8,-12.2 9.2,-15C13.6,-11 15.6,-5 15.4,2.4C15.4,11.8 9.2,18.6 0,18.6Z';
  out.push(path(outer, p.round([[0, '#ffd23a'], [0.42, '#ff7a1a'], [0.78, '#f0401c'], [1, '#c41a2a']], -1, 9, 28), stroke(ink, 1.3)));
  if (!p.tiny) {
    out.push(path('M15.4,2.4C15.4,11.8 9.2,18.6 0,18.6C6.6,16.4 11.4,10.6 11.8,3.4C12,-0.8 11.2,-4.4 9.8,-7.6C12.6,-4.8 15.4,-1.8 15.4,2.4Z', '#a8101e', ' fill-opacity="0.4"'));
    out.push(path('M-12.8,7.6C-13.4,2.6 -11.8,-1.8 -10,-5.8C-10,-1.6 -10.6,2.8 -10.4,7C-10.8,8.6 -12.4,8.8 -12.8,7.6Z', '#ffffff', ' fill-opacity="0.6"'));
  }
  // the gold within, and the white at its heart
  out.push(path('M0,17.2C-6.6,17.2 -10.8,12.8 -10.8,7.2C-10.8,2.6 -8,-0.6 -6.4,-3.8C-5.4,-1.2 -3.8,0.4 -2,1.2C-2.8,-4.6 -0.4,-9.8 3.6,-13.4' +
    'C3.8,-8.8 6.2,-5.6 8.6,-2.6C10,-0.8 10.8,2.6 10.8,6.8C10.8,12.8 6.6,17.2 0,17.2Z', p.round([[0, '#fff6b0'], [0.5, '#ffd23a'], [1, '#ff9a1a']], -1, 11, 18), stroke('#e0560c', 0.6)));
  out.push(path('M0,16.2C-4.2,16.2 -6.8,13.4 -6.8,9.8C-6.8,6 -4.2,3.6 -2.6,0.6C-1.8,2.8 -0.6,3.8 0.6,4.2C0.6,1.2 1.8,-1.8 3.8,-3.8C4.2,-0.4 6.8,3 6.8,8.6' +
    'C6.8,13 4.2,16.2 0,16.2Z', p.round([[0, '#ffffff'], [0.55, '#fffbe0'], [1, '#ffe25a']], -0.6, 11, 9)));
  // sparks thrown up from it
  if (!p.tiny) out.push(path(`${circ(-15, -14.6, 1.3)}${circ(14.6, -18, 1.1)}${circ(-18, -4.6, 0.8)}`, p.roundBox([[0, '#ffffff'], [0.45, '#ffe066'], [1, '#ff7a1a']], 0.4, 0.4, 0.6), stroke('#c43a0a', 0.5)));
  if (p.fine) out.push(path(`${glint(-11.6, -18.4, 1.6)}${glint(17.6, -9.4, 1.3)}`, '#ffffff'));
  return out.join('');
}

/** A week of goals met: a desk calendar's page, its rings at the top, its red header, and a big green check across the week. */
function calendar(p: Pen): string {
  const out: string[] = [];
  const ink = '#4a2e5c';
  // the pages under it, then the page, its last corner turned up
  out.push(path('M-16.6,-10.4H16.6V16.6C16.6,18.4 15.4,19.6 13.6,19.6H-13.6C-15.4,19.6 -16.6,18.4 -16.6,16.6Z', '#c9bde6', stroke(ink, 1.2)));
  out.push(path('M-17.4,-11.6C-17.4,-13.6 -16,-15 -14,-15H14C16,-15 17.4,-13.6 17.4,-11.6V10.4L11,17.4H-14C-16,17.4 -17.4,16 -17.4,14Z', p.line([[0, '#ffffff'], [0.6, '#f5f1fc'], [1, '#d9cff0']], -8, -6, 10, 18), stroke(ink, 1.2)));
  out.push(path('M17.4,10.4L11,17.4C11.8,15 11.6,12.8 10.8,11.2C13,11.6 15.2,11.4 17.4,10.4Z', p.box([[0, '#ffffff'], [1, '#b9acd8']]), stroke(ink, 0.9)));
  if (!p.tiny) {
    // the days, and the header's shadow on them
    out.push(path('M-16.6,-4.4H16.6V-2.8H-16.6Z', '#b9acd8', ' fill-opacity="0.55"'));
    out.push(line('M-12.4,1h2.4M-6.2,1h2.4M0,1h2.4M6.2,1h2.4M-12.4,6.6h2.4M-6.2,6.6h2.4M0,6.6h2.4M6.2,6.6h2.4M-12.4,12.2h2.4M-6.2,12.2h2.4M0,12.2h2.4', '#d2c8e8', 2));
  }
  // the header band, and the rings through it
  out.push(path('M-17.4,-4.6V-11.6C-17.4,-13.6 -16,-15 -14,-15H14C16,-15 17.4,-13.6 17.4,-11.6V-4.6Z', p.line([[0, '#ff8a8a'], [0.45, '#f0283e'], [1, '#b8102c']], 0, -15, 0, -4.6), stroke(ink, 1.2)));
  if (!p.tiny) out.push(line('M-15.2,-12.2C-15,-13 -14.4,-13.4 -13.4,-13.4H13.4', '#ffffff', 1, ' stroke-opacity="0.6"'));
  out.push(path(`${ell(-8.6, -9.2, 1.7, 1.2)}${ell(8.6, -9.2, 1.7, 1.2)}`, '#5a0a1e'));
  out.push(line('M-8.6,-9.4V-18M8.6,-9.4V-18', ink, 3.6));
  out.push(line('M-8.6,-9.4V-18M8.6,-9.4V-18', p.line([[0, '#ffffff'], [0.5, '#c9cfe0'], [1, '#7a84a8']], -9.6, 0, -7.4, 0), 1.8));
  // the check
  out.push(line('M-8.4,4.4L-2.6,10.2L10.6,-3', '#0d5a26', 6.4));
  out.push(line('M-8.4,4.4L-2.6,10.2L10.6,-3', p.line([[0, '#9cf27a'], [0.5, '#2fbf4f'], [1, '#14843a']], -4, -3, 4, 11), 4.2));
  if (!p.tiny) out.push(line('M-8.2,3.6L-2.8,8.8M-1.6,8.4L9.8,-3.2', '#ffffff', 0.8, ' stroke-opacity="0.65"'));
  if (p.fine) out.push(path(`${glint(-13.4, -18.4, 1.6)}${glint(15.4, 3.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** The days of learning: the golden sun of the Kurds half risen over green hills, its twenty-one rays sharp and straight. */
function sunrise(p: Pen): string {
  const out: string[] = [];
  const cy = 4;
  out.push(path(`M-21,${cy + 1}A21,21 0 0 1 21,${cy + 1}Z`, p.round([[0, '#fff3b0', 0.9], [0.5, '#ffc46a', 0.45], [1, '#ff9a5a', 0]], 0, cy, 21)));
  // the sun's twenty-one rays: a point at the outer radius, a notch at about half of it, one straight up; only those over the hills
  const pt = (k: number, r = k % 2 === 0 ? 20 : 11): string => at(0, cy, r, -90 + (k * 360) / 42);
  const ks = Array.from({ length: 23 }, (_, i) => i - 11);
  out.push(path(`M${ks.map((k) => pt(k)).join('L')}Z`, p.round([[0, '#ffffff'], [0.42, '#fff3a0'], [0.68, '#ffd23a'], [1, '#ffa214']], -2, cy - 2, 21), stroke('#cc660a', 0.75)));
  if (!p.tiny) {
    // the half of each ray away from the light, a shade deeper, as if cast in gold; and the light on the sun's face
    out.push(path(ks.filter((k) => k % 2 === 0).map((k) => `M${pt(k)}L${pt(k + 1)}L${pt(k, 10.4)}Z`).join(''), '#f08a0a', ' fill-opacity="0.3"'));
    out.push(path(`M-7.4,${cy - 0.8}C-6.8,${cy - 4.6} -3.8,${cy - 7.2} -0.2,${cy - 7.6}C-3.4,${cy - 6} -5.6,${cy - 3.6} -6.4,${cy - 0.6}Z`, '#ffffff', ' fill-opacity="0.85"'));
  }
  // the hills it rises over, lit gold-green along their tops and fading away below
  const hills = `M-20.4,${cy + 2}C-15,${cy - 2} -8.4,${cy - 2.4} -3,${cy + 0.4}C2,${cy - 2.2} 10,${cy - 2.8} 15,${cy - 0.2}C17.4,${cy + 1} 19.4,${cy + 2.2} 20.4,${cy + 3}`;
  out.push(path(`${hills}V${cy + 11}H-20.4Z`, p.roundBox([[0, '#e2f79a'], [0.3, '#8ad05a'], [0.55, '#3f9a42', 0.85], [0.9, '#2f8a3e', 0]], 0.5, 0, 1)));
  out.push(line(hills, '#1a5a2e', 1.1));
  if (!p.tiny) out.push(line(`M-17.6,${cy + 0.6}C-13.8,${cy - 1.4} -8.8,${cy - 1.4} -5.6,${cy + 0.2}M4.4,${cy - 1.2}C8.4,${cy - 2.4} 12,${cy - 2} 14.8,${cy - 0.6}`, '#fff6c0', 1, ' stroke-opacity="0.9"'));
  if (p.fine) out.push(path(`${glint(-16.4, -12.4, 1.8)}${glint(16.6, -14.6, 1.4)}`, '#ffffff'));
  return out.join('');
}

/** A wave of the ocean, three weeks at the top: it rises and curls over, white foam along its crest, a spray of drops thrown from it. */
function wave(p: Pen): string {
  const out: string[] = [];
  const ink = '#0a2f6a';
  // the hollow under its curl, then the wave over it
  out.push(path('M10.4,-6.6C14,-4.6 18,-5.4 19.6,-7.8C20.8,-1.6 20,5.6 17.2,13.4C11.8,11.6 7.6,8.4 5.6,3.4C4.6,0.2 6.8,-5 10.4,-6.6Z', p.line([[0, '#082c6a'], [1, '#1a6cc4']], 16, -4, 12, 12), stroke(ink, 1.1)));
  if (!p.tiny) out.push(line('M18.6,-4.4C19.2,0.6 18.6,5.6 16.8,10.4', '#5fb8f0', 0.9, ' stroke-opacity="0.7"'));
  const body = 'M-20,19C-17.4,13.6 -14.4,8 -12.2,1.4C-9.6,-7 -3.6,-16.4 5.4,-18.2C12.8,-19.6 19.4,-14.6 19.6,-7.6C19.8,-2.4 16,1.2 12,0.4' +
    'C9.4,-0.2 8.4,-3 9.8,-4.8C7,-4.4 4.6,-1.4 5,2.4C5.6,7.6 10.6,11.2 16.6,12.6L20,14V19Z';
  out.push(path(body, p.line([[0, '#0e4aa0'], [0.4, '#1a8ee0'], [0.75, '#3fd0f0'], [1, '#c0f8ff']], -8, 19, 4, -18), stroke(ink, 1.2)));
  if (!p.tiny) out.push(line('M-15.4,15.4C-12.4,9 -10,2 -7,-4.6M-8.6,17.6C-6,11.6 -4.6,6 -2.4,0.4M7.6,6.4C10.4,9 14,10.4 18.4,10.8', '#9eeeff', 0.9, ' stroke-opacity="0.6"'));
  // the foam along its crest and over its lip
  const foam = 'M-10.6,-3.4C-7.4,-11.6 -1.4,-17 5.4,-18.2C12.8,-19.6 19.4,-14.6 19.6,-7.6C19.8,-2.4 16,1.2 12,0.4C14.4,-1.4 15.6,-4 15,-6.6' +
    'C13.6,-6 12.4,-7.4 12.8,-9C11,-8.6 9.6,-10.2 10.2,-11.6C8.2,-11.4 6.8,-12.8 7.2,-14.2C5,-13.4 3.4,-14.4 3.4,-15.4C1.4,-14 -0.6,-14.2 -1.4,-15C-2.8,-13 -5,-12.6 -6,-13C-6.6,-10.4 -8.8,-9 -10.6,-3.4Z';
  out.push(path(foam, p.line([[0, '#ffffff'], [1, '#c8f0ff']], 0, -19, 0, 0), stroke(ink, 0.8)));
  // the sea it rises from, foaming where it falls
  out.push(path('M-20,15.6C-16.6,13.4 -13,13.8 -10.4,15.6C-7.4,13.6 -3.6,13.6 -0.6,15.6C2.6,13.4 6.4,13.4 9.4,15.4C12.4,13.2 16.4,12.8 20,14.4V19H-20Z', p.line([[0, '#3fd0f0'], [1, '#1466c0']], 0, 13, 0, 19), stroke(ink, 1)));
  if (!p.tiny) {
    out.push(line('M-18.4,15.4C-16,14.4 -13.4,14.6 -11.6,15.6M-8.8,15.2C-6.4,14.2 -3.8,14.2 -1.8,15.4M1.4,15.2C3.8,14 6.4,14 8.4,15.2M10.8,14.8C13.4,13.6 16.4,13.4 18.8,14.4', '#ffffff', 1, ' stroke-opacity="0.85"'));
    // foam where its lip falls into the sea
    out.push(path(`${circ(14.6, 13, 1.5)}${circ(17.4, 12.2, 1.9)}${circ(19.4, 13.8, 1.2)}`, '#ffffff', stroke(ink, 0.5)));
    // a spray of drops
    out.push(path(`${circ(-14.6, -12.4, 1.4)}${circ(-17.6, -7.4, 1)}${circ(-12.4, -17.2, 0.9)}${circ(-18.4, -14.6, 0.7)}`, '#ffffff', stroke(ink, 0.5)));
  }
  if (p.fine) out.push(path(`${glint(-4.6, -18.4, 1.6)}${glint(-15.6, 4.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** The return: a swallow come home, in flight, its back a deep glossy blue, its belly white, its throat red, its tail forked. */
function swallow(p: Pen): string {
  const out: string[] = [];
  const ink = '#0e1648';
  const blue = p.line([[0, '#6a9cff'], [0.4, '#2a52c4'], [1, '#121f66']], -10, -16, 8, 10);
  // the far wing, down behind it, and the forked tail
  out.push(path('M-4.6,-2.6C-9.6,2 -12.6,8.4 -13.4,15.6C-9.4,10.8 -5.2,6.6 0.6,2.8Z', '#1b2c7a', stroke(ink, 1)));
  if (!p.tiny) out.push(line('M-5.6,-0.8C-8.6,2.6 -10.8,7 -12,11.8', '#6a8ce8', 0.7, ' stroke-opacity="0.6"'));
  out.push(path('M3.8,1.6C8.2,1.8 14,2.6 20,3.6C15,4.4 11.6,5.2 9.6,6C11.8,9 13.8,12.6 15.8,17.2C11,13.6 6.6,9.4 3.4,5Z', blue, stroke(ink, 1)));
  // the body: its blue back, its white belly and its red throat and brow
  out.push(path('M-14.6,-8.6C-14.6,-11.4 -12.6,-12.8 -10.4,-12.8C-7,-12.6 -3.4,-9.6 1,-5.6C3.6,-3.2 6,-0.8 8.2,1.4L7,4.8C2,5.6 -4.6,3.6 -9,-0.2C-11.8,-2.6 -14.6,-5 -14.6,-8.6Z', blue, stroke(ink, 1.1)));
  out.push(path('M-11.4,-4.4C-7.6,-4.6 -2,-2.6 4,0.6C5.6,1.6 6.8,2.6 7.6,3.6L7,4.8C2,5.6 -4.6,3.6 -9,-0.2C-10,-1.4 -10.8,-2.8 -11.4,-4.4Z', p.line([[0, '#ffffff'], [1, '#ddd2ec']], 0, -3, 0, 5)));
  out.push(path('M-14.6,-8.4C-14.4,-6 -13,-4.2 -11,-3.8C-10.6,-5.8 -10.8,-7.4 -11.8,-8.6Z M-14.4,-9.8C-14,-11.4 -12.8,-12.4 -11.4,-12.7L-12.2,-10Z', p.box([[0, '#ff9a7a'], [1, '#d8261e']])));
  out.push(path('M-14.4,-9.8L-17.4,-9.2L-14.4,-8.2Z', '#2a2030', stroke(ink, 0.6)));
  // the near wing, raised
  out.push(path('M-6.8,-7.6C-3.6,-13.8 4.2,-18.4 18.6,-19.2C12.4,-16.2 6.8,-12 3,-5.6Z', blue, stroke(ink, 1.1)));
  if (!p.tiny) {
    out.push(line('M-1.8,-9C2.2,-12.6 7.6,-15.6 14,-17.6M0.6,-7C4,-10.2 8.4,-12.8 11.4,-14.4', '#a8c4ff', 0.6, ' stroke-opacity="0.7"'));
    out.push(path('M-12.8,-11.4C-11.6,-12.2 -9.8,-12.2 -8.4,-11.4C-9.8,-11.2 -11.2,-11 -12.8,-11.4Z M-5,-8.6C-3,-12.4 1.8,-15.6 8,-17.2C3.4,-15.2 -0.8,-12.4 -5,-8.6Z', '#ffffff', ' fill-opacity="0.65"'));
  }
  out.push(path(circ(-11.6, -9.6, 1), '#0a0a1e'));
  if (!p.tiny) out.push(path(circ(-11.9, -9.9, 0.35), '#ffffff'));
  if (p.fine) out.push(path(`${glint(-17.4, -15.4, 1.6)}${glint(17.6, 10.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** A whole week, one petal for each of its days: a golden flower of seven petals, its heart a ring of seeds, two leaves behind it. */
function sevenPetals(p: Pen): string {
  const out: string[] = [];
  const turns = Array.from({ length: 7 }, (_, i) => -90 + (i * 360) / 7);
  // two leaves behind it
  out.push(path('M5.4,8.4C9.4,7.4 15.4,9.6 19.4,15.6C14,17.8 7.6,15.6 5.4,8.4Z M-5.4,8.4C-9.4,7.4 -15.4,9.6 -19.4,15.6C-14,17.8 -7.6,15.6 -5.4,8.4Z', p.line([[0, '#b6f08a'], [0.5, '#4fbf4c'], [1, '#1f7a3a']], 0, 8, 0, 18), stroke('#1a5a2e', 0.9)));
  if (!p.tiny) out.push(line('M6.4,9.4C10.4,10.4 14.4,12.6 17.6,15.4M-6.4,9.4C-10.4,10.4 -14.4,12.6 -17.6,15.4', '#1a5a2e', 0.6, ' stroke-opacity="0.55"'));
  // the petals: each drawn from its base out to its tip and back, turned; and the half of each away from the light
  const petal = (deg: number, half: boolean): string => {
    const a = (r: number, d: number): string => at(0, -1, r, deg + d);
    return half ? `M${a(4, 0)}L${a(18.8, 0)}C${a(18.4, 13.6)} ${a(12, 27)} ${a(4, 0)}Z` : `M${a(4, 0)}C${a(9.4, -48)} ${a(19.8, -21)} ${a(18.8, 0)}C${a(19.8, 21)} ${a(9.4, 48)} ${a(4, 0)}Z`;
  };
  out.push(path(turns.map((d) => petal(d, false)).join(''), p.round([[0, '#fff3b0'], [0.32, '#ffdc4a'], [0.68, '#ffb81c'], [1, '#e88a0c']], -4, -6, 26), stroke('#9a5206', 1.1)));
  if (!p.tiny) out.push(path(turns.map((d) => petal(d, true)).join(''), '#d06a06', ' fill-opacity="0.3"'));
  if (p.fine) out.push(line(turns.map((d) => `M${at(0, -1, 8, d)}L${at(0, -1, 15.4, d)}`).join(''), '#c46a06', 0.5, ' stroke-opacity="0.5"'));
  // the heart, and the seeds in it in two rings
  out.push(path(circ(0, -1, 6.6), p.round([[0, '#e09a4a'], [0.6, '#9a4c12'], [1, '#5a2a08']], -1.8, -2.8, 8.2), stroke('#4a2206', 1)));
  if (!p.tiny) {
    const ring = (count: number, r: number, size: number, turn: number): string =>
      Array.from({ length: count }, (_, i) => circ(Math.cos(((turn + (i * 360) / count) * Math.PI) / 180) * r, -1 + Math.sin(((turn + (i * 360) / count) * Math.PI) / 180) * r, size)).join('');
    out.push(path(ring(10, 4.3, 0.8, -90) + ring(5, 2, 0.6, -54), '#ffd27a'));
    out.push(path('M-4.8,-2.8C-4.4,-5 -2.6,-6.4 -0.4,-6.6C-2.2,-5.8 -3.6,-4.6 -4.8,-2.8Z', '#ffffff', ' fill-opacity="0.7"'));
  }
  if (p.fine) out.push(path(`${glint(-15.4, -14.4, 1.6)}${glint(16.4, -6.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** A climber's season: a snowy mountain peak with a small red flag on its summit, a second peak behind it and cloud at its feet. */
function summit(p: Pen): string {
  const out: string[] = [];
  const ink = '#262a5e';
  const snow = p.line([[0, '#ffffff'], [1, '#d2e2ff']], -4, -14, 4, -1);
  const cloud = p.line([[0, '#ffffff'], [1, '#d6c6f4']], 0, 12, 0, 18);
  // the peak behind, then the mountain
  out.push(path('M1.6,18L12.4,-3.6L15,-1L20.4,18Z', p.line([[0, '#d0d8f8'], [1, '#7480c4']], 8, -4, 16, 18), stroke(ink, 1.1)));
  out.push(path('M12.4,-3.6L10,1.4Q11.2,0.4 12.1,1.8Q13.2,3 14.3,1.4Q15,0.6 15.8,1.6L15,-1Z', snow, stroke(ink, 0.7)));
  out.push(path('M-20,18L-12.4,3.6L-9.2,1.4L-1.6,-14L5.4,-2.4L8.4,-0.6L16,18Z', p.line([[0, '#d6defa'], [0.45, '#8590d0'], [1, '#3f4688']], -12, -8, 10, 18), stroke(ink, 1.2)));
  // its face away from the light, its rock, and the snow on its head
  if (!p.tiny) {
    out.push(path('M-1.6,-14L5.4,-2.4L8.4,-0.6L16,18L2.6,18L4,7.4L0.4,-2.6Z', '#232862', ' fill-opacity="0.42"'));
    out.push(line('M-11.4,9.4L-7.4,6.8M-15.6,13.6L-11.4,11.4M-5.6,4.6L-3.2,2.8M7.2,11.6L9.8,8.4M5.6,4.4L7.6,2.6', ink, 0.7, ' stroke-opacity="0.35"'));
    out.push(line('M-15.8,10.4L-12,3.8L-9,1.8L-6.8,-2.6', '#ffffff', 0.9, ' stroke-opacity="0.6"'));
  }
  out.push(path('M-1.6,-14L-7.6,-1.8Q-6.2,-3.6 -5,-1.6Q-4,0.4 -3,-1.4L-2.2,-3Q-1,-1 0,-2.8Q1,-4.4 2.4,-2.2Q3.4,-0.8 4.4,-4Z', snow, stroke(ink, 0.8)));
  if (!p.tiny) out.push(path('M-1.6,-14L4.4,-4Q3.4,-0.8 2.4,-2.2Q1.4,-3.8 0.4,-2.8Z', '#9fb4ec', ' fill-opacity="0.75"'));
  // the flag on the summit
  out.push(line('M-1.6,-13.6V-21.4', '#4a2a1a', 1.3));
  out.push(path('M-1.2,-21.4C2.2,-22.6 5.4,-20.2 9.4,-20.8C6.8,-19.2 4.4,-16.8 -1.2,-16.6Z', p.box([[0, '#ff9a9a'], [0.5, '#f0283e'], [1, '#a80c26']]), stroke('#6a0618', 0.7)));
  // clouds at its feet
  out.push(path('M-20,18C-20,14.8 -17,13.2 -14.4,14.4C-13.4,11.8 -9.4,11.2 -7.6,13.4C-5.8,12 -2.6,12.8 -2.2,15.4C0,15.2 1.6,16.6 1.4,18Z', cloud, stroke('#5a4a9a', 0.9)));
  out.push(path('M8.6,18C8.6,16 10.6,14.8 12.4,15.6C13.4,13.8 16.4,13.6 17.6,15.4C19.2,15 20.4,16.4 20.2,18Z', cloud, stroke('#5a4a9a', 0.9)));
  if (p.fine) out.push(path(`${glint(-12.6, -12.4, 1.6)}${glint(16.6, -11.4, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** Placed: a glossy red pin set in the map at the end of its road, a white check in its head. */
function pin(p: Pen): string {
  const out: string[] = [];
  const ink = '#6a0618';
  // the folded map it stands in, a road across it to the pin
  out.push(path('M-18.6,11.4L-6.2,13.4L6.2,11.4L18.6,13.4V19.6L6.2,17.6L-6.2,19.6L-18.6,17.6Z', '#f6efdc', stroke('#5a4a2a', 1)));
  if (!p.tiny) {
    out.push(path('M-6.2,13.4L6.2,11.4V17.6L-6.2,19.6Z', '#c9b896', ' fill-opacity="0.6"'));
    out.push(path('M-16.4,13.6C-14,12.6 -11,13.4 -10.4,15.4C-12,17 -15,17 -16.4,13.6Z M9.4,13.6C11.4,12.8 13.6,13.4 13.4,15.4C11.6,16.4 9.6,15.8 9.4,13.6Z', '#7ad06a'));
    out.push(path('M12.6,17.4C14,16.4 16.2,16.4 17.4,17.6C16.4,18.6 14,18.6 12.6,17.4Z', '#6ac6f0'));
    out.push(line('M-17,17C-13.4,15 -10,17.6 -6.6,16.4C-4.4,15.6 -2.6,15.6 -0.8,15.4', '#e0142e', 0.8, ' stroke-dasharray="1.4 1.1"'));
  }
  out.push(path(ell(0, 15.2, 4.4, 1.4), '#3a0a1a', ' fill-opacity="0.35"'));
  // the pin
  out.push(path('M0,15.2C-3.4,9.8 -11.6,3.4 -11.6,-6.2C-11.6,-13 -6.4,-18.4 0,-18.4C6.4,-18.4 11.6,-13 11.6,-6.2C11.6,3.4 3.4,9.8 0,15.2Z', p.round([[0, '#ffb0b4'], [0.3, '#ff4a5a'], [0.75, '#e0142e'], [1, '#a00c24']], -4, -11, 24), stroke(ink, 1.3)));
  if (!p.tiny) {
    out.push(path('M11.6,-6.2C11.6,3.4 3.4,9.8 0,15.2C2.4,9.6 8.4,3.6 9.2,-4.8C9.6,-9.6 8,-13.8 5,-16.4C9,-14.6 11.6,-10.6 11.6,-6.2Z', '#8a0a20', ' fill-opacity="0.45"'));
    out.push(path('M-9.2,-8.6C-9,-12.6 -6,-15.6 -2.2,-16C-5.4,-14.4 -7.6,-12 -8.4,-8.4Z', '#ffffff', ' fill-opacity="0.85"'));
  }
  // the check in its head
  out.push(line('M-5.2,-6.4L-1.4,-2.6L5.6,-10', ink, 5));
  out.push(line('M-5.2,-6.4L-1.4,-2.6L5.6,-10', '#ffffff', 3.2));
  if (p.fine) out.push(path(`${glint(13.6, -15.4, 1.6)}${glint(-15.4, 4.6, 1.2)}`, '#ffffff'));
  return out.join('');
}

/** Tea, a daily goal met: a round porcelain teapot, gold-banded, a rose painted on its belly, steam from its spout. */
function teapot(p: Pen): string {
  const out: string[] = [];
  const ink = '#4a3a6a';
  const gold = p.line([[0, '#fff3a0'], [1, '#d88a0c']], 0, -14, 0, 16);
  const china = p.round([[0, '#ffffff'], [0.6, '#f3eefb'], [1, '#c9bde6']], -5, -2, 18);
  // the handle behind, the spout, the belly, its foot, the lid and its knob
  out.push(line('M-12.6,-3.4C-20.4,-4.6 -21,8.6 -12.2,9.4', ink, 4.2));
  out.push(line('M-12.6,-3.4C-20.4,-4.6 -21,8.6 -12.2,9.4', china, 2.2));
  out.push(path('M10.4,0.2C13.8,-0.6 15.8,-3.2 17.4,-7.2L20.6,-8.8C20.2,-6.6 19.4,-4.8 18.6,-3.2C17,0.8 14.8,4.8 11,7.4Z', china, stroke(ink, 1)));
  out.push(path(ell(-1, 15.2, 8.2, 2.4), gold, stroke(ink, 0.9)));
  out.push(path('M-14.2,4C-14.2,-4.6 -8.2,-8.8 -1,-8.8C6.2,-8.8 12.2,-4.6 12.2,4C12.2,11 6.6,15 -1,15C-8.6,15 -14.2,11 -14.2,4Z', china, stroke(ink, 1.2)));
  out.push(line('M-13.2,-0.8C-6,-3.6 4,-3.6 11.2,-0.8M-11.6,10.6C-5,13 3,13 9.6,10.6', gold, 1.3));
  out.push(path('M-8.8,-8.2C-8.2,-12.6 6.2,-12.6 6.8,-8.2Z', china, stroke(ink, 1)));
  out.push(path(circ(-1, -13.8, 2.3), p.roundBox([[0, '#ffd2e2'], [1, '#e2457e']], 0.35, 0.3, 0.7), stroke(ink, 0.9)));
  // the rose painted on it, with two leaves
  out.push(path('M-8.2,6.4C-10.6,4.2 -10,1.6 -7.4,2C-5.8,2.2 -5,3.6 -5.4,5.2Z M6.2,6.4C8.6,4.2 8,1.6 5.4,2C3.8,2.2 3,3.6 3.4,5.2Z', p.box([[0, '#b6f08a'], [1, '#2f9a48']]), stroke('#1f6b3a', 0.6)));
  out.push(path(circ(-1, 4.6, 4.6), p.roundBox([[0, '#ffd2e2'], [0.6, '#ff6f9e'], [1, '#c8285e']], 0.4, 0.35, 0.7), stroke('#8a1440', 0.8)));
  if (!p.tiny) {
    out.push(line('M-1,1.6C1.6,1.8 2.4,4.4 0.8,6.2C-0.8,7.8 -3.6,7 -3.8,4.6C-3.9,3.2 -2.8,2.4 -1.6,2.8C-0.4,3.2 -0.4,4.8 -1.4,5.2', '#8a1440', 0.7));
    out.push(path('M-11.4,-0.2C-10.8,-4 -7.4,-6.6 -3.2,-7C-6.6,-5.4 -9.4,-3.2 -11.4,-0.2Z', '#ffffff', ' fill-opacity="0.9"'));
    out.push(line('M19.4,-11C17.6,-13 21.6,-14.6 19.8,-17.4', '#ffffff', 1.3, ' stroke-opacity="0.85"'));
  }
  return out.join('');
}

export const HABIT: Readonly<Record<string, Picture>> = {
  agir: fire,
  hefte: calendar,
  roj: sunrise,
  pela: wave,
  vegera: swallow,
  cay: teapot,
  'gula-hefte': sevenPetals,
  hilkiser: summit,
  cihgirti: pin,
};
