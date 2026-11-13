/**
 * Hevalo's songbird: the two birds singing on Rhyme's cover, and every
 * member's own bird that carries their letters (letters.ts).
 *
 * A cut-out like the rest of the app's objects (cutout.ts): a round body with
 * its head, a tail and a wing in a darker tone of its own colour, a pale
 * breast, an orange beak and a dot of an eye, lit from the upper left. It is
 * drawn about its feet at 0,0, facing right, about thirty units tall; a
 * mirror (`flip` -1) turns it to face left with the light still on its upper
 * left.
 *
 * It stands with its wing folded, or flies with both wings up — the far one
 * behind its body, the near one over it — its legs tucked away and, when it
 * carries a letter, the letter held in its beak.
 */
import { at, form, type Tones } from './cutout.js';
import type { Drawing } from './svg.js';
import { n, tint } from './svg.js';

/** The deep tone the eye and legs are drawn in, as on the other cut-outs: never black. */
const INK = '#3a2b4d';
const BEAK = '#f08a34';
const PAPER: Tones = { light: '#fffaf1', base: '#f6ead6', shade: '#cdb898' };
const SEAL = '#d8493b';

/** A colour as a form's three tones. */
export const birdTones = (hex: string): Tones => ({ light: tint(hex, 0.32), base: hex, shade: tint(hex, -0.32) });

/**
 * A cut-out drawn in a mirror (`flip` -1): the same form as `form`, with its
 * sliver of light moved the other way inside the mirror, so that on the page
 * it still runs along the upper left, where the light is.
 */
export function cut(dr: Drawing, d: string, t: Tones, drop: number, rim: number, flip: 1 | -1): void {
  if (flip === 1) return form(dr, d, t, drop, rim);
  if (drop > 0) dr.add(`<path d="${d}" fill="${t.shade}"${at(0, drop)}/>`);
  dr.add(`<path d="${d}" fill="${t.light}"/>`);
  dr.add(`<g clip-path="url(#${dr.clip(d)})"><path d="${d}" fill="${t.base}"${at(-rim, rim)}/></g>`);
}

const fill = (dr: Drawing, d: string, hex: string): void => dr.add(`<path d="${d}" fill="${hex}"/>`);
const dot = (dr: Drawing, cx: number, cy: number, r: number, hex: string): void => dr.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${hex}"/>`);

const BODY = 'M-12 -11C-12 -19 -6 -24 1 -24C3 -30.5 8 -33.5 13 -33C18 -32.5 21 -28.6 20.6 -24C20.2 -20 17.8 -17.4 17.2 -13.6C16.4 -5.6 10 -1.5 2 -1.5C-6 -1.5 -12 -5 -12 -11Z';
const TAIL = 'M-8 -14C-14 -17 -20 -21 -24.6 -21.4C-26.6 -21.4 -27 -19.4 -25.6 -18C-23 -15.4 -20.6 -13.4 -18.6 -11.6C-21.6 -11 -23.6 -9.6 -23 -8C-22.4 -6.6 -19 -6.4 -9 -6Z';
const BREAST = 'M17.4 -14.6C16.6 -5.6 10 -1.5 2 -1.5C-1.6 -1.5 -4.6 -2.3 -7 -3.6C1 -4.6 9.6 -8.6 13.4 -15.6C14.6 -17.8 17 -17.8 17.4 -14.6Z';
const FOLDED_WING = 'M-5 -18.6C1.6 -20.4 8.6 -17.6 9.2 -12.4C7 -8.6 0 -7.6 -9.6 -9.8C-12.6 -10.4 -14.4 -11.6 -15.4 -13C-12.6 -15.4 -9 -17.6 -5 -18.6Z';
/** The wings raised in flight: their roots on the back, their tips swept up and behind, the feathers' ends rounded along the trailing edge. */
const FAR_WING = 'M10 -20C11 -32 7 -42 0 -48Q-3.4 -43 -2 -38Q-6.4 -34 -4 -29Q-6.4 -24 -1 -21Z';
const NEAR_WING = 'M6 -18C6 -32 -2 -46 -12 -52Q-17 -47 -15.6 -41Q-21 -36 -18.6 -30Q-21.6 -24 -14 -22Q-6 -17 0 -14Z';

/** What the bird is doing: standing with its wing folded, or flying, with a letter in its beak or without. */
export type SongbirdPose = 'perched' | 'flying' | 'carrying';

/** The letter a bird carries: a small folded envelope held by its corner in the beak. */
function heldLetter(dr: Drawing, flip: 1 | -1): void {
  const d = 'M17 -24L31 -22.4L29.6 -12.4L15.6 -14Z';
  cut(dr, d, PAPER, 1.2, 0.8, flip);
  dr.add(`<path d="M17 -24L23.6 -18.4L31 -22.4" fill="none" stroke="${PAPER.shade}" stroke-width="0.9" stroke-linejoin="round"/>`);
  dot(dr, 23.6, -18.6, 1.7, SEAL);
}

/**
 * A songbird about its feet at 0,0, facing right (`flip` -1 faces it left).
 * The same bird sings on Rhyme's cover and carries a member's letters.
 */
export function songbird(dr: Drawing, hex: string, flip: 1 | -1, pose: SongbirdPose = 'perched'): void {
  const own = birdTones(hex);
  const deep = birdTones(tint(hex, -0.14));
  const flying = pose !== 'perched';
  if (flying) cut(dr, FAR_WING, birdTones(tint(hex, -0.28)), 0, 1.2, flip);
  // the legs, behind the body: down to the bough, or tucked up in flight
  dr.add(`<path d="${flying ? 'M-1 -4L-5 -2M4.6 -4L0.6 -2' : 'M-1 -3L-2 0.8M5.6 -3L4.6 0.8'}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`);
  cut(dr, TAIL, deep, 1.6, 1.2, flip);
  cut(dr, BODY, own, 1.8, 1.8, flip);
  fill(dr, BREAST, tint(hex, 0.55));
  cut(dr, flying ? NEAR_WING : FOLDED_WING, deep, flying ? 1.2 : 0, 1.4, flip);
  fill(dr, 'M20.2 -27.6L26.6 -25L20.4 -22.4Z', BEAK);
  dot(dr, 14.4, -26.4, 2.1, INK);
  dot(dr, 15.1, -27.1, 0.7, '#ffffff');
  if (pose === 'carrying') heldLetter(dr, flip);
}
