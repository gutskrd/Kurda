/**
 * Hevalo's pen pal pigeon: every member's own bird, which carries their
 * letters (letters.ts).
 *
 * Drawn after the owner's turnaround of a round grey pigeon, at its
 * proportions: an upright bird, a round head on a round body, with a big
 * orange-ringed eye on the side of its head, a white cere over a short dark
 * beak, the deep colour of the head and neck ending in a scalloped collar
 * flecked with sheen, a big pale wing over its side with two dark curved
 * stripes and dark tips, a dark scalloped tail behind, pale legs and pink
 * feet. Flat shapes of colour laid one on another, no outline anywhere, and
 * every colour taken from the bird's own (`plumage`), so each bird is the
 * same pigeon in its colour.
 *
 * The turnaround gives three of its pictures: side on, three-quarters
 * toward you (`turn`) and facing you (`front`), so it turns round as a
 * round bird does rather than flipping like a card. Its other pictures keep
 * everything as it is side on: blinking, chirping with its eyes screwed up
 * and its beak open, waving a wing, asleep sat down on the sill, bowed on
 * its legs to peck at the sill, and flying with its wings up and then
 * down. Facing you, it can wave a wing hello.
 *
 * It is drawn about its feet at 0,0, facing right, a unit to ten of the
 * reference's pixels: about forty units tall and thirty-five from tail to
 * beak. Its shadow on the sill is drawn on its own (`pigeonShadow`), so that
 * an app can leave it lying on the sill while the pigeon hops or flies off.
 */
import type { Drawing } from './svg.js';
import { mix, n, radialBox } from './svg.js';

/**
 * What the pigeon is doing. Flying is two pictures, its wings up and its wings
 * down, which an app shows in turn. Turning round is two more: turned
 * three-quarters toward you (`turn`, facing right like the others, mirrored
 * for the other way) and facing you (`front`, the same either way round);
 * facing you, it can wave a wing at you with its eyes screwed up for joy
 * (`hello`), which an app shows in turn with `front`. Pecking (`peck`), it is
 * bowed on its legs with its beak down at the sill (`PIGEON_PECK`).
 */
export type PigeonPose = 'perched' | 'blink' | 'happy' | 'wave' | 'sleep' | 'peck' | 'wings-up' | 'wings-down' | 'turn' | 'front' | 'hello';
export const PIGEON_POSES: readonly PigeonPose[] = ['perched', 'blink', 'happy', 'wave', 'sleep', 'peck', 'wings-up', 'wings-down', 'turn', 'front', 'hello'];

/** The deep the dark parts are taken toward: a night violet, never black; the wing's tips and the tail toward a quieter one, near the reference's charcoal. */
const DUSK = '#1d1838';
const CHARCOAL = '#221e2c';
const PUPIL = '#1d1238';
const RING = '#ee8a5f';
const CERE = '#fbf8f2';
const FEET = '#f4a6a6';
const PAPER = '#fbf3e4';
const PAPER_EDGE = '#d9c8a6';
const SEAL = '#d8493b';

/** A pigeon's colours, all from its own colour, as the reference's greys are from its grey. */
interface Plumage {
  /** the head and neck, down to the collar */
  head: string;
  /** the breast and belly */
  body: string;
  /** the wing, and the legs */
  wing: string;
  /** the wing's tips and stripes, and the darkest flecks */
  tips: string;
  tail: string;
  beak: string;
  /** an eye shut: the lid in its ring */
  lid: string;
  /** the two colours the neck's flecks shine in */
  sheen: readonly [string, string];
  /** the ring round the eye */
  ring: string;
}

/** Whether a colour is green or teal: teal flecks would not show on it, so they shine pink. */
function greenish(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  return g > r + 20 && g >= b - 10;
}

/** Whether a colour is orange: an orange ring would not show round the eye on its head, so the ring is golden. */
function orange(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  return r > g + 50 && g > b + 30;
}

/** Whether a colour is violet: violet flecks would not show on it, so they shine blue. */
function violet(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  return b > g + 30 && r > g;
}

function plumage(hex: string): Plumage {
  const head = mix(hex, DUSK, 0.28);
  return {
    head,
    body: hex,
    wing: mix(hex, '#f6f8ff', 0.36),
    tips: mix(hex, CHARCOAL, 0.86),
    tail: mix(hex, CHARCOAL, 0.54),
    beak: mix(hex, CHARCOAL, 0.58),
    lid: mix(head, hex, 0.45),
    sheen: [greenish(hex) ? '#f39bb8' : '#72c2a6', violet(hex) ? '#3d8fc6' : '#7b3ba5'],
    ring: orange(hex) ? '#ffd27a' : RING,
  };
}

const fill = (dr: Drawing, d: string, hex: string, extra = ''): void => dr.add(`<path d="${d}" fill="${hex}"${extra}/>`);
const stroke = (dr: Drawing, d: string, hex: string, width: number): void =>
  dr.add(`<path d="${d}" fill="none" stroke="${hex}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`);

/** An ellipse as a path, for a clip or to fill. */
function oval(cx: number, cy: number, rx: number, ry: number): string {
  return `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
}

/** A run of small scallops from where the path is to `to`, hanging toward `+y` of the line between them. */
function scallops(from: readonly [number, number], to: readonly [number, number], count: number, depth: number): string {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const len = Math.hypot(dx, dy);
  // the side the scallops hang to: below the line, whichever way it runs
  const side = dx >= 0 ? 1 : -1;
  const [nx, ny] = [(-dy / len) * side, (dx / len) * side];
  let d = '';
  for (let i = 0; i < count; i++) {
    const [mx, my] = [from[0] + dx * ((i + 0.5) / count) + nx * depth * 2, from[1] + dy * ((i + 0.5) / count) + ny * depth * 2];
    d += `Q${n(mx)} ${n(my)} ${n(from[0] + dx * ((i + 1) / count))} ${n(from[1] + dy * ((i + 1) / count))}`;
  }
  return d;
}

/** A stripe thin at both ends and widest in its middle, along a curve from `a` through toward `c` to `b`. */
function taper(a: readonly [number, number], c: readonly [number, number], b: readonly [number, number], width: number): string {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dy);
  const [nx, ny] = [(-dy / len) * width, (dx / len) * width];
  return `M${n(a[0])} ${n(a[1])}Q${n(c[0] + nx)} ${n(c[1] + ny)} ${n(b[0])} ${n(b[1])}Q${n(c[0] - nx)} ${n(c[1] - ny)} ${n(a[0])} ${n(a[1])}Z`;
}

/** A fleck of sheen on the neck: [x, y, which colour (0 and 1 the sheen, 2 the dark), how long]. */
type Fleck = readonly [number, number, 0 | 1 | 2, number];

function flecks(dr: Drawing, p: Plumage, list: readonly Fleck[]): void {
  for (const [x, y, k, h] of list) {
    const hex = k === 2 ? p.tips : p.sheen[k];
    dr.add(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="0.31" ry="${n(h / 2)}" fill="${hex}"/>`);
  }
}

/** How an eye looks: open, shut, or screwed up for joy. */
type Eyes = 'open' | 'shut' | 'happy';

/**
 * An eye: its orange ring, and in it the pupil (`pupil`, an ellipse as
 * cx, cy, rx, ry), or the lid closed over it, with the line where it shuts:
 * hanging down when the eye is shut, arched up when it is screwed up for joy.
 */
function eye(dr: Drawing, p: Plumage, ring: readonly number[], pupil: readonly number[], eyes: Eyes): void {
  const [rx0, ry0, rrx, rry] = ring as [number, number, number, number];
  const [px, py, prx, pry] = pupil as [number, number, number, number];
  dr.add(`<ellipse cx="${n(rx0)}" cy="${n(ry0)}" rx="${n(rrx)}" ry="${n(rry)}" fill="${p.ring}"/>`);
  if (eyes === 'open') {
    dr.add(`<g clip-path="url(#${dr.clip(oval(rx0, ry0, rrx, rry))})">`);
    dr.add(`<ellipse cx="${n(px)}" cy="${n(py)}" rx="${n(prx)}" ry="${n(pry)}" fill="${PUPIL}"/>`);
    dr.add('</g>');
    return;
  }
  dr.add(`<ellipse cx="${n(px)}" cy="${n(py)}" rx="${n(prx)}" ry="${n(pry)}" fill="${p.lid}"/>`);
  const [w, h] = [prx * 0.9, pry * 0.55];
  // shut, the line hangs down across the eye; screwed up for joy, it arches up
  const [ends, middle] = eyes === 'shut' ? [py - h * 0.2, py + h * 1.3] : [py + h * 0.5, py - h * 1.5];
  stroke(dr, `M${n(px - w)} ${n(ends)}Q${n(px)} ${n(middle)} ${n(px + w)} ${n(ends)}`, PUPIL, Math.max(0.5, prx * 0.22));
}

// ───────────────────────────────────────────── side on

/** The head: a round dome, in which the eye sits. */
const HEAD = { x: 1.9, y: -29.1, r: 9.5 } as const;
/** The body under the head, from the throat round the breast and belly to the back; its top is under the head. */
const TRUNK =
  'M11.36 -28.2C11.9 -25.2 13 -22 13 -18A12.8 12.6 0 0 1 0.2 -5.4A12.8 12.6 0 0 1 -12.6 -18C-12.6 -21.8 -10.6 -24.6 -7.7 -25.8C-4.6 -28.4 6 -29.8 11.36 -28.2Z';
/** The deep colour of the head and neck, down to its scalloped collar across the breast; behind the wing it runs on back. */
const COLLAR = `M15 -42V-20.8${scallops([15, -20.8], [3.2, -20.2], 4, 0.8)}L-15 -23V-42Z`;
/** The eye's ring and its pupil, as cx, cy, rx, ry. */
const EYE_RING = [2.8, -29.7, 4.3, 4.3] as const;
const EYE_PUPIL = [2.8, -29.7, 2.9, 2.9] as const;
/** The cere: the white bump over the root of the beak. */
const CERE_AT = [10.6, -28.1, 1.4] as const;
/** The beak: its upper half, and the darker lower half under it. */
const BEAK_UPPER = 'M9.6 -27.9L12 -27.5C13.1 -27.2 14.2 -26.7 14.95 -26.1C13.6 -25.8 12.3 -25.6 11 -25.4Z';
const BEAK_LOWER = 'M11 -25.4C12.3 -25.6 13.6 -25.8 14.95 -26.1C13.7 -25.1 12.2 -24.4 10.7 -24.2Z';
/** Where the beak opens about, chirping. */
const BEAK_ROOT = [10.6, -25.8] as const;
/** The flecks on the side of the neck, from the reference: those on the head bow with it. */
const SIDE_FLECKS: readonly Fleck[] = [
  [-6.2, -29.2, 0, 1.9], [7.5, -24.5, 0, 1.8], [8.1, -18.3, 0, 1.5], [-2, -26.9, 0, 1.4], [3.9, -22, 0, 1.2],
  [10.6, -16.8, 1, 2.1], [5.6, -23, 1, 1.8], [5.4, -16.2, 1, 1.7],
  [11.8, -18.9, 2, 1.9], [9.6, -23.3, 2, 1.8], [8, -15.5, 2, 1.9], [-4.5, -26.3, 2, 1.6],
];

/** The wing over the side: a big pale oval, its two dark stripes curving down its back edge, and its dark tips behind it, swept back. */
const WING = { x: -4.1, y: -17, rx: 8.4, ry: 7.8 } as const;
const WING_STRIPES: ReadonlyArray<readonly [readonly [number, number], readonly [number, number], readonly [number, number]]> = [
  [[-6.6, -24.4], [-9.6, -20], [-6.2, -15.2]],
  [[-8.6, -23.8], [-12.8, -17.6], [-7.8, -11.2]],
];
const WING_TIPS = 'M-4.6 -23.6C-11.6 -24.4 -17.8 -20.8 -19.4 -13.2C-16.4 -10.6 -12 -9.3 -6.6 -9.6Z';
/**
 * Where the wing turns about when it is raised, beaten down or waved: its
 * shoulder on the back, so that raised it stands up behind the head and
 * never over the eye; and how far it turns for each way it is held.
 */
const SHOULDER = [-4, -21] as const;
const WING_TURN = { folded: 0, up: 88, down: -40, wave: 46 } as const;

/** The tail behind, low: dark, its end in three rounded feathers. */
const TAIL = 'M-5.6 -13.6C-10.4 -14 -16.2 -13.2 -19.6 -11.4Q-21.8 -9 -18 -8.2Q-18.6 -5.2 -14.4 -6.4Q-13.4 -3.8 -9.2 -5.4L-5.2 -7.6Z';

/** Its two legs, short and pale, and its pink feet: each a leg down to the sill and two toes across it. */
const LEGS = ['M-3.4 -6.2L-1.2 -6.2L-1.7 -3.2L-2.9 -3.2Z', 'M0 -6.4L2 -6.4L1.6 -3.8L0.4 -3.8Z'] as const;
const FEET_SIDE = 'M-2.5 -3.4L-1.9 0.6M-4.5 -1.4L0.7 -1.4M-2 -1.1L1.3 0.6M0.8 -4L1.4 -0.1M-1.2 -2.1L3.8 -2.1M1.2 -1.7L4.6 -0.2';
/** Flying, its feet tucked back under its belly. */
const FEET_TUCKED = 'M-1.6 -5.6L-5.6 -4.2M-0.6 -5.2L-4.4 -3.4';

/**
 * Pecking, it bows on its legs: its body leans forward about the top of its
 * legs, which stay standing on the sill, and its head bows further about its
 * neck, so the tip of its beak comes down to the sill a little ahead of its
 * feet while its breast stays just over the sill. Asleep, its head droops a
 * little.
 */
const HIP = [-0.6, -6.2] as const;
const NECK = [3, -21] as const;
const PECK = { lean: 50, bow: 30 } as const;
const DROOP = 12;

/**
 * Where the tip of its beak is, about its feet, as it pecks (`peck`): on the
 * sill ahead of its feet, where an app lays what it picks up; and how far
 * ahead of its feet its bowed head then reaches, so that two pigeons on the
 * sill keep apart even pecking.
 */
export const PIGEON_PECK = { beak: pecked([14.95, -26.1]), reach: Math.round((pecked([HEAD.x, HEAD.y])[0] + HEAD.r) * 10) / 10 } as const;

/** How far ahead of its feet a pigeon standing side on reaches: the tip of its beak, and the far edge of a letter in it. */
export const PIGEON_REACH = { beak: 14.95, letter: 25.6 } as const;

function turned(p: readonly [number, number], about: readonly [number, number], deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  const [x, y] = [p[0] - about[0], p[1] - about[1]];
  return [about[0] + x * Math.cos(a) - y * Math.sin(a), about[1] + x * Math.sin(a) + y * Math.cos(a)];
}

function pecked(p: readonly [number, number]): readonly [number, number] {
  const [x, y] = turned(turned(p, NECK, PECK.bow), HIP, PECK.lean);
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
}

/** How the pigeon is seen side on. */
interface SideLook {
  eyes: Eyes;
  wing: keyof typeof WING_TURN;
  legs: 'standing' | 'tucked' | 'sitting';
  letter: boolean;
  /** how far it leans forward on its legs, and how far its head bows, in degrees */
  lean: number;
  bow: number;
  /** its beak open, chirping */
  open: boolean;
}

/** The wing, its tips and its stripes, turned about the shoulder as it is held. */
function sideWing(dr: Drawing, p: Plumage, turn: number, hex = p.wing): void {
  dr.add(turn ? `<g transform="rotate(${n(turn)} ${n(SHOULDER[0])} ${n(SHOULDER[1])})">` : '<g>');
  fill(dr, WING_TIPS, p.tips);
  const shape = oval(WING.x, WING.y, WING.rx, WING.ry);
  fill(dr, shape, hex);
  dr.add(`<g clip-path="url(#${dr.clip(shape)})">`);
  for (const [a, c, b] of WING_STRIPES) fill(dr, taper(a, c, b, 0.62), p.tips);
  dr.add('</g></g>');
}

/** The pigeon side on, facing right. */
function sideOn(dr: Drawing, p: Plumage, look: SideLook): void {
  if (look.legs === 'standing') {
    for (const leg of LEGS) fill(dr, leg, p.wing);
    stroke(dr, FEET_SIDE, FEET, 0.55);
  }
  // asleep, it has sat down on its legs; pecking, it leans forward on them
  const sat = look.legs === 'sitting' ? 'translate(0 5.4)' : '';
  const lean = look.lean ? `rotate(${n(look.lean)} ${n(HIP[0])} ${n(HIP[1])})` : '';
  dr.add(sat || lean ? `<g transform="${`${sat} ${lean}`.trim()}">` : '<g>');
  if (look.legs === 'tucked') stroke(dr, FEET_TUCKED, FEET, 0.6);
  // flying with its wings up, the further wing shows behind it, a shade deeper and a little ahead
  if (look.wing === 'up') {
    dr.add('<g transform="translate(3.6 -0.6)">');
    sideWing(dr, p, WING_TURN.up - 18, mix(p.wing, p.body, 0.45));
    dr.add('</g>');
  }
  fill(dr, TAIL, p.tail);
  fill(dr, TRUNK, p.body);
  dr.add(`<g clip-path="url(#${dr.clip(TRUNK)})">`);
  fill(dr, COLLAR, p.head);
  flecks(dr, p, SIDE_FLECKS.filter(([, y]) => y > -25));
  dr.add('</g>');
  const bow = look.bow ? `<g transform="rotate(${n(look.bow)} ${n(NECK[0])} ${n(NECK[1])})">` : '<g>';
  dr.add(bow);
  dr.add(`<circle cx="${n(HEAD.x)}" cy="${n(HEAD.y)}" r="${n(HEAD.r)}" fill="${p.head}"/>`);
  flecks(dr, p, SIDE_FLECKS.filter(([, y]) => y <= -25));
  dr.add('</g>');
  sideWing(dr, p, WING_TURN[look.wing]);
  dr.add(bow);
  eye(dr, p, EYE_RING, EYE_PUPIL, look.eyes);
  if (look.open) {
    // the beak open to chirp: its halves apart about their root, and the dark of the mouth between them
    const [rx, ry] = BEAK_ROOT;
    fill(dr, `M${n(rx)} ${n(ry)}L14.4 -26.9L14.5 -25.1Z`, PUPIL);
    fill(dr, BEAK_LOWER, p.tips, ` transform="rotate(18 ${n(rx)} ${n(ry)})"`);
    fill(dr, BEAK_UPPER, p.beak, ` transform="rotate(-14 ${n(rx)} ${n(ry)})"`);
  } else {
    fill(dr, BEAK_LOWER, p.tips);
    fill(dr, BEAK_UPPER, p.beak);
  }
  dr.add(`<circle cx="${n(CERE_AT[0])}" cy="${n(CERE_AT[1])}" r="${n(CERE_AT[2])}" fill="${CERE}"/>`);
  dr.add('</g>');
  if (look.letter) {
    // the letter hangs from the tip of its beak before its breast, the beak's tip over the paper, holding it
    heldLetter(dr, 14.9, -26.1, 1);
    fill(dr, BEAK_UPPER, p.beak);
    dr.add(`<circle cx="${n(CERE_AT[0])}" cy="${n(CERE_AT[1])}" r="${n(CERE_AT[2])}" fill="${CERE}"/>`);
  }
  dr.add('</g>');
}

/** The letter in its beak: a small envelope held by its corner at `x`, `y`, sealed with red wax, hanging before it; `squeeze` narrows it as the bird turns. */
function heldLetter(dr: Drawing, x: number, y: number, squeeze: number): void {
  dr.add(`<g transform="translate(${n(x)} ${n(y)}) scale(${n(squeeze)} 1)">`);
  fill(dr, 'M-1.9 -0.5L10.7 1.1L9.5 10.5L-3.1 8.9Z', PAPER_EDGE);
  fill(dr, 'M-1.9 -1.3L10.7 0.3L9.7 9.7L-2.9 8.1Z', PAPER);
  stroke(dr, 'M-1.9 -1.3L4.1 4.7L10.7 0.3', PAPER_EDGE, 0.8);
  dr.add(`<circle cx="4.1" cy="4.5" r="1.7" fill="${SEAL}"/>`);
  dr.add('</g>');
}

/** Two little notes off a chirping pigeon's beak, drawn as shapes. */
function chirp(dr: Drawing): void {
  const note = (x: number, y: number, s: number): string =>
    `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(1.1 * s)}" ry="${n(0.8 * s)}" fill="#9b97c9" transform="rotate(-20 ${n(x)} ${n(y)})"/>` +
    `<path d="M${n(x + 0.95 * s)} ${n(y - 0.2 * s)}V${n(y - 4 * s)}Q${n(x + 2.2 * s)} ${n(y - 3.4 * s)} ${n(x + 2.6 * s)} ${n(y - 2.2 * s)}" fill="none" stroke="#9b97c9" stroke-width="${n(0.55 * s)}" stroke-linecap="round"/>`;
  dr.add(note(19.4, -30.4, 1) + note(23.6, -36.2, 0.8));
}

/** Three Zs rising off a sleeping pigeon, drawn as strokes. */
function sleeping(dr: Drawing): void {
  const z = (x: number, y: number, s: number): string => `M${n(x)} ${n(y)}h${n(s)}l${n(-s)} ${n(s)}h${n(s)}`;
  stroke(dr, z(12.4, -36, 2.4) + z(16.4, -42, 3) + z(21, -49, 3.6), '#9b97c9', 1.2);
}

// ───────────────────────────────────────────── turned toward you

/** Turned three-quarters toward you, from the reference: the body a little shorter from back to breast, the wing further back along its flank, both eyes showing. */
const TQ = {
  head: { x: 1.7, y: -29.1, r: 9.5 },
  trunk: 'M11 -28.2C11.5 -25.6 12.5 -22 12.5 -18A12.4 12.6 0 0 1 0.1 -5.4A12.4 12.6 0 0 1 -12.3 -18C-12.3 -21.8 -10.4 -24.6 -7.7 -25.8C-4.6 -28.4 5.8 -29.8 11 -28.2Z',
  collar: `M15 -42V-20.6${scallops([15, -20.6], [-2, -19.8], 5, 0.8)}L-15 -23V-42Z`,
  wing: { x: -8, y: -17, rx: 6.3, ry: 8 },
  stripes: [
    [[-9.9, -24.6], [-12.4, -20], [-9.8, -15.4]],
    [[-11.2, -23.8], [-15, -17.6], [-11, -11.4]],
  ] as ReadonlyArray<readonly [readonly [number, number], readonly [number, number], readonly [number, number]]>,
  tips: 'M-8.6 -22.8C-13.4 -23.2 -18 -19.8 -19.4 -13.4C-16.8 -10.6 -13 -9.2 -9.2 -9.4Z',
  tail: 'M-6.8 -12.6C-10.6 -12.8 -14.6 -12 -17.2 -10.4Q-18.8 -8.4 -15.8 -7.8Q-15.8 -5.2 -12.6 -6.2Q-11.4 -3.8 -8.4 -5.2L-5.6 -7.2Z',
  near: { ring: [0.2, -29.7, 4.3, 4.3], pupil: [0.2, -29.7, 2.85, 2.85] },
  far: { ring: [10.85, -29.5, 1.85, 4.2], pupil: [10.2, -29.65, 1.5, 2.85] },
  ceres: [[5.9, -28.1], [8.5, -27.95]],
  beakUpper: 'M5.3 -27.6C4.9 -26.4 5.2 -25.2 5.8 -24.75L9.5 -25.4C9.8 -26.2 9.7 -27 9.4 -27.6Z',
  beakLower: 'M5.8 -24.75L9.5 -25.4L6.8 -23.95Z',
  legs: ['M-4 -6.2L-1.8 -6.2L-2.3 -3.2L-3.5 -3.2Z', 'M1 -6.4L3.4 -6.4L2.9 -3.7L1.6 -3.7Z'],
  feet: 'M-2.9 -3.4L-3.2 0.6M-4.9 -0.8L0 -1.6M-3 -0.8L-0.6 0.8M2.3 -3.8L2.6 -0.2M0.4 -2.2L4.9 -2.6M2.5 -1.6L4.6 0.2',
  flecks: [
    [9.9, -23.8, 0, 1.7], [10.6, -18.4, 0, 1.5], [4.4, -15.1, 0, 1.3], [-4.7, -26.7, 0, 1.4], [5.6, -20.8, 0, 1.2],
    [8.1, -22.4, 1, 1.7], [7.5, -16.2, 1, 1.7], [-1, -16, 1, 1.5], [0, -21.6, 1, 1.5],
    [10, -15.6, 2, 1.9], [-1.9, -22.8, 2, 1.6], [2.4, -23.4, 2, 1.6], [-6.7, -26.1, 2, 1.6], [2.4, -17.3, 2, 1.5],
  ] as readonly Fleck[],
} as const;

/**
 * The pigeon turned three-quarters toward you, facing right, on its way
 * round: the wing further back along its flank, the nearer eye on the side of
 * its head and the further one at the front of it, past the two white bumps
 * of its cere, with the beak under them. A letter in its beak hangs turned
 * with it.
 */
function turnedToYou(dr: Drawing, p: Plumage, letter: boolean): void {
  for (const leg of TQ.legs) fill(dr, leg, p.wing);
  stroke(dr, TQ.feet, FEET, 0.55);
  fill(dr, TQ.tail, p.tail);
  fill(dr, TQ.trunk, p.body);
  dr.add(`<g clip-path="url(#${dr.clip(TQ.trunk)})">`);
  fill(dr, TQ.collar, p.head);
  flecks(dr, p, TQ.flecks.filter(([, y]) => y > -25));
  dr.add('</g>');
  dr.add(`<circle cx="${n(TQ.head.x)}" cy="${n(TQ.head.y)}" r="${n(TQ.head.r)}" fill="${p.head}"/>`);
  flecks(dr, p, TQ.flecks.filter(([, y]) => y <= -25));
  fill(dr, TQ.tips, p.tips);
  const shape = oval(TQ.wing.x, TQ.wing.y, TQ.wing.rx, TQ.wing.ry);
  fill(dr, shape, p.wing);
  dr.add(`<g clip-path="url(#${dr.clip(shape)})">`);
  for (const [a, c, b] of TQ.stripes) fill(dr, taper(a, c, b, 0.62), p.tips);
  dr.add('</g>');
  eye(dr, p, TQ.near.ring, TQ.near.pupil, 'open');
  // the further eye, turned away round the front of the head: narrower than the nearer one, never bigger
  eye(dr, p, TQ.far.ring, TQ.far.pupil, 'open');
  fill(dr, TQ.beakUpper, p.beak);
  fill(dr, TQ.beakLower, p.tips);
  for (const [x, y] of TQ.ceres) dr.add(`<circle cx="${n(x)}" cy="${n(y)}" r="1.35" fill="${CERE}"/>`);
  if (letter) {
    heldLetter(dr, 7.4, -24.6, 0.72);
    fill(dr, TQ.beakLower, p.tips);
  }
}

// ───────────────────────────────────────────── facing you

/** Facing you, from the reference: the round head on the round body, an eye on each side of the head, the wings at its sides. */
const FRONT = {
  head: { x: 0, y: -29.1, r: 9.5 },
  trunk: 'M-9.5 -29.1C-9.5 -26.8 -9.9 -24.4 -10.43 -22.4A11.7 11.7 0 1 0 10.43 -22.4C9.9 -24.4 9.5 -26.8 9.5 -29.1Z',
  collar: `M-14 -42V-21.6${scallops([-14, -21.6], [0, -19.6], 4, 0.85)}${scallops([0, -19.6], [14, -21.6], 4, 0.85)}V-42Z`,
  /** the right wing, folded at its side behind the breast, and the dark edge of it along its top; the left is its mirror */
  wing: { x: 10, y: -16, rx: 3.5, ry: 6.4, turn: 16 },
  wingEdge: taper([10.6, -24.6], [15, -20.2], [12.2, -14.4], 0.9),
  /** where the wing lifts from, waving */
  shoulder: [10.4, -22.6],
  ring: [6.05, -29.65, 2.95, 4.25],
  pupil: [5.25, -29.7, 2.25, 2.8],
  ceres: [[-1.12, -28.05], [1.12, -28.05]],
  beak: 'M-2.2 -27C-1.2 -27.3 1.2 -27.3 2.2 -27C2 -26 0.9 -25 0 -24.4C-0.9 -25 -2 -26 -2.2 -27Z',
  legs: ['M-3.95 -6.2L-1.25 -6.2L-2.05 -3.3L-3.05 -3.3Z', 'M1.25 -6.2L3.95 -6.2L3.05 -3.3L2.05 -3.3Z'],
  flecks: [
    [7.2, -18.3, 0, 2], [8.7, -25.7, 0, 1.7], [-5, -23.8, 0, 1.7], [-5.6, -18.4, 0, 1.5], [1, -15.1, 0, 1.3], [-0.7, -20.8, 0, 1.2],
    [-3, -22.4, 1, 1.7], [-8, -17, 1, 1.7], [5.9, -16, 1, 1.5], [-2.1, -16.2, 1, 1.6], [4.7, -21.6, 1, 1.5],
    [-4.6, -15.5, 2, 1.9], [-9.2, -19, 2, 1.7], [2.2, -23.4, 2, 1.6], [-7.1, -22.4, 2, 1.6], [6.6, -22.5, 2, 1.5], [2.6, -17.4, 2, 1.5], [10, -19.5, 2, 1.5],
  ] as readonly Fleck[],
} as const;

/** A foot from in front, at `x`: its leg down to where the toes part, and the toes spread toward you. */
function frontFoot(x: number): string {
  return `M${n(x)} -3.4L${n(x - 0.2)} -1.5M${n(x + 1.2)} -2.9L${n(x - 1.8)} 1.5M${n(x - 2.8)} 0.1L${n(x - 0.2)} -1.5L${n(x + 1.1)} 0`;
}

/** A letter in its beak seen from in front: the envelope hanging down before its breast, held by the middle of its top edge. */
function frontLetter(dr: Drawing): void {
  dr.add('<g transform="translate(0 -15)">');
  fill(dr, 'M-5.6 -7.6L6.4 -8L6.8 1.8L-5.2 2.2Z', PAPER_EDGE);
  fill(dr, 'M-5.9 -8.4L6.1 -8.8L6.5 1L-5.5 1.4Z', PAPER);
  stroke(dr, 'M-5.9 -8.4L0.3 -3.2L6.1 -8.8', PAPER_EDGE, 0.8);
  dr.add(`<circle cx="0.3" cy="-3.4" r="1.7" fill="${SEAL}"/>`);
  dr.add('</g>');
}

/**
 * The pigeon facing you, as it is for a moment in the middle of turning
 * round, or while it stops to look at you: its round head on its round body,
 * an eye on each side of the head, the cere's two white bumps between them
 * over the beak, the collar across its breast, and its wings at its sides.
 * Waving, the wing on your right is lifted out and up from its shoulder, and
 * its eyes are screwed up for joy. A letter in its beak hangs before its
 * breast.
 */
function facingYou(dr: Drawing, p: Plumage, letter: boolean, waving: boolean): void {
  for (const leg of FRONT.legs) fill(dr, leg, p.wing);
  stroke(dr, frontFoot(-2.75) + frontFoot(2.75), FEET, 0.55);
  for (const side of [1, -1]) {
    const w = FRONT.wing;
    const lift = waving && side === 1 ? ` rotate(-140 ${n(FRONT.shoulder[0])} ${n(FRONT.shoulder[1])})` : '';
    dr.add(`<g transform="${side === 1 ? '' : 'scale(-1 1)'}${lift}">`);
    dr.add(`<ellipse cx="${n(w.x)}" cy="${n(w.y)}" rx="${n(w.rx)}" ry="${n(w.ry)}" fill="${p.wing}" transform="rotate(${n(w.turn)} ${n(w.x)} ${n(w.y)})"/>`);
    fill(dr, FRONT.wingEdge, p.tips);
    dr.add('</g>');
  }
  fill(dr, FRONT.trunk, p.body);
  dr.add(`<g clip-path="url(#${dr.clip(FRONT.trunk)})">`);
  fill(dr, FRONT.collar, p.head);
  flecks(dr, p, FRONT.flecks.filter(([, y]) => y > -25));
  dr.add('</g>');
  const head = oval(FRONT.head.x, FRONT.head.y, FRONT.head.r, FRONT.head.r);
  fill(dr, head, p.head);
  flecks(dr, p, FRONT.flecks.filter(([, y]) => y <= -25));
  // each eye on its side of the head: as much of it showing as the head's own outline lets
  dr.add(`<g clip-path="url(#${dr.clip(head)})">`);
  for (const side of [1, -1]) {
    const [rx, ry, rrx, rry] = FRONT.ring;
    const [px, py, prx, pry] = FRONT.pupil;
    eye(dr, p, [rx * side, ry, rrx, rry], [px * side, py, prx, pry], waving ? 'happy' : 'open');
  }
  dr.add('</g>');
  if (letter) frontLetter(dr);
  fill(dr, FRONT.beak, p.beak);
  for (const [x, y] of FRONT.ceres) dr.add(`<circle cx="${n(x)}" cy="${n(y)}" r="1.35" fill="${CERE}"/>`);
}

/** Whether a pigeon in `pose` has a letter in its beak when given one: a sleeping, chirping or pecking pigeon holds none. */
export function pigeonHolds(pose: PigeonPose, letter: boolean): boolean {
  return letter && pose !== 'sleep' && pose !== 'happy' && pose !== 'peck';
}

/**
 * The shadow a pigeon standing on the sill casts there, about its feet at
 * 0,0, facing right. The light comes in through the window behind it, so the
 * shadow falls a little toward the room, and it is the shape of what casts
 * it: the round of the body the most of it, the feet the darkest where they
 * touch the sill, the tail a fainter one further back, and a letter in its
 * beak, hanging before its breast, one of its own in front. Asleep, sat down
 * on the sill, it casts a rounder one close under it. Every shape fades out
 * to its rim, and all of them are one shade, so the shadows of the bird and
 * its letter lie together as one.
 */
export function pigeonShadow(dr: Drawing, pose: PigeonPose = 'perched', letter = false): void {
  const soft = dr.id('shadow');
  dr.def(radialBox(soft, [[0, DUSK, 1], [0.55, DUSK, 0.72], [1, DUSK, 0]]));
  const blot = (cx: number, cy: number, rx: number, ry: number, strength = 1): string =>
    `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="url(#${soft})"${strength === 1 ? '' : ` opacity="${n(strength)}"`}/>`;
  dr.add('<g opacity="0.26">');
  const holds = pigeonHolds(pose, letter);
  if (pose === 'sleep') dr.add(blot(0, 1.2, 14.6, 3) + blot(-15.6, 1.6, 5.4, 1.2, 0.55));
  // pecking, the round of it has leant forward over its feet and its head is down by the sill; its raised tail casts little
  else if (pose === 'peck') dr.add(blot(9.4, 1.5, 15.4, 3) + blot(-0.6, 1.1, 5, 1.3) + blot(-9.6, 1.8, 4, 1, 0.4));
  else if (pose === 'front' || pose === 'hello') {
    // facing you it is round and as wide as it is deep, its feet side by side
    dr.add(blot(0, 1.4, 13.4, 3) + blot(-2.75, 1.1, 3, 1.1) + blot(2.75, 1.1, 3, 1.1));
    if (holds) dr.add(blot(0.4, 2.2, 7.2, 1.8));
  } else if (pose === 'turn') {
    dr.add(blot(-0.6, 1.5, 13.6, 3) + blot(-14.6, 1.8, 4.6, 1.2, 0.55) + blot(-0.4, 1.1, 4.8, 1.3));
    if (holds) dr.add(blot(10.6, 1.7, 5.2, 1.8));
  } else dr.add(blot(-0.4, 1.5, 14, 3) + blot(-16.4, 1.8, 5.6, 1.3, 0.55) + blot(-0.6, 1.1, 5, 1.3));
  if (holds && pose !== 'front' && pose !== 'hello' && pose !== 'turn') dr.add(blot(18.6, 1.7, 7, 2));
  dr.add('</g>');
}

/**
 * A pigeon about its feet at 0,0, facing right (the caller mirrors it to face
 * left). `letter` puts a letter in its beak; a sleeping, chirping or pecking
 * pigeon holds none. Standing or asleep it casts its shadow (`pigeonShadow`)
 * unless told not to, for an app that lays the shadow on the sill by itself.
 */
export function pigeon(dr: Drawing, hex: string, pose: PigeonPose = 'perched', letter = false, shadow = true): void {
  const p = plumage(hex);
  const flying = pose === 'wings-up' || pose === 'wings-down';
  if (!flying && shadow) pigeonShadow(dr, pose, letter);
  const holding = pigeonHolds(pose, letter);
  if (pose === 'turn') return turnedToYou(dr, p, holding);
  if (pose === 'front' || pose === 'hello') return facingYou(dr, p, holding, pose === 'hello');
  sideOn(dr, p, {
    eyes: pose === 'happy' ? 'happy' : pose === 'blink' || pose === 'sleep' ? 'shut' : 'open',
    wing: pose === 'wings-up' ? 'up' : pose === 'wings-down' ? 'down' : pose === 'wave' ? 'wave' : 'folded',
    legs: flying ? 'tucked' : pose === 'sleep' ? 'sitting' : 'standing',
    letter: holding,
    lean: pose === 'peck' ? PECK.lean : 0,
    bow: pose === 'peck' ? PECK.bow : pose === 'sleep' ? DROOP : 0,
    open: pose === 'happy',
  });
  if (pose === 'sleep') sleeping(dr);
  if (pose === 'happy') chirp(dr);
}
