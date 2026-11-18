/**
 * The pictures on the Letters and words cards: toy blocks for the alphabet, a paint palette for colours, an abacus for
 * numbers, the sun for weekdays (roj is both day and sun) and a wall calendar for months, all in the cut-out style
 * (cutout.ts). Only the blocks carry letters, drawn as round-pen strokes since drawings hold no text: A, B, C for Latin
 * and ا, ب, پ for Soranî in Arabic script. Numbers are counted on the abacus rather than written, so they read in every
 * script. The apps' tiles are light or dark with the theme, so pale pieces keep a darker edge below them.
 */
import type { WordSetId } from '../word-sets/words.js';
import { COLOURS } from '../word-sets/words.js';
import { at, dab, form, ring, rr, type Tones } from './cutout.js';
import { Drawing, checkSize, n, prefixFor, tint } from './svg.js';

/** What a card on Letters and words shows: the alphabet, or one of the word sets. */
export type WordsCardId = 'letters' | WordSetId;

export interface WordSetArtOptions {
  set: WordsCardId;
  /** For the alphabet's blocks: Latin letters, or the Arabic script Soranî is written in. */
  script?: 'latin' | 'arabic';
  /** Size in pixels; the drawing is square. */
  size?: number;
  /** The accessible label; the cards print the set's name beside it and hide the picture from screen readers. */
  title?: string;
  idPrefix?: string;
}

const hexOf = (id: string): string => COLOURS.find((c) => c.id === id)!.hex;

// ─────────────────────────────────────────────────────────── the letters

const LETTER_PEN = 5.2;
/** The blocks' paint and the colour of the letter cut into each: cream on the dark ones, brown on the saffron. */
const BLOCKS: readonly { x: number; y: number; hex: string; ink: string }[] = [
  { x: 17, y: 62, hex: '#d8493b', ink: '#fff4e2' },
  { x: 63, y: 62, hex: '#3fa45b', ink: '#fff4e2' },
  { x: 40, y: 17, hex: '#f2b632', ink: '#7a3f0c' },
];
const BLOCK = 40;

/** A Latin capital as pen strokes, centred on (0, 0), about 22 units tall. */
const LATIN_GLYPHS: readonly string[] = [
  // A
  'M-9 11L0 -11L9 11M-5.4 3H5.4',
  // B: its stem, the smaller bowl above and the fuller one below.
  'M-7 11V-11H0.5C8.5 -11 8.5 -0.5 0.5 -0.5H-7M0.5 -0.5H1.5C10.5 -0.5 10.5 11 1.5 11H-7',
  // C: most of a ring, open to the right.
  'M8 -7.5A11 11 0 1 0 8 7.5',
];

/**
 * Alif, be and pe as pen strokes: a vertical stroke, and a flat boat with a tooth at its right end, its left end
 * turned up and its dots below. Each is raised by half its descent so letter and dots sit centred on the face.
 */
const BOAT = 'M12 -5V0Q12 3 8 3H-7Q-12 3 -12 -2';
const ARABIC_GLYPHS: readonly { d: string; dots: readonly [number, number][]; lift: number }[] = [
  { d: 'M0 -11V11', dots: [], lift: 0 },
  { d: BOAT, dots: [[0, 9.5]], lift: 3.5 },
  { d: BOAT, dots: [[-4, 9], [4, 9], [0, 14.5]], lift: 5.5 },
];

/** Three toy blocks, two on the ground and one on top, each with a letter on its face. */
function blocks(dr: Drawing, script: 'latin' | 'arabic'): void {
  // In the script's reading order: the first letter where the eye starts, on the ground.
  const order = script === 'arabic' ? [1, 0, 2] : [0, 1, 2];
  BLOCKS.forEach((b, i) => {
    form(dr, rr(b.x, b.y, BLOCK, BLOCK, 9), { light: tint(b.hex, 0.32), base: b.hex, shade: tint(b.hex, -0.32) }, 5, 2.4);
    const cx = b.x + BLOCK / 2;
    const cy = b.y + BLOCK / 2;
    const g = order[i]!;
    if (script === 'latin') {
      dr.add(`<path d="${LATIN_GLYPHS[g]}" fill="none" stroke="${b.ink}" stroke-width="${LETTER_PEN}" stroke-linecap="round" stroke-linejoin="round"${at(cx, cy)}/>`);
    } else {
      const glyph = ARABIC_GLYPHS[g]!;
      const dots = glyph.dots.map(([x, y]) => `<circle cx="${n(x)}" cy="${n(y)}" r="2.8" fill="${b.ink}"/>`).join('');
      dr.add(
        `<g${at(cx, cy - glyph.lift)}><path d="${glyph.d}" fill="none" stroke="${b.ink}" stroke-width="${LETTER_PEN}" stroke-linecap="round" stroke-linejoin="round"/>${dots}</g>`,
      );
    }
  });
}

// ─────────────────────────────────────────────────────────── the colours

const WOOD_PALE: Tones = { light: '#fde8c4', base: '#f0d09e', shade: '#c4935a' };

/** A painter's palette, thumb hole at the lower right, with four blobs of the set's first colours round its top. */
function palette(dr: Drawing): void {
  const d = `M60 24C86 24 106 38 106 58C106 72 98 80 88 86C78 92 72 96 58 96C34 96 14 82 14 60C14 38 34 24 60 24Z${ring(80, 74, 7.5)}`;
  form(dr, d, WOOD_PALE, 5, 2.4, true);
  const blobs: readonly [string, number, number][] = [
    ['red', 34, 58],
    ['yellow', 45, 40],
    ['green', 66, 35],
    ['blue', 86, 47],
  ];
  for (const [id, x, y] of blobs) dab(dr, x, y, 9, 8.4, hexOf(id), 2.4);
}

// ─────────────────────────────────────────────────────────── the numbers

const WOOD_DARK: Tones = { light: '#e9b37a', base: '#cf8c4c', shade: '#91592b' };
const ROD = '#9aa0ad';
/** One bead, then two, then three, in pomegranate, saffron and meadow. */
const BEAD_ROWS: readonly [string, number][] = [
  ['#d8493b', 1],
  ['#f2b632', 2],
  ['#3fa45b', 3],
];

/** An abacus: a wooden frame round three rods holding one, two and three beads. */
function abacus(dr: Drawing): void {
  form(dr, `${rr(16, 22, 88, 78, 12)}${rr(27, 33, 66, 56, 5)}`, WOOD_DARK, 5, 2.4, true);
  BEAD_ROWS.forEach(([hex, count], row) => {
    const y = 46 + row * 16;
    dr.add(`<path d="M27 ${y}H93" stroke="${ROD}" stroke-width="2.4"/>`);
    for (let i = 0; i < count; i++) dab(dr, 39 + i * 15, y, 7, 6.2, hex, 2);
  });
}

// ─────────────────────────────────────────────────────────── the days

const SUN: Tones = { light: '#ffe48a', base: '#ffc93c', shade: '#e09a1c' };
const RAY = { face: '#f6a82c', edge: '#d0801f' };

/** The sun, roj: a round face and eight rounded rays. */
function sun(dr: Drawing): void {
  const cx = 60;
  const cy = 58;
  const rays: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const p = (r: number, da: number): string => `${n(cx + r * Math.cos(a + da))} ${n(cy + r * Math.sin(a + da))}`;
    // A blunt ray from the face out, its tip rounded off.
    rays.push(`M${p(30, -0.26)}L${p(46, -0.09)}Q${p(50, 0)} ${p(46, 0.09)}L${p(30, 0.26)}Z`);
  }
  const d = rays.join('');
  dr.add(`<path d="${d}" fill="${RAY.edge}"${at(0, 4)}/>`);
  dr.add(`<path d="${d}" fill="${RAY.face}"/>`);
  form(dr, ring(cx, cy, 30), SUN, 4, 3);
}

// ─────────────────────────────────────────────────────────── the months

const PAGE: Tones = { light: '#fffaf1', base: '#f2e7d5', shade: '#c9b597' };
const HEADER = { face: '#d8493b', light: '#ec6d5e', edge: '#b3362b', hole: '#7d241d' };
const CELL = '#e0d1b8';
const TODAY = '#f2b632';
const RINGS = { front: '#aab0bc', back: '#7c8392' };
const RING_XS = [33, 54.5, 76];

/** A wall calendar: a page with a pomegranate band, hung by three rings, with a grid of days and one marked. */
function calendar(dr: Drawing): void {
  const page = rr(18, 28, 84, 76, 14);
  // The rings' far legs go down behind the page.
  for (const x of RING_XS) dr.add(`<path d="M${n(x + 11)} 21V34" stroke="${RINGS.back}" stroke-width="5" stroke-linecap="round"/>`);
  form(dr, page, PAGE, 5, 2.4);
  // The band across the top, lit along its upper edge and shaded along its lower.
  const band = dr.clip(page);
  dr.add(
    `<g clip-path="url(#${band})"><path d="M18 28H102V54H18Z" fill="${HEADER.edge}"/><path d="M18 28H102V51H18Z" fill="${HEADER.face}"/>` +
      `<path d="M18 28H102V31.5H18Z" fill="${HEADER.light}"/></g>`,
  );
  // Two weeks of day cells, today's marked.
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const fill = row === 0 && col === 2 ? TODAY : CELL;
      dr.add(`<path d="${rr(27 + col * 17, 62 + row * 17, 13, 12, 3.5)}" fill="${fill}"/>`);
    }
  }
  // The rings' near legs, from a hole in the band up and over.
  for (const x of RING_XS) {
    dr.add(`<ellipse cx="${n(x)}" cy="39" rx="3.6" ry="3" fill="${HEADER.hole}"/>`);
    dr.add(`<path d="M${n(x)} 38V21A5.5 5.5 0 0 1 ${n(x + 11)} 21" fill="none" stroke="${RINGS.front}" stroke-width="5" stroke-linecap="round"/>`);
  }
}

const DRAW: Record<WordSetId, (dr: Drawing) => void> = { colours: palette, numbers: abacus, days: sun, months: calendar };
const TITLE: Record<WordsCardId, string> = { letters: 'Alphabet', colours: 'Colours', numbers: 'Numbers', days: 'Days of the week', months: 'Months' };

/** The picture on a Letters and words card. */
export function wordSetSvg(opts: WordSetArtOptions): string {
  const size = checkSize(opts.size, 44);
  const script = opts.script ?? 'latin';
  const dr = new Drawing(prefixFor(opts.idPrefix, 'wordset', opts.set, opts.set === 'letters' ? script : undefined));
  if (opts.set === 'letters') blocks(dr, script);
  else DRAW[opts.set](dr);
  return dr.svg(size, opts.title ?? TITLE[opts.set]);
}
