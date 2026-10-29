/**
 * The streak's fire, designed once and drawn the same by the phone and the
 * website, in the painterly-flat look of the rest of Hevalo's art. It grows
 * with the streak (`fire-stages.ts`): cold logs ready to be lit, a spark
 * caught, a little flame, a campfire, a big fire, a bonfire, a blaze, and the
 * Newroz fire. The logs lie in the same place at every stage, so whatever
 * the stage, it is the fire on them that has grown.
 *
 * It is data, not markup, because each app moves its parts its own way — the
 * website with a CSS keyframe per part, the phone with one native-driven
 * clock per fire — and both have to move the same parts by the same amounts.
 * Each tongue is a closed path with its own gradient, and flickers around its
 * own root (taller and narrower, leaning one way then the other) on its own
 * period and phase, so the layers slide against each other the way flames do
 * instead of breathing as one shape. The pale heart pulses, a soft glow
 * breathes behind it all, sparks rise off it and fade, and now and then the
 * tip of a flame breaks off and is gone.
 *
 * Only transforms and opacity ever change: no shape is redrawn while it
 * burns, nor while it grows into its next stage, so it costs a phone nothing
 * it would notice.
 */
import { FIRE_GROW, fireStageIndex, type FireLevel, type FireStage } from '../fire-stages.js';
import {
  HALO_RAYS,
  SHAPE_HEIGHT,
  SHAPE_ROOT,
  TONGUE_SHAPES,
  WISP_SHAPES,
  haloRays,
  hearthStones,
  log,
  mapPath,
  mirrored,
  oval,
  pathBox,
  ribbon,
  ring,
  type Box,
  type LogPart,
  type TongueShape,
  type WispShape,
} from './fire-shapes.js';
import { FIRE_CYCLE_MS, FIRE_RISE_STOPS, calmMotion, type FireMotion, type FirePose } from './fire-motion.js';
import type { Pt } from './svg.js';

export * from './fire-motion.js';
export * from './fire-colours.js';

/** The box round an outline of the fire, in the drawing's units: what a phone layer drawing just that part needs to hold. */
export { pathBox as fireOutlineBox, type Box as FireBox } from './fire-shapes.js';

/**
 * The drawing's box, which holds the biggest fire there is. The logs lie at
 * its foot, the same at every stage; the smaller fires burn low in it, with
 * the air above them they will grow into.
 */
export const FIRE_VIEW = { x: 0, y: 0, w: 200, h: 250 } as const;

/** Where the flame stands: the middle of the logs, behind them. Every stage grows up and out from here. */
export const FIRE_ROOT: Pt = [100, 228];

/**
 * At this size (in points or CSS pixels, the fire's height) and under, the
 * light version is drawn: the flame alone in a box cropped round it, three
 * tongues, a gentler flicker, no logs, glow or sparks — beside a number in a
 * row, more would be noise. Its box is the same at every stage, so the text
 * beside it never moves.
 */
export const FIRE_SMALL = 28;
export const FIRE_SMALL_VIEW = { x: 50, y: 90, w: 100, h: 140 } as const;
/** How much of the full flicker the light version moves by. */
export const FIRE_SMALL_CALM = 0.55;

export type FireTongueId = 'back' | 'left' | 'right' | 'outer' | 'flame' | 'core' | 'heart';

export interface FireTongue {
  id: FireTongueId;
  /** a closed outline in the drawing's box */
  d: string;
  /** where it is rooted: what it stretches up from and leans about */
  origin: Pt;
  motion: FireMotion;
}

/**
 * The tip of a flame breaking off: a small sliver of flame just under the
 * tip of a tongue, hidden behind it, that rises clear of it and shrinks to
 * nothing (shrinking, not fading, so it never dims to a smudge). Drawn in the
 * orange flame's colours, behind the tongues.
 */
export interface FireWisp {
  d: string;
  origin: Pt;
  motion: FireMotion;
}

/** A spark: a dot that flies up out of the flame from behind it, drifting, and fades; some of the Newroz fire's are gold. */
export interface FireEmber {
  cx: number;
  cy: number;
  r: number;
  gold: boolean;
  motion: FireMotion;
}

/**
 * A thin ribbon rising: a curl of smoke off cold logs, or heat shimmering
 * over a big fire's tips. Drawn behind the flame. `rest` is where it is drawn
 * when the fire stands still; null, it is not drawn then.
 */
export interface FireDrift {
  kind: 'smoke' | 'heat';
  d: string;
  origin: Pt;
  motion: FireMotion;
  rest: FirePose | null;
}

/** The light behind the fire: a soft radial glow, never a blur, breathing (pulsing, at its hottest). */
export interface FireGlow {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** how strong it is, against the colour's own strength */
  strength: number;
  motion: FireMotion;
}

/**
 * The golden sun behind the Newroz fire: a soft disc of light and thin rays,
 * long and short by turns, fading out from it, turning very slowly. The light
 * version has the disc alone, a gold glow behind its flame.
 */
export interface FireHalo {
  cx: number;
  cy: number;
  /** the disc's radius */
  r: number;
  /** the rays, as one outline; null for none */
  rays: string | null;
  /** how the rays fade out from the middle: an offset (a share of `reach`), and the share of their strength there */
  rayFade: readonly (readonly [number, number])[];
  /** how far the rays reach */
  reach: number;
  /** how strong it is, against the colours' own strength */
  strength: number;
  /** null when it stands still */
  motion: FireMotion | null;
}

/** The one ember still glowing in a cold hearth, brightening and dimming slowly. */
export interface FireCinder {
  cx: number;
  cy: number;
  r: number;
  motion: FireMotion;
}

export type FireBasePart = 'coal' | 'ash' | LogPart | 'stone' | 'stoneLight';

/** What part of the hearth a piece belongs to: the two logs and what lies under them, the third log on the pile, the stones round it. */
export type FireBaseGroup = 'hearth' | 'log' | 'stones';

export interface FireBasePiece {
  part: FireBasePart;
  d: string;
  group: FireBaseGroup;
}

/** One stage of the fire as drawn, back to front, at one size. */
export interface FireDrawing {
  stage: FireStage;
  small: boolean;
  view: Box;
  /** where the flame stands; it grows about this */
  root: Pt;
  /** how far the flame reaches across, and up from its root */
  flame: { w: number; h: number };
  /** whether anything in it moves: a fire burning, or the smoke and the ember of a cold hearth */
  moving: boolean;
  halo: FireHalo | null;
  glow: FireGlow | null;
  /** the hearth behind the flame: the far stones */
  back: readonly FireBasePiece[];
  drifts: readonly FireDrift[];
  wisps: readonly FireWisp[];
  embers: readonly FireEmber[];
  /** back to front */
  tongues: readonly FireTongue[];
  /** the hearth in front of the flame's root: coals or ash, the logs, the near stones */
  front: readonly FireBasePiece[];
  cinder: FireCinder | null;
}

// ─────────────────────────────────────────────────────────────── motion

/** A loop's four poses of stretch and lean, about the part's root. */
const flicker = (periodMs: number, phase: number, poses: readonly [number, number, number][]): FireMotion => ({
  kind: 'loop',
  periodMs,
  phase,
  poses: poses.map(([sx, sy, skew]) => ({ sx, sy, skew })),
});

/**
 * How each tongue flickers. Their periods all differ from their neighbours'
 * and their leans run against each other, so no two layers ever move as one;
 * the side flames lean outwards, away from the fire.
 */
const FLICKER: Readonly<Record<FireTongueId, FireMotion>> = {
  back: flicker(1200, 0.3, [
    [1, 1, 0],
    [0.95, 1.1, -6],
    [1.04, 0.92, 2],
    [0.97, 1.05, -9],
  ]),
  left: flicker(960, 0.7, [
    [1, 1, 0],
    [0.95, 1.1, 6],
    [1.04, 0.93, -2],
    [0.97, 1.06, 8],
  ]),
  right: flicker(1200, 0.1, [
    [1, 1, 0],
    [0.96, 1.08, -6],
    [1.03, 0.94, 2],
    [0.97, 1.05, -8],
  ]),
  outer: flicker(1600, 0, [
    [1, 1, 0],
    [0.97, 1.05, -3],
    [1.02, 0.97, 1.5],
    [0.98, 1.04, 3.5],
  ]),
  flame: flicker(960, 0.55, [
    [1, 1, 0],
    [0.96, 1.08, 3],
    [1.03, 0.95, -3],
    [0.97, 1.05, -1],
  ]),
  core: flicker(800, 0.2, [
    [1, 1, 0],
    [0.95, 1.1, -4],
    [1.03, 0.93, 2],
    [0.97, 1.06, 5],
  ]),
  heart: flicker(600, 0, [
    [1, 1, 0],
    [1.06, 1.08, 0],
    [0.97, 0.95, 0],
    [1.04, 1.05, 0],
  ]),
};

/** The crown leans less than a slim flame: a wide one leaning far would shear. */
const CROWN_FLICKER = flicker(1600, 0.4, [
  [1, 1, 0],
  [0.98, 1.06, -2],
  [1.02, 0.96, 1],
  [0.99, 1.04, -3],
]);

/** A flame just caught flickers quicker and further than a grown one, the way a young flame does. */
const NERVOUS: Partial<Record<FireTongueId, FireMotion>> = {
  flame: flicker(480, 0, [
    [1, 1, 0],
    [0.9, 1.16, -8],
    [1.06, 0.9, 5],
    [0.93, 1.12, 10],
  ]),
  heart: flicker(600, 0.3, [
    [1, 1, 0],
    [1.1, 1.14, 4],
    [0.94, 0.88, -2],
    [1.06, 1.08, -4],
  ]),
};

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Something rising off the fire, at each of `FIRE_RISE_STOPS`: it waits
 * unseen for `wait` of its period, then appears, climbs `rise` (slowing a
 * little as it goes), drifts `drift` across with a `swirl` of a turn about
 * its way, shrinks and fades.
 */
function rising({ rise, drift, swirl = 0, periodMs, phase, wait = 0 }: { rise: number; drift: number; swirl?: number; periodMs: number; phase: number; wait?: number }): FireMotion {
  return {
    kind: 'rise',
    periodMs,
    phase,
    poses: FIRE_RISE_STOPS.map((stop) => {
      const t = Math.max(0, (stop - wait) / (1 - wait));
      const o = t <= 0 ? 0 : t < 0.15 ? t / 0.15 : t < 0.45 ? 1 : (1 - t) / 0.55;
      const s = 1 - 0.6 * t;
      return {
        x: round3(drift * t + swirl * Math.sin(Math.PI * 2 * t)),
        y: round3(-rise * (1 - (1 - t) ** 1.3)),
        sx: round3(s),
        sy: round3(s),
        o: round3(o),
      };
    }),
  };
}

/** A broken-off tip: up clear of its flame, drifting `side` (-1 left, 1 right), shrinking to nothing; `k` scales its climb. */
function breakingOff(periodMs: number, phase: number, side: number, k: number): FireMotion {
  const at = (y: number, x: number, sx: number, sy: number, o: number): FirePose => ({ x: round3(x * side * k), y: round3(y * k), sx, sy, o });
  return {
    kind: 'rise',
    periodMs,
    phase,
    poses: [at(0, 0, 0.8, 0.8, 0), at(-6, 0, 1, 1.25, 1), at(-14, 1.5, 0.7, 1, 1), at(-20, 3, 0.35, 0.6, 1), at(-24, 4, 0.12, 0.35, 0.6), at(-26, 4.5, 0.1, 0.3, 0)],
  };
}

// ─────────────────────────────────────────────────────────────── stages

interface EmberSpec {
  /** where it starts, in the tongues' own drawing (so it starts inside the stage's flame) */
  at: Pt;
  r: number;
  rise: number;
  drift: number;
  swirl?: number;
  periodMs: number;
  phase: number;
  wait?: number;
  gold?: boolean;
}

/**
 * How a stage stretches the tongues' own drawing about its root: up by
 * `sy`, and across by `sx` at the top but only `base` of that at the root,
 * so a big fire's foot stays on its logs while its top spreads.
 */
interface Stretch {
  sx: number;
  sy: number;
  base: number;
}

interface StageArt extends Stretch {
  /** how much taller it grows on top by the time the next stage is reached (a tenth, about) */
  grows: number;
  tongues: readonly (readonly [FireTongueId, TongueShape])[];
  wisps: readonly WispShape[];
  embers: readonly EmberSpec[];
  glow: number;
  /** the glow pulsing, not only breathing */
  pulse: boolean;
  heat: boolean;
  log: boolean;
  stones: boolean;
  halo: boolean;
}

/** The campfire's sparks, spread so they never rise together. */
const CAMP_EMBERS: readonly EmberSpec[] = [
  { at: [48, 46], r: 2.4, rise: 56, drift: -14, swirl: 2, periodMs: 1600, phase: 0 },
  { at: [74, 44], r: 2, rise: 52, drift: 14, swirl: -2, periodMs: 2400, phase: 0.35 },
  { at: [34, 58], r: 1.8, rise: 60, drift: -16, swirl: 2, periodMs: 1200, phase: 0.62 },
  { at: [90, 50], r: 2.2, rise: 56, drift: 12, swirl: -2, periodMs: 1600, phase: 0.8 },
  { at: [62, 34], r: 1.6, rise: 46, drift: 5, swirl: 2, periodMs: 2400, phase: 0.85 },
];

/** A bigger fire's sparks: more of them, higher, spiralling as they go. */
const spiral = (embers: readonly EmberSpec[], rise: number, swirl: number): EmberSpec[] =>
  embers.map((e, i) => ({ ...e, rise: e.rise * rise, swirl: (i % 2 === 0 ? 1 : -1) * swirl * (0.7 + 0.3 * (i % 3)) }));

const BIG_EMBERS: readonly EmberSpec[] = [
  ...CAMP_EMBERS,
  { at: [26, 72], r: 1.8, rise: 56, drift: -18, periodMs: 1200, phase: 0.3 },
  { at: [98, 64], r: 2, rise: 54, drift: 18, periodMs: 2400, phase: 0.15 },
];

const BONFIRE_EMBERS: readonly EmberSpec[] = spiral(
  [
    ...BIG_EMBERS,
    { at: [56, 58], r: 2, rise: 60, drift: -6, periodMs: 1600, phase: 0.45 },
    { at: [80, 66], r: 1.7, rise: 56, drift: 10, periodMs: 1200, phase: 0.05 },
  ],
  1.25,
  6,
);

const BLAZE_EMBERS: readonly EmberSpec[] = spiral([...BONFIRE_EMBERS, { at: [44, 64], r: 1.9, rise: 60, drift: -10, periodMs: 2400, phase: 0.6 }], 1.15, 9);

const NEWROZ_EMBERS: readonly EmberSpec[] = [...BLAZE_EMBERS, { at: [70, 60] as Pt, r: 2.1, rise: 64, drift: 8, periodMs: 1600, phase: 0.25 }].map((e, i) => ({ ...e, gold: i % 2 === 1 }));

const BIG_TONGUES: StageArt['tongues'] = [
  ['back', 'back'],
  ['left', 'side'],
  ['right', 'side'],
  ['outer', 'outer'],
  ['flame', 'flame'],
  ['core', 'core'],
  ['heart', 'heart'],
];

const NOTHING = { heat: false, log: false, stones: false, halo: false, pulse: false } as const;

/**
 * Each stage as drawn: a step up from the one before, so every new stage is
 * plainly bigger, and from the bonfire on something more besides (more wood,
 * the stones, the sun behind it). From the foot of the box, the flames
 * reach about 27%, 41%, 56%, 68%, 76%, 83% and 90% of the way up it, and a
 * tenth or so further by the day before the next stage: the Newroz fire
 * fills it at its fullest.
 */
const STAGE_ART: Readonly<Record<Exclude<FireStage, 'cold'>, StageArt>> = {
  spark: {
    ...NOTHING,
    sx: 0.62,
    sy: 0.51,
    base: 1,
    grows: 0.12,
    tongues: [
      ['flame', 'core'],
      ['heart', 'heart'],
    ],
    wisps: [],
    embers: [{ at: [58, 76], r: 1.8, rise: 30, drift: 5, swirl: 2, periodMs: 2400, phase: 0, wait: 0.4 }],
    glow: 0.55,
  },
  kindling: {
    ...NOTHING,
    sx: 0.66,
    sy: 0.6,
    base: 1,
    grows: 0.12,
    tongues: [
      ['outer', 'outer'],
      ['core', 'core'],
      ['heart', 'heart'],
    ],
    wisps: ['middle'],
    embers: [
      { at: [50, 56], r: 2, rise: 40, drift: -9, swirl: 2, periodMs: 1600, phase: 0 },
      { at: [70, 52], r: 1.8, rise: 36, drift: 8, swirl: -2, periodMs: 2400, phase: 0.5 },
    ],
    glow: 0.8,
  },
  campfire: {
    ...NOTHING,
    sx: 0.92,
    sy: 0.88,
    base: 1,
    grows: 0.1,
    tongues: BIG_TONGUES.filter(([id]) => id !== 'left' && id !== 'right'),
    wisps: ['middle', 'right'],
    embers: CAMP_EMBERS,
    glow: 1,
  },
  bigfire: { ...NOTHING, sx: 1.02, sy: 1.1, base: 0.92, grows: 0.1, tongues: BIG_TONGUES, wisps: ['middle', 'right', 'left'], embers: BIG_EMBERS, glow: 1.05 },
  bonfire: { ...NOTHING, sx: 1.12, sy: 1.26, base: 0.88, grows: 0.08, tongues: BIG_TONGUES, wisps: ['middle', 'right', 'left'], embers: BONFIRE_EMBERS, glow: 1.15, heat: true, log: true },
  blaze: {
    sx: 1.18,
    sy: 1.38,
    base: 0.86,
    grows: 0.08,
    tongues: BIG_TONGUES,
    wisps: ['middle', 'right', 'left'],
    embers: BLAZE_EMBERS,
    glow: 1.25,
    pulse: true,
    heat: true,
    log: true,
    stones: true,
    halo: false,
  },
  newroz: {
    sx: 1.24,
    sy: 1.5,
    base: 0.84,
    grows: 0.08,
    tongues: BIG_TONGUES.map(([id, shape]) => [id, id === 'back' ? 'crown' : shape] as const),
    wisps: ['middle', 'right', 'left'],
    embers: NEWROZ_EMBERS,
    glow: 1.05,
    pulse: true,
    heat: true,
    log: true,
    stones: true,
    halo: true,
  },
};

/** Where each tongue was rooted as drawn. */
const TONGUE_ROOTS: Readonly<Record<TongueShape, Pt>> = {
  back: [70, 136],
  outer: SHAPE_ROOT,
  flame: SHAPE_ROOT,
  core: SHAPE_ROOT,
  heart: SHAPE_ROOT,
  side: [36, 138],
  crown: SHAPE_ROOT,
};

/** Where each broken-off tip was drawn rising from, and which way it drifts. */
const WISP_FROM: Readonly<Record<WispShape, { origin: Pt; side: number; periodMs: number; phase: number }>> = {
  middle: { origin: [56, 26], side: -1, periodMs: 1200, phase: 0.1 },
  right: { origin: [96, 42], side: 1, periodMs: 1600, phase: 0.6 },
  left: { origin: [22, 58], side: -1, periodMs: 2400, phase: 0.3 },
};

/** The heat over a big fire's tips: two faint waves, drawn in the tongues' own drawing so they stay over its tips. */
const HEAT_LINES: readonly (readonly Pt[])[] = [
  [
    [38, 46],
    [35, 36],
    [39, 26],
    [36, 16],
  ],
  [
    [80, 42],
    [83, 32],
    [79, 22],
    [82, 12],
  ],
];

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** A point of the tongues' own drawing, where a fire stretched by `s` puts it. */
function place([x, y]: Pt, { sx, sy, base }: Stretch): Pt {
  const up = clamp01((SHAPE_ROOT[1] - y) / SHAPE_HEIGHT);
  return [FIRE_ROOT[0] + (x - SHAPE_ROOT[0]) * sx * (base + (1 - base) * up), FIRE_ROOT[1] + (y - SHAPE_ROOT[1]) * sy];
}

/** An outline of the tongues' own drawing, stretched by `s`. */
const stretched = (d: string, s: Stretch): string => mapPath(d, (x, y) => place([x, y], s));

const roundPt = ([x, y]: Pt): Pt => [round3(x), round3(y)];

/** A closed outline's box, as how far the flame reaches. */
function reach(tongues: readonly FireTongue[]): { w: number; h: number } {
  const boxes = tongues.map((t) => pathBox(t.d));
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const top = Math.min(...boxes.map((b) => b.y));
  return { w: Math.round(right - left), h: Math.round(FIRE_ROOT[1] - top) };
}

/** More wood on the pile: a third log laid across the back of the crossing, behind the two in front. */
const THIRD_LOG: readonly FireBasePiece[] = log(150, 210, 56, 214, 'barkShade', false).map((p) => ({ ...p, group: 'log' }));

/** The logs, as they lie at every stage: two crossed over what burns under them, the far one in shade; a third on the pile from the bonfire on. */
function hearth(cold: boolean, third = false): FireBasePiece[] {
  return [
    cold ? { part: 'ash', d: oval(100, 226, 40, 8.5), group: 'hearth' } : { part: 'coal', d: oval(100, 222, 31, 9), group: 'hearth' },
    ...(third ? THIRD_LOG : []),
    ...log(60, 217, 136, 231, 'barkShade', cold).map((p) => ({ ...p, group: 'hearth' as const })),
    ...log(140, 217, 64, 231, 'bark', cold).map((p) => ({ ...p, group: 'hearth' as const })),
  ];
}

const STONES = hearthStones(100, 231, 82, 13);
const BACK_STONES: readonly FireBasePiece[] = STONES.back.map((p) => ({ ...p, group: 'stones' }));
const FRONT_STONES: readonly FireBasePiece[] = STONES.front.map((p) => ({ ...p, group: 'stones' }));

/** The sun behind the Newroz fire: turning by one long and one short ray each time round the clock, so the turn has no seam. */
const HALO: FireHalo = {
  cx: 100,
  cy: 104,
  r: 74,
  rays: haloRays(100, 104, 58, 96, 80),
  // from where they stand out of the disc to where they end
  rayFade: [
    [58 / 96, 1],
    [1, 0],
  ],
  reach: 96,
  strength: 1,
  motion: { kind: 'rise', periodMs: FIRE_CYCLE_MS, phase: 0, poses: FIRE_RISE_STOPS.map((stop) => ({ r: round3((stop * 720) / HALO_RAYS) })) },
};

/** The cold hearth's two curls of smoke, one after the other, so a thread of it is always rising. */
const SMOKE_LINE: readonly Pt[] = [
  [101, 214],
  [104, 200],
  [98, 186],
  [95, 172],
  [99, 160],
  [96, 150],
];

function coldDrawing(): FireDrawing {
  const smoke = ribbon(SMOKE_LINE, [1, 2.2, 2.8, 2.4, 1.6, 0.6]);
  return {
    stage: 'cold',
    small: false,
    view: FIRE_VIEW,
    root: FIRE_ROOT,
    flame: { w: 12, h: 8 },
    moving: true,
    halo: null,
    glow: null,
    back: [],
    drifts: [0, 0.5].map((phase) => ({
      kind: 'smoke' as const,
      d: smoke,
      origin: [101, 214] as Pt,
      motion: {
        kind: 'rise' as const,
        periodMs: FIRE_CYCLE_MS,
        phase,
        poses: FIRE_RISE_STOPS.map((t) => ({ x: round3(-4 * t), y: round3(-26 * t), sx: round3(0.8 + 0.5 * t), sy: round3(0.85 + 0.3 * t), o: round3(t === 0 || t === 1 ? 0 : Math.min(1, t / 0.2) * (1 - t) * 1.1) })),
      },
      rest: phase === 0 ? { o: 0.6 } : null,
    })),
    wisps: [],
    embers: [],
    tongues: [],
    front: hearth(true),
    cinder: {
      cx: 107,
      cy: 219.5,
      r: 9,
      motion: {
        kind: 'loop',
        periodMs: FIRE_CYCLE_MS,
        phase: 0,
        poses: [
          { o: 0.45, sx: 0.9, sy: 0.9 },
          { o: 1, sx: 1.08, sy: 1.08 },
          { o: 0.6, sx: 0.95, sy: 0.95 },
          { o: 0.9, sx: 1.04, sy: 1.04 },
        ],
      },
    },
  };
}

function fullDrawing(stage: Exclude<FireStage, 'cold'>, growth: number): FireDrawing {
  const art = STAGE_ART[stage];
  const s: Stretch = { sx: art.sx * (1 + art.grows * 0.5 * growth), sy: art.sy * (1 + art.grows * growth), base: art.base };
  const nervous = stage === 'spark';
  const tongues: FireTongue[] = art.tongues.map(([id, shape]) => {
    const flip = id === 'right';
    const [rx, ry] = TONGUE_ROOTS[shape];
    // the right flame a little shorter than the left, so the two sides are not one shape mirrored
    const own = flip ? { ...s, sy: s.sy * 0.9 } : s;
    return {
      id,
      d: stretched(flip ? mirrored(TONGUE_SHAPES[shape]) : TONGUE_SHAPES[shape], own),
      origin: roundPt(place([flip ? SHAPE_ROOT[0] * 2 - rx : rx, ry], own)),
      motion: shape === 'crown' ? CROWN_FLICKER : ((nervous ? NERVOUS[id] : undefined) ?? FLICKER[id]),
    };
  });
  const flame = reach(tongues);
  const climb = Math.min(1.3, Math.max(0.6, s.sy));
  const wisps = art.wisps.map((w) => {
    const from = WISP_FROM[w];
    return { d: stretched(WISP_SHAPES[w], s), origin: roundPt(place(from.origin, s)), motion: breakingOff(from.periodMs, from.phase, from.side, climb) };
  });
  const embers = art.embers.map((e) => {
    const [cx, cy] = place(e.at, s);
    // never higher than the box: the biggest fires' sparks spiral out to its corners instead
    const rise = Math.min(e.rise, cy - e.r - 4);
    return { cx: round3(cx), cy: round3(cy), r: e.r, gold: e.gold === true, motion: rising({ ...e, rise }) };
  });
  const top = FIRE_ROOT[1] - flame.h;
  // the glow round the flame's middle, as big as the box allows
  const glowRy = Math.min(flame.h * 0.62 + 14, 120);
  const glowCy = Math.min(FIRE_ROOT[1] - flame.h * 0.42, FIRE_VIEW.h - glowRy);
  const glow: FireGlow = {
    cx: 100,
    cy: round3(Math.max(glowCy, glowRy)),
    rx: round3(Math.min(98, flame.w * 0.7 + 24)),
    ry: round3(glowRy),
    strength: art.glow,
    motion: {
      kind: 'loop',
      periodMs: art.pulse ? 1600 : 2400,
      phase: 0,
      poses: art.pulse
        ? [
            { sx: 1, sy: 1, o: 0.75 },
            { sx: 1.07, sy: 1.06, o: 1 },
            { sx: 0.95, sy: 0.96, o: 0.7 },
            { sx: 1.05, sy: 1.04, o: 0.95 },
          ]
        : [
            { sx: 1, sy: 1, o: 0.85 },
            { sx: 1.05, sy: 1.04, o: 1 },
            { sx: 0.97, sy: 0.98, o: 0.8 },
            { sx: 1.03, sy: 1.03, o: 0.95 },
          ],
    },
  };
  // the heat wavers as it rises, never higher than the box
  const drifts: FireDrift[] = art.heat
    ? HEAT_LINES.map((line, i) => ({
        kind: 'heat' as const,
        d: stretched(ribbon(line, [0.8, 2.6, 2.4, 0.6]), s),
        origin: roundPt(place(line[0] as Pt, s)),
        motion: {
          kind: 'rise' as const,
          periodMs: 2400,
          phase: i * 0.5,
          poses: FIRE_RISE_STOPS.map((t) => ({ y: round3(-Math.min(14, top - 4) * t), skew: round3(8 * Math.sin(Math.PI * 2 * t)), sx: 1, sy: round3(1 + 0.3 * t), o: round3(Math.sin(Math.PI * t)) })),
        },
        rest: null,
      }))
    : [];
  return {
    stage,
    small: false,
    view: FIRE_VIEW,
    root: FIRE_ROOT,
    flame,
    moving: true,
    halo: art.halo ? HALO : null,
    glow,
    back: art.stones ? BACK_STONES : [],
    drifts,
    wisps,
    embers,
    tongues,
    front: [...hearth(false, art.log), ...(art.stones ? FRONT_STONES : [])],
    cinder: null,
  };
}

/** The light version's ring of gold: bright all through, softening only at its outer edge. */
const SMALL_RING_FADE = [
  [40 / 49, 1],
  [0.92, 1],
  [1, 0.3],
] as const;

/** The light version's flame at each stage: the young ones visibly smaller in the same box, the rest the full small flame. */
const SMALL_SCALE: Readonly<Record<FireStage, number>> = { cold: 1, spark: 0.6, kindling: 0.8, campfire: 1, bigfire: 1, bonfire: 1, blaze: 1, newroz: 1 };

function smallDrawing(stage: FireStage): FireDrawing {
  const s = SMALL_SCALE[stage];
  const nervous = stage === 'spark';
  const tongues: FireTongue[] = (['outer', 'core', 'heart'] as const).map((id) => {
    const motion = (nervous ? NERVOUS[id === 'outer' ? 'flame' : id] : undefined) ?? FLICKER[id];
    return { id, d: stretched(TONGUE_SHAPES[id], { sx: s, sy: s, base: 1 }), origin: FIRE_ROOT, motion: calmMotion(motion, FIRE_SMALL_CALM) };
  });
  return {
    stage,
    small: true,
    view: FIRE_SMALL_VIEW,
    root: FIRE_ROOT,
    flame: reach(tongues),
    // the grey flame of no streak yet stands still
    moving: stage !== 'cold',
    // the Newroz fire's gold beside a number: a glow behind the flame and a thin ring of light round it
    halo: stage === 'newroz' ? { cx: 100, cy: 150, r: 48, rays: ring(100, 150, 40, 49), rayFade: SMALL_RING_FADE, reach: 49, strength: 1.7, motion: null } : null,
    glow: null,
    back: [],
    drifts: [],
    wisps: [],
    embers: [],
    tongues,
    front: [],
    cinder: null,
  };
}

/**
 * The fire at `level` as drawn at `size` (its height): the light version's
 * flame at `FIRE_SMALL` and under, the whole fire above it.
 */
export function fireDrawing(level: FireLevel, size: number): FireDrawing {
  if (size <= FIRE_SMALL) return smallDrawing(level.stage);
  return level.stage === 'cold' ? coldDrawing() : fullDrawing(level.stage, clamp01(level.growth));
}

// ─────────────────────────────────────────────────────────────── framing

/** The box round some outlines. */
function boxRound(paths: readonly string[]): Box {
  const boxes = paths.map(pathBox);
  const [x, y] = [Math.min(...boxes.map((b) => b.x)), Math.min(...boxes.map((b) => b.y))];
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/**
 * The two crossed logs every stage burns on, where they lie in the box: the
 * same at every stage, so whatever stands beside the fire lines up with them.
 */
export const FIRE_LOGS: Box = boxRound(
  hearth(false)
    .filter((p) => p.part !== 'coal')
    .map((p) => p.d),
);

/** How far over a flame's tips its frame reaches, as a share of the flame's height: room for the tips as they flicker up. */
const FLICKER_ROOM = 0.1;

const frames = new Map<FireStage, Box>();

/**
 * The part of the box a stage of the fire takes up — its frame — for a
 * screen that shows the fire big without the empty air above a young one:
 * across, as far as its logs, flame, stones or sun reach either side of its
 * root; up, from the foot of its hearth to over its tips as they flicker on
 * the stage's last day, or to the top of its sun. The same all through a
 * stage, so a fire a day bigger grows in its frame rather than moving it, and
 * a fire growing into the stage fits it all the way. Sparks rising and the
 * glow may reach past it, as light does.
 */
export function fireFrame(stage: FireStage): Box {
  const known = frames.get(stage);
  if (known) return known;
  const d = fireDrawing({ stage, growth: 1 }, FIRE_VIEW.h);
  const parts = boxRound([...d.back, ...d.front, ...d.drifts, ...d.tongues].map((p) => p.d));
  const tips = d.tongues.length > 0 ? FIRE_ROOT[1] - d.flame.h * (1 + FLICKER_ROOM) : parts.y;
  const top = Math.max(FIRE_VIEW.y, Math.floor(Math.min(parts.y, tips, d.halo ? d.halo.cy - d.halo.reach : parts.y)));
  const foot = Math.min(FIRE_VIEW.y + FIRE_VIEW.h, Math.ceil(parts.y + parts.h));
  const half = Math.ceil(Math.max(FIRE_ROOT[0] - parts.x, parts.x + parts.w - FIRE_ROOT[0], d.halo ? d.halo.reach : 0));
  const frame = { x: FIRE_ROOT[0] - half, y: top, w: half * 2, h: foot - top };
  frames.set(stage, frame);
  return frame;
}

/** How tall to draw the whole fire (its `size`) for a stage's frame to fit in `w` by `h`. */
export function fireSizeToFit(stage: FireStage, w: number, h: number): number {
  const frame = fireFrame(stage);
  return FIRE_VIEW.h * Math.min(w / frame.w, h / frame.h);
}

// ─────────────────────────────────────────────────────────────── growing

/** Whether `from` is a smaller fire than `to`: an earlier stage, or the same stage less grown. */
export function fireIsSmaller(from: FireLevel, to: FireLevel): boolean {
  const [a, b] = [fireStageIndex(from.stage), fireStageIndex(to.stage)];
  return a < b || (a === b && a > 0 && clamp01(from.growth) < clamp01(to.growth));
}

/**
 * The fire growing from one level into another, on the day it grew. The
 * old fire is drawn first; when the growth starts its flame stretches up
 * from its root toward the new one's size while the new one, starting at
 * the old one's size, appears over it, stretches up past its own and
 * settles: the fire seems to leap up into its new shape. A burst of sparks
 * flies off it, its glow flares, and what the old fire did not have arrives
 * as it grows — the third log dropping onto the pile, the stones rising
 * round it, the sun opening behind it. Every part moves on `FIRE_GROW_STOPS`
 * over `FIRE_GROW.ms`.
 */
export interface FireGrowth {
  from: FireDrawing;
  /** the old fire's flame: stretching toward the new one's size, then gone behind it (a cold hearth's smoke only fades) */
  out: FireMotion;
  /** the new fire's flame: from the old one's size, up past its own, settling */
  in: FireMotion;
  /** the cold hearth fading as the logs catch, when the old fire was cold; null otherwise */
  fade: FireMotion | null;
  /** a flash of light as it grows; null for a fire only a day bigger */
  flash: FireGlow | null;
  /** the parts of the hearth the old fire did not have, arriving */
  arrive: Readonly<Partial<Record<FireBaseGroup, FireMotion>>>;
  /** the sun opening behind it, when the old fire had none */
  halo: FireMotion | null;
  /** sparks flying up off it as it grows */
  burst: readonly FireEmber[];
}

const growMotion = (poses: readonly FirePose[]): FireMotion => ({ kind: 'grow', periodMs: FIRE_GROW.ms, phase: 0, poses });

/** How many sparks fly as each stage is reached. */
const BURST: Readonly<Record<FireStage, number>> = { cold: 0, spark: 4, kindling: 6, campfire: 8, bigfire: 9, bonfire: 10, blaze: 12, newroz: 14 };

/** The growth from `from` into `to` at `size`; null when `from` is no smaller (nothing to grow). */
export function fireGrowth(from: FireLevel, to: FireLevel, size: number): FireGrowth | null {
  if (!fireIsSmaller(from, to)) return null;
  const a = fireDrawing(from, size);
  const b = fireDrawing(to, size);
  const stageUp = a.stage !== b.stage;
  const halfway = (k: 'w' | 'h'): number => (a.flame[k] + (b.flame[k] - a.flame[k]) * 0.55) / b.flame[k];
  const lift = stageUp ? 1.08 : 1.03;
  const inPoses: FirePose[] = [
    { sx: round3(a.flame.w / b.flame.w), sy: round3(a.flame.h / b.flame.h), o: 0 },
    { sx: round3(halfway('w')), sy: round3(halfway('h') * 1.02), o: 1 },
    { sx: round3(2 - lift), sy: lift, o: 1 },
    { sx: 1, sy: 1, o: 1 },
  ];
  const cold = a.stage === 'cold';
  const fade = growMotion([{ o: 1 }, { o: 0.65 }, { o: 0 }, { o: 0 }]);
  const out = cold
    ? fade
    : growMotion(
        inPoses.map((p, i) => ({ sx: round3((p.sx ?? 1) * (b.flame.w / a.flame.w)), sy: round3((p.sy ?? 1) * (b.flame.h / a.flame.h)), o: i < 2 ? 1 : 0 })),
      );
  const has = (d: FireDrawing, group: FireBaseGroup): boolean => [...d.back, ...d.front].some((p) => p.group === group);
  const arrive: Partial<Record<FireBaseGroup, FireMotion>> = {};
  if (!b.small && has(b, 'log') && !has(a, 'log'))
    arrive.log = growMotion([
      { y: -18, o: 0 },
      { y: -18, o: 0 },
      { y: 1.5, o: 1 },
      { y: 0, o: 1 },
    ]);
  if (!b.small && has(b, 'stones') && !has(a, 'stones'))
    arrive.stones = growMotion([
      { y: 7, sy: 0.4, o: 0 },
      { y: 3, sy: 0.75, o: 0.6 },
      { y: -0.6, sy: 1.04, o: 1 },
      { y: 0, sy: 1, o: 1 },
    ]);
  const flash = stageUp && b.glow ? { ...b.glow, strength: Math.max(1.6, b.glow.strength * 1.4), motion: growMotion([{ sx: 0.6, sy: 0.6, o: 0 }, { sx: 1, sy: 1, o: 1 }, { sx: 1.14, sy: 1.14, o: 0.45 }, { sx: 1.2, sy: 1.2, o: 0 }]) } : null;
  const count = stageUp && !b.small ? BURST[b.stage] : 0;
  const burst: FireEmber[] = Array.from({ length: count }, (_, i) => {
    const across = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    const cx = FIRE_ROOT[0] + across * b.flame.w * 0.28;
    const cy = FIRE_ROOT[1] - b.flame.h * (0.45 + 0.15 * Math.abs(Math.sin(i * 2.4)));
    const r = 1.6 + (i % 3) * 0.4;
    const dx = across * (24 + b.flame.w * 0.25) + ((i * 5) % 7) - 3;
    const dy = -Math.min(cy - r - 4, 34 + b.flame.h * 0.3 + ((i * 11) % 9));
    return {
      cx: round3(cx),
      cy: round3(cy),
      r,
      gold: b.stage === 'newroz' && i % 2 === 0,
      motion: growMotion([
        { o: 0, sx: 0.6, sy: 0.6 },
        { x: round3(dx * 0.05), y: round3(dy * 0.05), o: 0.3, sx: 0.8, sy: 0.8 },
        { x: round3(dx * 0.6), y: round3(dy * 0.6), o: 1, sx: 1, sy: 1 },
        { x: round3(dx), y: round3(dy), o: 0, sx: 0.4, sy: 0.4 },
      ]),
    };
  });
  return {
    from: a,
    out,
    in: growMotion(inPoses),
    fade: cold && !a.small ? fade : null,
    flash,
    arrive,
    halo: b.halo && !a.halo ? growMotion([{ sx: 0.55, sy: 0.55, r: -12, o: 0 }, { sx: 0.72, sy: 0.72, r: -8, o: 0.35 }, { sx: 1.04, sy: 1.04, r: -1, o: 1 }, { sx: 1, sy: 1, r: 0, o: 1 }]) : null,
    burst,
  };
}
