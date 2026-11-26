/**
 * The lesson path's drawings in the painted valley style (valley.ts): the colours of each unit's land for its landmark,
 * each unit's own vivid colour (`PATH_STOP_TONES`), the stops as a base and a face a press pushes down (`pathStopSvg`;
 * the app sets a skill's glyph), a unit's painted sandûq (`pathChestSvg`), and the signpost while the next unit is being
 * made (`pathSignpostSvg`). Chapter landmarks are in path-landmark.ts.
 */
import type { UnitTone } from '../lesson-path.js';
import type { PathGround } from '../path-world.js';
import { roadLight } from './light.js';
import { CANVAS, mix, n, n2, prefixFor } from './svg.js';
import { kilimAlong } from './paint.js';
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
 * A stop's picture: `box` points square with the stop's centre at (`cx`, `cy`). The puck's face is `rx` × `ry`,
 * standing `side` above the road (`raised` for the current skill); `press` is how far the face sinks under a finger.
 */
export const PATH_STOP_ART = { box: 112, cx: 56, cy: 58, rx: 36, ry: 31, side: 10, raised: 13, press: 6 } as const;

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

/** A unit's colours: its `fill` and darker `lip`, `ink` written on the fill, and `text`, the colour as words on the page. */
export interface UnitColours {
  fill: string;
  lip: string;
  ink: string;
  text: string;
}

/**
 * Each unit's own vivid colour, part of the road's art: its banner, the stop to do now and the bubble over it. Bright
 * with deep ink on the slate night, deep with white ink by day (saffron keeps a deep ink, since a yellow dark enough for
 * white words is brown). The apps read these (mobile coursemap/path.ts, web learn/path.css, tested against them).
 */
export const PATH_STOP_TONES: Record<'light' | 'dark', Record<UnitTone, UnitColours>> = {
  light: {
    meadow: { fill: '#118226', lip: '#036819', ink: '#ffffff', text: '#1e7729' },
    dusk: { fill: '#864ad2', lip: '#623e96', ink: '#ffffff', text: '#714ca6' },
    pine: { fill: '#007e6f', lip: '#006257', ink: '#ffffff', text: '#007066' },
    river: { fill: '#0073bd', lip: '#005b9a', ink: '#ffffff', text: '#006aaa' },
    rose: { fill: '#b2417f', lip: '#8a2b60', ink: '#ffffff', text: '#9b3b6e' },
    clay: { fill: '#b55000', lip: '#8d3800', ink: '#ffffff', text: '#9d4700' },
    pomegranate: { fill: '#bd4049', lip: '#932a33', ink: '#ffffff', text: '#a43a41' },
    saffron: { fill: '#c37902', lip: '#8f5d04', ink: '#241600', text: '#885703' },
  },
  dark: {
    meadow: { fill: '#72d577', lip: '#479c4d', ink: '#0b290e', text: '#72d577' },
    dusk: { fill: '#caa3ff', lip: '#9470cd', ink: '#261a3a', text: '#caa3ff' },
    pine: { fill: '#00dac8', lip: '#00a091', ink: '#002a25', text: '#00dac8' },
    river: { fill: '#3fc6ff', lip: '#0a8fd1', ink: '#00243b', text: '#3fc6ff' },
    rose: { fill: '#ff8cc9', lip: '#c35f92', ink: '#361426', text: '#ff8cc9' },
    clay: { fill: '#ff9c49', lip: '#c56c21', ink: '#371801', text: '#ff9c49' },
    pomegranate: { fill: '#ff8c8f', lip: '#cd5f62', ink: '#391415', text: '#ff8c8f' },
    saffron: { fill: '#e6b22d', lip: '#ac7d00', ink: '#2f1e00', text: '#e6b22d' },
  },
};

/**
 * What is not open yet: a flat slate puck a step off the page, its padlock in a lighter grey, and the line still
 * ahead. The apps read these too.
 */
export const PATH_REST: Record<'light' | 'dark', { fill: string; lip: string; ink: string; line: string }> = {
  light: { fill: '#dce3e7', lip: '#c2cdd3', ink: '#5f717a', line: 'rgba(23,36,43,0.16)' },
  dark: { fill: '#2e3c43', lip: '#222d33', ink: '#8a9ba3', line: 'rgba(238,243,245,0.16)' },
};

/** A puck's colours: face, side, and the highlight where the light falls on it (none on a flat locked one). */
interface Token {
  face: string;
  side: string;
  glint: string | null;
}

/** Every look's colours, by day and by evening. */
function tokenOf(look: PathStopLook, t: UnitColours, dark: boolean): Token {
  const rest = PATH_REST[dark ? 'dark' : 'light'];
  const slate: Token = { face: rest.fill, side: rest.lip, glint: null };
  const unit: Token = { face: t.fill, side: t.lip, glint: '#ffffff' };
  const gold: Token = { face: warm(VALLEY.gold, dark), side: warm(VALLEY.goldDark, dark), glint: '#fff6dc' };
  switch (look) {
    case 'done':
      return gold;
    case 'strong':
      return { face: warm('#f2b632', dark), side: warm('#a8691a', dark), glint: '#ffffff' };
    case 'refresh':
      return { face: mix(gold.face, slate.face, 0.3), side: mix(gold.side, slate.side, 0.3), glint: '#ffffff' };
    case 'current':
    case 'available':
    case 'review':
    case 'guide':
    case 'jump':
      return unit;
    // A chapter's story, open once every topic is done, is the chapter's prize, so it is gold.
    case 'story':
      return gold;
    default:
      return slate;
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
 * One stop, base or face: a round puck raised off the road, flat in its colour with one highlight, or flat slate while
 * it is shut. A skill's face has only its colour, and the app sets its glyph; the guide's book, story scroll and jump
 * gate are part of the face. A unit's chest (`chest`, `chestOpen`) is a painted sandûq standing on the road instead.
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
  const shade = dark ? '#05080a' : '#17242b';

  if (look === 'chest' || look === 'chestOpen') {
    const body = part === 'base' ? `<path d="${ellipsePath(cx + 2, cy + 27, 34, 7)}" fill="${shade}" fill-opacity="${dark ? 0.4 : 0.14}"/>` : sanduq(cx, cy + 4, look === 'chestOpen', dark);
    return wrap(prefix, size, B, body);
  }

  const side = look === 'current' ? PATH_STOP_ART.raised : look === 'jump' ? 8 : PATH_STOP_ART.side;
  const k = tokenOf(look, t, dark);

  if (part === 'base') {
    // Its shade on the road, then its side: the face extended down by `side`.
    let body = `<path d="${ellipsePath(cx + 3, cy + side + ry * 0.55, rx * 0.98, ry * 0.4)}" fill="${shade}" fill-opacity="${dark ? 0.36 : 0.12}"/>`;
    body += fill(`M${n(cx - rx)} ${n(cy)}L${n(cx - rx)} ${n(cy + side)}A${n(rx)} ${n(ry)} 0 0 0 ${n(cx + rx)} ${n(cy + side)}L${n(cx + rx)} ${n(cy)}Z${ellipsePath(cx, cy + side, rx, ry)}`, k.side);
    if (look === 'strong') body += stroke(`M${n(cx - rx - 2)} ${n(cy + side)}A${n(rx + 2)} ${n(ry + 2)} 0 0 0 ${n(cx + rx + 2)} ${n(cy + side)}`, warm('#f2b632', dark), 3);
    return wrap(prefix, size, B, body);
  }

  // The face: its colour, and one highlight where the light falls on its upper left.
  let body = '';
  if (look === 'strong') body += fill(ellipsePath(cx, cy, rx + 3, ry + 3), warm('#ffd96a', dark));
  body += fill(ellipsePath(cx, cy, rx, ry), k.face);
  if (k.glint) {
    body += `<path d="M${n(cx - rx * 0.78)} ${n(cy - ry * 0.12)}C${n(cx - rx * 0.78)} ${n(cy - ry * 0.7)} ${n(cx - rx * 0.3)} ${n(cy - ry * 0.92)} ${n(cx + rx * 0.08)} ${n(cy - ry * 0.86)}C${n(cx - rx * 0.32)} ${n(cy - ry * 0.7)} ${n(cx - rx * 0.6)} ${n(cy - ry * 0.46)} ${n(cx - rx * 0.78)} ${n(cy - ry * 0.12)}Z" fill="${k.glint}" fill-opacity="${dark ? 0.28 : 0.32}"/>`;
  }
  if (look === 'guide' || look === 'guideLocked') body += book(cx, cy - 2, look === 'guide' ? t : { fill: PATH_REST[scheme].ink, lip: PATH_REST[scheme].lip }, dark);
  if (look === 'story') body += scroll(cx, cy - 2, dark, false);
  if (look === 'storyLocked') body += scroll(cx, cy - 2, dark, true);
  if (look === 'jump') body += gate(cx, cy + 2, dark);
  return wrap(prefix, size, B, body);
}

export interface PathChestOptions {
  /** Thrown open on its gold, once its unit is done. */
  open?: boolean;
  dark?: boolean;
  /** Display size in points; the drawing is `PATH_STOP_ART.box` square. */
  size?: number;
  idPrefix?: string;
}

/** A unit's painted sandûq on its own, with its shadow, for beside the road: shut while the unit is ahead, open on gold once it is done. */
export function pathChestSvg(opts: PathChestOptions = {}): string {
  const { open = false, dark = false } = opts;
  const size = opts.size ?? PATH_STOP_ART.box;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const { box: B, cx, cy } = PATH_STOP_ART;
  const shade = dark ? '#05080a' : '#17242b';
  const body = `<path d="${ellipsePath(cx + 2, cy + 31, 34, 7)}" fill="${shade}" fill-opacity="${dark ? 0.4 : 0.14}"/>${sanduq(cx, cy + 4, open, dark)}`;
  return wrap(prefixFor(opts.idPrefix, 'chest', open, dark), size, B, body);
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
 * A unit's prize: a sandûq, the painted wooden dowry chest, wrapped round its middle in a strip of kilim with madder
 * ground, cream lozenges and indigo eyes, brass at its corners and its lock. Open, the lid is thrown back on gold.
 */
function sanduq(x: number, y: number, open: boolean, dark: boolean): string {
  const c = (hex: string): string => dusk(hex, dark, 0.2);
  const wood = { lid: c('#bd7639'), lidLight: c('#d4904f'), body: c('#a8642f'), shade: c('#83491f'), seam: c('#5e3318') };
  const brass = warm('#e2b24a', dark);
  const madder = c('#b8323a');
  let out = '';
  if (open) {
    // The lid thrown back, its inside toward us, with the kilim strip running over it.
    out += fill(`M${n(x - 31)} ${n(y - 5)}L${n(x - 27)} ${n(y - 30)}Q${n(x)} ${n(y - 37)} ${n(x + 27)} ${n(y - 30)}L${n(x + 31)} ${n(y - 5)}Z`, wood.shade);
    out += fill(`M${n(x - 7)} ${n(y - 5)}L${n(x - 6)} ${n(y - 34)}h12L${n(x + 7)} ${n(y - 5)}Z`, madder);
    // The mouth, and the gold heaped in it, catching the light.
    out += fill(`M${n(x - 31)} ${n(y - 5)}Q${n(x)} ${n(y - 13)} ${n(x + 31)} ${n(y - 5)}Z`, c('#4a2812'));
    out += fill(ellipsePath(x - 12, y - 7, 9, 4) + ellipsePath(x + 3, y - 9, 11, 5) + ellipsePath(x + 17, y - 6, 8, 3.5), warm(VALLEY.gold, dark));
    out += fill(ellipsePath(x + 1, y - 11, 4, 1.8) + ellipsePath(x - 13, y - 9, 3, 1.4), warm(VALLEY.goldLight, dark));
  }
  // The body, its foot in shade and a plank line along it.
  out += fill(`M${n(x - 32)} ${n(y - 5)}h64v23a4 4 0 0 1 -4 4h-56a4 4 0 0 1 -4 -4Z`, wood.body);
  out += fill(`M${n(x - 32)} ${n(y + 14)}h64v4a4 4 0 0 1 -4 4h-56a4 4 0 0 1 -4 -4Z`, wood.shade);
  out += stroke(`M${n(x - 30)} ${n(y + 5)}h60`, wood.seam, 1.2);
  if (!open) {
    // The barrel lid, lit along its crown.
    out += fill(`M${n(x - 32)} ${n(y - 5)}V${n(y - 12)}C${n(x - 32)} ${n(y - 23)} ${n(x + 32)} ${n(y - 23)} ${n(x + 32)} ${n(y - 12)}V${n(y - 5)}Z`, wood.lid);
    out += fill(`M${n(x - 27)} ${n(y - 15)}C${n(x - 22)} ${n(y - 21)} ${n(x + 22)} ${n(y - 21)} ${n(x + 27)} ${n(y - 15)}C${n(x + 18)} ${n(y - 18)} ${n(x - 18)} ${n(y - 18)} ${n(x - 27)} ${n(y - 15)}Z`, wood.lidLight);
  }
  out += stroke(`M${n(x - 32)} ${n(y - 5)}h64`, wood.seam, 1.6);
  // The kilim strip round its middle: madder ground, cream edges, a lozenge with an indigo eye on each face.
  const top = open ? y - 5 : y - 20;
  out += fill(`M${n(x - 7)} ${n(top)}h14V${n(y + 22)}h-14Z`, madder);
  out += stroke(`M${n(x - 5.5)} ${n(top + 1)}V${n(y + 21)}M${n(x + 5.5)} ${n(top + 1)}V${n(y + 21)}`, c('#f3e1b5'), 1);
  const marks = (open ? [y + 4, y + 14] : [y - 12, y + 4, y + 14]).map((my) => ({ p: [x, my] as [number, number], angle: 0 }));
  out += kilimAlong(marks, 7, c('#f3e1b5'), c(VALLEY.indigo));
  // Brass at the foot's corners, and the lock on the strip at the seam.
  out += fill(`M${n(x - 32)} ${n(y + 14)}h7v8h-3a4 4 0 0 1 -4 -4ZM${n(x + 32)} ${n(y + 14)}h-7v8h3a4 4 0 0 0 4 -4Z`, brass);
  if (!open) {
    out += fill(`M${n(x - 5)} ${n(y - 8)}h10v9a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2Z`, brass);
    out += fill(`${ellipsePath(x, y - 4.5, 1.6, 1.6)}M${n(x - 0.8)} ${n(y - 4)}h1.6v3h-1.6Z`, wood.seam);
  } else {
    // Two glints over the gold.
    out += fill(sparkle(x - 18, y - 22, 4) + sparkle(x + 21, y - 17, 3), warm('#fff6dc', dark));
  }
  return out;
}

/** A four-pointed glint. */
function sparkle(x: number, y: number, r: number): string {
  const k = r * 0.28;
  return `M${n(x)} ${n(y - r)}Q${n(x + k)} ${n(y - k)} ${n(x + r)} ${n(y)}Q${n(x + k)} ${n(y + k)} ${n(x)} ${n(y + r)}Q${n(x - k)} ${n(y + k)} ${n(x - r)} ${n(y)}Q${n(x - k)} ${n(y - k)} ${n(x)} ${n(y - r)}Z`;
}

// ───────────────────────────────────────────────────────────── the kilim trim

export interface PathKilimOptions {
  /** Width and height in points; the band repeats its motif along the width. */
  width: number;
  height: number;
  /** The motif's colour and its lozenges' eyes, from the unit's own colours. */
  ink: string;
  eye: string;
  idPrefix?: string;
}

/**
 * The kilim trim along a unit's banner: a woven band of lozenges with eyes, beads between them and a sawtooth along each
 * edge, as on a Kurdish kilim's border, in the unit's own colours so it reads as woven into the banner. Decorative.
 */
export function pathKilimSvg(opts: PathKilimOptions): string {
  const { width: w, height: h, ink, eye } = opts;
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) throw new RangeError(`art: kilim needs a positive size, got ${String(w)} × ${String(h)}`);
  const mid = h / 2;
  const step = h * 1.6;
  const count = Math.max(1, Math.floor(w / step));
  const gap = w / count;
  const marks = Array.from({ length: count }, (_, i) => ({ p: [gap * (i + 0.5), mid] as [number, number], angle: 0 }));
  // The sawtooth along both edges, a tooth for each half step.
  const tooth = gap / 2;
  let teeth = '';
  for (let x = 0; x < w - 0.5; x += tooth) {
    teeth += `M${n(x)} 0L${n(x + tooth / 2)} ${n(h * 0.16)}L${n(x + tooth)} 0ZM${n(x)} ${n(h)}L${n(x + tooth / 2)} ${n(h * 0.84)}L${n(x + tooth)} ${n(h)}Z`;
  }
  const body = `<path d="${teeth}" fill="${ink}"/>${kilimAlong(marks, h * 0.56, ink, eye)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(w)}" height="${n2(h)}" viewBox="0 0 ${n2(w)} ${n2(h)}" aria-hidden="true" focusable="false" id="${prefixFor(opts.idPrefix, 'kilim', w, h)}">${body}</svg>`;
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

