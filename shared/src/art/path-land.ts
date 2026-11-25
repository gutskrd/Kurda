/**
 * The lesson path's drawings in the painted valley style (valley.ts): the colours of each unit's land for its banner and
 * landmark, the stops as a base and a face a press pushes down (`pathStopSvg`; the app sets a skill's glyph), and the
 * signpost while the next unit is being made (`pathSignpostSvg`). Chapter landmarks are in path-landmark.ts.
 */
import type { UnitTone } from '../lesson-path.js';
import type { PathGround } from '../path-world.js';
import { themeColors } from '../themes.js';
import { roadLight } from './light.js';
import { CANVAS, mix, n, n2, prefixFor } from './svg.js';
import { VALLEY, dusk, ellipsePath, fill, stroke, warm } from './valley.js';

// ───────────────────────────────────────────────────────────── the lands

/** A unit's land as a banner and a landmark see it: its ground, the shade cast on it, and its far and near hills. */
interface Land {
  base: string;
  shade: string;
  hills: { far: string; near: string; snow?: boolean };
}

/** The twelve lands of the road's year, from spring orchards to the winter stove (`PATH_LANDS` assigns them to units). */
const LANDS: Record<PathGround, Land> = {
  orchard: { base: VALLEY.meadow, shade: VALLEY.meadowShade, hills: { far: VALLEY.far, near: VALLEY.mid, snow: true } },
  meadow: { base: '#cfe2a0', shade: '#b8d08a', hills: { far: VALLEY.far, near: '#b3c99a' } },
  lanes: { base: '#dfdcac', shade: '#c7c393', hills: { far: VALLEY.far, near: '#bcc79c' } },
  town: { base: '#e4d6aa', shade: '#ccbd8f', hills: { far: '#d3d2d6', near: '#c9c6a2' } },
  stubble: { base: '#e9d79c', shade: '#d2bd80', hills: { far: '#d6d0c8', near: '#d3c38e' } },
  plaza: { base: '#dcd5c3', shade: '#c4bca7', hills: { far: '#cccdd6', near: '#bdbba9' } },
  bloom: { base: '#cfe59a', shade: '#b6d083', hills: { far: '#cbd3e2', near: '#aecb8d', snow: true } },
  honey: { base: '#d9e4a0', shade: '#c1cd88', hills: { far: VALLEY.far, near: '#bfcb92' } },
  valley: { base: '#c9df98', shade: '#b1c983', hills: { far: '#c7cfdc', near: '#a7c587' } },
  alpine: { base: '#c8d6a0', shade: '#b0bf8a', hills: { far: '#c4cad8', near: '#aab89a', snow: true } },
  autumn: { base: '#e3cf98', shade: '#cbb57f', hills: { far: '#d2ccd2', near: '#c9b183' } },
  snow: { base: VALLEY.snow, shade: VALLEY.snowShade, hills: { far: '#d6dde8', near: '#e4eaf1', snow: true } },
};

/** The shade cast on a land's ground by day or evening; a landmark stands in it as the trees do. */
export function pathGroundShade(ground: PathGround, dark = false): string {
  const land = LANDS[ground];
  if (!land) throw new RangeError(`art: no ground ${String(ground)}`);
  return roadLight(dark)(land.shade);
}

/** A land's far and near hills and its ground, by day or evening, for a picture of the land seen from afar (a chapter's banner). */
export function pathGroundView(ground: PathGround, dark = false): { far: string; near: string; base: string; shade: string; snow: boolean } {
  const land = LANDS[ground];
  if (!land) throw new RangeError(`art: no ground ${String(ground)}`);
  return {
    far: roadLight(dark)(land.hills.far),
    near: roadLight(dark)(land.hills.near),
    base: roadLight(dark)(land.base),
    shade: roadLight(dark)(land.shade),
    snow: land.hills.snow === true,
  };
}

// ───────────────────────────────────────────────────────────── the stops

/**
 * A stop's picture: `box` points square with the stop's centre at (`cx`, `cy`). The token's face is `rx` × `ry`,
 * standing `side` above the road (`raised` for the current skill); `press` is how far the face sinks under a finger.
 */
export const PATH_STOP_ART = { box: 112, cx: 56, cy: 58, rx: 36, ry: 31, side: 10, raised: 13, press: 6 } as const;

/** The colour theme's main colour, the main button's, which the current stop wears as the road's one way forward. */
function now(dark: boolean): { face: string; side: string; ring: string } {
  const t = themeColors(dark ? 'dark' : 'light');
  return { face: t.primary.toLowerCase(), side: t.primaryPressed.toLowerCase(), ring: mix(t.primary, '#ffffff', dark ? 0.7 : 0.6) };
}

/** What a stop looks like, by what it is and how it stands. */
export const PATH_STOP_LOOKS = [
  'done',
  'strong',
  'refresh',
  'current',
  'available',
  'locked',
  'review',
  'guide',
  'guideLocked',
  'story',
  'storyLocked',
  'jump',
  'chest',
  'chestOpen',
] as const;
export type PathStopLook = (typeof PATH_STOP_LOOKS)[number];

/**
 * The units' colours: the `fill` and `lip` the apps paint a unit's banner with (mobile coursemap/path.ts, web
 * learn/path.css), also used for the current stop's token, deep by day and light by evening.
 */
export const PATH_STOP_TONES: Record<'light' | 'dark', Record<UnitTone, { fill: string; lip: string }>> = {
  light: {
    meadow: { fill: '#058644', lip: '#006531' },
    river: { fill: '#0073df', lip: '#0157ac' },
    clay: { fill: '#c45001', lip: '#973c00' },
    dusk: { fill: '#6363eb', lip: '#4a47c0' },
    pine: { fill: '#008282', lip: '#006262' },
    rose: { fill: '#cd3688', lip: '#a51a6a' },
    saffron: { fill: '#c37902', lip: '#8f5d04' },
  },
  dark: {
    meadow: { fill: '#78d694', lip: '#459b61' },
    river: { fill: '#91c1ff', lip: '#5188cd' },
    clay: { fill: '#ffa47a', lip: '#c16d45' },
    dusk: { fill: '#aeb8fe', lip: '#767ecd' },
    pine: { fill: '#57d4d4', lip: '#009a9a' },
    rose: { fill: '#fd9ac6', lip: '#bc668e' },
    saffron: { fill: '#eeb154', lip: '#b07a20' },
  },
};

/** A token's colours: face, side, the ring inside its rim, and its highlight. */
interface Token {
  face: string;
  side: string;
  ring: string;
  glint: string;
}

/** Every look's colours, by day and by evening. */
function tokenOf(look: PathStopLook, t: { fill: string; lip: string }, dark: boolean): Token {
  // A smooth river stone: pale by day, a warm moonlit grey by night, so the road keeps the page's warmth.
  const stone: Token = dark
    ? { face: '#4d463f', side: '#342f2a', ring: '#5e564d', glint: '#9a8f82' }
    : { face: '#ece8e1', side: '#c6beb0', ring: '#f7f5f1', glint: '#ffffff' };
  const cream: Token = dark
    ? { face: '#efe4cc', side: t.lip, ring: t.fill, glint: '#fff8ea' }
    : { face: VALLEY.cream, side: t.lip, ring: t.fill, glint: '#ffffff' };
  const gold: Token = { face: warm(VALLEY.gold, dark), side: warm(VALLEY.goldDark, dark), ring: warm(VALLEY.goldLight, dark), glint: '#fff6dc' };
  switch (look) {
    case 'done':
      return gold;
    case 'strong':
      return { face: warm('#f2b632', dark), side: warm('#a8691a', dark), ring: '#fff1c2', glint: '#ffffff' };
    case 'refresh':
      return { face: mix(gold.face, stone.face, 0.5), side: mix(gold.side, stone.side, 0.5), ring: mix(gold.ring, stone.ring, 0.5), glint: stone.glint };
    case 'current':
      return { ...now(dark), glint: '#ffffff' };
    case 'available':
      return cream;
    case 'review':
      return { ...cream, side: stone.side, ring: mix(t.fill, cream.face, 0.4) };
    case 'guide':
      return { ...cream, ring: mix(t.fill, cream.face, 0.55) };
    // A chapter's story, open once every topic is done, is the chapter's prize, so it is gold.
    case 'story':
      return gold;
    default:
      return stone;
  }
}

export interface PathStopOptions {
  look: PathStopLook;
  tone: UnitTone;
  /** The base (its shade on the road and its side), or the face a press pushes down. */
  part: 'base' | 'face';
  dark?: boolean;
  /** Display size in points; the drawing is `PATH_STOP_ART.box` square. */
  size?: number;
  idPrefix?: string;
}

/**
 * One stop, base or face: a round token raised off the road. A skill's face has only its colour, ring and highlight,
 * and the app sets its glyph; the guide's book, story scroll, jump gate and chapter saddlebag are part of the face.
 */
export function pathStopSvg(opts: PathStopOptions): string {
  const { look, tone, part, dark = false } = opts;
  if (!(PATH_STOP_LOOKS as readonly string[]).includes(look)) throw new RangeError(`art: no stop look ${String(look)}`);
  const scheme = dark ? 'dark' : 'light';
  const t = PATH_STOP_TONES[scheme][tone];
  if (!t) throw new RangeError(`art: no unit tone ${String(tone)}`);
  const size = opts.size ?? PATH_STOP_ART.box;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const { box: B, cx, cy, rx, ry } = PATH_STOP_ART;
  const prefix = prefixFor(opts.idPrefix, 'stop', look, tone, part, dark);
  const bag = look === 'chest' || look === 'chestOpen';
  const side = look === 'current' ? PATH_STOP_ART.raised : bag || look === 'jump' ? 5 : PATH_STOP_ART.side;
  const k = tokenOf(look, t, dark);
  const shade = dark ? '#05060c' : '#3a2a12';

  if (part === 'base') {
    let body = '';
    // The current stop sits in a soft pool of its own colour, so the eye finds it.
    if (look === 'current') {
      const glow = now(dark).face;
      body += `<path d="${ellipsePath(cx, cy + 4, rx + 16, ry + 13)}" fill="${glow}" fill-opacity="${dark ? 0.2 : 0.14}"/>`;
      body += `<path d="${ellipsePath(cx, cy + 4, rx + 9, ry + 7)}" fill="${glow}" fill-opacity="${dark ? 0.24 : 0.18}"/>`;
    }
    // Its shade on the road, then its side: the face extended down by `side`.
    body += `<path d="${ellipsePath(cx + 4, cy + side + ry * 0.55, rx * 0.98, ry * 0.4)}" fill="${shade}" fill-opacity="${dark ? 0.32 : 0.16}"/>`;
    body += fill(`M${n(cx - rx)} ${n(cy)}L${n(cx - rx)} ${n(cy + side)}A${n(rx)} ${n(ry)} 0 0 0 ${n(cx + rx)} ${n(cy + side)}L${n(cx + rx)} ${n(cy)}Z${ellipsePath(cx, cy + side, rx, ry)}`, k.side);
    if (look === 'strong') body += stroke(`M${n(cx - rx - 2)} ${n(cy + side)}A${n(rx + 2)} ${n(ry + 2)} 0 0 0 ${n(cx + rx + 2)} ${n(cy + side)}`, warm('#f2b632', dark), 3);
    return wrap(prefix, size, B, body);
  }

  // The face: its colour, the ring inside its rim, and one highlight where the light falls on its upper left.
  let body = '';
  if (look === 'strong') body += fill(ellipsePath(cx, cy, rx + 3, ry + 3), warm('#ffd96a', dark));
  body += fill(ellipsePath(cx, cy, rx, ry), k.face);
  body += `<path d="${ellipsePath(cx, cy, rx - 6, ry - 5.5)}" fill="none" stroke="${k.ring}" stroke-width="2.6"/>`;
  body += `<path d="M${n(cx - rx * 0.78)} ${n(cy - ry * 0.12)}C${n(cx - rx * 0.78)} ${n(cy - ry * 0.7)} ${n(cx - rx * 0.3)} ${n(cy - ry * 0.92)} ${n(cx + rx * 0.08)} ${n(cy - ry * 0.86)}C${n(cx - rx * 0.32)} ${n(cy - ry * 0.7)} ${n(cx - rx * 0.6)} ${n(cy - ry * 0.46)} ${n(cx - rx * 0.78)} ${n(cy - ry * 0.12)}Z" fill="${k.glint}" fill-opacity="${dark ? 0.3 : 0.55}"/>`;
  if (look === 'guide' || look === 'guideLocked') body += book(cx, cy - 2, look === 'guide' ? t : { fill: '#bdb09a', lip: '#9c8f78' }, dark);
  if (look === 'story') body += scroll(cx, cy - 2, dark, false);
  if (look === 'storyLocked') body += scroll(cx, cy - 2, dark, true);
  if (look === 'jump') body += gate(cx, cy + 2, dark);
  if (bag) body += saddlebag(cx, cy + 1, look === 'chestOpen', dark);
  return wrap(prefix, size, B, body);
}

function wrap(prefix: string, size: number, box: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${box} ${box}" aria-hidden="true" focusable="false" id="${prefix}">${body}</svg>`;
}

/** An open book on the token, its cover in the unit's colour, with two lined pages. */
function book(x: number, y: number, cover: { fill: string; lip: string }, dark: boolean): string {
  const page = dark ? '#ece3cf' : '#fffaf0';
  const pageShade = dark ? '#cfc4ab' : '#efe0c0';
  let out = fill(`M${n(x - 23)} ${n(y - 1)}L${n(x - 21)} ${n(y + 9)}Q${n(x - 10)} ${n(y + 5)} ${n(x)} ${n(y + 11)}Q${n(x + 10)} ${n(y + 5)} ${n(x + 21)} ${n(y + 9)}L${n(x + 23)} ${n(y - 1)}Z`, cover.lip);
  out += fill(`M${n(x)} ${n(y + 8)}Q${n(x - 9)} ${n(y + 1)} ${n(x - 20)} ${n(y + 5)}L${n(x - 18)} ${n(y - 17)}Q${n(x - 8)} ${n(y - 21)} ${n(x)} ${n(y - 14)}Z`, page);
  out += fill(`M${n(x)} ${n(y + 8)}Q${n(x + 9)} ${n(y + 1)} ${n(x + 20)} ${n(y + 5)}L${n(x + 18)} ${n(y - 17)}Q${n(x + 8)} ${n(y - 21)} ${n(x)} ${n(y - 14)}Z`, pageShade);
  let lines = '';
  for (let i = 0; i < 3; i++) {
    const dy = y - 11 + i * 5.5;
    lines += `M${n(x - 15)} ${n(dy)}Q${n(x - 9)} ${n(dy - 2)} ${n(x - 4)} ${n(dy + 1)}M${n(x + 4)} ${n(dy + 1)}Q${n(x + 9)} ${n(dy - 2)} ${n(x + 15)} ${n(dy)}`;
  }
  out += stroke(lines, cover.fill, 1.5);
  return out;
}

/** A scroll on the token: open with its lines and Hevalo's apple in the corner, or rolled and tied while its chapter waits. */
function scroll(x: number, y: number, dark: boolean, shut: boolean): string {
  const paper = dark ? '#e3d6b6' : '#f7e7c2';
  const roll = dark ? '#b79d6d' : '#d9b97a';
  const red = dusk(VALLEY.red, dark, 0.15);
  if (shut) {
    return (
      fill(`M${n(x - 22)} ${n(y - 7)}h44a7 7 0 0 1 0 14h-44a7 7 0 0 1 0 -14Z`, paper) +
      fill(`M${n(x - 22)} ${n(y + 2)}h44a7 7 0 0 1 -1.6 5h-40.8a7 7 0 0 1 -1.6 -5Z`, roll) +
      fill(ellipsePath(x + 22, y, 3.6, 7), roll) +
      fill(`M${n(x - 3)} ${n(y - 7.6)}h6v15.2h-6Z`, red) +
      fill(`M${n(x)} ${n(y + 7)}c-3 4 -9 5 -9 1c1 -3 6 -3 9 -1ZM${n(x)} ${n(y + 7)}c3 4 9 5 9 1c-1 -3 -6 -3 -9 -1Z`, red)
    );
  }
  return (
    fill(`M${n(x - 17)} ${n(y - 15)}h34v22h-34Z`, paper) +
    stroke(`M${n(x - 11)} ${n(y - 8)}h22M${n(x - 11)} ${n(y - 3)}h18M${n(x - 11)} ${n(y + 2)}h10`, roll, 1.6) +
    fill(`M${n(x - 21)} ${n(y - 19)}h42a4 4 0 0 1 0 8h-42a4 4 0 0 1 0 -8ZM${n(x - 21)} ${n(y + 4)}h42a4 4 0 0 1 0 8h-42a4 4 0 0 1 0 -8Z`, roll) +
    // The running joke in the corner of every story: an apple, which Hevalo will find.
    fill(ellipsePath(x + 10, y + 1, 3.4, 3.2), red) +
    fill(`M${n(x + 10.8)} ${n(y - 2.8)}q3 -2 5 -0.4q-3 1.6 -5 0.4Z`, dusk(VALLEY.leaf, dark))
  );
}

/** The jump's gate on its slab: an earth-wall arch with blue doors, shut. */
function gate(x: number, y: number, dark: boolean): string {
  const c = (hex: string): string => dusk(hex, dark);
  return (
    fill(`M${n(x - 24)} ${n(y + 10)}v-26h48v26Z`, c(VALLEY.wall)) +
    fill(`M${n(x - 24)} ${n(y - 16)}h48v-4h-48Z`, c(VALLEY.roof)) +
    fill(`M${n(x - 12)} ${n(y + 10)}v-14a12 12 0 0 1 24 0v14Z`, c(VALLEY.gateDark)) +
    fill(`M${n(x - 10)} ${n(y + 10)}v-13a10 10 0 0 1 10 -10v23Z`, c(VALLEY.gate)) +
    fill(`M${n(x + 10)} ${n(y + 10)}v-13a10 10 0 0 0 -10 -10v23Z`, c(VALLEY.gateLight)) +
    fill(ellipsePath(x - 3, y + 1, 1.3, 1.3) + ellipsePath(x + 3, y + 1, 1.3, 1.3), warm('#f2c35c', dark))
  );
}

/**
 * The chapter's gift: a heybe, the woven saddlebag a guest's gifts come home in, with madder pockets, a row of indigo
 * lozenges and a tied flap; open, the flap is thrown back on gold and sweets.
 */
function saddlebag(x: number, y: number, open: boolean, dark: boolean): string {
  const c = (hex: string): string => dusk(hex, dark, 0.2);
  let out = fill(`M${n(x - 27)} ${n(y - 12)}h54v27a7 7 0 0 1 -7 7h-40a7 7 0 0 1 -7 -7Z`, c('#8f3a2c'));
  out += fill(`M${n(x - 27)} ${n(y - 12)}h54v23a7 7 0 0 1 -7 7h-40a7 7 0 0 1 -7 -7Z`, c('#b6493a'));
  out += stroke(`M${n(x - 27)} ${n(y - 3)}h54M${n(x - 27)} ${n(y + 9)}h54`, c('#f1d9a8'), 2);
  let lozenges = '';
  for (let i = 0; i < 5; i++) lozenges += `M${n(x - 20 + i * 10)} ${n(y + 3)}l4.5 -4.5l4.5 4.5l-4.5 4.5Z`;
  out += fill(lozenges, c(VALLEY.indigo));
  out += stroke(`M${n(x)} ${n(y - 12)}v24`, c('#7a2f24'), 2);
  if (open) {
    out += fill(`M${n(x - 27)} ${n(y - 12)}q27 -20 54 0q-27 -9 -54 0Z`, c('#7a2f24'));
    out += fill(ellipsePath(x - 8, y - 14, 5, 2.4) + ellipsePath(x + 6, y - 15, 4.4, 2.2) + ellipsePath(x - 1, y - 17, 4, 2), warm('#f6c445', dark));
    out += fill(ellipsePath(x + 14, y - 13, 3, 2.4), warm('#ffffff', dark));
  } else {
    out += stroke(`M${n(x - 27)} ${n(y - 12)}q27 -15 54 0`, c('#7a2f24'), 3);
    out += fill(ellipsePath(x, y - 17, 3.2, 3.2), c('#e9c060'));
  }
  return out;
}

// ───────────────────────────────────────────────────────────── the signpost

export interface PathSignpostOptions {
  dark?: boolean;
  size?: number;
  idPrefix?: string;
}

/**
 * The end of the path for now, on the 120-unit canvas: a wooden signpost with a long plank pointing on up the road and
 * a short one back, a kilim ribbon round the post and a small cairn at its foot. Decorative; the words beside it say
 * where.
 */
export function pathSignpostSvg(opts: PathSignpostOptions = {}): string {
  const { dark = false } = opts;
  const size = opts.size ?? CANVAS;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const prefix = prefixFor(opts.idPrefix, 'signpost', dark);
  const c = (hex: string): string => dusk(hex, dark);
  const wood = { light: c('#d29a63'), face: c('#ab743f'), shade: c('#7c522b') };
  let out = fill(ellipsePath(62, 108, 36, 7), c(VALLEY.meadowShade));
  // The stones at its foot, largest first so the small ones sit on it.
  for (const [x, y, r] of [[76, 104, 10], [44, 106, 7], [77, 96, 6]] as const) {
    out += fill(ellipsePath(x, y, r, r * 0.6), c('#b4ab98'));
    out += fill(ellipsePath(x - r * 0.15, y - r * 0.12, r * 0.82, r * 0.44), c('#ddd6c8'));
  }
  // The post: lit on the left, shaded on the right, with a cap.
  out += fill('M55 106V26h5v80Z', wood.face) + fill('M60 106V26h4v80Z', wood.shade) + fill('M53.5 23h12v4h-12Z', wood.light);
  // The long plank pointing on up the road, and the short one back.
  out += fill('M40 34h50l9 7l-9 7h-50Z', wood.face) + fill('M40 34h50l9 7h-59Z', wood.light);
  out += stroke('M47 41h10M62 41h9M76 41h7', wood.shade, 1.8);
  out += fill('M75 58h-38l-7 5l7 5h38Z', wood.shade) + fill('M75 58h-38l-7 5h45Z', wood.face);
  // A kilim ribbon round the post, its ends lifting in the wind.
  out += fill('M54 28h11v5h-11Z', dusk(VALLEY.red, dark, 0.15)) + stroke('M54 30.5h11', warm(VALLEY.gold, dark), 1.2);
  out += fill('M65 29q8 -4 13 2q-7 -1 -12 3Z', dusk(VALLEY.red, dark, 0.15)) + fill('M65 31q6 4 8 12q-4 -6 -9 -9Z', dusk(VALLEY.redDark, dark, 0.15));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${CANVAS} ${CANVAS}" aria-hidden="true" focusable="false" id="${prefix}">${out}</svg>`;
}

