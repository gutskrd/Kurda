/**
 * The colours the streak's fire is drawn in (`fire.ts`), at each stage, on
 * the light page and the dark, and tinted by an event theme's accent; and how
 * its soft lights fade. The whole fire's flame is painted in its own colours
 * (`fire-sprites.ts`); these are everything round it, and the light
 * version's flame beside a number.
 */
import type { FireStage } from '../fire-stages.js';
import type { FireBasePart, FireTongueId } from './fire.js';

/** How a glow fades from its middle out: offset, and the share of its strength there; softly all the way, with no edge to it. */
export const FIRE_GLOW_FADE = [
  [0, 1],
  [0.3, 0.72],
  [0.62, 0.3],
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

/** How a drift fades along its length, top first: smoke is thickest low down and thins as it rises. */
export const FIRE_DRIFT_FADE = {
  smoke: [
    [0, 0],
    [0.45, 1],
    [1, 0.75],
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
  /** the light version's flame */
  tongues: Readonly<Record<FireTongueId, FireStops>>;
  /** the glow's colour and how strong it is at its middle; null for a fire not burning */
  glow: FireTint | null;
  /** the sparks' colour; null when nothing rises */
  ember: string | null;
  /** the Newroz fire's gold: its gold sparks; null for every other fire */
  gold: string | null;
  /** the sun behind the Newroz fire; null for every other fire */
  halo: { disc: FireTint; rays: FireTint } | null;
  /** a cold hearth's smoke, and its one ember */
  smoke: FireTint | null;
  cinder: { core: string; glow: string } | null;
  base: Readonly<Record<FireBasePart, FireStops>>;
}

export type FireScheme = 'light' | 'dark';

type Wood = Omit<FireColours['base'], 'coal' | 'ash' | 'stone' | 'stoneLight' | 'char'>;

/**
 * The wood, lit by the flame: dark bark glowing orange along its top, which
 * faces the fire, deep in shade underneath; the sawn ends, facing away from
 * it, warm but dim.
 */
const LOGS: Record<FireScheme, Wood> = {
  light: { bark: ['#9A5428', '#2E1A0E'], barkShade: ['#7C4420', '#24140B'], barkLight: ['#FFA552', '#9A5428'], cut: ['#8A5634', '#4E2E18'], ring: ['#6A4024', '#4A2A16'] },
  // a shade lighter on the dark page, so the wood is not lost in it
  dark: { bark: ['#A65E2E', '#3A2214'], barkShade: ['#88502A', '#2E1B10'], barkLight: ['#FFB060', '#A65E2E'], cut: ['#9A6440', '#5A3620'], ring: ['#784A2C', '#56341E'] },
};

/** Logs burnt and gone cold: charred, grey-brown, still wood. */
const CHARRED: Record<FireScheme, Wood & Pick<FireColours['base'], 'char' | 'ash'>> = {
  light: {
    bark: ['#7D6E64', '#56493F'],
    barkShade: ['#695B52', '#483C34'],
    barkLight: ['#93857A', '#8A7B70'],
    cut: ['#C9BBAC', '#A69585'],
    ring: ['#8F8073', '#7E6F62'],
    char: ['#4A3E37', '#3A302A'],
    ash: ['#D6D1CB', '#B3ADA6'],
  },
  dark: {
    bark: ['#8F8076', '#655850'],
    barkShade: ['#7A6C63', '#564A42'],
    barkLight: ['#A69689', '#9C8C7F'],
    cut: ['#CFC1B2', '#AE9E8D'],
    ring: ['#968779', '#86776A'],
    char: ['#3D3430', '#2E2723'],
    ash: ['#8D8882', '#6E6964'],
  },
};

/** The hearth stones: round, dark, lit warm orange on the faces towards the fire. */
const STONE: Record<FireScheme, Pick<FireColours['base'], 'stone' | 'stoneLight'>> = {
  light: { stone: ['#6E605A', '#2E2725'], stoneLight: ['#FFA858', '#8A5A40'] },
  dark: { stone: ['#76675F', '#342C29'], stoneLight: ['#FFB060', '#94603F'] },
};

/** The light version's flame alight, in warm, full colours: deep red-orange outside, through gold, to a heart nearly white. Each layer a little deeper at its tip than at its root, where a flame is hottest. */
const SMALL_FLAME: Record<FireScheme, FireColours['tongues']> = {
  light: { outer: ['#E4432A', '#F7712D'], core: ['#FFBF2C', '#FFDA5A'], heart: ['#FFF0BA', '#FFFDF0'] },
  dark: { outer: ['#F45530', '#FF7E38'], core: ['#FFCB3A', '#FFE570'], heart: ['#FFF5C8', '#FFFFF6'] },
};

/**
 * The fire alight, round its painted flame: a warm glow, sparks, and the
 * coals glowing under the logs. On the dark page every colour is a step
 * brighter and the glow stronger.
 */
const LIT: Record<FireScheme, FireColours> = {
  light: {
    tongues: SMALL_FLAME.light,
    glow: { colour: '#FFA238', opacity: 0.55 },
    ember: '#F2771E',
    gold: null,
    halo: null,
    smoke: null,
    cinder: null,
    base: { ...LOGS.light, ...STONE.light, coal: ['#FFB040', '#E8541E'], ash: CHARRED.light.ash, char: CHARRED.light.char },
  },
  dark: {
    tongues: SMALL_FLAME.dark,
    glow: { colour: '#FF8A2A', opacity: 0.68 },
    ember: '#FFD66B',
    gold: null,
    halo: null,
    smoke: null,
    cinder: null,
    base: { ...LOGS.dark, ...STONE.dark, coal: ['#FFBE52', '#F0602A'], ash: CHARRED.dark.ash, char: CHARRED.dark.char },
  },
};

/** The hottest fires beside a number: the gold paler, and the heart white with a blue root, as the hottest flames burn. */
const HOTTEST: Record<FireScheme, Pick<FireColours['tongues'], 'core' | 'heart'>> = {
  light: { core: ['#FFCC33', '#FFEB94'], heart: ['#FFFFFF', '#FFFEF8', '#7CC2FF'] },
  dark: { core: ['#FFD54A', '#FFF0A6'], heart: ['#FFFFFF', '#FFFFFF', '#8ED0FF'] },
};

/** The Newroz fire's gold: its gold sparks, and the sun behind it. */
const NEWROZ: Record<FireScheme, Pick<FireColours, 'gold' | 'halo'>> = {
  light: { gold: '#E9A30F', halo: { disc: { colour: '#FFC93D', opacity: 0.55 }, rays: { colour: '#FFB81F', opacity: 0.6 } } },
  dark: { gold: '#FFD34D', halo: { disc: { colour: '#FFB52E', opacity: 0.5 }, rays: { colour: '#FFC23A', opacity: 0.95 } } },
};

/**
 * A fire not burning (no streak yet): charred logs over ash, one ember still
 * glowing and a curl of smoke, and, beside a number, the small flame in cool
 * grey, its drop of a heart darker, still.
 */
const COLD: Record<FireScheme, FireColours> = {
  light: {
    tongues: { outer: ['#9DA4B0', '#B3B9C4'], core: ['#B6BCC6', '#C6CBD3'], heart: ['#7D8491', '#8B919D'] },
    glow: null,
    ember: null,
    gold: null,
    halo: null,
    smoke: { colour: '#959CA6', opacity: 0.55 },
    cinder: { core: '#FFB547', glow: '#F05A26' },
    base: { ...CHARRED.light, ...STONE.light, coal: CHARRED.light.ash },
  },
  dark: {
    tongues: { outer: ['#646B79', '#757C8A'], core: ['#717886', '#838A97'], heart: ['#3F4551', '#4A505C'] },
    glow: null,
    ember: null,
    gold: null,
    halo: null,
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
 * the app) tints its light — the glow and the light pooled under it, and its
 * sparks — and recolours the light version's flame from the accent's deepest
 * shade outside to near white at the heart; the painted flame, the logs, the
 * stones and the Newroz fire's gold stay as they are. Cold, it is the same
 * whatever the event.
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
  return {
    ...base,
    tongues: {
      outer: [mix(hue, '#000000', deep), mix(hue, '#000000', deep - 0.12)],
      core: [mix(hue, '#FFFFFF', 0.42), mix(hue, '#FFFFFF', 0.58)],
      heart: [mix(hue, '#FFFFFF', 0.78), mix(hue, '#FFFFFF', 0.94)],
    },
    glow: base.glow ? { colour: hue, opacity: base.glow.opacity } : null,
    ember: scheme === 'dark' ? mix(hue, '#FFFFFF', 0.5) : hue,
  };
}
