/**
 * The streak's fire, designed once and drawn the same by the phone and the
 * website: a painted flame, soft and glowing, on logs lit by it. It grows
 * with the streak (`fire-stages.ts`): cold logs ready to be lit, a spark
 * caught, a little flame, a campfire, a big fire, a bonfire, a blaze, and the
 * Newroz fire. The logs lie in the same place at every stage, so whatever the
 * stage, it is the fire on them that has grown.
 *
 * The flame itself is painted ahead of time (`fire-sprites.ts`): a loop of
 * frames in which it flows up and changes shape all the time, its licks
 * stretching, splitting and breaking off, which both apps play frame by
 * frame. Everything round it is data, not markup, because each app moves its
 * parts its own way — the website with a CSS keyframe per part, the phone
 * with one native-driven clock per fire — and both have to move the same
 * parts by the same amounts: a soft glow breathing round the flame and
 * pooled on the ground under it, sparks drifting up off it and fading, the
 * sun behind the Newroz fire; and for cold logs, one ember glowing and a curl
 * of smoke.
 *
 * Only transforms, opacity and which frame shows ever change: nothing is
 * redrawn while it burns, nor while it grows into its next stage, so it costs
 * a phone nothing it would notice.
 */
import { FIRE_GROW, fireStageIndex, type FireLevel, type FireStage } from '../fire-stages.js';
import { HALO_RAYS, SHAPE_ROOT, SMALL_SHAPES, haloRays, hearthStones, log, mapPath, oval, pathBox, ribbon, ring, type Box, type LogPart } from './fire-shapes.js';
import { FIRE_FLAME_REACH, FIRE_ROOT, FIRE_SPRITES, type FireSprite } from './fire-sprites.js';
import { FIRE_CYCLE_MS, FIRE_RISE_STOPS, calmMotion, type FireMotion, type FirePose } from './fire-motion.js';
import type { Pt } from './svg.js';

export * from './fire-motion.js';
export * from './fire-colours.js';
export * from './fire-sprites.js';

/** The box round an outline of the fire, in the drawing's units: what a phone layer drawing just that part needs to hold. */
export { pathBox as fireOutlineBox, type Box as FireBox } from './fire-shapes.js';

/**
 * The drawing's box, which holds the biggest fire there is. The logs lie at
 * its foot, the same at every stage; the smaller fires burn low in it, with
 * the air above them they will grow into.
 */
export const FIRE_VIEW = { x: 0, y: 0, w: 200, h: 250 } as const;

/**
 * At this size (in points or CSS pixels, the fire's height) and under, the
 * light version is drawn: a bold flame alone in a box cropped round it — a
 * round body with a two-lobed top, the gold inside it and a round drop of a
 * heart — breathing gently, no logs, glow or sparks: beside a number in a
 * row, more would be noise. Its box is the same at every stage, so the text
 * beside it never moves.
 */
export const FIRE_SMALL = 28;
export const FIRE_SMALL_VIEW = { x: 50, y: 90, w: 100, h: 140 } as const;
/** How much of the full flicker the light version moves by. */
export const FIRE_SMALL_CALM = 0.55;

/** The light version's layers of flame, back to front. */
export type FireTongueId = 'outer' | 'core' | 'heart';

/** A layer of the light version's flame. */
export interface FireTongue {
  id: FireTongueId;
  /** a closed outline in the drawing's box */
  d: string;
  /** where it is rooted: what it stretches up from and leans about */
  origin: Pt;
  motion: FireMotion;
}

/** The painted flame of a burning fire: the stage's sheet, and where its frames stand in the box at this fire's growth. */
export interface FireFlame {
  sheet: FireSprite;
  /** the sheet's box stretched about the root to the fire's size: smaller on the day a stage is reached, the sheet's own box the day before the next */
  box: Box;
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
 * A thin ribbon of smoke rising off cold logs, drawn behind them. `rest` is
 * where it is drawn when the fire stands still; null, it is not drawn then.
 */
export interface FireDrift {
  kind: 'smoke';
  d: string;
  origin: Pt;
  motion: FireMotion;
  rest: FirePose | null;
}

/** The fire's light: a soft radial glow, never a blur, breathing (pulsing, at its hottest); round it, or pooled on the ground under it. */
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
  /** its light pooled on the ground round the logs, breathing with the glow; null for a fire not burning */
  pool: FireGlow | null;
  /** the hearth behind the flame: the far stones */
  back: readonly FireBasePiece[];
  drifts: readonly FireDrift[];
  embers: readonly FireEmber[];
  /** the painted flame of a burning fire; null for cold logs and the light version */
  painted: FireFlame | null;
  /** the light version's flame, back to front; none for the whole fire, whose flame is painted */
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
 * How the light version's layers breathe: slowly, from their root, wider as
 * they squash and narrower as they stretch, swaying a little, each on its
 * own period, so no two ever move as one; the heart only swells and settles.
 */
const FLICKER: Readonly<Record<FireTongueId, FireMotion>> = {
  outer: flicker(2400, 0, [
    [1, 1, 0],
    [1.03, 0.96, -1.5],
    [0.98, 1.04, 1],
    [1.02, 0.97, 2],
  ]),
  core: flicker(1200, 0.2, [
    [1, 1, 0],
    [0.96, 1.06, -2.5],
    [1.03, 0.97, 2],
    [0.98, 1.05, 3],
  ]),
  heart: flicker(2400, 0, [
    [1, 1, 0],
    [1.06, 1.05, 0],
    [0.97, 0.96, 0],
    [1.04, 1.03, 0],
  ]),
};

/** A flame just caught breathes quicker and further than a grown one, the way a young flame does. */
const NERVOUS: Partial<Record<FireTongueId, FireMotion>> = {
  outer: flicker(1600, 0, [
    [1, 1, 0],
    [0.94, 1.1, -4],
    [1.05, 0.93, 3],
    [0.96, 1.08, 5],
  ]),
  heart: flicker(2400, 0.3, [
    [1, 1, 0],
    [1.08, 1.08, 2],
    [0.95, 0.92, -1],
    [1.05, 1.05, -2],
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

// ─────────────────────────────────────────────────────────────── stages

interface EmberSpec {
  /** where it starts: across, as a share of the flame's half-width either side of its root, and up, as a share of its height (so it starts inside the stage's flame) */
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

interface StageArt {
  embers: readonly EmberSpec[];
  glow: number;
  /** the glow pulsing, not only breathing */
  pulse: boolean;
  log: boolean;
  stones: boolean;
  halo: boolean;
}

/** The campfire's sparks, spread so they never rise together, drifting up slowly. */
const CAMP_EMBERS: readonly EmberSpec[] = [
  { at: [-0.23, 0.69], r: 2.4, rise: 56, drift: -14, swirl: 3, periodMs: 2400, phase: 0 },
  { at: [0.23, 0.69], r: 2, rise: 52, drift: 14, swirl: -3, periodMs: 4800, phase: 0.35 },
  { at: [-0.5, 0.58], r: 1.8, rise: 60, drift: -16, swirl: 3, periodMs: 1600, phase: 0.62 },
  { at: [0.54, 0.63], r: 2.2, rise: 56, drift: 12, swirl: -3, periodMs: 2400, phase: 0.8 },
  { at: [0, 0.78], r: 1.6, rise: 46, drift: 5, swirl: 3, periodMs: 4800, phase: 0.85 },
];

/** A bigger fire's sparks: more of them, higher, spiralling as they go. */
const spiral = (embers: readonly EmberSpec[], rise: number, swirl: number): EmberSpec[] =>
  embers.map((e, i) => ({ ...e, rise: e.rise * rise, swirl: (i % 2 === 0 ? 1 : -1) * swirl * (0.7 + 0.3 * (i % 3)) }));

const BIG_EMBERS: readonly EmberSpec[] = [
  ...CAMP_EMBERS,
  { at: [-0.66, 0.48], r: 1.8, rise: 56, drift: -18, periodMs: 2400, phase: 0.3 },
  { at: [0.7, 0.54], r: 2, rise: 54, drift: 18, periodMs: 4800, phase: 0.15 },
];

const BONFIRE_EMBERS: readonly EmberSpec[] = spiral(
  [
    ...BIG_EMBERS,
    { at: [-0.08, 0.6], r: 2, rise: 60, drift: -6, periodMs: 2400, phase: 0.45 },
    { at: [0.39, 0.54], r: 1.7, rise: 56, drift: 10, periodMs: 1600, phase: 0.05 },
  ],
  1.25,
  6,
);

const BLAZE_EMBERS: readonly EmberSpec[] = spiral([...BONFIRE_EMBERS, { at: [-0.31, 0.55], r: 1.9, rise: 60, drift: -10, periodMs: 4800, phase: 0.6 }], 1.15, 9);

const NEWROZ_EMBERS: readonly EmberSpec[] = [...BLAZE_EMBERS, { at: [0.19, 0.58] as Pt, r: 2.1, rise: 64, drift: 8, periodMs: 2400, phase: 0.25 }].map((e, i) => ({ ...e, gold: i % 2 === 1 }));

const NOTHING = { log: false, stones: false, halo: false, pulse: false } as const;

/**
 * What each stage has round its flame (the flame itself, a step up from the
 * one before at each, is its sheet's): more sparks the bigger it gets, a
 * brighter glow, and from the bonfire on something more besides — more wood,
 * then the stones, then the sun behind it.
 */
const STAGE_ART: Readonly<Record<Exclude<FireStage, 'cold'>, StageArt>> = {
  spark: { ...NOTHING, embers: [{ at: [-0.04, 0.46], r: 1.8, rise: 30, drift: 5, swirl: 2, periodMs: 4800, phase: 0, wait: 0.4 }], glow: 0.55 },
  kindling: {
    ...NOTHING,
    embers: [
      { at: [-0.19, 0.61], r: 2, rise: 40, drift: -9, swirl: 2, periodMs: 2400, phase: 0 },
      { at: [0.19, 0.64], r: 1.8, rise: 36, drift: 8, swirl: -2, periodMs: 4800, phase: 0.5 },
    ],
    glow: 0.8,
  },
  campfire: { ...NOTHING, embers: CAMP_EMBERS, glow: 1 },
  bigfire: { ...NOTHING, embers: BIG_EMBERS, glow: 1.05 },
  bonfire: { ...NOTHING, embers: BONFIRE_EMBERS, glow: 1.15, log: true },
  blaze: { embers: BLAZE_EMBERS, glow: 1.25, pulse: true, log: true, stones: true, halo: false },
  newroz: { embers: NEWROZ_EMBERS, glow: 1.05, pulse: true, log: true, stones: true, halo: true },
};

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** How far a stage's flame reaches at `growth` through it: a little further every day, from the day the stage is reached to the day before the next. */
function reachAt(stage: Exclude<FireStage, 'cold'>, growth: number): { w: number; h: number } {
  const { from, to } = FIRE_FLAME_REACH[stage];
  return { w: Math.round(from.w + (to.w - from.w) * growth), h: Math.round(from.h + (to.h - from.h) * growth) };
}

/** A box stretched by `sx` across and `sy` up about the root. */
const stretchedBox = (b: Box, sx: number, sy: number): Box => ({
  x: round3(FIRE_ROOT[0] + (b.x - FIRE_ROOT[0]) * sx),
  y: round3(FIRE_ROOT[1] + (b.y - FIRE_ROOT[1]) * sy),
  w: round3(b.w * sx),
  h: round3(b.h * sy),
});

/** More wood on the pile: a third log laid across the back of the crossing, behind the two in front. */
const THIRD_LOG: readonly FireBasePiece[] = log(146, 208, 60, 212, 'barkShade', false).map((p) => ({ ...p, group: 'log' }));

/** The logs, as they lie at every stage: two crossed over what burns under them, the far one in shade; a third on the pile from the bonfire on. */
function hearth(cold: boolean, third = false): FireBasePiece[] {
  return [
    cold ? { part: 'ash', d: oval(100, 226, 40, 8.5), group: 'hearth' } : { part: 'coal', d: oval(100, 222, 31, 9), group: 'hearth' },
    ...(third ? THIRD_LOG : []),
    ...log(62, 216, 134, 229, 'barkShade', cold).map((p) => ({ ...p, group: 'hearth' as const })),
    ...log(138, 216, 66, 229, 'bark', cold).map((p) => ({ ...p, group: 'hearth' as const })),
  ];
}

const STONES = hearthStones(100, 231, 82, 12.5);
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

/** The cold hearth's two soft curls of smoke, one after the other, so a curl of it is always rising. */
const SMOKE_LINE: readonly Pt[] = [
  [101, 213],
  [105, 200],
  [99, 187],
  [94, 174],
  [97, 161],
  [104, 152],
];

function coldDrawing(): FireDrawing {
  const smoke = ribbon(SMOKE_LINE, [2.4, 5, 6.4, 6, 4.6, 2.2]);
  return {
    stage: 'cold',
    small: false,
    view: FIRE_VIEW,
    root: FIRE_ROOT,
    flame: { w: 12, h: 8 },
    moving: true,
    halo: null,
    glow: null,
    pool: null,
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
    embers: [],
    painted: null,
    tongues: [],
    front: hearth(true),
    cinder: {
      cx: 107,
      cy: 219,
      r: 10,
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
  const flame = reachAt(stage, growth);
  const fullest = FIRE_FLAME_REACH[stage].to;
  const sheet = FIRE_SPRITES[stage];
  const embers = art.embers.map((e) => {
    const [cx, cy] = [FIRE_ROOT[0] + (e.at[0] * flame.w) / 2, FIRE_ROOT[1] - e.at[1] * flame.h];
    // never higher than the box: the biggest fires' sparks spiral out to its corners instead
    const rise = Math.min(e.rise, cy - e.r - 4);
    return { cx: round3(cx), cy: round3(cy), r: e.r, gold: e.gold === true, motion: rising({ ...e, rise }) };
  });
  // the glow round the flame's middle, as big as the box allows; it breathes slowly, and pulses at the hottest
  const glowRy = Math.min(flame.h * 0.66 + 16, 120);
  const glowCy = Math.min(FIRE_ROOT[1] - flame.h * 0.42, FIRE_VIEW.h - glowRy);
  const breath: FireMotion = {
    kind: 'loop',
    periodMs: art.pulse ? 1600 : 2400,
    phase: 0,
    poses: art.pulse
      ? [
          { sx: 1, sy: 1, o: 0.72 },
          { sx: 1.08, sy: 1.07, o: 1 },
          { sx: 0.95, sy: 0.96, o: 0.68 },
          { sx: 1.05, sy: 1.04, o: 0.94 },
        ]
      : [
          { sx: 1, sy: 1, o: 0.8 },
          { sx: 1.05, sy: 1.04, o: 1 },
          { sx: 0.97, sy: 0.98, o: 0.76 },
          { sx: 1.03, sy: 1.03, o: 0.94 },
        ],
  };
  const glow: FireGlow = {
    cx: 100,
    cy: round3(Math.max(glowCy, glowRy)),
    rx: round3(Math.min(98, flame.w * 0.74 + 28)),
    ry: round3(glowRy),
    strength: art.glow,
    motion: breath,
  };
  // the same light pooled flat on the ground round the logs, wider the bigger the fire
  const poolRx = Math.min(96, flame.w * 0.5 + 44);
  const pool: FireGlow = { cx: 100, cy: 231, rx: round3(poolRx), ry: round3(poolRx * 0.17), strength: art.glow, motion: breath };
  return {
    stage,
    small: false,
    view: FIRE_VIEW,
    root: FIRE_ROOT,
    flame,
    moving: true,
    halo: art.halo ? HALO : null,
    glow,
    pool,
    back: art.stones ? BACK_STONES : [],
    drifts: [],
    embers,
    painted: { sheet, box: stretchedBox(sheet.box, flame.w / fullest.w, flame.h / fullest.h) },
    tongues: [],
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

/** A closed outline's box, as how far the flame reaches. */
function reach(tongues: readonly FireTongue[]): { w: number; h: number } {
  const boxes = tongues.map((t) => pathBox(t.d));
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const top = Math.min(...boxes.map((b) => b.y));
  return { w: Math.round(right - left), h: Math.round(FIRE_ROOT[1] - top) };
}

function smallDrawing(stage: FireStage): FireDrawing {
  const s = SMALL_SCALE[stage];
  const nervous = stage === 'spark';
  const tongues: FireTongue[] = (['outer', 'core', 'heart'] as const).map((id) => {
    const motion = (nervous ? NERVOUS[id] : undefined) ?? FLICKER[id];
    // drawn rooted where the whole fire's flame stands, smaller for a young fire
    const d = mapPath(SMALL_SHAPES[id], (x, y) => [FIRE_ROOT[0] + (x - SHAPE_ROOT[0]) * s, FIRE_ROOT[1] + (y - SHAPE_ROOT[1]) * s]);
    const box = pathBox(d);
    // the body and the gold breathe from their foot, the heart swells about its own middle
    const origin: Pt = [round3(box.x + box.w / 2), round3(id === 'heart' ? box.y + box.h / 2 : box.y + box.h)];
    return { id, d, origin, motion: calmMotion(motion, FIRE_SMALL_CALM) };
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
    pool: null,
    back: [],
    drifts: [],
    embers: [],
    painted: null,
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
 * a fire growing into the stage fits it all the way. Sparks rising, the
 * flame's soft edge and the glow may reach past it, as light does.
 */
export function fireFrame(stage: FireStage): Box {
  const known = frames.get(stage);
  if (known) return known;
  const d = fireDrawing({ stage, growth: 1 }, FIRE_VIEW.h);
  const parts = boxRound([...d.back, ...d.front, ...d.drifts].map((p) => p.d));
  const tips = d.painted ? FIRE_ROOT[1] - d.flame.h * (1 + FLICKER_ROOM) : parts.y;
  const top = Math.max(FIRE_VIEW.y, Math.floor(Math.min(parts.y, tips, d.halo ? d.halo.cy - d.halo.reach : parts.y)));
  const foot = Math.min(FIRE_VIEW.y + FIRE_VIEW.h, Math.ceil(parts.y + parts.h));
  const half = Math.ceil(Math.max(FIRE_ROOT[0] - parts.x, parts.x + parts.w - FIRE_ROOT[0], d.painted ? d.flame.w / 2 : 0, d.halo ? d.halo.reach : 0));
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
 * the old one's size, fades in over it, stretches up past its own and
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
