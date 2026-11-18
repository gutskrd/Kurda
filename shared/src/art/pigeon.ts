/**
 * The pen pal pigeon: each member's letter-carrying bird (letters.ts). Traced from the owner's turnaround of a round
 * grey pigeon; keep its proportions. Flat layered colour shapes with no outline, every colour derived from the bird's
 * own (`plumage`). The turnaround gives three views (side on, three-quarters `turn`, and `front`) so it turns round like
 * a round bird rather than flipping like a card; the other poses are side on. Drawn about its feet at 0,0, facing
 * right, one unit to ten reference pixels (about forty tall, thirty-five tail to beak). Its sill shadow is drawn
 * separately (`pigeonShadow`) so an app can leave it on the sill while the bird hops or flies off.
 */
import type { Drawing } from './svg.js';
import { mix, n, radialBox } from './svg.js';

/**
 * What the pigeon is doing. Flying is two pictures (wings up, wings down) shown in turn. Turning round adds `turn`
 * (three-quarters toward you, facing right, mirrored for the other way) and `front`; facing you it can wave (`hello`),
 * alternated with `front`. Pecking passes through `peck-1` and `peck-2` to its beak at the sill (`peck`, `PIGEON_PECK`)
 * so the head moves smoothly down and up; `bob` thrusts the head forward a moment, as pigeons do while standing about.
 */
export type PigeonPose =
  | 'perched'
  | 'blink'
  | 'happy'
  | 'wave'
  | 'sleep'
  | 'bob'
  | 'peck-1'
  | 'peck-2'
  | 'peck'
  | 'wings-up'
  | 'wings-down'
  | 'turn'
  | 'front'
  | 'hello';
export const PIGEON_POSES: readonly PigeonPose[] = ['perched', 'blink', 'happy', 'wave', 'sleep', 'bob', 'peck-1', 'peck-2', 'peck', 'wings-up', 'wings-down', 'turn', 'front', 'hello'];

/** What the dark parts are taken toward: a night violet, never black; wing tips and tail use a quieter near-charcoal. */
const DUSK = '#1d1838';
const CHARCOAL = '#221e2c';
const PUPIL = '#1d1238';
/** The inside of an open beak: soft pink, never a dark hole. */
const MOUTH = '#e8868e';
const RING = '#ee8a5f';
const CERE = '#fbf8f2';
const FEET = '#f4a6a6';
const PAPER = '#fbf3e4';
const PAPER_EDGE = '#d9c8a6';
const SEAL = '#d8493b';

/**
 * A pigeon's colours and markings. The reference has three kinds (`PIGEON_KINDS`): grey, with dark wing tips, stripes
 * and neck sheen; white, with a pink beak and a fine grey wing outline; brown, with thin brown stripes on a pale wing.
 */
export interface Plumage {
  /** The head and neck, down to the collar. */
  head: string;
  /** The breast and belly. */
  body: string;
  wing: string;
  /** The wing tips, behind it. */
  tips: string;
  tail: string;
  beak: string;
  /** The lower half of the beak. */
  jaw: string;
  /** The bump over the root of the beak. */
  cere: string;
  legs: string;
  /** The ring round the eye. */
  ring: string;
  /** A shut eye: the lid in its ring. */
  lid: string;
  /** The wing's two curved stripes and their width, if it has them. */
  stripes: readonly [string, number] | null;
  /** The neck's sheen flecks, two shining and one dark, if it has them. */
  flecks: readonly [string, string, string] | null;
  /** A fine line round the front and foot of the wing, where the wing matches the body. */
  outline: string | null;
  /** Facing you: the wings at its sides, and the dark edge along their tops if they have one. */
  sides: string;
  band: string | null;
}

/** The reference's darkest dark, kept a little warm: the pupils and the grey pigeon's wing tips. */
const INK = '#1c1a22';

/** The reference's three kinds of pigeon, in its colours. */
export const PIGEON_KINDS = {
  grey: {
    head: '#687878', body: '#889898', wing: '#b0b8b8', tips: INK, tail: '#505858', beak: '#505858', jaw: INK, cere: '#f8f8f6', legs: '#b2bcbf',
    ring: '#e88058', lid: '#7a8888', stripes: [INK, 0.62], flecks: ['#70b8a0', '#7838a0', INK], outline: null, sides: '#b0b8b8', band: INK,
  },
  white: {
    head: '#fcfcfc', body: '#fcfcfc', wing: '#fcfcfc', tips: '#fcfcfc', tail: '#d8e0e0', beak: '#fcc0c4', jaw: '#f0a0a4', cere: '#fcd4d8', legs: '#fcfcfc',
    ring: '#ecd0b0', lid: '#f2f0ec', stripes: null, flecks: null, outline: '#d8e0e0', sides: '#d8e0e0', band: null,
  },
  brown: {
    head: '#b8988c', body: '#c8b4ac', wing: '#d4c4bc', tips: '#d4c4bc', tail: '#b8988c', beak: '#505858', jaw: INK, cere: '#fcfcfc', legs: '#c8b4ac',
    ring: '#d46c48', lid: '#c4a69a', stripes: ['#a48880', 0.46], flecks: null, outline: null, sides: '#d4c4bc', band: null,
  },
} as const satisfies Record<string, Plumage>;

export type PigeonKind = keyof typeof PIGEON_KINDS;

/** Whether a colour is green or teal, where teal flecks would not show, so they shine pink. */
function greenish(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  return g > r + 20 && g >= b - 10;
}

/** Whether a colour is orange, where an orange eye ring would not show, so the ring is golden. */
function orange(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  return r > g + 50 && g > b + 30;
}

/** Whether a colour is violet, where violet flecks would not show, so they shine blue. */
function violet(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  return b > g + 30 && r > g;
}

/** The grey pigeon's markings in another colour, every shade derived from that colour as the grey's are from grey. */
function dyed(hex: string): Plumage {
  const head = mix(hex, DUSK, 0.28);
  const wing = mix(hex, '#f6f8ff', 0.36);
  const tips = mix(hex, CHARCOAL, 0.86);
  return {
    head,
    body: hex,
    wing,
    tips,
    tail: mix(hex, CHARCOAL, 0.54),
    beak: mix(hex, CHARCOAL, 0.58),
    jaw: tips,
    cere: CERE,
    legs: wing,
    ring: orange(hex) ? '#ffd27a' : RING,
    lid: mix(head, hex, 0.45),
    stripes: [tips, 0.62],
    flecks: [greenish(hex) ? '#f39bb8' : '#72c2a6', violet(hex) ? '#3d8fc6' : '#7b3ba5', tips],
    outline: null,
    sides: wing,
    band: tips,
  };
}

/** A pigeon's plumage: one of the reference kinds by name, or grey markings dyed in a colour. */
function plumage(kind: string): Plumage {
  return kind in PIGEON_KINDS ? PIGEON_KINDS[kind as PigeonKind] : dyed(kind);
}

const fill = (dr: Drawing, d: string, hex: string, extra = ''): void => dr.add(`<path d="${d}" fill="${hex}"${extra}/>`);
const stroke = (dr: Drawing, d: string, hex: string, width: number): void =>
  dr.add(`<path d="${d}" fill="none" stroke="${hex}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`);

/** An ellipse as a path, for a clip or to fill. */
function oval(cx: number, cy: number, rx: number, ry: number): string {
  return `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
}

/** A run of small scallops from the current point to `to`, hanging toward `+y` of the line between them. */
function scallops(from: readonly [number, number], to: readonly [number, number], count: number, depth: number): string {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const len = Math.hypot(dx, dy);
  // The side the scallops hang to: below the line, whichever way it runs.
  const side = dx >= 0 ? 1 : -1;
  const [nx, ny] = [(-dy / len) * side, (dx / len) * side];
  let d = '';
  for (let i = 0; i < count; i++) {
    const [mx, my] = [from[0] + dx * ((i + 0.5) / count) + nx * depth * 2, from[1] + dy * ((i + 0.5) / count) + ny * depth * 2];
    d += `Q${n(mx)} ${n(my)} ${n(from[0] + dx * ((i + 1) / count))} ${n(from[1] + dy * ((i + 1) / count))}`;
  }
  return d;
}

/** A stripe thin at both ends and widest in the middle, along a curve from `a` toward `c` to `b`. */
function taper(a: readonly [number, number], c: readonly [number, number], b: readonly [number, number], width: number): string {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dy);
  const [nx, ny] = [(-dy / len) * width, (dx / len) * width];
  return `M${n(a[0])} ${n(a[1])}Q${n(c[0] + nx)} ${n(c[1] + ny)} ${n(b[0])} ${n(b[1])}Q${n(c[0] - nx)} ${n(c[1] - ny)} ${n(a[0])} ${n(a[1])}Z`;
}

/** A neck fleck: [x, y, colour (0 and 1 sheen, 2 dark), length]. */
type Fleck = readonly [number, number, 0 | 1 | 2, number];

function flecks(dr: Drawing, p: Plumage, list: readonly Fleck[]): void {
  if (!p.flecks) return;
  for (const [x, y, k, h] of list) {
    const hex = p.flecks[k];
    dr.add(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="0.31" ry="${n(h / 2)}" fill="${hex}"/>`);
  }
}

/** How an eye looks: open, shut, or screwed up for joy. */
type Eyes = 'open' | 'shut' | 'happy';

/**
 * An eye: its orange ring holding the pupil (`pupil` as cx, cy, rx, ry), or the closed lid with its line, hanging down
 * when shut and arched up when screwed up for joy.
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
  // Shut, the line hangs down across the eye; screwed up for joy, it arches up.
  const [ends, middle] = eyes === 'shut' ? [py - h * 0.2, py + h * 1.3] : [py + h * 0.5, py - h * 1.5];
  stroke(dr, `M${n(px - w)} ${n(ends)}Q${n(px)} ${n(middle)} ${n(px + w)} ${n(ends)}`, PUPIL, Math.max(0.5, prx * 0.22));
}

// ───────────────────────────────────────────── side on

/** The head: a round dome holding the eye. */
const HEAD = { x: 1.9, y: -29.1, r: 9.5 } as const;
/** The body under the head, from the throat round the breast and belly to the back. */
const TRUNK =
  'M11.36 -28.2C11.9 -25.2 13 -22 13 -18A12.8 12.6 0 0 1 0.2 -5.4A12.8 12.6 0 0 1 -12.6 -18C-12.6 -21.8 -10.6 -24.6 -7.7 -25.8C-4.6 -28.4 6 -29.8 11.36 -28.2Z';
/** The deep colour of head and neck, down to its scalloped collar across the breast, running on back behind the wing. */
const COLLAR = `M15 -42V-20.8${scallops([15, -20.8], [3.2, -20.2], 4, 0.8)}L-15 -23V-42Z`;
/** The eye's ring and pupil, as cx, cy, rx, ry. */
const EYE_RING = [2.8, -29.7, 4.3, 4.3] as const;
const EYE_PUPIL = [2.8, -29.7, 2.9, 2.9] as const;
/** The cere: the white bump over the root of the beak. */
const CERE_AT = [10.6, -28.1, 1.4] as const;
/** The beak: its upper half, and the darker lower half below. */
const BEAK_UPPER = 'M9.6 -27.9L12 -27.5C13.1 -27.2 14.2 -26.7 14.95 -26.1C13.6 -25.8 12.3 -25.6 11 -25.4Z';
const BEAK_LOWER = 'M11 -25.4C12.3 -25.6 13.6 -25.8 14.95 -26.1C13.7 -25.1 12.2 -24.4 10.7 -24.2Z';
/** The hinge the beak opens about when chirping. */
const BEAK_ROOT = [10.8, -25.5] as const;
/** The flecks on the side of the neck, from the reference; those on the head bow with it. */
const SIDE_FLECKS: readonly Fleck[] = [
  [-6.2, -29.2, 0, 1.9], [7.5, -24.5, 0, 1.8], [8.1, -18.3, 0, 1.5], [-2, -26.9, 0, 1.4], [3.9, -22, 0, 1.2],
  [10.6, -16.8, 1, 2.1], [5.6, -23, 1, 1.8], [5.4, -16.2, 1, 1.7],
  [11.8, -18.9, 2, 1.9], [9.6, -23.3, 2, 1.8], [8, -15.5, 2, 1.9], [-4.5, -26.3, 2, 1.6],
];

/** The wing over the side: a big pale oval, two dark stripes curving down its back edge, and dark tips swept back behind. */
const WING = { x: -4.1, y: -17, rx: 8.4, ry: 7.8 } as const;
const WING_STRIPES: ReadonlyArray<readonly [readonly [number, number], readonly [number, number], readonly [number, number]]> = [
  [[-6.6, -24.4], [-9.6, -20], [-6.2, -15.2]],
  [[-8.6, -23.8], [-12.8, -17.6], [-7.8, -11.2]],
];
const WING_TIPS = 'M-4.6 -23.6C-11.6 -24.4 -17.8 -20.8 -19.4 -13.2C-16.4 -10.6 -12 -9.3 -6.6 -9.6Z';
/** A white wing's fine line, from the front of its top round its front and back along its foot. */
const WING_OUTLINE = 'M-0.3 -24A8.4 7.8 0 0 1 -4.1 -9.2C-7.6 -9 -11 -9.4 -14.4 -10.4';
/**
 * Where the wing pivots when raised, beaten or waved: its shoulder on the back, so a raised wing stands behind the head
 * and never covers the eye; and its angle for each way it is held.
 */
const SHOULDER = [-4, -21] as const;
const WING_TURN = { folded: 0, up: 88, down: -40, wave: 46 } as const;

/** The tail, low behind: dark, ending in three rounded feathers. */
const TAIL = 'M-5.6 -13.6C-10.4 -14 -16.2 -13.2 -19.6 -11.4Q-21.8 -9 -18 -8.2Q-18.6 -5.2 -14.4 -6.4Q-13.4 -3.8 -9.2 -5.4L-5.2 -7.6Z';

/** Two short pale legs with pink feet: each a leg down to the sill and two toes across it. */
const LEGS = ['M-3.4 -6.2L-1.2 -6.2L-1.7 -3.2L-2.9 -3.2Z', 'M0 -6.4L2 -6.4L1.6 -3.8L0.4 -3.8Z'] as const;
const FEET_SIDE = 'M-2.5 -3.4L-1.9 0.6M-4.5 -1.4L0.7 -1.4M-2 -1.1L1.3 0.6M0.8 -4L1.4 -0.1M-1.2 -2.1L3.8 -2.1M1.2 -1.7L4.6 -0.2';
/** Flying, feet tucked back under the belly. */
const FEET_TUCKED = 'M-1.6 -5.6L-5.6 -4.2M-0.6 -5.2L-4.4 -3.4';

/**
 * Pecking, the head leads and the body follows: the head bows about the neck and reaches forward and down, the body
 * leans forward about the top of the legs, which stay on the sill, so the beak tip reaches the sill a little ahead of
 * the feet while the breast stays over them. `peck-1` and `peck-2` are in-between moments, head ahead of body. A bob
 * thrusts the head forward; asleep, the head droops a little.
 */
const HIP = [-0.6, -6.2] as const;
const NECK = [3, -21] as const;
/** The beak tip, side on, where a letter is held. */
const BEAK_TIP = [14.95, -26.1] as const;

/** How head and body are carried: the body's lean about the hip, the head's bow about the neck, and the head's reach. */
interface Carriage {
  lean: number;
  bow: number;
  reach: readonly [number, number];
}

const UPRIGHT: Carriage = { lean: 0, bow: 0, reach: [0, 0] };
const PECKED: Carriage = { lean: 35, bow: 45, reach: [3, 3.5] };
/** How far down each pecking picture is, as shares of the whole way. */
const PECK_DEPTH = { 'peck-1': 0.3, 'peck-2': 0.58, peck: 1 } as const;
const CARRIAGE: Partial<Record<PigeonPose, Carriage>> = {
  ...Object.fromEntries(
    Object.entries(PECK_DEPTH).map(([pose, f]) => [pose, { lean: PECKED.lean * f, bow: PECKED.bow * f, reach: [PECKED.reach[0] * f, PECKED.reach[1] * f] }]),
  ),
  bob: { lean: 0, bow: 4, reach: [2.2, 0.6] },
  sleep: { lean: 0, bow: 12, reach: [0, 0] },
};

function turned(p: readonly [number, number], about: readonly [number, number], deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  const [x, y] = [p[0] - about[0], p[1] - about[1]];
  return [about[0] + x * Math.cos(a) - y * Math.sin(a), about[1] + x * Math.sin(a) + y * Math.cos(a)];
}

/** Where a head point ends up with head and body carried as `c`. */
function carried(p: readonly [number, number], c: Carriage): [number, number] {
  const [x, y] = turned(p, NECK, c.bow);
  return turned([x + c.reach[0], y + c.reach[1]], HIP, c.lean);
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
const pecked = carried(BEAK_TIP, CARRIAGE.peck!);

/** Where a held letter hangs from: a third of the way along its top edge, so the beak holds it a little left of centre. */
const LETTER_HOLD = 2.4;

/**
 * Pecking, relative to its feet: where the beak tip reaches the sill (a little ahead of the feet), where the middle of a
 * letter picked up or laid down there lies, and how far ahead the bowed head reaches, so two pigeons keep apart even
 * pecking.
 */
export const PIGEON_PECK = {
  beak: [round2(pecked[0]), round2(pecked[1])],
  letter: round2(pecked[0] + LETTER_HOLD),
  reach: Math.round((carried([HEAD.x, HEAD.y], CARRIAGE.peck!)[0] + HEAD.r) * 10) / 10,
} as const;

/** How far ahead of its feet a side-on pigeon reaches (beak tip, and the far edge of a held letter), and how far below the beak a letter hangs. */
export const PIGEON_REACH = { beak: BEAK_TIP[0], letter: round2(BEAK_TIP[0] + 9.7), hang: 10.7 } as const;

/** The beak tip relative to the feet in a side-on pose, where a held letter hangs from. */
export function pigeonBeakTip(pose: PigeonPose): readonly [number, number] {
  const [x, y] = carried(BEAK_TIP, CARRIAGE[pose] ?? UPRIGHT);
  return [round2(x), round2(y)];
}

/** How the pigeon is seen side on. */
interface SideLook {
  eyes: Eyes;
  wing: keyof typeof WING_TURN;
  legs: 'standing' | 'tucked' | 'sitting';
  letter: boolean;
  /** How head and body are carried: upright, bowing to peck, bobbing, or drooping asleep. */
  carriage: Carriage;
  /** The beak open, chirping. */
  open: boolean;
}

/** The wing with its tips and stripes, turned about the shoulder as it is held. */
function sideWing(dr: Drawing, p: Plumage, turn: number, hex = p.wing): void {
  dr.add(turn ? `<g transform="rotate(${n(turn)} ${n(SHOULDER[0])} ${n(SHOULDER[1])})">` : '<g>');
  fill(dr, WING_TIPS, hex === p.wing ? p.tips : hex);
  const shape = oval(WING.x, WING.y, WING.rx, WING.ry);
  fill(dr, shape, hex);
  wingMarks(dr, p, shape, WING_STRIPES, WING_OUTLINE);
  dr.add('</g>');
}

/** A wing's stripes clipped to it, or the fine line round its front and foot. */
function wingMarks(dr: Drawing, p: Plumage, shape: string, stripes: typeof WING_STRIPES, outline: string): void {
  if (p.stripes) {
    const [hex, width] = p.stripes;
    dr.add(`<g clip-path="url(#${dr.clip(shape)})">`);
    for (const [a, c, b] of stripes) fill(dr, taper(a, c, b, width), hex);
    dr.add('</g>');
  }
  if (p.outline) stroke(dr, outline, p.outline, 0.42);
}

/** The pigeon side on, facing right. */
function sideOn(dr: Drawing, p: Plumage, look: SideLook): void {
  const c = look.carriage;
  if (look.legs === 'standing') {
    for (const leg of LEGS) fill(dr, leg, p.legs);
    stroke(dr, FEET_SIDE, FEET, 0.55);
  }
  // Asleep, it sits down on its legs; pecking, it leans forward on them.
  const sat = look.legs === 'sitting' ? 'translate(0 5.4)' : '';
  const lean = c.lean ? `rotate(${n(c.lean)} ${n(HIP[0])} ${n(HIP[1])})` : '';
  const body = sat || lean ? `<g transform="${`${sat} ${lean}`.trim()}">` : '<g>';
  dr.add(body);
  if (look.legs === 'tucked') stroke(dr, FEET_TUCKED, FEET, 0.6);
  // Flying with wings up, the far wing shows behind it, a shade deeper and a little ahead.
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
  const moved = c.bow || c.reach[0] || c.reach[1];
  const head = moved ? `<g transform="translate(${n(c.reach[0])} ${n(c.reach[1])}) rotate(${n(c.bow)} ${n(NECK[0])} ${n(NECK[1])})">` : '<g>';
  dr.add(head);
  dr.add(`<circle cx="${n(HEAD.x)}" cy="${n(HEAD.y)}" r="${n(HEAD.r)}" fill="${p.head}"/>`);
  flecks(dr, p, SIDE_FLECKS.filter(([, y]) => y <= -25));
  dr.add('</g>');
  sideWing(dr, p, WING_TURN[look.wing]);
  dr.add(head);
  eye(dr, p, EYE_RING, EYE_PUPIL, look.eyes);
  if (look.open) openBeak(dr, p);
  else beak(dr, p);
  dr.add('</g></g>');
  if (look.letter) {
    // The letter hangs straight down from the beak tip wherever the head is, with the beak tip over the paper.
    const [x, y] = carried(BEAK_TIP, c);
    heldLetter(dr, x, y, 1);
    dr.add(body + head);
    fill(dr, BEAK_UPPER, p.beak);
    dr.add(`<circle cx="${n(CERE_AT[0])}" cy="${n(CERE_AT[1])}" r="${n(CERE_AT[2])}" fill="${p.cere}"/>`);
    dr.add('</g></g>');
  }
}

/** The beak shut, and the cere over it. */
function beak(dr: Drawing, p: Plumage): void {
  fill(dr, BEAK_LOWER, p.jaw);
  fill(dr, BEAK_UPPER, p.beak);
  dr.add(`<circle cx="${n(CERE_AT[0])}" cy="${n(CERE_AT[1])}" r="${n(CERE_AT[2])}" fill="${p.cere}"/>`);
}

/**
 * The beak open to chirp: its halves apart about their hinge, with the pink mouth between, drawn slightly inside both
 * halves so only beak and mouth show between them.
 */
function openBeak(dr: Drawing, p: Plumage): void {
  const hinge = BEAK_ROOT;
  const deep: [number, number] = [11 + 0.78 * (BEAK_TIP[0] - 11), -25.4 + 0.78 * (BEAK_TIP[1] + 25.4)];
  const [up, down] = [turned(deep, hinge, -9), turned(deep, hinge, 13)];
  const round = turned([deep[0] + 0.9, deep[1]], hinge, 2);
  fill(
    dr,
    `M${n(hinge[0])} ${n(hinge[1])}L${n(up[0])} ${n(up[1])}Q${n(round[0])} ${n(round[1])} ${n(down[0])} ${n(down[1])}Z`,
    MOUTH,
  );
  fill(dr, BEAK_LOWER, mix(p.beak, p.jaw, 0.5), ` transform="rotate(16 ${n(hinge[0])} ${n(hinge[1])})"`);
  fill(dr, BEAK_UPPER, p.beak, ` transform="rotate(-12 ${n(hinge[0])} ${n(hinge[1])})"`);
  dr.add(`<circle cx="${n(CERE_AT[0])}" cy="${n(CERE_AT[1])}" r="${n(CERE_AT[2])}" fill="${p.cere}"/>`);
}

/**
 * The held letter: a small envelope sealed with red wax, hanging from the beak at `x`, `y`, held a third of the way
 * along its top edge; `squeeze` narrows it as the bird turns.
 */
function heldLetter(dr: Drawing, x: number, y: number, squeeze: number): void {
  dr.add(`<g transform="translate(${n(x)} ${n(y)}) scale(${n(squeeze)} 1)">`);
  fill(dr, 'M-4.6 1.1L9.4 0.5L9.7 10.1L-4.3 10.7Z', PAPER_EDGE);
  fill(dr, 'M-4.6 0.3L9.4 -0.3L9.7 9.3L-4.3 9.9Z', PAPER);
  stroke(dr, 'M-4.6 0.3L2.5 5.2L9.4 -0.3', PAPER_EDGE, 0.8);
  dr.add(`<circle cx="2.5" cy="5" r="1.7" fill="${SEAL}"/>`);
  dr.add('</g>');
}

/** Two little notes off a chirping pigeon's beak. */
function chirp(dr: Drawing): void {
  const note = (x: number, y: number, s: number): string =>
    `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(1.1 * s)}" ry="${n(0.8 * s)}" fill="#9b97c9" transform="rotate(-20 ${n(x)} ${n(y)})"/>` +
    `<path d="M${n(x + 0.95 * s)} ${n(y - 0.2 * s)}V${n(y - 4 * s)}Q${n(x + 2.2 * s)} ${n(y - 3.4 * s)} ${n(x + 2.6 * s)} ${n(y - 2.2 * s)}" fill="none" stroke="#9b97c9" stroke-width="${n(0.55 * s)}" stroke-linecap="round"/>`;
  dr.add(note(19.4, -30.4, 1) + note(23.6, -36.2, 0.8));
}

/** Three Zs rising off a sleeping pigeon. */
function sleeping(dr: Drawing): void {
  const z = (x: number, y: number, s: number): string => `M${n(x)} ${n(y)}h${n(s)}l${n(-s)} ${n(s)}h${n(s)}`;
  stroke(dr, z(12.4, -36, 2.4) + z(16.4, -42, 3) + z(21, -49, 3.6), '#9b97c9', 1.2);
}

// ───────────────────────────────────────────── turned toward you

/** Three-quarters toward you, from the reference: the body a little shorter front to back, the wing further back, both eyes showing. */
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
  outline: 'M-5.14 -24.13A6.3 8 0 0 1 -8 -9C-11 -8.9 -13.6 -9.4 -16 -10.4',
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
 * The pigeon three-quarters toward you, facing right, on its way round: the wing further back along its flank, the near
 * eye on the side of the head and the far one at its front past the cere's two white bumps, the beak below. A held
 * letter turns with it.
 */
function turnedToYou(dr: Drawing, p: Plumage, letter: boolean): void {
  for (const leg of TQ.legs) fill(dr, leg, p.legs);
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
  wingMarks(dr, p, shape, TQ.stripes, TQ.outline);
  eye(dr, p, TQ.near.ring, TQ.near.pupil, 'open');
  // The far eye, turned away round the front of the head: narrower than the near one, never bigger.
  eye(dr, p, TQ.far.ring, TQ.far.pupil, 'open');
  fill(dr, TQ.beakUpper, p.beak);
  fill(dr, TQ.beakLower, p.jaw);
  for (const [x, y] of TQ.ceres) dr.add(`<circle cx="${n(x)}" cy="${n(y)}" r="1.35" fill="${p.cere}"/>`);
  if (letter) {
    heldLetter(dr, 7.2, -24.2, 0.72);
    fill(dr, TQ.beakLower, p.jaw);
  }
}

// ───────────────────────────────────────────── facing you

/** Facing you, from the reference: the round head on the round body, an eye on each side, the wings at its sides. */
const FRONT = {
  head: { x: 0, y: -29.1, r: 9.5 },
  trunk: 'M-9.5 -29.1C-9.5 -26.8 -9.9 -24.4 -10.43 -22.4A11.7 11.7 0 1 0 10.43 -22.4C9.9 -24.4 9.5 -26.8 9.5 -29.1Z',
  collar: `M-14 -42V-21.6${scallops([-14, -21.6], [0, -19.6], 4, 0.85)}${scallops([0, -19.6], [14, -21.6], 4, 0.85)}V-42Z`,
  /** The right wing folded at its side behind the breast, with its dark top edge; the left mirrors it. */
  wing: { x: 10, y: -16, rx: 3.5, ry: 6.4, turn: 16 },
  wingEdge: taper([10.6, -24.6], [15, -20.2], [12.2, -14.4], 0.9),
  /** Where the wing lifts from when waving. */
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

/** A foot seen from in front at `x`: the leg down to where the toes part, and the toes spread toward you. */
function frontFoot(x: number): string {
  return `M${n(x)} -3.4L${n(x - 0.2)} -1.5M${n(x + 1.2)} -2.9L${n(x - 1.8)} 1.5M${n(x - 2.8)} 0.1L${n(x - 0.2)} -1.5L${n(x + 1.1)} 0`;
}

/** A held letter seen from in front: the envelope hanging before the breast, held by the middle of its top edge. */
function frontLetter(dr: Drawing): void {
  dr.add('<g transform="translate(0 -15)">');
  fill(dr, 'M-5.6 -7.6L6.4 -8L6.8 1.8L-5.2 2.2Z', PAPER_EDGE);
  fill(dr, 'M-5.9 -8.4L6.1 -8.8L6.5 1L-5.5 1.4Z', PAPER);
  stroke(dr, 'M-5.9 -8.4L0.3 -3.2L6.1 -8.8', PAPER_EDGE, 0.8);
  dr.add(`<circle cx="0.3" cy="-3.4" r="1.7" fill="${SEAL}"/>`);
  dr.add('</g>');
}

/**
 * The pigeon facing you, mid-turn or stopping to look at you: round head on round body, an eye on each side, the cere's
 * two bumps over the beak, the collar across the breast and the wings at its sides. Waving lifts the wing on your right
 * from its shoulder and screws up its eyes; a held letter hangs before its breast.
 */
function facingYou(dr: Drawing, p: Plumage, letter: boolean, waving: boolean): void {
  for (const leg of FRONT.legs) fill(dr, leg, p.legs);
  stroke(dr, frontFoot(-2.75) + frontFoot(2.75), FEET, 0.55);
  for (const side of [1, -1]) {
    const w = FRONT.wing;
    const lift = waving && side === 1 ? ` rotate(-140 ${n(FRONT.shoulder[0])} ${n(FRONT.shoulder[1])})` : '';
    dr.add(`<g transform="${side === 1 ? '' : 'scale(-1 1)'}${lift}">`);
    dr.add(`<ellipse cx="${n(w.x)}" cy="${n(w.y)}" rx="${n(w.rx)}" ry="${n(w.ry)}" fill="${p.sides}" transform="rotate(${n(w.turn)} ${n(w.x)} ${n(w.y)})"/>`);
    if (p.band) fill(dr, FRONT.wingEdge, p.band);
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
  // Each eye on its side of the head, clipped to the head's outline.
  dr.add(`<g clip-path="url(#${dr.clip(head)})">`);
  for (const side of [1, -1]) {
    const [rx, ry, rrx, rry] = FRONT.ring;
    const [px, py, prx, pry] = FRONT.pupil;
    eye(dr, p, [rx * side, ry, rrx, rry], [px * side, py, prx, pry], waving ? 'happy' : 'open');
  }
  dr.add('</g>');
  if (letter) frontLetter(dr);
  fill(dr, FRONT.beak, p.beak);
  for (const [x, y] of FRONT.ceres) dr.add(`<circle cx="${n(x)}" cy="${n(y)}" r="1.35" fill="${p.cere}"/>`);
}

/** Whether a pigeon in `pose` holds a given letter; sleeping, chirping and pecking pigeons hold none. */
export function pigeonHolds(pose: PigeonPose, letter: boolean): boolean {
  return letter && pose !== 'sleep' && pose !== 'happy' && pose !== 'peck';
}

/**
 * The shadow a pigeon casts on the sill, about its feet at 0,0, facing right. The light comes through the window behind
 * it, so the shadow falls a little toward the room, shaped by the body (most of it), the feet (darkest where they touch),
 * the tail (fainter, further back) and a held letter (in front). Asleep, it is rounder and closer. Every shape fades to
 * its rim in one shade, so bird and letter shadows merge into one.
 */
export function pigeonShadow(dr: Drawing, pose: PigeonPose = 'perched', letter = false): void {
  const soft = dr.id('shadow');
  dr.def(radialBox(soft, [[0, DUSK, 1], [0.55, DUSK, 0.72], [1, DUSK, 0]]));
  const blot = (cx: number, cy: number, rx: number, ry: number, strength = 1): string =>
    `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="url(#${soft})"${strength === 1 ? '' : ` opacity="${n(strength)}"`}/>`;
  dr.add('<g opacity="0.26">');
  const holds = pigeonHolds(pose, letter);
  if (pose === 'sleep') dr.add(blot(0, 1.2, 14.6, 3) + blot(-15.6, 1.6, 5.4, 1.2, 0.55));
  // Pecking, the body leans forward over the feet with the head down by the sill; the raised tail casts little.
  else if (pose === 'peck' || pose === 'peck-2') {
    dr.add(blot(7.4, 1.5, 15, 3) + blot(-0.6, 1.1, 5, 1.3) + blot(-9.6, 1.8, 4, 1, 0.4));
    if (holds) dr.add(blot(23, 1.7, 7, 2));
  }
  else if (pose === 'front' || pose === 'hello') {
    // Facing you, it is round and as wide as deep, the feet side by side.
    dr.add(blot(0, 1.4, 13.4, 3) + blot(-2.75, 1.1, 3, 1.1) + blot(2.75, 1.1, 3, 1.1));
    if (holds) dr.add(blot(0.4, 2.2, 7.2, 1.8));
  } else if (pose === 'turn') {
    dr.add(blot(-0.6, 1.5, 13.6, 3) + blot(-14.6, 1.8, 4.6, 1.2, 0.55) + blot(-0.4, 1.1, 4.8, 1.3));
    if (holds) dr.add(blot(10.6, 1.7, 5.2, 1.8));
  } else dr.add(blot(-0.4, 1.5, 14, 3) + blot(-16.4, 1.8, 5.6, 1.3, 0.55) + blot(-0.6, 1.1, 5, 1.3));
  if (holds && pose !== 'front' && pose !== 'hello' && pose !== 'turn' && pose !== 'peck-2') dr.add(blot(17.4, 1.7, 7, 2));
  dr.add('</g>');
}

/**
 * A pigeon about its feet at 0,0, facing right (the caller mirrors it to face left). `letter` puts a letter in its beak,
 * except in poses that hold none. Standing or asleep it casts its shadow (`pigeonShadow`) unless `shadow` is false, for
 * an app that lays the shadow on the sill itself.
 */
export function pigeon(dr: Drawing, kind: string, pose: PigeonPose = 'perched', letter = false, shadow = true): void {
  const p = plumage(kind);
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
    carriage: CARRIAGE[pose] ?? UPRIGHT,
    open: pose === 'happy',
  });
  if (pose === 'sleep') sleeping(dr);
  if (pose === 'happy') chirp(dr);
}
