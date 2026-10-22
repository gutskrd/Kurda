/**
 * The pictures Hevalo shows on the habit badges' (and the ranked ones' that are not a rank's stone) — a flame, a calendar, the sunrise, a wave, a swallow, a teapot, a flower of seven petals, a mountain with a flag, and a pin on the map — drawn whole with the pen
 * (pen.ts), in the style of the secrets (pictures.ts).
 */
import { circ, ell, line, path, stroke } from '../pen.js';
import type { Pen, Picture } from '../pen.js';

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
  cay: teapot,
};
