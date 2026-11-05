/**
 * The pictures on the four word-set cards: a paint palette for the colours, an
 * abacus for the numbers, the sun for the days of the week (in Kurdish one
 * word, roj, is both the day and the sun) and a wall calendar for the months.
 * Each is an object a child would know, drawn the same way so the four read as
 * one family: flat cut-outs lit from the upper left, every form with a lit rim
 * along its upper edge and its thickness showing as a darker band below it,
 * as the coin stands forward on its edge.
 *
 * They replaced a grid of four dots that served for both the colours and the
 * months, so the two cards looked alike, a "123" in the display font and a
 * calendar glyph for the days. A picture holds no text, so the numbers are
 * counted rather than written: the abacus shows one bead, then two, then
 * three, which reads the same in every script.
 *
 * The two apps draw these on their own tile, which is light or dark with the
 * theme; each picture carries its own colours, and the pale ones (the
 * calendar's page, the palette's wood) have their darker edge below them so
 * they hold on a light tile too.
 */
import type { WordSetId } from '../word-sets/words.js';
import { COLOURS } from '../word-sets/words.js';
import { Drawing, checkSize, n, prefixFor, tint } from './svg.js';

export interface WordSetArtOptions {
  set: WordSetId;
  /** how big it is drawn, in pixels (it is square) */
  size?: number;
  /** its text label; the cards say the set's name beside it and hide the picture from screen readers */
  title?: string;
  idPrefix?: string;
}

/** One form's three tones: its lit rim, its face, and the edge below it. */
interface Tones {
  light: string;
  base: string;
  shade: string;
}

/** A rounded rectangle as a path, so it can be moved, clipped and cut. */
function rr(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}` +
    `V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
  );
}

/** A circle as a path (two half arcs), for cutting a hole with even-odd. */
function ring(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx - r)} ${n(cy)}Z`;
}

const at = (dx: number, dy: number): string => ` transform="translate(${n(dx)} ${n(dy)})"`;

/**
 * One cut-out form: its thickness as a band of `shade` showing `drop` below
 * it, its face, and a lit rim along its upper left — the face in `light`,
 * then the face again in `base` moved down and right by `rim` and clipped to
 * the shape, so only a sliver of the light stays.
 */
function form(dr: Drawing, d: string, tones: Tones, drop: number, rim: number, evenodd = false): void {
  const rule = evenodd ? ' fill-rule="evenodd"' : '';
  if (drop > 0) dr.add(`<path d="${d}" fill="${tones.shade}"${rule}${at(0, drop)}/>`);
  dr.add(`<path d="${d}" fill="${tones.light}"${rule}/>`);
  dr.add(`<g clip-path="url(#${dr.clip(d, evenodd)})"><path d="${d}" fill="${tones.base}"${rule}${at(rim, rim)}/></g>`);
}

/** A round dab of colour (a bead, a blob of paint): its edge below, its face, and one spot of light. */
function dab(dr: Drawing, cx: number, cy: number, rx: number, ry: number, hex: string, drop: number): void {
  dr.add(`<ellipse cx="${n(cx)}" cy="${n(cy + drop)}" rx="${n(rx)}" ry="${n(ry)}" fill="${tint(hex, -0.28)}"/>`);
  dr.add(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${hex}"/>`);
  dr.add(`<ellipse cx="${n(cx - rx * 0.36)}" cy="${n(cy - ry * 0.38)}" rx="${n(rx * 0.3)}" ry="${n(ry * 0.24)}" fill="${tint(hex, 0.5)}"/>`);
}

const hexOf = (id: string): string => COLOURS.find((c) => c.id === id)!.hex;

// ─────────────────────────────────────────────────────────── the colours

const WOOD_PALE: Tones = { light: '#fde8c4', base: '#f0d09e', shade: '#c4935a' };

/** A painter's palette, its thumb hole at the lower right, with four blobs of the set's first colours round its top. */
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
/** One bead, then two, then three: the numbers counted, in the warm palette's pomegranate, saffron and meadow. */
const BEAD_ROWS: readonly [string, number][] = [
  ['#d8493b', 1],
  ['#f2b632', 2],
  ['#3fa45b', 3],
];

/** An abacus: a wooden frame round three rods, one bead slid along the first, two along the second, three along the third. */
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
    // a blunt tooth from the face out, its tip rounded off
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

/** A wall calendar: a page with a pomegranate band across its top, hung by three rings, and a grid of days with one marked. */
function calendar(dr: Drawing): void {
  const page = rr(18, 28, 84, 76, 14);
  // the rings' far legs go down behind the page
  for (const x of RING_XS) dr.add(`<path d="M${n(x + 11)} 21V34" stroke="${RINGS.back}" stroke-width="5" stroke-linecap="round"/>`);
  form(dr, page, PAGE, 5, 2.4);
  // the band across the top, lit along its upper edge, its lower edge in shadow
  const band = dr.clip(page);
  dr.add(
    `<g clip-path="url(#${band})"><path d="M18 28H102V54H18Z" fill="${HEADER.edge}"/><path d="M18 28H102V51H18Z" fill="${HEADER.face}"/>` +
      `<path d="M18 28H102V31.5H18Z" fill="${HEADER.light}"/></g>`,
  );
  // the days: two weeks of cells, today's marked
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const fill = row === 0 && col === 2 ? TODAY : CELL;
      dr.add(`<path d="${rr(27 + col * 17, 62 + row * 17, 13, 12, 3.5)}" fill="${fill}"/>`);
    }
  }
  // the rings' near legs, from a hole in the band up and over
  for (const x of RING_XS) {
    dr.add(`<ellipse cx="${n(x)}" cy="39" rx="3.6" ry="3" fill="${HEADER.hole}"/>`);
    dr.add(`<path d="M${n(x)} 38V21A5.5 5.5 0 0 1 ${n(x + 11)} 21" fill="none" stroke="${RINGS.front}" stroke-width="5" stroke-linecap="round"/>`);
  }
}

const DRAW: Record<WordSetId, (dr: Drawing) => void> = { colours: palette, numbers: abacus, days: sun, months: calendar };
const TITLE: Record<WordSetId, string> = { colours: 'Colours', numbers: 'Numbers', days: 'Days of the week', months: 'Months' };

/** The picture on a word set's card. */
export function wordSetSvg(opts: WordSetArtOptions): string {
  const size = checkSize(opts.size, 44);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'wordset', opts.set));
  DRAW[opts.set](dr);
  return dr.svg(size, opts.title ?? TITLE[opts.set]);
}
