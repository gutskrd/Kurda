/**
 * Drawn capital letters for the game covers (game-covers.ts), and the oval their round forms are cut from. Letters are
 * paths, never `<text>`, because fonts differ between the phone and the browser. Each is one even, round-ended line in
 * a 7 × 10 box; the set is what the covers write, including the five letters Kurmancî adds to the Latin alphabet.
 */
import { n } from './svg.js';

/** An oval as a path. */
export function oval(cx: number, cy: number, rx: number, ry: number): string {
  return `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
}

/** The hat of ê, î and û, kept clear of the letter's box so a heavy line does not close the gap. */
const HAT = 'M1.8 -2.9L3.5 -4.6L5.2 -2.9';
/** The cedilla of ç and ş, also kept clear: joined to the letter, a heavy line turns Ş into a currency sign. */
const TAIL = 'M4.1 12.5C5.1 13 4.9 14.6 3.2 14.5';
const C = 'M6.2 2.3C5.6 0.9 4.7 0 3.6 0C1.9 0 0.8 1.9 0.8 5C0.8 8.1 1.9 10 3.6 10C4.7 10 5.6 9.1 6.2 7.7';
const E = 'M6 0H1.1V10H6.2M1.1 5H5.2';
const I = 'M3.5 0V10';
const S = 'M6 1.9C5.4 0.7 4.5 0 3.4 0C1.9 0 0.9 1 0.9 2.5C0.9 4.2 2.3 4.7 3.6 5.1C5.1 5.5 6.2 6.2 6.2 7.6C6.2 9.1 5 10 3.5 10C2.2 10 1.2 9.3 0.7 8.1';
const U = 'M0.8 0V6.5C0.8 8.7 2 10 3.5 10C5 10 6.2 8.7 6.2 6.5V0';

/** Each letter's line in a 7 × 10 box, hat above and cedilla below. */
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
  // The dot is a line so short that its round ends make it a dot.
  '?': 'M1.3 2.5C1.3 1 2.3 0 3.6 0C5 0 6 1 6 2.4C6 4.4 3.6 4.6 3.6 6.7M3.6 9.8V9.9',
};

/** The letters a cover can write. */
export const LETTERS: readonly string[] = Object.keys(GLYPHS);

/** Two decimals, for a letter's scale and line weight, where a tenth is too coarse. */
const fine = (v: number): string => String(Math.round(v * 100) / 100);

/** One letter as markup: box's upper left at (x, y), `height` tall, turned `turn` degrees about its middle, line `weight` thick. */
export function letter(ch: string, x: number, y: number, height: number, colour: string, weight: number, turn = 0): string {
  const d = GLYPHS[ch];
  if (d === undefined) throw new RangeError(`art: the covers cannot write ${ch}`);
  const k = height / 10;
  const turned = turn === 0 ? '' : ` rotate(${n(turn)} 3.5 5)`;
  // The letter is scaled into place from its own box, so the stroke is divided by the same factor to come out as asked.
  return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${fine(weight / k)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${n(x)} ${n(y)}) scale(${fine(k)})${turned}"/>`;
}

/** How wide a letter's box is when the letter is `height` tall. */
export const letterWidth = (height: number): number => height * 0.7;
