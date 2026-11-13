/**
 * Hevalo's pen pal pigeon: every member's own bird, which carries their
 * letters (letters.ts).
 *
 * Drawn from the owner's two references. From the first, the look: a round
 * pigeon all of flat shapes, with no outline anywhere; a darker head and neck
 * that meet the paler breast in a zigzag; the sheen on its neck in small
 * flecks of green, violet and ink; big dark eyes in orange rings; a dark beak
 * with a white bump on top; short pink feet. From the second, the character:
 * the round three-quarter pose, both eyes on the viewer, a small crest of two
 * feathers, two dark bars across the wing, and its poses — standing, blinking,
 * waving a wing, asleep, and flying with its wings up and down.
 *
 * It is drawn about its feet at 0,0, facing right, about forty units tall to
 * the crest; a mirror turns it to face left.
 */
import type { Drawing } from './svg.js';
import { mix, n } from './svg.js';

/** What the pigeon is doing. Flying is two pictures, its wings up and its wings down, which an app shows in turn. */
export type PigeonPose = 'perched' | 'blink' | 'wave' | 'sleep' | 'wings-up' | 'wings-down';
export const PIGEON_POSES: readonly PigeonPose[] = ['perched', 'blink', 'wave', 'sleep', 'wings-up', 'wings-down'];

/** The deep the dark parts are taken toward: a night violet, never black. */
const DUSK = '#1d1838';
const EYE_RING = '#f0875a';
const PUPIL = '#17142a';
const BEAK = '#4a4d5c';
const CERE = '#f6f3ee';
const FEET = '#f2a0aa';
const SHEEN = ['#4fc7ac', '#9a5bd0'] as const;
const PAPER = '#fbf3e4';
const PAPER_EDGE = '#d9c8a6';
const SEAL = '#d8493b';

/** A pigeon's colours, all from the one colour it is. */
interface Plumage {
  head: string;
  body: string;
  belly: string;
  wing: string;
  coverts: string;
  bar: string;
  tail: string;
  tuft: string;
  ink: string;
}

function plumage(hex: string): Plumage {
  return {
    head: mix(hex, DUSK, 0.2),
    body: hex,
    belly: mix(hex, '#ffffff', 0.24),
    wing: mix(hex, DUSK, 0.1),
    coverts: mix(hex, '#ffffff', 0.32),
    bar: mix(hex, DUSK, 0.62),
    tail: mix(hex, DUSK, 0.24),
    tuft: mix(hex, DUSK, 0.32),
    ink: mix(hex, DUSK, 0.72),
  };
}

const fill = (dr: Drawing, d: string, hex: string, extra = ''): void => dr.add(`<path d="${d}" fill="${hex}"${extra}/>`);
const stroke = (dr: Drawing, d: string, hex: string, width: number): void =>
  dr.add(`<path d="${d}" fill="none" stroke="${hex}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`);

/** The round of the body: an egg standing up, its breast forward. */
const BODY = { cx: -1, cy: -13, rx: 14, ry: 13.5 } as const;
/** The big round head and the neck under it as one shape, its lower edge the zigzag across the chest. */
const HEAD =
  'M-9.2 -26A12.5 12.5 0 1 1 15.3 -27.2C15 -24.4 14.2 -21.6 13.4 -19.2' +
  'L10.6 -21.6L7.8 -18.8L5 -21.6L2.2 -18.8L-0.6 -21.6L-3.4 -19L-6 -21.2C-7.6 -22.2 -8.8 -24 -9.2 -26Z';
/** The crest: two small feathers on the crown. */
const TUFT = 'M-0.6 -40.2C-1.6 -43.8 0 -46 2.2 -46C2.2 -44 1.8 -42 1.2 -40.4ZM2.4 -40.6C3.2 -43.8 5.4 -45 7.2 -44.4C6.4 -42.6 5 -41.2 3.6 -40.4Z';
/** The tail, short, out behind and down, and the dark band at its end. */
const TAIL = 'M-10.6 -13.6L-21.4 -5.4C-22.6 -4.2 -21.8 -1.6 -20 -1.6L-8.6 -4.4Z';
const TAIL_BAND = 'M-18.2 -7.8L-21.4 -5.4C-22.6 -4.2 -21.8 -1.6 -20 -1.6L-16.4 -2.6Z';
/** The wing folded along the side, the pale coverts along its top, the dark of its tip, and its two bars. */
const WING = 'M5.6 -18C1 -22 -8.4 -21 -13.6 -15.6C-16 -13 -17.2 -9.6 -17.6 -7.4C-11.6 -4.4 -4 -3.6 1 -6C5 -8 7 -13 5.6 -18Z';
const WING_COVERTS = 'M5.6 -18C1 -22 -8.4 -21 -13.6 -15.6C-7.8 -17.6 -1.2 -17.8 4.4 -15.4C5.4 -16 5.8 -16.8 5.6 -18Z';
const WING_BARS = 'M-5.6 -18.2Q-7.6 -13.2 -6.2 -5M-10.4 -16.4Q-12.2 -12.2 -11 -5.6';
const WING_TIP = 'M-15 -12.4C-16.4 -10.8 -17.2 -9 -17.6 -7.4C-16 -6.6 -14.2 -6 -12.4 -5.6C-13.4 -7.8 -14.2 -10.2 -15 -12.4Z';

/** A wing spread for flight, up over the back or down below it: its outline, the pale of its leading edge, the dark of its tip, its two bars, and the far wing behind. */
interface Spread {
  near: string;
  edge: string;
  tip: readonly [cx: number, cy: number, rx: number, ry: number];
  bars: string;
  far: string;
}
const WINGS_UP: Spread = {
  near:
    'M5 -19C3 -30 -2 -42 -10 -50.6Q-13.6 -54 -16.8 -51Q-20.4 -50.6 -19.6 -47Q-22.6 -45.6 -21.4 -42.4Q-24 -40.4 -22 -37.4Q-24.2 -35 -21.8 -32.4' +
    'Q-23.2 -29.4 -20.4 -27.6Q-20.6 -23.4 -16.4 -21.6Q-14.6 -17.4 -10 -17.4C-4 -16.8 1 -17.4 5 -19Z',
  edge: 'M5 -19C3 -30 -2 -42 -10 -50.6C-6.4 -42 -3.4 -32 -1.4 -18.4C1 -18.4 3.2 -18.6 5 -19Z',
  tip: [-18, -46.4, 6.4, 7.8],
  bars: 'M-1.6 -21.8Q-8.4 -21.6 -15 -19.8M-3.4 -26.6Q-10 -27 -17.8 -25.2',
  far: 'M2 -21C1.4 -31 0.2 -40 -2.2 -47.4Q-4.4 -50 -6.8 -47.6Q-9.4 -47 -9.2 -43.8Q-11.4 -42 -10.4 -38.6C-10.4 -32 -9.6 -26 -7.6 -21Z',
};
const WINGS_DOWN: Spread = {
  near:
    'M5 -19C1 -13 -4 -5 -10 3.4Q-12 6.8 -15 5.2Q-17.8 6.2 -18.4 3Q-21.4 3.2 -21.4 -0.2Q-24.2 -1 -23.4 -4.2Q-25.6 -6 -24 -9' +
    'Q-24.8 -12.6 -21 -14.4C-14 -18.4 -4 -20 5 -19Z',
  edge: 'M5 -19C1 -13 -4 -5 -10 3.4C-8 -4.6 -4 -11.4 0.4 -16.6C2 -17.6 3.6 -18.4 5 -19Z',
  tip: [-17.4, 1.6, 6.6, 5.2],
  bars: 'M-2.4 -13.6Q-9 -13 -15 -10M-6 -8.8Q-12 -7.8 -18 -4.8',
  far: 'M-1 -6C-2.6 -2.6 -4 0.8 -5.4 3.6Q-7.2 5.8 -9.4 4Q-11 3.6 -11 1.2C-9.6 -1.4 -8 -4 -6.6 -6.6Z',
};

/** The sheen on the neck: where each fleck is, and which colour (0, 1 the sheen's; 2 the bird's own ink). */
const FLECKS: ReadonlyArray<readonly [number, number, 0 | 1 | 2]> = [
  [-5.4, -23.4, 0],
  [-2, -24.6, 1],
  [1.6, -23.2, 2],
  [5.2, -24.4, 0],
  [8.6, -23, 1],
  [11.8, -24, 0],
  [-6.2, -14.6, 2],
  [-2, -12.2, 1],
  [2.6, -14.6, 2],
  [6.8, -12.4, 0],
  [9.6, -15.6, 1],
];

/** The eyes: big and dark in their orange rings, the near one the larger. */
function eyes(dr: Drawing): void {
  dr.add(`<ellipse cx="2.4" cy="-31" rx="5.1" ry="5.5" fill="${EYE_RING}"/>`);
  dr.add(`<ellipse cx="3" cy="-30.6" rx="3.7" ry="4.15" fill="${PUPIL}"/>`);
  dr.add(`<circle cx="4.2" cy="-32.4" r="1.1" fill="#ffffff"/>`);
  dr.add(`<ellipse cx="10.9" cy="-31.4" rx="4.2" ry="5" fill="${EYE_RING}"/>`);
  dr.add(`<ellipse cx="11.4" cy="-31" rx="3" ry="3.75" fill="${PUPIL}"/>`);
  dr.add(`<circle cx="12.3" cy="-32.6" r="0.9" fill="#ffffff"/>`);
}

/** The eyes shut: a lid's line under the last of the orange ring, content rather than sad. */
function shut(dr: Drawing, p: Plumage): void {
  stroke(dr, 'M-2.2 -31.2Q2.4 -27.8 7 -31.2M7.4 -31.4Q10.9 -28.6 14.4 -31.4', EYE_RING, 2.4);
  stroke(dr, 'M-2.2 -31.2Q2.4 -28.4 7 -31.2M7.4 -31.4Q10.9 -29.2 14.4 -31.4', p.ink, 1.2);
}

/** The beak, and the white bump at its root. */
function beak(dr: Drawing): void {
  fill(dr, 'M13 -27.6L19.4 -24.6L13.6 -23.2Z', BEAK);
  dr.add(`<circle cx="13.8" cy="-27.4" r="1.55" fill="${CERE}"/><circle cx="15.5" cy="-26.6" r="1.25" fill="${CERE}"/>`);
}

/** The letter in its beak: a small envelope held by its corner, sealed with red wax. */
function heldLetter(dr: Drawing): void {
  fill(dr, 'M15.8 -26.8L28.8 -25.2L27.6 -15.4L14.6 -17Z', PAPER_EDGE);
  fill(dr, 'M15.8 -27.6L28.8 -26L27.8 -16.6L14.8 -18.2Z', PAPER);
  stroke(dr, 'M15.8 -27.6L22 -21.6L28.8 -26', PAPER_EDGE, 0.8);
  dr.add(`<circle cx="22" cy="-21.8" r="1.7" fill="${SEAL}"/>`);
}

/** Three Zs rising off a sleeping pigeon, drawn as strokes. */
function sleeping(dr: Drawing): void {
  const z = (x: number, y: number, s: number): string => `M${n(x)} ${n(y)}h${n(s)}l${n(-s)} ${n(s)}h${n(s)}`;
  stroke(dr, z(16.4, -44, 2.6) + z(20.6, -50.6, 3.4) + z(25.8, -58.6, 4.2), '#9b97c9', 1.3);
}

/** The body and its paler belly. */
function body(dr: Drawing, p: Plumage): void {
  const round = `M${n(BODY.cx - BODY.rx)} ${n(BODY.cy)}a${n(BODY.rx)} ${n(BODY.ry)} 0 1 0 ${n(BODY.rx * 2)} 0a${n(BODY.rx)} ${n(BODY.ry)} 0 1 0 ${n(-BODY.rx * 2)} 0Z`;
  fill(dr, round, p.body);
  // the paler belly, kept to the round of the body
  dr.add(`<g clip-path="url(#${dr.clip(round)})"><ellipse cx="2" cy="-4.6" rx="11.6" ry="6.6" fill="${p.belly}"/></g>`);
}

/** The head over the body, its crest, and the sheen on its neck and breast. */
function head(dr: Drawing, p: Plumage): void {
  fill(dr, HEAD, p.head);
  fill(dr, TUFT, p.tuft);
  const colours = [SHEEN[0], SHEEN[1], p.ink];
  for (const [x, y, c] of FLECKS) dr.add(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="0.62" ry="1.25" fill="${colours[c]}"/>`);
}

/** A wing spread open: its outline, the pale of its leading edge, the dark of its tip, and its bars. */
function spreadWing(dr: Drawing, p: Plumage, wing: Spread): void {
  const [tx, ty, trx, try_] = wing.tip;
  fill(dr, wing.near, p.wing);
  dr.add(`<g clip-path="url(#${dr.clip(wing.near)})">`);
  fill(dr, wing.edge, p.coverts);
  dr.add(`<ellipse cx="${n(tx)}" cy="${n(ty)}" rx="${n(trx)}" ry="${n(try_)}" fill="${p.bar}"/>`);
  stroke(dr, wing.bars, p.bar, 1.9);
  dr.add('</g>');
}

/** The folded wing, along the side. */
function foldedWing(dr: Drawing, p: Plumage): void {
  fill(dr, WING, p.wing);
  fill(dr, WING_COVERTS, p.coverts);
  fill(dr, WING_TIP, p.bar);
  stroke(dr, WING_BARS, p.bar, 1.8);
}

/** Two feet standing: a short leg each and three toes spread on the ground. */
function feet(dr: Drawing): void {
  stroke(dr, 'M-3.6 -1.6V0.4M-6.2 1H-1.2M-3.6 0.4L-2 1.6M3.4 -1.6V0.4M0.9 1H5.9M3.4 0.4L5 1.6', FEET, 1.25);
}

/**
 * A pigeon about its feet at 0,0, facing right (the caller mirrors it to face
 * left). `letter` puts a letter in its beak; a sleeping pigeon holds none.
 */
export function pigeon(dr: Drawing, hex: string, pose: PigeonPose = 'perched', letter = false): void {
  const p = plumage(hex);
  const flying = pose === 'wings-up' || pose === 'wings-down';
  if (!flying) dr.add(`<ellipse cx="-1.6" cy="1" rx="13" ry="2.2" fill="${DUSK}" opacity="0.13"/>`);
  // in flight it leans into the air; asleep it has sat down on its feet
  dr.add(flying ? '<g transform="rotate(-8 0 -18)">' : pose === 'sleep' ? '<g transform="translate(0 1.8)">' : '<g>');
  if (flying) fill(dr, (pose === 'wings-up' ? WINGS_UP : WINGS_DOWN).far, mix(p.wing, DUSK, 0.2));
  fill(dr, TAIL, p.tail);
  fill(dr, TAIL_BAND, p.bar);
  if (flying) stroke(dr, 'M-3 -0.6L-4.6 1M3 -0.6L1.6 1.2', FEET, 1.4);
  else if (pose !== 'sleep') feet(dr);
  body(dr, p);
  // a wing raised over the back rises from behind the head, so it never hides a face
  if (pose === 'wings-up') spreadWing(dr, p, WINGS_UP);
  if (pose === 'wave') {
    // the near wing opened and lifted high behind the head, as a hand is raised to say hello
    dr.add('<g transform="translate(3 -19) rotate(-14) scale(0.8) translate(-3 19)">');
    spreadWing(dr, p, WINGS_UP);
    dr.add('</g>');
  }
  head(dr, p);
  if (pose === 'sleep' || pose === 'blink') shut(dr, p);
  else eyes(dr);
  if (letter && pose !== 'sleep') heldLetter(dr);
  beak(dr);
  if (pose === 'wings-down') spreadWing(dr, p, WINGS_DOWN);
  else if (!flying && pose !== 'wave') foldedWing(dr, p);
  dr.add('</g>');
  if (pose === 'sleep') sleeping(dr);
}
