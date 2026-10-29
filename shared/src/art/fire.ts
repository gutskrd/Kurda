/**
 * The streak's fire, designed once and drawn the same by the phone and the
 * website: a little campfire of layered flame tongues on a pair of logs, in
 * the painterly-flat look of the rest of Hevalo's art.
 *
 * It is data, not markup, because each app moves its parts its own way — the
 * website with a CSS keyframe per part, the phone with one native-driven
 * clock per fire — and both have to move the same parts by the same amounts.
 * Each tongue is a closed path in one 120 × 150 box with its own gradient,
 * and flickers around its own root (taller and narrower, leaning one way then
 * the other) on its own period and phase, so the layers slide against each
 * other the way flames do instead of breathing as one shape. The pale heart
 * pulses, a soft glow breathes behind it all, sparks rise off it and fade,
 * and now and then the tip of a flame breaks off and is gone.
 *
 * Only transforms and opacity ever change: no shape is redrawn while it
 * burns, so it costs a phone nothing it would notice.
 */
import { n } from './svg.js';

/** The drawing's box: the flame and the logs under it. */
export const FIRE_VIEW = { x: 0, y: 0, w: 120, h: 150 } as const;

/**
 * At this size (in points or CSS pixels, the fire's height) and under, the
 * light version is drawn: the flame alone in a box cropped round it, three
 * tongues, a gentler flicker, no logs, glow or sparks — beside a number in a
 * row, more would be noise.
 */
export const FIRE_SMALL = 28;
export const FIRE_SMALL_VIEW = { x: 10, y: 0, w: 100, h: 140 } as const;
/** How much of the full flicker the light version moves by. */
export const FIRE_SMALL_CALM = 0.55;

/**
 * Every part's period divides this, so the phone can drive a whole fire from
 * one looping clock and the loop never shows a seam.
 */
export const FIRE_CYCLE_MS = 4800;

/** Where a looping part's four poses fall in its period; after the last it eases back to the first. */
export const FIRE_LOOP_STOPS = [0, 0.25, 0.5, 0.75] as const;
/** Where a rising part's four poses fall: it appears, rises, fades, and starts again unseen. */
export const FIRE_RISE_STOPS = [0, 0.15, 0.7, 1] as const;

/**
 * One pose of a moving part, in the drawing's units, about the part's own
 * origin: moved by `x`, `y`; stretched by `sx`, `sy`; leaning by `skew`
 * degrees (positive leans its top to the left, as CSS's skewX does);
 * `o` its opacity. Anything left out stays at rest.
 */
export interface FirePose {
  x?: number;
  y?: number;
  sx?: number;
  sy?: number;
  skew?: number;
  o?: number;
}

export interface FireMotion {
  /** 'loop' eases through `FIRE_LOOP_STOPS` and back; 'rise' runs straight through `FIRE_RISE_STOPS` */
  kind: 'loop' | 'rise';
  periodMs: number;
  /** how far into its period the part starts, 0 to 1 */
  phase: number;
  /** one pose per stop of its kind */
  poses: readonly FirePose[];
}

export type FireTongueId = 'back' | 'outer' | 'flame' | 'core' | 'heart';

export interface FireTongue {
  id: FireTongueId;
  /** a closed outline in the drawing's box */
  d: string;
  /** where it is rooted: what it stretches up from and leans about */
  origin: readonly [number, number];
  motion: FireMotion;
  /** drawn in the light version too */
  small: boolean;
}

/**
 * The tongues, back to front: a tall slim flame behind everything whose tip
 * shows between the others; the red-orange outer flame, its tips curling
 * outwards; the orange inside it; the gold; and the pale heart low down,
 * where a fire is hottest. Their periods all differ and their leans run
 * against each other, so no two layers ever move as one.
 */
export const FIRE_TONGUES: readonly FireTongue[] = [
  {
    id: 'back',
    d: 'M70 136C54 136 46 124 47 108C48 92 58 80 66 64C72 52 78 34 82 10C90 28 96 48 95 70C94 96 88 136 70 136Z',
    origin: [70, 136],
    motion: {
      kind: 'loop',
      periodMs: 1200,
      phase: 0.3,
      poses: [
        { sx: 1, sy: 1, skew: 0 },
        { sx: 0.95, sy: 1.1, skew: -6 },
        { sx: 1.04, sy: 0.92, skew: 2 },
        { sx: 0.97, sy: 1.05, skew: -9 },
      ],
    },
    small: false,
  },
  {
    id: 'outer',
    d: 'M60 138C35 138 16 122 16 100C16 84 26 62 21 42C29 52 35 57 41 60C43 42 47 22 56 4C61 22 70 37 77 49C83 41 90 33 97 22C106 42 109 70 104 98C100 122 84 138 60 138Z',
    origin: [60, 138],
    motion: {
      kind: 'loop',
      periodMs: 1600,
      phase: 0,
      poses: [
        { sx: 1, sy: 1, skew: 0 },
        { sx: 0.97, sy: 1.05, skew: -3 },
        { sx: 1.02, sy: 0.97, skew: 1.5 },
        { sx: 0.98, sy: 1.04, skew: 3.5 },
      ],
    },
    small: true,
  },
  {
    id: 'flame',
    d: 'M60 138C39 138 25 125 25 106C25 92 34 80 32 64C38 72 43 76 48 77C49 60 54 42 63 24C66 40 74 52 80 64C83 58 87 52 90 44C97 62 98 86 94 106C91 126 79 138 60 138Z',
    origin: [60, 138],
    motion: {
      kind: 'loop',
      periodMs: 960,
      phase: 0.55,
      poses: [
        { sx: 1, sy: 1, skew: 0 },
        { sx: 0.96, sy: 1.08, skew: 3 },
        { sx: 1.03, sy: 0.95, skew: -3 },
        { sx: 0.97, sy: 1.05, skew: -1 },
      ],
    },
    small: false,
  },
  {
    id: 'core',
    d: 'M60 138C45 138 34 128 34 112C34 98 42 88 48 78C53 70 56 60 58 48C64 60 72 70 78 82C83 92 86 102 86 112C86 128 75 138 60 138Z',
    origin: [60, 138],
    motion: {
      kind: 'loop',
      periodMs: 800,
      phase: 0.2,
      poses: [
        { sx: 1, sy: 1, skew: 0 },
        { sx: 0.95, sy: 1.1, skew: -4 },
        { sx: 1.03, sy: 0.93, skew: 2 },
        { sx: 0.97, sy: 1.06, skew: 5 },
      ],
    },
    small: true,
  },
  {
    id: 'heart',
    d: 'M60 138C49 138 42 130 42 120C42 109 49 101 53 94C56 89 58 84 59 77C62 84 65 89 68 94C72 101 78 109 78 120C78 130 71 138 60 138Z',
    origin: [60, 138],
    motion: {
      kind: 'loop',
      periodMs: 600,
      phase: 0,
      poses: [
        { sx: 1, sy: 1 },
        { sx: 1.06, sy: 1.08 },
        { sx: 0.97, sy: 0.95 },
        { sx: 1.04, sy: 1.05 },
      ],
    },
    small: true,
  },
];

/**
 * The tip of a flame breaking off: a small drop of flame just under the tip
 * of a tongue, hidden behind it, that rises clear of it, shrinking, and is
 * gone. Drawn in the orange flame's colours, behind the tongues.
 */
export interface FireWisp {
  d: string;
  origin: readonly [number, number];
  motion: FireMotion;
}

export const FIRE_WISPS: readonly FireWisp[] = [
  {
    d: 'M56 25C54 25 53 23 53.6 20.5C54.3 17.5 55.6 15 56 10C57 15 58.4 17.5 58.6 20.5C59 23 58 25 56 25Z',
    origin: [56, 26],
    motion: {
      kind: 'rise',
      periodMs: 1200,
      phase: 0.1,
      poses: [
        { y: 0, sx: 1, sy: 1, o: 0 },
        { y: -8, sx: 1, sy: 1.1, o: 1 },
        { y: -22, x: -3, sx: 0.55, sy: 0.7, o: 0.9 },
        { y: -28, x: -4, sx: 0.3, sy: 0.4, o: 0 },
      ],
    },
  },
  {
    d: 'M96 41C94 41 93 39 93.6 36.5C94.3 33.5 95.6 31 96 26C97 31 98.4 33.5 98.6 36.5C99 39 98 41 96 41Z',
    origin: [96, 42],
    motion: {
      kind: 'rise',
      periodMs: 1600,
      phase: 0.6,
      poses: [
        { y: 0, sx: 1, sy: 1, o: 0 },
        { y: -8, sx: 1, sy: 1.1, o: 1 },
        { y: -20, x: 3, sx: 0.55, sy: 0.7, o: 0.9 },
        { y: -26, x: 4, sx: 0.3, sy: 0.4, o: 0 },
      ],
    },
  },
];

/** A spark: a dot that rises off the flame, drifting, and fades. */
export interface FireEmber {
  cx: number;
  cy: number;
  r: number;
  motion: FireMotion;
}

/** Where each spark starts, how far it climbs and drifts, and when; spread so they never rise together. */
const EMBERS: readonly { cx: number; cy: number; r: number; rise: number; drift: number; periodMs: number; phase: number }[] = [
  { cx: 50, cy: 62, r: 2.4, rise: 64, drift: -14, periodMs: 1600, phase: 0 },
  { cx: 74, cy: 58, r: 2, rise: 58, drift: 14, periodMs: 2400, phase: 0.35 },
  { cx: 40, cy: 76, r: 1.8, rise: 72, drift: -18, periodMs: 1200, phase: 0.62 },
  { cx: 84, cy: 74, r: 2.2, rise: 66, drift: 12, periodMs: 1600, phase: 0.8 },
  { cx: 62, cy: 50, r: 1.6, rise: 54, drift: 5, periodMs: 2400, phase: 0.85 },
];

export const FIRE_EMBERS: readonly FireEmber[] = EMBERS.map(({ cx, cy, r, rise, drift, periodMs, phase }) => ({
  cx,
  cy,
  r,
  motion: {
    kind: 'rise',
    periodMs,
    phase,
    poses: [
      { x: 0, y: 0, sx: 1, sy: 1, o: 0 },
      // pushed back a little against its drift as it leaves the flame, the way heat tosses a spark
      { x: -drift * 0.15, y: -rise * 0.18, sx: 1, sy: 1, o: 1 },
      { x: drift * 0.6, y: -rise * 0.72, sx: 0.8, sy: 0.8, o: 0.85 },
      { x: drift, y: -rise, sx: 0.4, sy: 0.4, o: 0 },
    ],
  },
}));

/** The glow behind the fire, breathing slowly: a soft radial light, never a blur. */
export const FIRE_GLOW = {
  cx: 60,
  cy: 90,
  rx: 74,
  ry: 78,
  /** how it fades from its middle out: offset, and the share of the glow's strength there */
  fade: [
    [0, 1],
    [0.5, 0.45],
    [1, 0],
  ] as const,
  origin: [60, 90] as const,
  motion: {
    kind: 'loop',
    periodMs: 2400,
    phase: 0,
    poses: [
      { sx: 1, sy: 1, o: 0.85 },
      { sx: 1.05, sy: 1.04, o: 1 },
      { sx: 0.97, sy: 0.98, o: 0.8 },
      { sx: 1.03, sy: 1.03, o: 0.95 },
    ],
  } satisfies FireMotion,
} as const;

export type FireBasePart = 'coal' | 'barkShade' | 'bark' | 'barkLight' | 'cut' | 'ring';

/** A log seen from the side: a capsule `r` thick either side of the line from (x1, y1) to (x2, y2), as a closed path. */
function capsule(x1: number, y1: number, x2: number, y2: number, r: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1);
  // across the log, towards its upper edge
  const nx = (y2 - y1) / len;
  const ny = -(x2 - x1) / len;
  const p = (x: number, y: number, side: number): string => `${n(x + nx * r * side)} ${n(y + ny * r * side)}`;
  return `M${p(x1, y1, 1)}L${p(x2, y2, 1)}A${n(r)} ${n(r)} 0 0 1 ${p(x2, y2, -1)}L${p(x1, y1, -1)}A${n(r)} ${n(r)} 0 0 1 ${p(x1, y1, 1)}Z`;
}

/** An ellipse as a closed path. */
function oval(cx: number, cy: number, rx: number, ry: number): string {
  return `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
}

/** A log from its sawn end (x1, y1), where its rings show, to (x2, y2): bark, a lit edge along its top, the cut face. */
function log(x1: number, y1: number, x2: number, y2: number, bark: 'bark' | 'barkShade'): { part: FireBasePart; d: string }[] {
  const r = 6.5;
  const along = (t: number, lift: number): [number, number] => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    return [x1 + (x2 - x1) * t + ((y2 - y1) / len) * lift, y1 + (y2 - y1) * t - ((x2 - x1) / len) * lift];
  };
  const [ax, ay] = along(0.16, 3.6);
  const [bx, by] = along(0.74, 3.6);
  return [
    { part: bark, d: capsule(x1, y1, x2, y2, r) },
    { part: 'barkLight', d: capsule(ax, ay, bx, by, 1.2) },
    { part: 'cut', d: oval(x1, y1, 4.4, r) },
    { part: 'ring', d: oval(x1, y1, 2, 3) },
  ];
}

/**
 * What the fire burns on, in front of the flame's root: glowing coals, and
 * two logs crossed over them, the far one in shade, each showing the rings
 * of its sawn end. Still: nothing here moves.
 */
export const FIRE_BASE: readonly { part: FireBasePart; d: string }[] = [
  { part: 'coal', d: oval(60, 132, 31, 9) },
  ...log(20, 127, 96, 141, 'barkShade'),
  ...log(100, 127, 24, 141, 'bark'),
];

/** A gradient's two ends: at the tip of a tongue (or the top of a log) and at its root. */
export type FireStops = readonly [string, string];

export interface FireColours {
  tongues: Readonly<Record<FireTongueId, FireStops>>;
  /** the glow's colour and how strong it is at its middle; null for a fire not burning */
  glow: { colour: string; opacity: number } | null;
  /** the sparks' colour; null when nothing rises */
  ember: string | null;
  base: Readonly<Record<FireBasePart, FireStops>>;
}

export type FireScheme = 'light' | 'dark';

const LOGS: Record<FireScheme, Omit<FireColours['base'], 'coal'>> = {
  light: { bark: ['#9C6436', '#6E4222'], barkShade: ['#7F4F2A', '#5A3519'], barkLight: ['#B37A4A', '#A87044'], cut: ['#F2CC94', '#DDA868'], ring: ['#C48A50', '#B07840'] },
  // a shade lighter on the dark page, so the wood is not lost in it
  dark: { bark: ['#B07444', '#7E4E2A'], barkShade: ['#905C33', '#683F20'], barkLight: ['#C78C5C', '#BC8252'], cut: ['#F6D6A4', '#E2B276'], ring: ['#C99258', '#B27C44'] },
};

/**
 * The fire alight, in the sun's colours: red-orange outside, through orange
 * and gold, to a heart nearly white. Each tongue is a little deeper at its
 * tip than at its root, where a flame is hottest. On the dark page every
 * colour is a step brighter and the glow stronger; on the light page the
 * outer flame is deep enough to hold its edge against white.
 */
const LIT: Record<FireScheme, FireColours> = {
  light: {
    tongues: {
      back: ['#D2302A', '#EC552B'],
      outer: ['#E4462A', '#F4692C'],
      flame: ['#F7861F', '#FFA53B'],
      core: ['#FFBE2E', '#FFD757'],
      heart: ['#FFEDB0', '#FFFCEE'],
    },
    glow: { colour: '#FFAA3C', opacity: 0.5 },
    ember: '#F2771E',
    base: { ...LOGS.light, coal: ['#FF8A2A', '#E2521E'] },
  },
  dark: {
    tongues: {
      back: ['#E6402E', '#FF6532'],
      outer: ['#F2552E', '#FF7A36'],
      flame: ['#FF9426', '#FFB648'],
      core: ['#FFC93A', '#FFE36C'],
      heart: ['#FFF4C4', '#FFFFF5'],
    },
    glow: { colour: '#FF8A2A', opacity: 0.6 },
    ember: '#FFD66B',
    base: { ...LOGS.dark, coal: ['#FFA040', '#F0602A'] },
  },
};

/** A fire not burning (a streak not kept going): cool grey, still, no glow, no sparks, the coals gone dark. */
const UNLIT: Record<FireScheme, FireColours> = {
  light: {
    tongues: {
      back: ['#959CA9', '#AAB0BC'],
      outer: ['#9AA1AE', '#B4BAC5'],
      flame: ['#B5BBC6', '#C9CED7'],
      core: ['#CDD1D9', '#DCDFE5'],
      heart: ['#E8EAEE', '#F5F6F8'],
    },
    glow: null,
    ember: null,
    base: {
      bark: ['#8F8A86', '#6C6662'],
      barkShade: ['#7A7570', '#5C5652'],
      barkLight: ['#A8A29D', '#9F9994'],
      cut: ['#D6D1CB', '#BFB8B0'],
      ring: ['#A39C95', '#958D85'],
      coal: ['#6C6662', '#57524E'],
    },
  },
  dark: {
    tongues: {
      back: ['#555C6A', '#666D7B'],
      outer: ['#5D6472', '#707785'],
      flame: ['#767D8B', '#89909D'],
      core: ['#959BA7', '#A7ACB7'],
      heart: ['#BFC3CB', '#D2D5DB'],
    },
    glow: null,
    ember: null,
    base: {
      bark: ['#7A7571', '#5A5551'],
      barkShade: ['#67625E', '#4C4743'],
      barkLight: ['#928C87', '#88827D'],
      cut: ['#B8B2AB', '#A0998F'],
      ring: ['#8C857E', '#7E776F'],
      coal: ['#4A4643', '#3C3835'],
    },
  },
};

/** `#rrggbb` mixed toward `toward` by `share` (0 keeps it, 1 is `toward`). */
function mix(hex: string, toward: string, share: number): string {
  const a = parseHex(hex);
  const b = parseHex(toward);
  const c = a.map((v, i) => Math.round(v + ((b[i] as number) - v) * share));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function parseHex(hex: string): [number, number, number] {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? '000000';
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Whether `accent` is a colour this can work with (`#rrggbb`). */
const isHex = (accent: string | null | undefined): accent is string => typeof accent === 'string' && /^#?[0-9a-f]{6}$/i.test(accent.trim());

/**
 * The colours to draw the fire in. Lit, it burns in the sun's colours for
 * the page it is on; an event's accent (an event theme dressing the app)
 * recolours the flame in that accent instead, from its deepest shade outside
 * to near white at the heart, the logs and their coals staying as they are.
 * Unlit, it is cool grey whatever the event.
 */
export function fireColours({ lit, scheme, accent }: { lit: boolean; scheme: FireScheme; accent?: string | null }): FireColours {
  if (!lit) return UNLIT[scheme];
  const base = LIT[scheme];
  if (!isHex(accent)) return base;
  const hue = mix(accent, accent, 0);
  const deep = scheme === 'dark' ? 0.12 : 0.28;
  return {
    ...base,
    tongues: {
      back: [mix(hue, '#000000', deep + 0.08), mix(hue, '#000000', deep - 0.06)],
      outer: [mix(hue, '#000000', deep), mix(hue, '#000000', deep - 0.12)],
      flame: [hue, mix(hue, '#FFFFFF', 0.22)],
      core: [mix(hue, '#FFFFFF', 0.42), mix(hue, '#FFFFFF', 0.58)],
      heart: [mix(hue, '#FFFFFF', 0.78), mix(hue, '#FFFFFF', 0.94)],
    },
    glow: base.glow ? { colour: hue, opacity: base.glow.opacity } : null,
    ember: scheme === 'dark' ? mix(hue, '#FFFFFF', 0.5) : hue,
  };
}

/** The parts drawn at `size`: the light version's three tongues at `FIRE_SMALL` and under, everything above it. */
export function fireParts(size: number): {
  small: boolean;
  view: { x: number; y: number; w: number; h: number };
  tongues: readonly FireTongue[];
  wisps: readonly FireWisp[];
  embers: readonly FireEmber[];
  glow: boolean;
  base: boolean;
} {
  const small = size <= FIRE_SMALL;
  if (small) return { small, view: FIRE_SMALL_VIEW, tongues: FIRE_TONGUES.filter((t) => t.small), wisps: [], embers: [], glow: false, base: false };
  return { small, view: FIRE_VIEW, tongues: FIRE_TONGUES, wisps: FIRE_WISPS, embers: FIRE_EMBERS, glow: true, base: true };
}

/** A motion moved by only `share` of its full amount: the light version's gentler flicker. */
export function calmMotion(motion: FireMotion, share: number): FireMotion {
  const toward = (v: number | undefined, rest: number): number | undefined => (v === undefined ? undefined : rest + (v - rest) * share);
  return {
    ...motion,
    poses: motion.poses.map((p) => ({
      ...p,
      x: toward(p.x, 0),
      y: toward(p.y, 0),
      sx: toward(p.sx, 1),
      sy: toward(p.sy, 1),
      skew: toward(p.skew, 0),
    })),
  };
}

/** Stops of a motion's kind. */
export const fireStops = (motion: FireMotion): readonly number[] => (motion.kind === 'loop' ? FIRE_LOOP_STOPS : FIRE_RISE_STOPS);

/** The rest value of each pose field. */
const REST: Required<FirePose> = { x: 0, y: 0, sx: 1, sy: 1, skew: 0, o: 1 };
const FIELDS = ['x', 'y', 'sx', 'sy', 'skew', 'o'] as const;

/**
 * Where a part is at `u` (0 to 1) through its own period, phase already
 * applied by the caller: a loop eases in and out between its poses (a sine
 * ease, the same curve the website's keyframes are given), and a rise moves
 * straight from one to the next.
 */
export function firePoseAt(motion: FireMotion, u: number): Required<FirePose> {
  const stops = fireStops(motion);
  const poses = motion.poses;
  const t = ((u % 1) + 1) % 1;
  let i = stops.length - 1;
  while (i > 0 && t < (stops[i] as number)) i -= 1;
  const from = stops[i] as number;
  const loop = motion.kind === 'loop';
  const last = i === stops.length - 1;
  // a loop's last pose eases back to its first by the end of the period; a rise holds its last
  const to = last ? (loop ? 1 : from) : (stops[i + 1] as number);
  const a = poses[i] ?? {};
  const b = last ? (loop ? (poses[0] ?? {}) : a) : (poses[i + 1] ?? {});
  const span = to - from;
  const raw = span > 0 ? (t - from) / span : 0;
  const k = loop ? (1 - Math.cos(Math.PI * raw)) / 2 : raw;
  const out = { ...REST };
  for (const f of FIELDS) {
    const va = a[f] ?? REST[f];
    const vb = b[f] ?? REST[f];
    out[f] = va + (vb - va) * k;
  }
  return out;
}

/**
 * A part's motion laid along one clock running 0 → 1 over `FIRE_CYCLE_MS`,
 * for the phone: `input` and the pose at each, sampled finely enough
 * (`perPeriod` samples each time round) that straight lines between samples
 * follow the curve. The first and last samples are the same pose, so the
 * clock loops without a seam.
 */
export function fireSamples(motion: FireMotion, perPeriod = 24): { input: number[]; poses: Required<FirePose>[] } {
  const repeats = FIRE_CYCLE_MS / motion.periodMs;
  const count = Math.round(repeats * perPeriod);
  const input: number[] = [];
  const poses: Required<FirePose>[] = [];
  for (let s = 0; s <= count; s++) {
    const at = s / count;
    input.push(at);
    poses.push(firePoseAt(motion, at * repeats + motion.phase));
  }
  return { input, poses };
}
