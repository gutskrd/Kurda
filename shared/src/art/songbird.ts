/**
 * Hevalo's bird: every member's own bird that carries their letters
 * (letters.ts), and the two birds singing on Rhyme's cover.
 *
 * Traced from the owner's reference: a round little bird, all one soft shape
 * from its head to its rump, its colour deep at the head and fading to pale
 * under the wing; a big pale wing raised over its back, crossed by two dark
 * wavy bars and fine feather lines; a dark fan of a tail; a tuft on its crown,
 * a blush on its cheek, a small dark eye under a brow, a little orange beak
 * and two little orange feet. No outline anywhere: shapes of colour laid one
 * on another.
 *
 * It is drawn about its feet at 0,0, facing right, about thirty units long
 * from tail to beak; a mirror turns it to face left. It flies with the wing
 * up and its feet tucked, stands on a sill or a bough with the wing folded
 * along its side, or flies with a letter held in its beak.
 */
import type { Drawing } from './svg.js';
import { mix, n } from './svg.js';

/** What the bird is doing: standing with its wing folded, or flying, with a letter in its beak or without. */
export type SongbirdPose = 'perched' | 'flying' | 'carrying';

/** The deep the dark parts are taken toward: a night violet, never black. */
const DUSK = '#1d1838';
const BEAK = '#f39a3c';
const FEET = '#f0903a';
const EYE = '#2b2642';
const PAPER = '#fbf3e4';
const PAPER_EDGE = '#d9c8a6';
const SEAL = '#d8493b';

/** A bird's colours, all from the one colour it is: its head, its paler body and wing, the dark of its tail and bars, and its cheek. */
interface Plumage {
  head: string;
  body: string;
  belly: string;
  wing: string;
  quill: string;
  bar: string;
  tail: string;
  tuft: string;
  cheek: string;
  blush: string;
}

/** Whether a colour is green or teal: a teal cheek would not show on it, so it blushes pink. */
function greenish(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  return g > r && g >= b - 10;
}

function plumage(hex: string): Plumage {
  const pinkCheek = greenish(hex);
  return {
    head: hex,
    body: mix(hex, '#ffffff', 0.18),
    belly: mix(hex, '#ffffff', 0.62),
    wing: mix(hex, '#ffffff', 0.74),
    quill: mix(mix(hex, '#ffffff', 0.74), DUSK, 0.32),
    bar: mix(hex, DUSK, 0.72),
    tail: mix(hex, DUSK, 0.62),
    tuft: mix(hex, DUSK, 0.18),
    cheek: pinkCheek ? '#f39bb6' : '#6fd6c2',
    blush: pinkCheek ? mix(hex, '#f39bb6', 0.5) : mix(hex, '#e79ad8', 0.45),
  };
}

const fill = (dr: Drawing, d: string, hex: string): void => dr.add(`<path d="${d}" fill="${hex}"/>`);
const stroke = (dr: Drawing, d: string, hex: string, width: number): void =>
  dr.add(`<path d="${d}" fill="none" stroke="${hex}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`);

/** The body, one round shape from rump to forehead; its chin a little above the feet. */
const BODY = 'M-19 -10C-18.6 -17 -12.4 -21 -5 -22C-2 -26 3 -28 8.4 -27.6C15.4 -27 20 -21 19.6 -13C19.2 -5.4 13.4 -0.4 5 0.2C-4 0.9 -13.6 -0.4 -17.8 -4.2C-19.4 -5.8 -19.6 -8 -19 -10Z';
/** The paler rear and underside the body fades to, under where the wing sits. */
const BELLY = 'M-19 -10C-18.6 -13 -16 -15.6 -11.6 -16.6C-7 -13 -1.4 -8.6 4.6 -5.6C9 -3.4 12.6 -2.4 14.6 -2.2C12 -0.8 8.6 0 5 0.2C-4 0.9 -13.6 -0.4 -17.8 -4.2C-19.4 -5.8 -19.6 -8 -19 -10Z';
/** The tail: a dark fan out behind and a little up. */
const TAIL = 'M-15 -15.4C-21 -18.8 -27.4 -20.6 -32.2 -19.8C-35.8 -19.2 -36.6 -14.6 -33.8 -12.2C-29.2 -8.6 -22.6 -6.8 -15.6 -5.8Z';
const TAIL_LINES = 'M-32.4 -16.6L-18 -12.6M-31 -13L-18 -9.6';
/** The tuft on its crown: two small feathers. */
const TUFT = 'M3.8 -26.8C3.2 -29.8 4.6 -31.8 6.8 -32C6.8 -30 6.2 -28 5.2 -26.6ZM6.4 -27.2C6.8 -30 8.8 -31.4 10.8 -31C10.2 -29.2 9 -27.6 7.6 -26.8Z';

/** The wing raised in flight, its root along the back and its scalloped edge swept up and behind. */
const WING_UP = 'M1.4 -18.6C2.6 -28 0.8 -37 -4.6 -42.4Q-8.4 -42 -10.4 -39.6Q-14 -39.4 -15.4 -36.4Q-18.6 -35 -18.8 -31.6Q-21.4 -29.4 -20.4 -26Q-21.6 -22.6 -19.2 -19.6Q-19.4 -16 -16.2 -14C-10 -13.6 -4.2 -15.2 1.4 -17.6Z';
/** The feather lines fanning from the wing's root to its edge. */
const WING_UP_QUILLS = 'M-6 -16L-8.6 -38.6M-8 -15.6L-13.8 -36.2M-10.2 -15.2L-17.4 -31.8M-12.4 -14.8L-19.4 -26.6M-14.4 -14.6L-18.6 -20.4M-3.8 -16.6L-4.4 -38.4';
/** The two dark wavy bars across the raised wing. */
const WING_UP_BARS =
  'M-12.8 -34.6Q-11.2 -33.2 -12.6 -31.6Q-14 -30 -12.4 -28.6Q-10.8 -27.2 -12.2 -25.6Q-13.6 -24 -12 -22.6Q-10.4 -21.2 -11.8 -19.6' +
  'M-7 -35.4Q-5.4 -34 -6.8 -32.4Q-8.2 -30.8 -6.6 -29.4Q-5 -28 -6.4 -26.4Q-7.8 -24.8 -6.2 -23.4Q-4.6 -22 -6 -20.4';

/** The wing folded along its side, at rest: the same pale feathers and bars, lying back toward the tail. */
const WING_DOWN = 'M4.4 -16.2C2 -19.4 -4 -21 -10 -19.4Q-14.6 -18.6 -17 -16.4Q-21.6 -15.8 -23.4 -13.4Q-21.6 -10.6 -17.6 -9.8Q-13.4 -7.4 -8.6 -7.6C-3.4 -7.6 2.4 -10.4 4.4 -16.2Z';
const WING_DOWN_QUILLS = 'M1.6 -13.6L-14.6 -16.8M0.2 -11.6L-19.6 -13.2M-1.8 -10L-16.2 -9.8';
const WING_DOWN_BARS =
  'M-3.8 -18.2Q-2.6 -16.8 -4 -15.4Q-5.4 -14 -4 -12.6Q-2.6 -11.2 -4 -9.8' + 'M-9.2 -18.4Q-8 -17 -9.4 -15.6Q-10.8 -14.2 -9.4 -12.8Q-8 -11.4 -9.4 -10';

/** The letter a bird carries: a small envelope held by its corner, sealed with red wax. */
function heldLetter(dr: Drawing): void {
  fill(dr, 'M17.6 -12.8L30.8 -11.2L29.6 -1.4L16.4 -3Z', PAPER_EDGE);
  fill(dr, 'M17.6 -13.6L30.8 -12L29.8 -2.6L16.6 -4.2Z', PAPER);
  stroke(dr, 'M17.6 -13.6L23.8 -7.6L30.8 -12', PAPER_EDGE, 0.8);
  dr.add(`<circle cx="23.8" cy="-7.8" r="1.7" fill="${SEAL}"/>`);
}

/**
 * A bird about its feet at 0,0, facing right (`flip` -1 when the caller has
 * mirrored it; the drawing is the same either way, with no light to keep on
 * one side). The same bird sings on Rhyme's cover and carries a member's
 * letters.
 */
export function songbird(dr: Drawing, hex: string, _flip: 1 | -1, pose: SongbirdPose = 'perched'): void {
  const p = plumage(hex);
  const flying = pose !== 'perched';
  // standing, it holds itself a little higher on its legs
  dr.add(`<g transform="translate(0 ${flying ? 0 : -2.4})">`);
  fill(dr, TAIL, p.tail);
  stroke(dr, TAIL_LINES, mix(p.tail, '#ffffff', 0.22), 0.7);
  if (flying) {
    // feet tucked under the belly
    stroke(dr, 'M-1.6 0.4L-3.6 1.4M2.4 0.4L0.6 1.6', FEET, 1.5);
  }
  fill(dr, BODY, p.body);
  // the head, deeper: the same shape kept to the front of the body
  dr.add(`<g clip-path="url(#${dr.clip(BODY)})"><ellipse cx="9.8" cy="-15.2" rx="13.6" ry="13.8" fill="${p.head}"/></g>`);
  fill(dr, BELLY, p.belly);
  fill(dr, TUFT, p.tuft);
  if (flying) {
    fill(dr, WING_UP, p.wing);
    stroke(dr, WING_UP_QUILLS, p.quill, 0.55);
    stroke(dr, WING_UP_BARS, p.bar, 1.25);
  } else {
    fill(dr, WING_DOWN, p.wing);
    stroke(dr, WING_DOWN_QUILLS, p.quill, 0.55);
    stroke(dr, WING_DOWN_BARS, p.bar, 1.2);
  }
  // the blush, a soft halo with its colour in the middle
  dr.add(`<ellipse cx="11" cy="-8.4" rx="3.6" ry="2.7" fill="${p.blush}" fill-opacity="0.55"/>`);
  dr.add(`<ellipse cx="11" cy="-8.4" rx="2.2" ry="1.7" fill="${p.cheek}"/>`);
  // the eye, and the little brow that gives it its look
  dr.add(`<ellipse cx="13" cy="-12.8" rx="1.25" ry="1.5" fill="${EYE}"/>`);
  stroke(dr, 'M11.2 -15.2Q13 -15.9 14.6 -15', EYE, 0.8);
  fill(dr, 'M18.4 -11.4L21.8 -9.6L18.4 -7.8Z', BEAK);
  dr.add('</g>');
  if (!flying) stroke(dr, 'M-1.6 -2.4L-2 0.4M-3.4 0.4H-0.6M3.4 -2.4L3 0.4M1.6 0.4H4.4', FEET, 1.3);
  if (pose === 'carrying') heldLetter(dr);
}
