/**
 * What the games' covers are written and outlined with (game-covers.ts):
 * smooth outlines through a few placed points, and capital letters.
 *
 * The letters are drawn, not set: a font would be the one place the phone and
 * the browser disagree, so no drawing in `art/` uses `<text>`. Each letter is
 * a single clean line of even weight with round ends, in a box seven wide and
 * ten tall, which is how a letter on a game tile is cut. The set is what the
 * covers write: the words on Peyvok's board, the rhymes, the chain of the
 * last letter, and the five letters Kurmancî adds to the Latin alphabet.
 */
import { n } from './svg.js';

/** A point; a third value of 1 makes it a corner, where an outline turns sharply instead of bending. */
export type P = readonly [number, number, (0 | 1)?];

const sub = (a: P, b: P): [number, number] => [a[0] - b[0], a[1] - b[1]];

/**
 * A curve through placed points: closed for a shape, open for a line. Each
 * bend is eased by its neighbours; at a corner the curve leaves straight for
 * the next point.
 */
export function smooth(pts: readonly P[], closed = true): string {
  const k = pts.length;
  if (k < 2) return '';
  const at = (i: number): P => (closed ? pts[((i % k) + k) % k]! : pts[Math.max(0, Math.min(k - 1, i))]!);
  // how the curve leaves a point, and how it arrives at one
  const leaves = (i: number): [number, number] => {
    const [dx, dy] = at(i)[2] === 1 ? sub(at(i + 1), at(i)) : sub(at(i + 1), at(i - 1));
    const f = at(i)[2] === 1 ? 1 / 3 : 1 / 6;
    return [dx * f, dy * f];
  };
  const arrives = (i: number): [number, number] => {
    const [dx, dy] = at(i)[2] === 1 ? sub(at(i), at(i - 1)) : sub(at(i + 1), at(i - 1));
    const f = at(i)[2] === 1 ? 1 / 3 : 1 / 6;
    return [dx * f, dy * f];
  };
  let d = `M${n(pts[0]![0])} ${n(pts[0]![1])}`;
  const spans = closed ? k : k - 1;
  for (let i = 0; i < spans; i++) {
    const [p1, p2, out, into] = [at(i), at(i + 1), leaves(i), arrives(i + 1)];
    d += `C${n(p1[0] + out[0])} ${n(p1[1] + out[1])} ${n(p2[0] - into[0])} ${n(p2[1] - into[1])} ${n(p2[0])} ${n(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** An oval as a path. */
export function oval(cx: number, cy: number, rx: number, ry: number): string {
  return `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
}

/** The hat of ê, î and û, above the letter's box. */
const HAT = 'M1.7 -1.7L3.5 -3.3L5.3 -1.7';
/** The cedilla of ç and ş, below it. */
const TAIL = 'M3.6 10.1L3.3 11.3C4.5 11.3 4.6 12.9 3.1 12.9';
const C = 'M6.2 2.3C5.6 0.9 4.7 0 3.6 0C1.9 0 0.8 1.9 0.8 5C0.8 8.1 1.9 10 3.6 10C4.7 10 5.6 9.1 6.2 7.7';
const E = 'M6 0H1.1V10H6.2M1.1 5H5.2';
const I = 'M3.5 0V10';
const S = 'M6 1.9C5.4 0.7 4.5 0 3.4 0C1.9 0 0.9 1 0.9 2.5C0.9 4.2 2.3 4.7 3.6 5.1C5.1 5.5 6.2 6.2 6.2 7.6C6.2 9.1 5 10 3.5 10C2.2 10 1.2 9.3 0.7 8.1';
const U = 'M0.8 0V6.5C0.8 8.7 2 10 3.5 10C5 10 6.2 8.7 6.2 6.5V0';

/** Each letter as the line it is drawn with, in a box seven wide and ten tall (a hat above it, a cedilla below). */
const GLYPHS: Readonly<Record<string, string>> = {
  A: 'M0.5 10L3.5 0L6.5 10M1.7 6.6H5.3',
  B: 'M1.1 0V10H3.9C5.4 10 6.3 9 6.3 7.5C6.3 6.1 5.4 5 3.9 5H1.1M3.9 5C5.1 5 5.9 4 5.9 2.6C5.9 1.1 5 0 3.7 0H1.1',
  C,
  Ç: C + TAIL,
  D: 'M1.1 0V10H2.7C5 10 6.4 8.1 6.4 5C6.4 1.9 5 0 2.7 0Z',
  E,
  Ê: E + HAT,
  H: 'M0.9 0V10M6.1 0V10M0.9 5H6.1',
  I,
  Î: I + HAT,
  J: 'M5.3 0V7C5.3 8.9 4.3 10 3 10C1.9 10 1.1 9.3 0.8 8.2',
  K: 'M1.1 0V10M6.2 0L1.1 5.7M3 3.9L6.5 10',
  L: 'M1.2 0V10H6.1',
  N: 'M1 10V0L6 10V0',
  O: 'M3.5 0C1.8 0 0.7 2 0.7 5C0.7 8 1.8 10 3.5 10C5.2 10 6.3 8 6.3 5C6.3 2 5.2 0 3.5 0Z',
  R: 'M1.1 10V0H3.7C5.2 0 6.2 1.1 6.2 2.7C6.2 4.3 5.2 5.4 3.7 5.4H1.1M3.7 5.4L6.4 10',
  S,
  Ş: S + TAIL,
  U,
  Û: U + HAT,
  V: 'M0.5 0L3.5 10L6.5 0',
  Y: 'M0.5 0L3.5 5.1L6.5 0M3.5 5.1V10',
  // the dot is a line too short to be anything else: its round ends make it one
  '?': 'M1.3 2.5C1.3 1 2.3 0 3.6 0C5 0 6 1 6 2.4C6 4.4 3.6 4.6 3.6 6.7M3.6 9.8V9.9',
};

/** The letters a cover can write. */
export const LETTERS: readonly string[] = Object.keys(GLYPHS);

/** A number to two decimals: a letter's scale and the weight of its line, which a tenth is too coarse for. */
const fine = (v: number): string => String(Math.round(v * 100) / 100);

/**
 * One letter as markup: its box's upper left at (x, y), `height` tall, turned
 * by `turn` degrees about its middle, drawn with a line `weight` thick.
 */
export function letter(ch: string, x: number, y: number, height: number, colour: string, weight: number, turn = 0): string {
  const d = GLYPHS[ch];
  if (d === undefined) throw new RangeError(`art: the covers cannot write ${ch}`);
  const k = height / 10;
  const turned = turn === 0 ? '' : ` rotate(${n(turn)} 3.5 5)`;
  // the letter is drawn in its own box and scaled into place, so its line is thinned by the same amount to come out as asked
  return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${fine(weight / k)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${n(x)} ${n(y)}) scale(${fine(k)})${turned}"/>`;
}

/** How wide a letter's box is when the letter is `height` tall. */
export const letterWidth = (height: number): number => height * 0.7;
