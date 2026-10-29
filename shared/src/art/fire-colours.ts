/**
 * The colours the streak's fire is drawn in (`fire.ts`), at each stage, on
 * the light page and the dark, and recoloured by an event theme's accent;
 * and how its soft lights fade.
 */
import type { FireStage } from '../fire-stages.js';
import type { FireBasePart, FireTongueId } from './fire.js';

/** How a glow fades from its middle out: offset, and the share of its strength there. */
export const FIRE_GLOW_FADE = [
  [0, 1],
  [0.5, 0.45],
  [1, 0],
] as const;

/** How the rest of the fire's soft lights fade, the same way: the halo's disc, and the cold hearth's ember from its hot middle out. */
export const FIRE_DISC_FADE = [
  [0, 1],
  [0.6, 0.55],
  [1, 0],
] as const;
export const FIRE_CINDER_FADE = [
  [0, 'core', 1],
  [0.18, 'core', 0.95],
  [0.36, 'glow', 0.75],
  [1, 'glow', 0],
] as const;

/** How a drift fades along its length, top first: smoke is thickest low down and thins as it rises; heat shows only in its middle. */
export const FIRE_DRIFT_FADE = {
  smoke: [
    [0, 0],
    [0.45, 1],
    [1, 0.75],
  ],
  heat: [
    [0, 0],
    [0.5, 1],
    [1, 0],
  ],
} as const;

/** A gradient's colours, evenly spread from the tip of a tongue (or the top of a log) to its root: two, or three. */
export type FireStops = readonly [string, string] | readonly [string, string, string];

/** A colour and how strong it is at its strongest. */
export interface FireTint {
  colour: string;
  opacity: number;
}

export interface FireColours {
  tongues: Readonly<Record<FireTongueId, FireStops>>;
  /** the glow's colour and how strong it is at its middle; null for a fire not burning */
  glow: FireTint | null;
  /** the sparks' colour; null when nothing rises */
  ember: string | null;
  /** the Newroz fire's gold: its gold sparks; null for every other fire */
  gold: string | null;
  /** the sun behind the Newroz fire; null for every other fire */
  halo: { disc: FireTint; rays: FireTint } | null;
  /** heat over a big fire's tips */
  heat: FireTint | null;
  /** a cold hearth's smoke, and its one ember */
  smoke: FireTint | null;
  cinder: { core: string; glow: string } | null;
  base: Readonly<Record<FireBasePart, FireStops>>;
}

export type FireScheme = 'light' | 'dark';

type Wood = Omit<FireColours['base'], 'coal' | 'ash' | 'stone' | 'stoneLight' | 'char'>;

const LOGS: Record<FireScheme, Wood> = {
  light: { bark: ['#9C6436', '#6E4222'], barkShade: ['#7F4F2A', '#5A3519'], barkLight: ['#B37A4A', '#A87044'], cut: ['#F2CC94', '#DDA868'], ring: ['#C48A50', '#B07840'] },
  // a shade lighter on the dark page, so the wood is not lost in it
  dark: { bark: ['#B07444', '#7E4E2A'], barkShade: ['#905C33', '#683F20'], barkLight: ['#C78C5C', '#BC8252'], cut: ['#F6D6A4', '#E2B276'], ring: ['#C99258', '#B27C44'] },
};

/** Logs burnt and gone cold: charred, grey-brown, still wood. */
const CHARRED: Record<FireScheme, Wood & Pick<FireColours['base'], 'char' | 'ash'>> = {
  light: {
    bark: ['#7D6E64', '#56493F'],
    barkShade: ['#695B52', '#483C34'],
    barkLight: ['#93857A', '#8A7B70'],
    cut: ['#C9BBAC', '#A69585'],
    ring: ['#8F8073', '#7E6F62'],
    char: ['#3B322D', '#2A2420'],
    ash: ['#D6D1CB', '#B3ADA6'],
  },
  dark: {
    bark: ['#8F8076', '#655850'],
    barkShade: ['#7A6C63', '#564A42'],
    barkLight: ['#A69689', '#9C8C7F'],
    cut: ['#CFC1B2', '#AE9E8D'],
    ring: ['#968779', '#86776A'],
    char: ['#2F2724', '#231D1A'],
    ash: ['#8D8882', '#6E6964'],
  },
};

/** The hearth stones, their tops lit warm by the fire. */
const STONE: Record<FireScheme, Pick<FireColours['base'], 'stone' | 'stoneLight'>> = {
  light: { stone: ['#A99F96', '#7A7169'], stoneLight: ['#E2CBAE', '#CDB497'] },
  dark: { stone: ['#968D85', '#655D56'], stoneLight: ['#E0C6A2', '#C4A987'] },
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
      left: ['#D8382A', '#EE5A2B'],
      right: ['#D8382A', '#EE5A2B'],
      outer: ['#E4462A', '#F4692C'],
      flame: ['#F7861F', '#FFA53B'],
      core: ['#FFBE2E', '#FFD757'],
      heart: ['#FFEDB0', '#FFFCEE'],
    },
    glow: { colour: '#FFAA3C', opacity: 0.5 },
    ember: '#F2771E',
    gold: null,
    halo: null,
    heat: { colour: '#FFA63C', opacity: 0.5 },
    smoke: null,
    cinder: null,
    base: { ...LOGS.light, ...STONE.light, coal: ['#FF8A2A', '#E2521E'], ash: CHARRED.light.ash, char: CHARRED.light.char },
  },
  dark: {
    tongues: {
      back: ['#E6402E', '#FF6532'],
      left: ['#EC4A2E', '#FF6E34'],
      right: ['#EC4A2E', '#FF6E34'],
      outer: ['#F2552E', '#FF7A36'],
      flame: ['#FF9426', '#FFB648'],
      core: ['#FFC93A', '#FFE36C'],
      heart: ['#FFF4C4', '#FFFFF5'],
    },
    glow: { colour: '#FF8A2A', opacity: 0.6 },
    ember: '#FFD66B',
    gold: null,
    halo: null,
    heat: { colour: '#FFF0C8', opacity: 0.4 },
    smoke: null,
    cinder: null,
    base: { ...LOGS.dark, ...STONE.dark, coal: ['#FFA040', '#F0602A'], ash: CHARRED.dark.ash, char: CHARRED.dark.char },
  },
};

/** The hottest fires: the gold paler, and the heart white with a blue root, as the hottest flames burn. */
const HOTTEST: Record<FireScheme, Pick<FireColours['tongues'], 'core' | 'heart'>> = {
  light: { core: ['#FFCC33', '#FFEB94'], heart: ['#FFFFFF', '#FFFEF8', '#7CC2FF'] },
  dark: { core: ['#FFD54A', '#FFF0A6'], heart: ['#FFFFFF', '#FFFFFF', '#8ED0FF'] },
};

/** The Newroz fire's gold: its gold sparks, and the sun behind it. */
const NEWROZ: Record<FireScheme, Pick<FireColours, 'gold' | 'halo'>> = {
  light: { gold: '#E9A30F', halo: { disc: { colour: '#FFC93D', opacity: 0.55 }, rays: { colour: '#FFB81F', opacity: 0.6 } } },
  dark: { gold: '#FFD34D', halo: { disc: { colour: '#FFC64A', opacity: 0.55 }, rays: { colour: '#FFDA6E', opacity: 0.8 } } },
};

/**
 * A fire not burning (no streak yet): charred logs over ash, one ember still
 * glowing and a thread of smoke, and, beside a number, the small flame in
 * cool grey, still.
 */
const COLD: Record<FireScheme, FireColours> = {
  light: {
    tongues: {
      back: ['#959CA9', '#AAB0BC'],
      left: ['#959CA9', '#AAB0BC'],
      right: ['#959CA9', '#AAB0BC'],
      outer: ['#9AA1AE', '#B4BAC5'],
      flame: ['#B5BBC6', '#C9CED7'],
      core: ['#CDD1D9', '#DCDFE5'],
      heart: ['#E8EAEE', '#F5F6F8'],
    },
    glow: null,
    ember: null,
    gold: null,
    halo: null,
    heat: null,
    smoke: { colour: '#959CA6', opacity: 0.55 },
    cinder: { core: '#FFB547', glow: '#F05A26' },
    base: { ...CHARRED.light, ...STONE.light, coal: CHARRED.light.ash },
  },
  dark: {
    tongues: {
      back: ['#555C6A', '#666D7B'],
      left: ['#555C6A', '#666D7B'],
      right: ['#555C6A', '#666D7B'],
      outer: ['#5D6472', '#707785'],
      flame: ['#767D8B', '#89909D'],
      core: ['#959BA7', '#A7ACB7'],
      heart: ['#BFC3CB', '#D2D5DB'],
    },
    glow: null,
    ember: null,
    gold: null,
    halo: null,
    heat: null,
    smoke: { colour: '#A6ADB7', opacity: 0.42 },
    cinder: { core: '#FFC65C', glow: '#FF6A30' },
    base: { ...CHARRED.dark, ...STONE.dark, coal: CHARRED.dark.ash },
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
 * The colours to draw the fire in at `stage`. Alight, it burns in the sun's
 * colours for the page it is on, hotter at the blaze and the Newroz fire,
 * the Newroz fire with its gold. An event's accent (an event theme dressing
 * the app) recolours the flame in that accent instead, from its deepest
 * shade outside to near white at the heart; the logs, the stones and the
 * Newroz fire's gold stay as they are. Cold, it is the same whatever the event.
 */
export function fireColours({ stage, scheme, accent }: { stage: FireStage; scheme: FireScheme; accent?: string | null }): FireColours {
  if (stage === 'cold') return COLD[scheme];
  const hot = stage === 'blaze' || stage === 'newroz';
  const base: FireColours = {
    ...LIT[scheme],
    ...(hot ? { tongues: { ...LIT[scheme].tongues, ...HOTTEST[scheme] } } : null),
    ...(stage === 'newroz' ? NEWROZ[scheme] : null),
  };
  if (!isHex(accent)) return base;
  const hue = mix(accent, accent, 0);
  const deep = scheme === 'dark' ? 0.12 : 0.28;
  const side: FireStops = [mix(hue, '#000000', deep + 0.04), mix(hue, '#000000', deep - 0.09)];
  return {
    ...base,
    tongues: {
      back: [mix(hue, '#000000', deep + 0.08), mix(hue, '#000000', deep - 0.06)],
      left: side,
      right: side,
      outer: [mix(hue, '#000000', deep), mix(hue, '#000000', deep - 0.12)],
      flame: [hue, mix(hue, '#FFFFFF', 0.22)],
      core: [mix(hue, '#FFFFFF', 0.42), mix(hue, '#FFFFFF', 0.58)],
      heart: [mix(hue, '#FFFFFF', 0.78), mix(hue, '#FFFFFF', 0.94)],
    },
    glow: base.glow ? { colour: hue, opacity: base.glow.opacity } : null,
    ember: scheme === 'dark' ? mix(hue, '#FFFFFF', 0.5) : hue,
    heat: base.heat ? { ...base.heat, colour: mix(hue, '#FFFFFF', 0.6) } : null,
  };
}
