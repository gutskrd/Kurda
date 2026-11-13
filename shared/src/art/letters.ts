/**
 * The pictures of letters by bird (shared/src/letters.ts): your window, the
 * birds that come and go from it, and a letter in its envelope.
 *
 * The window is a deep arched one in a warm plaster wall, its wooden frame
 * crossed into four panes, a geranium in a pot on the sill — as a window in a
 * Kurdish house is — and through it the same sky and mountains the tree and
 * the profiles stand under, at the hour of the reader's own clock
 * (tree-scene.ts `SKIES`). A bird is drawn on its own (`letterBirdSvg`), so an
 * app can bring one in to the sill and send one away with transforms only,
 * without drawing the window again; `LETTER_SILL` says where on the window's
 * square a bird stands.
 *
 * Everything is a cut-out (cutout.ts) like the app's other objects, and the
 * birds are the songbird of Rhyme's cover (songbird.ts), each in its owner's
 * colour (`LETTER_BIRDS`).
 */
import { LETTER_BIRDS } from '../letters.js';
import { form, ring, rr, type Tones } from './cutout.js';
import { songbird, type SongbirdPose } from './songbird.js';
import { SKIES, type Sky } from './tree-scene.js';
import { Drawing, checkSize, linearAt, n, prefixFor, tint } from './svg.js';
import type { TreeSky } from './tree-scene.js';

const PLASTER = '#f1dfc2';
const WOOD: Tones = { light: '#f3cf9c', base: '#dba869', shade: '#a2733c' };
const POT: Tones = { light: '#f0a27a', base: '#d9774b', shade: '#a2522d' };
const LEAF: Tones = { light: '#8fd39c', base: '#3fa45b', shade: '#2a7340' };
const BLOOM = '#e5484d';
const PAPER: Tones = { light: '#fffaf1', base: '#f6ead6', shade: '#cdb898' };
const SEAL = '#d8493b';

/** The opening of the window: an arch over two straight sides, down to the sill. */
const OPENING = 'M26 90V42C26 24 41 13 60 13C79 13 94 24 94 42V90Z';
/** The frame round it, as wide again all the way round. */
const FRAME_OUTER = 'M20 92V42C20 20 38 7 60 7C82 7 100 20 100 42V92Z';

/**
 * Where a bird stands on the sill, on the window's 120-unit square: under its
 * feet, and how wide its own square (`letterBirdSvg`) is drawn there, as a
 * share of the window's width, so it sits on the sill at a bird's size.
 */
export const LETTER_SILL = { x: 50, y: 91, birdShare: 0.37 } as const;

export interface LetterWindowOptions {
  /** the hour's sky through the window; the day's by default */
  sky?: TreeSky;
  size?: number;
  /** its text label; the apps usually say what is happening beside it and hide the picture from screen readers */
  title?: string;
  idPrefix?: string;
}

/** The far country through the glass: the sky, the sun or the moon, and three ridges of mountains, paler the further they are. */
function view(dr: Drawing, sky: Sky): void {
  const air = dr.id('air');
  dr.def(linearAt(air, [[0, sky.air[0]], [0.62, sky.air[1]], [1, sky.air[2]]], 0, 13, 0, 90));
  dr.add(`<path d="M20 7H100V92H20Z" fill="url(#${air})"/>`);
  const [ox, oy, or, colour, halo] = sky.orb;
  // the orb, brought into the window's own frame of the sky
  const [cx, cy] = [30 + (ox / 120) * 60, 20 + (oy / 120) * 40];
  dr.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(or * 1.6)}" fill="${halo}" fill-opacity="0.35"/>`);
  dr.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(or * 0.9)}" fill="${colour}"/>`);
  dr.add(`<path d="M20 70L34 60L44 64L58 52L72 62L84 56L100 66V92H20Z" fill="${sky.ridges[0]}"/>`);
  dr.add(`<path d="M20 78L32 72L46 76L60 66L76 75L90 70L100 74V92H20Z" fill="${sky.ridges[1]}"/>`);
  dr.add(`<path d="M20 86C34 80 48 82 60 78C74 82 88 80 100 84V92H20Z" fill="${sky.ridges[2]}"/>`);
}

/** A geranium in a clay pot, standing on the sill at its right end. */
function geranium(dr: Drawing): void {
  for (const [x, y, r] of [[83, 76, 5.6], [91, 72, 6.4], [98, 77, 5.2], [88, 81, 5]] as const) form(dr, ring(x, y, r), LEAF, 1, 1);
  for (const [x, y] of [[86, 70], [94, 67], [99, 72]] as const) {
    for (const [dx, dy] of [[-1.8, 0], [1.8, 0], [0, -1.8], [0, 1.8]] as const) dr.add(`<circle cx="${n(x + dx)}" cy="${n(y + dy)}" r="2" fill="${BLOOM}"/>`);
    dr.add(`<circle cx="${n(x)}" cy="${n(y)}" r="1.2" fill="${tint(BLOOM, 0.5)}"/>`);
  }
  form(dr, 'M82 83H102L99.6 92H84.4Z', POT, 0, 1.2);
  form(dr, rr(80.6, 81, 22.8, 4, 1.4), POT, 1, 0.8);
}

/**
 * Your window, at the hour's sky: the plaster wall round it, the view, the
 * wooden frame and its cross of glazing bars, the sill a bird lands on, and
 * the geranium.
 */
export function letterWindowSvg(opts: LetterWindowOptions = {}): string {
  const size = checkSize(opts.size, 120);
  const skyName = opts.sky ?? 'day';
  const sky = SKIES[skyName];
  if (!sky) throw new RangeError(`art: no sky called ${String(skyName)}`);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-window', skyName));
  dr.add(`<path d="M0 0H120V120H0Z" fill="${PLASTER}"/>`);
  // the wall a little deeper below the sill, where its shadow falls
  dr.add(`<path d="M0 100H120V120H0Z" fill="${tint(PLASTER, -0.05)}"/>`);
  dr.add(`<g clip-path="url(#${dr.clip(OPENING)})">`);
  view(dr, sky);
  // the glazing bars, in the frame's wood
  dr.add(`<path d="M58.6 13H61.4V90H58.6ZM26 48.6H94V51.4H26Z" fill="${WOOD.base}"/>`);
  dr.add('</g>');
  form(dr, `${FRAME_OUTER}${OPENING}`, WOOD, 0, 1.6, true);
  dr.add(`<ellipse cx="60" cy="101.5" rx="48" ry="2.6" fill="${tint(PLASTER, -0.12)}"/>`);
  form(dr, rr(12, 89, 96, 9, 3), WOOD, 3, 1.4);
  geranium(dr);
  return dr.svg(size, opts.title ?? 'A window');
}

export interface LetterBirdOptions {
  /** the bird's number (`letterBirdOf`): its colour */
  bird: number;
  pose?: SongbirdPose;
  /** facing left rather than right */
  facingLeft?: boolean;
  size?: number;
  title?: string;
  idPrefix?: string;
}

/** Where a bird's feet are on its own square, and how much bigger than the window's it is drawn. */
export const LETTER_BIRD_FEET = { x: 60, y: 104, scale: 1.9 } as const;

/** A member's bird, on its own transparent square: perched, flying, or flying with a letter in its beak. */
export function letterBirdSvg(opts: LetterBirdOptions): string {
  const size = checkSize(opts.size, 120);
  const hex = LETTER_BIRDS[opts.bird];
  if (!hex) throw new RangeError(`art: no bird ${String(opts.bird)}`);
  const pose = opts.pose ?? 'perched';
  const flip = opts.facingLeft ? -1 : 1;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-bird', opts.bird, pose, flip));
  const { x, y, scale } = LETTER_BIRD_FEET;
  dr.add(`<g transform="translate(${n(x)} ${n(y)}) scale(${n(scale * flip)} ${n(scale)})">`);
  songbird(dr, hex, flip, pose);
  dr.add('</g>');
  return dr.svg(size, opts.title ?? 'A bird');
}

export interface LetterEnvelopeOptions {
  size?: number;
  title?: string;
  idPrefix?: string;
}

/** A letter in its envelope, sealed with red wax: what is written, or arrives. */
export function letterEnvelopeSvg(opts: LetterEnvelopeOptions = {}): string {
  const size = checkSize(opts.size, 120);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-envelope'));
  form(dr, rr(14, 30, 92, 62, 8), PAPER, 4, 2);
  // the flaps: the bottom two meeting under the top one
  dr.add(`<path d="M16 88L52 60M104 88L68 60" fill="none" stroke="${PAPER.shade}" stroke-width="1.6" stroke-linecap="round"/>`);
  form(dr, 'M16 34C16 31.8 17.6 30.6 19.6 31.6L60 63L100.4 31.6C102.4 30.6 104 31.8 104 34L66 66C62.6 68.8 57.4 68.8 54 66Z', PAPER, 1.6, 1);
  form(dr, ring(60, 64, 9), { light: tint(SEAL, 0.32), base: SEAL, shade: tint(SEAL, -0.32) }, 2, 1.4);
  dr.add(`<circle cx="60" cy="64" r="4.6" fill="none" stroke="${tint(SEAL, -0.2)}" stroke-width="1.2"/>`);
  return dr.svg(size, opts.title ?? 'A letter');
}
