/**
 * Hevalo's pen pal pigeon: every member's own bird, which carries their
 * letters (letters.ts).
 *
 * Traced from the owner's reference, at its own proportions: a round bird
 * lying long in the air, one soft shape from its rump to its face, deep in
 * colour at the head and fading to pale toward the tail; a tall pale wing
 * raised over its back, crossed by fine feather lines and two dark wavy
 * bars; a dark rounded tail with lighter stripes along it; a small crest of
 * two feathers; a small dark eye with a little brow over it; a teal cheek in
 * a soft blush; a pale patch at the front of the face; a peach-orange beak;
 * and orange feet. No outline anywhere: shapes of colour laid one on
 * another, the body's fade the one gradient.
 *
 * The reference is the pigeon flying with its wings up. Its other pictures
 * keep everything else as it is there: standing with the wing folded along
 * its back, blinking, chirping happily with its eyes screwed up and its beak
 * open (as the owner's playful birds do), waving the wing, asleep, and
 * flying with its wings down, which an app shows in turn with the wings up
 * for a beat. Turning round, it is seen turned three-quarters toward you and
 * then facing you (after the owner's front and three-quarter references),
 * so that it turns as a round bird does rather than flipping like a card.
 *
 * It is drawn about its feet at 0,0, facing right, a unit to five of the
 * reference's pixels: about fifty-five units from tail to beak. Its shadow on
 * the sill is drawn on its own (`pigeonShadow`), so that an app can leave it
 * lying on the sill while the pigeon hops or flies off.
 */
import type { Drawing } from './svg.js';
import { linearAt, mix, n, radialAt, radialBox } from './svg.js';

/**
 * What the pigeon is doing. Flying is two pictures, its wings up and its wings
 * down, which an app shows in turn. Turning round is two more: turned
 * three-quarters toward you (`turn`, facing right like the others, mirrored
 * for the other way) and facing you (`front`, the same either way round);
 * facing you, it can wave a wing at you with its eyes screwed up for joy
 * (`hello`), which an app shows in turn with `front`.
 */
export type PigeonPose = 'perched' | 'blink' | 'happy' | 'wave' | 'sleep' | 'wings-up' | 'wings-down' | 'turn' | 'front' | 'hello';
export const PIGEON_POSES: readonly PigeonPose[] = ['perched', 'blink', 'happy', 'wave', 'sleep', 'wings-up', 'wings-down', 'turn', 'front', 'hello'];

/** The deep the dark parts are taken toward: a night violet, never black. */
const DUSK = '#1d1838';
const EYE = '#1d1238';
const BEAK = '#ffaa62';
const FEET = '#ff9f55';
const PAPER = '#fbf3e4';
const PAPER_EDGE = '#d9c8a6';
const SEAL = '#d8493b';

/** A pigeon's colours, all from the one colour of its head. */
interface Plumage {
  head: string;
  rear: string;
  face: string;
  belly: string;
  wing: string;
  quill: string;
  bar: string;
  tail: string;
  stripe: string;
  brow: string;
  cheek: string;
  blush: string;
}

/** Whether a colour is green or teal: a teal cheek would not show on it, so it blushes pink. */
function greenish(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  return g > r && g >= b - 10;
}

function plumage(hex: string): Plumage {
  const pink = greenish(hex);
  return {
    head: hex,
    rear: mix(hex, '#f0f4ff', 0.6),
    face: mix(hex, '#f6f7ff', 0.78),
    belly: mix(hex, '#c26fd2', 0.28),
    wing: mix(hex, '#f6f8ff', 0.8),
    quill: mix(mix(hex, '#f6f8ff', 0.8), DUSK, 0.3),
    bar: mix(hex, DUSK, 0.72),
    tail: mix(hex, DUSK, 0.64),
    stripe: mix(mix(hex, DUSK, 0.64), '#ffffff', 0.15),
    brow: mix(hex, DUSK, 0.5),
    cheek: pink ? '#f49ab8' : '#6fd8d0',
    blush: pink ? mix(hex, '#f6a8c4', 0.5) : mix(hex, '#9fb4ee', 0.5),
  };
}

const fill = (dr: Drawing, d: string, hex: string, extra = ''): void => dr.add(`<path d="${d}" fill="${hex}"${extra}/>`);
const stroke = (dr: Drawing, d: string, hex: string, width: number): void =>
  dr.add(`<path d="${d}" fill="none" stroke="${hex}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`);

/** The body, rump to face, lying long; the bottom of it a little above where its feet are. */
const BODY = 'M-19.6 -12.6C-19.8 -16.4 -17.2 -19.2 -12 -20.6C-4 -22.6 1 -24.6 7.6 -24.6C14.6 -24.6 19.8 -19 19.8 -12.4C19.8 -6.2 15.6 -1.6 8.6 -0.6C1 0.4 -8 0.2 -13.6 -2.2C-17.6 -4 -19.4 -8 -19.6 -12.6Z';
/** The crest: two small feathers leaning back from the top of the head. */
const CREST = 'M4.4 -23.4C4 -24.8 4.4 -26 5.4 -26.6C5.9 -25.4 6.2 -24.3 6.4 -23.2ZM7.2 -23.8C7.1 -25.2 7.7 -26.3 8.8 -26.6C9.1 -25.4 9 -24.4 8.9 -23.4Z';
/** The tail: a dark paddle out behind, its end rounded and a little raised, and the lighter stripes along it. */
const TAIL = 'M-16.4 -18.4C-21.4 -19 -26.6 -20.8 -30.4 -20.8C-33.4 -20.8 -34.8 -18.4 -34 -16C-33.2 -14 -30.2 -13.6 -26.8 -12.6C-23.6 -11.6 -20.8 -10.2 -18 -9.2Z';
const TAIL_STRIPES = 'M-32.4 -19.2Q-27 -18.8 -21.2 -16.8M-32.8 -17Q-27.2 -16.2 -21.4 -14.2M-31.6 -14.8Q-26.8 -13.8 -21.6 -11.8';

/** A wing: its outline, the fine lines of its feathers (each from the edge toward the root), and its two wavy bars, top to bottom. */
interface Wing {
  outline: string;
  quills: string;
  bars: readonly [from: readonly [number, number], to: readonly [number, number]][];
  /** how it is turned about its root, if it is: degrees, and the point it turns about */
  turn?: readonly [number, number, number];
}

/** A wavy bar from one point to another: a run of small waves across the line between them. */
function wave(from: readonly [number, number], to: readonly [number, number], waves: number, depth: number): string {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const len = Math.hypot(dx, dy);
  const [nx, ny] = [-dy / len, dx / len];
  let d = `M${n(from[0])} ${n(from[1])}`;
  for (let i = 0; i < waves; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const [mx, my] = [from[0] + dx * ((i + 0.5) / waves) + nx * depth * side, from[1] + dy * ((i + 0.5) / waves) + ny * depth * side];
    d += `Q${n(mx)} ${n(my)} ${n(from[0] + dx * ((i + 1) / waves))} ${n(from[1] + dy * ((i + 1) / waves))}`;
  }
  return d;
}

/** The feather lines of a wing: from points on its edge, each most of the way toward its root. */
function quills(edge: ReadonlyArray<readonly [number, number]>, root: readonly [number, number], reach: number): string {
  return edge.map(([x, y]) => `M${n(x)} ${n(y)}L${n(x + (root[0] - x) * reach)} ${n(y + (root[1] - y) * reach)}`).join('');
}

/** The wing raised over the back, as the reference flies: tall and pale, broad at its top. */
const WING_UP: Wing = {
  outline: 'M-11.6 -9.4C-14.6 -11 -16 -14.4 -16 -18.8L-15.8 -28.8C-15.6 -34.6 -14.6 -38.6 -12 -40.4C-6 -41.8 0.4 -42 3.8 -40.8C5.6 -39.8 4.6 -32 2.8 -24.4C1.8 -18.8 1.2 -13.6 0.8 -9.6C-3.4 -8.6 -8 -8.6 -11.6 -9.4Z',
  quills: quills([[-15.8, -15.6], [-15.9, -21.4], [-15.8, -27.2], [-15.2, -33.4], [-12.6, -39.4], [-7.6, -41.2], [-2.4, -41.4], [2.6, -40.4]], [-5.6, -8], 0.5),
  bars: [
    [[-6.6, -33.2], [-11.4, -12.4]],
    [[-1.4, -32.2], [-6.6, -11.6]],
  ],
};
/** The wing beaten down, the other half of a beat: hanging from the back below the body, swept back. */
const WING_DOWN: Wing = {
  outline: 'M-12.6 -15.6C-15.4 -12 -18.6 -4.4 -19.6 1.4C-20.2 5.6 -18.4 8.6 -14.6 9.2C-10.6 9.8 -7.8 8.4 -6.6 5.4C-4.6 0.4 -1.4 -6 1.4 -12.6C-3.4 -14.6 -8.4 -15.6 -12.6 -15.6Z',
  quills: quills([[-19.4, -0.6], [-19.6, 4.2], [-17.2, 8.4], [-12.6, 9.6], [-8.4, 8.2]], [-6, -13.4], 0.6),
  bars: [
    [[-15.6, 4.6], [-9.6, -12.6]],
    [[-10.6, 6.4], [-4.8, -11]],
  ],
  // swept back as it beats down, as a wing is
  turn: [34, -5, -14],
};
/** The wing folded along the back, its tip over the root of the tail, the bars running back along it. */
const WING_FOLDED: Wing = {
  outline: 'M5 -17.2C2 -21.4 -8 -22.2 -14.4 -19.8C-19 -18 -22.4 -14.6 -23.4 -11C-16.8 -8.4 -6.6 -7.6 -0.4 -9.6C3.6 -11 6 -14 5 -17.2Z',
  quills: quills([[-21.8, -14.6], [-18.6, -18.4], [-14, -20.4], [-8.6, -21.4], [-3, -21]], [3, -11.4], 0.55),
  bars: [
    [[-2.2, -17.6], [-19, -15.2]],
    [[-1, -13.4], [-18.4, -11.6]],
  ],
};

/** A wing, pale, with its feather lines and bars kept to it. */
function wing(dr: Drawing, p: Plumage, w: Wing): void {
  dr.add(w.turn ? `<g transform="rotate(${w.turn.map(n).join(' ')})">` : '<g>');
  fill(dr, w.outline, p.wing);
  dr.add(`<g clip-path="url(#${dr.clip(w.outline)})">`);
  stroke(dr, w.quills, p.quill, 0.32);
  for (const [from, to] of w.bars) stroke(dr, wave(from, to, 7, 1.05), p.bar, 1.5);
  dr.add('</g></g>');
}

/** The body in its fade from the deep head to the pale rump, the blush of colour low on the breast, and the pale front of the face. */
function body(dr: Drawing, p: Plumage): void {
  const fade = dr.id('f');
  dr.def(linearAt(fade, [[0, p.rear], [0.42, p.rear], [0.66, p.head], [1, p.head]], -20, 0, 20, 0));
  fill(dr, BODY, `url(#${fade})`);
  dr.add(`<g clip-path="url(#${dr.clip(BODY)})">`);
  dr.add(`<ellipse cx="6" cy="-1.6" rx="6" ry="2.8" fill="${p.belly}" opacity="0.38"/>`);
  dr.add(`<ellipse cx="19" cy="-11.4" rx="1.5" ry="2.2" fill="${p.face}"/>`);
  dr.add('</g>');
  fill(dr, CREST, p.head);
}

/** The upper half of the beak, which is the whole beak when it is shut. */
const BEAK_TOP = 'M17.8 -10.6C19.4 -10.6 20.9 -9.9 21.3 -8.9C21.5 -8.2 20.9 -7.8 20.2 -8C19.4 -8.2 18.6 -8.4 18 -8.6Z';

/** The face: the eye with its brow (or shut, or screwed up with joy, the beak open to chirp), the cheek in its blush, and the beak. */
function face(dr: Drawing, p: Plumage, eyes: 'open' | 'shut' | 'happy'): void {
  const glow = dr.id('k');
  dr.def(radialAt(glow, [[0, p.cheek, 1], [0.42, p.cheek, 0.9], [0.7, p.blush, 0.7], [1, p.blush, 0]], 12, -8.2, 3));
  dr.add(`<circle cx="12" cy="-8.2" r="3" fill="url(#${glow})"/>`);
  if (eyes === 'happy') {
    stroke(dr, 'M13.4 -11Q14.6 -12.8 15.8 -11', EYE, 0.7);
    // the beak open: its upper half tipped up a little, and the lower under it
    fill(dr, 'M18 -8.4L20.8 -7.3C21.1 -7 20.8 -6.6 20.4 -6.7L18.2 -7.2Z', mix(BEAK, DUSK, 0.18));
    dr.add(`<path d="${BEAK_TOP}" fill="${BEAK}" transform="rotate(-10 18 -9.6)"/>`);
    return;
  }
  if (eyes === 'shut') {
    stroke(dr, 'M13.4 -11.2Q14.6 -10 15.8 -11.2', EYE, 0.6);
  } else {
    dr.add(`<ellipse cx="14.6" cy="-11.4" rx="0.72" ry="1.42" fill="${EYE}" transform="rotate(12 14.6 -11.4)"/>`);
    stroke(dr, 'M15 -14.9L15.8 -13.2', p.brow, 0.62);
  }
  fill(dr, BEAK_TOP, BEAK);
}

/** Two little notes off a chirping pigeon's beak, drawn as shapes. */
function chirp(dr: Drawing): void {
  const note = (x: number, y: number, s: number): string =>
    `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(1.1 * s)}" ry="${n(0.8 * s)}" fill="#9b97c9" transform="rotate(-20 ${n(x)} ${n(y)})"/>` +
    `<path d="M${n(x + 0.95 * s)} ${n(y - 0.2 * s)}V${n(y - 4 * s)}Q${n(x + 2.2 * s)} ${n(y - 3.4 * s)} ${n(x + 2.6 * s)} ${n(y - 2.2 * s)}" fill="none" stroke="#9b97c9" stroke-width="${n(0.55 * s)}" stroke-linecap="round"/>`;
  dr.add(note(24.4, -14.6, 1) + note(28.6, -20.4, 0.8));
}

/** The letter in its beak: a small envelope held by its corner, sealed with red wax, hanging beside the breast. */
function heldLetter(dr: Drawing): void {
  fill(dr, 'M19.4 -9.4L32 -7.8L30.8 2L18.2 0.4Z', PAPER_EDGE);
  fill(dr, 'M19.4 -10.2L32 -8.6L31 0.8L18.4 -0.8Z', PAPER);
  stroke(dr, 'M19.4 -10.2L25.4 -4.2L32 -8.6', PAPER_EDGE, 0.8);
  dr.add(`<circle cx="25.4" cy="-4.4" r="1.7" fill="${SEAL}"/>`);
}

/** Three Zs rising off a sleeping pigeon, drawn as strokes. */
function sleeping(dr: Drawing): void {
  const z = (x: number, y: number, s: number): string => `M${n(x)} ${n(y)}h${n(s)}l${n(-s)} ${n(s)}h${n(s)}`;
  stroke(dr, z(18.6, -29, 2.6) + z(22.8, -35.6, 3.4) + z(28, -43.6, 4.2), '#9b97c9', 1.3);
}

// ───────────────────────────────────────────── turned toward you, and facing you

/** Facing you: one soft round from the crown to the feet, a little narrower at the head than at the breast. */
const FRONT_BODY = 'M0 -24.8C6.8 -24.8 11.2 -20.4 12.2 -14.4C13 -9.6 12.6 -4.6 9.6 -2C7.2 0 3.4 0.2 0 0.2C-3.4 0.2 -7.2 0 -9.6 -2C-12.6 -4.6 -13 -9.6 -12.2 -14.4C-11.2 -20.4 -6.8 -24.8 0 -24.8Z';
/** The crest from in front: its two feathers side by side, leaning a little apart. */
const FRONT_CREST = 'M-1.5 -24.4C-2.6 -25.3 -2.9 -26.5 -2.3 -27.6C-1.3 -27 -0.5 -25.9 -0.2 -24.6ZM0.4 -24.7C0.6 -25.9 1.3 -26.9 2.4 -27.3C2.6 -26.2 2.2 -25.2 1.6 -24.4Z';
/** The right wing from in front, folded at the side: its shoulder high, its edge round over the flank, its end low by the feet. The left is its mirror. */
const FRONT_WING = 'M10 -19.6C12.6 -18 13.6 -13.4 13.4 -9C13.2 -5.6 12.2 -3 10.4 -1.8C9.4 -5.2 9.2 -10.4 9.3 -14.6C9.4 -16.8 9.6 -18.6 10 -19.6Z';
/** The beak from in front, pointing at you: a small rounded wedge, wide at the face and coming to its point below. */
const FRONT_BEAK = 'M-1.7 -10.7C-1.5 -11.4 1.5 -11.4 1.7 -10.7C1.5 -9.6 0.7 -8.5 0 -8.1C-0.7 -8.5 -1.5 -9.6 -1.7 -10.7Z';

/** Its legs from in front, a little apart, each with its toes spread toward you. */
const FRONT_FEET = 'M-3.2 -2V0.4M-3.2 0.4L-4.7 1.3M-3.2 0.4V1.6M-3.2 0.4L-1.7 1.3M3.2 -2V0.4M3.2 0.4L1.7 1.3M3.2 0.4V1.6M3.2 0.4L4.7 1.3';
/** Its legs turned three-quarters, the nearer one a little back and the further one ahead of it. */
const TURNED_FEET = 'M-0.4 -2V0.4M-2.4 1.1L1.6 0.9M-0.4 0.4L1 1.5M4.4 -2V0.3M2.6 0.9L6.4 0.6M4.4 0.3L5.8 1.3';

/** How the side-on drawing is narrowed for the pigeon turned three-quarters: the body, the tail going away behind it, and the wing on its nearer side, moved back along its flank. */
const TURNED = { body: 0.8, tail: 0.78, crest: 0.76, wing: 0.76, wingAt: -3.6 } as const;
/** The beak turned three-quarters: short, between the eyes and nearer the further one, pointing past you a little down. */
const TURNED_BEAK = 'M9.6 -10.6C11.2 -10.9 13 -10.3 13.7 -9.3C14 -8.8 13.6 -8.3 13 -8.4C11.9 -8.5 10.8 -8.5 10 -8.6Z';

/** A cheek's glow: teal (or pink) in the middle, out through the blush to nothing at its rim. */
function cheekGlow(dr: Drawing, p: Plumage): string {
  const glow = dr.id('k');
  dr.def(radialBox(glow, [[0, p.cheek, 1], [0.42, p.cheek, 0.9], [0.7, p.blush, 0.7], [1, p.blush, 0]]));
  return glow;
}

/** An open eye at `x`, `y`, narrowed by `squeeze` as the face turns away, leaning `lean` degrees, with its brow a little over it. */
function eye(dr: Drawing, p: Plumage, x: number, y: number, lean: number, squeeze = 1, brow = true): void {
  dr.add(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(0.74 * squeeze)}" ry="1.42" fill="${EYE}" transform="rotate(${n(lean)} ${n(x)} ${n(y)})"/>`);
  if (brow) stroke(dr, `M${n(x - 0.9 * squeeze)} ${n(y - 3.3)}Q${n(x)} ${n(y - 3.9)} ${n(x + 0.9 * squeeze)} ${n(y - 3.3)}`, p.brow, 0.6);
}

/** A letter in its beak seen from in front: the envelope hanging down before its breast, held by the middle of its top edge. */
function frontLetter(dr: Drawing): void {
  fill(dr, 'M-5.6 -7.6L6.4 -8L6.8 1.8L-5.2 2.2Z', PAPER_EDGE);
  fill(dr, 'M-5.9 -8.4L6.1 -8.8L6.5 1L-5.5 1.4Z', PAPER);
  stroke(dr, 'M-5.9 -8.4L0.3 -3.2L6.1 -8.8', PAPER_EDGE, 0.8);
  dr.add(`<circle cx="0.3" cy="-3.4" r="1.7" fill="${SEAL}"/>`);
}

/**
 * The pigeon facing you, as it is for a moment in the middle of turning
 * round, or while it stops to look at you: the deep colour of its head all
 * down its front, a folded wing at each side with the ends of its bars
 * showing, an eye either side of the beak with the cheeks glowing under
 * them, and the beak pointing at you. A letter in its beak hangs before its
 * breast.
 */
function facingYou(dr: Drawing, p: Plumage, letter: boolean, waving = false): void {
  fill(dr, FRONT_BODY, p.head);
  dr.add(`<g clip-path="url(#${dr.clip(FRONT_BODY)})">`);
  dr.add(`<ellipse cx="0" cy="-2.6" rx="8" ry="3.8" fill="${p.belly}" opacity="0.38"/>`);
  dr.add('</g>');
  fill(dr, FRONT_CREST, p.head);
  // the wings folded at its sides: seen edge on from in front, so only the ends of their two dark bars show, low on the flank
  for (const side of [1, -1]) {
    // waving, the wing on your right is lifted out and up from its shoulder, as a hand is
    const lifted = waving && side === 1 ? ' transform="rotate(-118 10.2 -18.2)"' : '';
    dr.add(side === 1 ? `<g${lifted}>` : '<g transform="scale(-1 1)">');
    fill(dr, FRONT_WING, p.wing);
    dr.add(`<g clip-path="url(#${dr.clip(FRONT_WING)})">`);
    stroke(dr, wave([9, -8.6], [13.8, -8], 3, 0.7) + wave([9.2, -5.4], [13.2, -4.8], 3, 0.7), p.bar, 1.3);
    dr.add('</g></g>');
  }
  const glow = cheekGlow(dr, p);
  for (const side of [1, -1]) dr.add(`<circle cx="${n(7.6 * side)}" cy="-9.4" r="2.8" fill="url(#${glow})"/>`);
  dr.add(`<ellipse cx="0" cy="-10.2" rx="3.2" ry="2.5" fill="${p.face}"/>`);
  for (const side of [1, -1]) {
    if (waving) stroke(dr, `M${n(5.8 * side - 1.1)} -12.4Q${n(5.8 * side)} -14.2 ${n(5.8 * side + 1.1)} -12.4`, EYE, 0.7);
    else eye(dr, p, 5.8 * side, -12.8, 6 * side);
  }
  if (letter) frontLetter(dr);
  fill(dr, FRONT_BEAK, BEAK);
  stroke(dr, 'M-0.8 -9.4Q0 -8.8 0.8 -9.4', mix(BEAK, DUSK, 0.22), 0.4);
}

/**
 * The pigeon turned three-quarters toward you, facing right, on its way
 * round: shorter from tail to beak than side on, the tail going away behind
 * it, the folded wing on its nearer side, the nearer eye well in on its face
 * and the further one just showing past the beak, which points past you. A
 * letter in its beak hangs turned with it.
 */
function turnedToYou(dr: Drawing, p: Plumage, letter: boolean): void {
  dr.add(`<g transform="scale(${TURNED.tail} 1)">`);
  fill(dr, TAIL, p.tail);
  stroke(dr, TAIL_STRIPES, p.stripe, 0.7);
  dr.add('</g>');
  const fade = dr.id('f');
  // turned, more of its front is seen, so the deep colour of the head comes further back and fades in more softly
  dr.def(linearAt(fade, [[0, p.rear], [0.28, p.rear], [0.64, p.head], [1, p.head]], -20, 0, 20, 0));
  dr.add(`<g transform="scale(${TURNED.body} 1)">`);
  fill(dr, BODY, `url(#${fade})`);
  dr.add(`<g clip-path="url(#${dr.clip(BODY)})">`);
  dr.add(`<ellipse cx="6" cy="-1.8" rx="7.6" ry="3" fill="${p.belly}" opacity="0.38"/>`);
  dr.add(`<ellipse cx="14.4" cy="-9.6" rx="2.3" ry="1.6" fill="${p.face}"/>`);
  dr.add('</g></g>');
  dr.add(`<g transform="scale(${TURNED.crest} 1)">`);
  fill(dr, CREST, p.head);
  dr.add('</g>');
  const glow = cheekGlow(dr, p);
  dr.add(`<circle cx="2.8" cy="-8.8" r="3" fill="url(#${glow})"/>`);
  // the further cheek is round the side of the face, so only the edge of its glow shows
  dr.add(`<g clip-path="url(#${dr.clip(BODY)})" transform="scale(${TURNED.body} 1)"><circle cx="19.4" cy="-9" r="2.2" fill="url(#${glow})"/></g>`);
  eye(dr, p, 5.2, -12.6, 8);
  // the further eye is on the part of the face turning away, so it shows narrower, its brow hardly at all
  eye(dr, p, 13.7, -12.8, 12, 0.72, false);
  if (letter) {
    dr.add('<g transform="matrix(0.72 0 0 1 0.2 0)">');
    heldLetter(dr);
    dr.add('</g>');
  }
  fill(dr, TURNED_BEAK, BEAK);
  dr.add(`<g transform="translate(${TURNED.wingAt} 0) scale(${TURNED.wing} 1)">`);
  wing(dr, p, WING_FOLDED);
  dr.add('</g>');
}

/** Whether a pigeon in `pose` has a letter in its beak when given one: a sleeping or chirping pigeon holds none. */
export function pigeonHolds(pose: PigeonPose, letter: boolean): boolean {
  return letter && pose !== 'sleep' && pose !== 'happy';
}

/**
 * The shadow a pigeon standing on the sill casts there, about its feet at
 * 0,0, facing right. The light comes in through the window behind it, so the
 * shadow falls a little toward the room, and it is the shape of what casts
 * it: the round of the body the most of it, the feet the darkest where they
 * touch the sill, the raised tail a fainter one further back, and a letter in
 * its beak, hanging nearly to the sill, one of its own in front. Asleep, sat
 * down on its legs, it casts a rounder one close under it. Every shape fades
 * out to its rim, and all of them are one shade, so the shadows of the bird
 * and its letter lie together as one.
 */
export function pigeonShadow(dr: Drawing, pose: PigeonPose = 'perched', letter = false): void {
  const soft = dr.id('shadow');
  dr.def(radialBox(soft, [[0, DUSK, 1], [0.55, DUSK, 0.72], [1, DUSK, 0]]));
  const blot = (cx: number, cy: number, rx: number, ry: number, strength = 1): string =>
    `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="url(#${soft})"${strength === 1 ? '' : ` opacity="${n(strength)}"`}/>`;
  dr.add('<g opacity="0.26">');
  const holds = pigeonHolds(pose, letter);
  if (pose === 'sleep') dr.add(blot(0.4, 1.2, 19, 3.2) + blot(-24, 1.8, 8, 1.4, 0.55));
  else if (pose === 'front' || pose === 'hello') {
    // facing you it is round and as wide as it is deep, its feet side by side
    dr.add(blot(0, 1.4, 13, 3) + blot(-3.2, 1.1, 3.4, 1.1) + blot(3.2, 1.1, 3.4, 1.1));
    if (holds) dr.add(blot(0.4, 2.2, 7.2, 1.8));
  } else if (pose === 'turn') {
    dr.add(blot(0.6, 1.5, 15.6, 3) + blot(-20.4, 2, 7, 1.4, 0.55) + blot(2, 1.1, 6, 1.4));
    if (holds) dr.add(blot(20.2, 1.7, 6.4, 2));
  } else dr.add(blot(0.6, 1.5, 18.4, 3) + blot(-25, 2, 9, 1.6, 0.55) + blot(2.6, 1.1, 6.6, 1.4));
  if (holds && pose !== 'front' && pose !== 'hello' && pose !== 'turn') dr.add(blot(25.4, 1.7, 8, 2.1));
  dr.add('</g>');
}

/**
 * A pigeon about its feet at 0,0, facing right (the caller mirrors it to face
 * left). `letter` puts a letter in its beak; a sleeping or chirping pigeon
 * holds none. Standing or asleep it casts its shadow (`pigeonShadow`) unless
 * told not to, for an app that lays the shadow on the sill by itself.
 */
export function pigeon(dr: Drawing, hex: string, pose: PigeonPose = 'perched', letter = false, shadow = true): void {
  const p = plumage(hex);
  const flying = pose === 'wings-up' || pose === 'wings-down';
  const standing = !flying && pose !== 'sleep';
  if (!flying && shadow) pigeonShadow(dr, pose, letter);
  if (pose === 'front' || pose === 'hello' || pose === 'turn') {
    stroke(dr, pose === 'turn' ? TURNED_FEET : FRONT_FEET, FEET, 1.15);
    dr.add('<g transform="translate(0 -2.2)">');
    if (pose === 'turn') turnedToYou(dr, p, letter);
    else facingYou(dr, p, letter, pose === 'hello');
    dr.add('</g>');
    return;
  }
  if (standing) {
    // two short legs, each with three toes on the ground
    stroke(dr, 'M0 -2V0.4M-2.2 1H2.2M0 0.4L1.4 1.4M5.2 -2V0.4M3 1H7.4M5.2 0.4L6.6 1.4', FEET, 1.15);
  }
  // standing, it holds itself up on its legs; asleep, it has sat down on them
  dr.add(standing ? '<g transform="translate(0 -2.2)">' : '<g>');
  fill(dr, TAIL, p.tail);
  stroke(dr, TAIL_STRIPES, p.stripe, 0.7);
  if (flying) stroke(dr, 'M3.4 -0.8L-2.6 0.8M5.6 -0.4L0 1.4', FEET, 1.2);
  body(dr, p);
  // a chirping pigeon has nothing in its beak
  const holding = pigeonHolds(pose, letter);
  face(dr, p, pose === 'happy' ? 'happy' : pose === 'blink' || pose === 'sleep' ? 'shut' : 'open');
  if (holding) heldLetter(dr);
  if (holding) fill(dr, BEAK_TOP, BEAK);
  wing(dr, p, pose === 'wings-up' || pose === 'wave' ? WING_UP : pose === 'wings-down' ? WING_DOWN : WING_FOLDED);
  dr.add('</g>');
  if (pose === 'sleep') sleeping(dr);
  if (pose === 'happy') chirp(dr);
}
