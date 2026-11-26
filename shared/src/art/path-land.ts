/**
 * The lesson path's drawings in the painted valley style (valley.ts): the colours of each unit's land for its landmark,
 * each unit's own vivid colour (`PATH_STOP_TONES`), the stops as tiles with a base and a face a press pushes down
 * (`pathStopSvg`; the app sets a skill's glyph), each unit's milestone (`pathMilestoneSvg`), its painted sandûq in parts
 * that open (`pathChestSvg`), and the signpost while the next unit is being made (`pathSignpostSvg`). Chapter landmarks
 * are in path-landmark.ts.
 */
import type { UnitTone } from '../lesson-path.js';
import type { PathGround } from '../path-world.js';
import { roadLight } from './light.js';
import { CANVAS, mix, n, n2, prefixFor, seeded, type Pt } from './svg.js';
import { kilimAlong } from './paint.js';
import { VALLEY, dusk, ellipsePath, fill, smoothPath, stroke, warm } from './valley.js';

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
 * A stop's picture: `box` points square with the face's middle at (`cx`, `cy`). The face is a tile `rx` × `ry`, a
 * rounded square seen from above the road, standing `side` high on its darker side (`raised` for the stop to do now, and
 * `stone` for a shut one, which lies lower); `press` is how far the face sinks under a finger.
 */
export const PATH_STOP_ART = { box: 112, cx: 56, cy: 58, rx: 36, ry: 30, side: 13, raised: 17, stone: 8, press: 6 } as const;

/** How far round a tile's corners are: how far along each side its curve keeps straight, 0.55 for an ellipse, 1 for a square. */
const TILE_ROUND = 0.8;

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
 * What is not open yet: a quiet slate stone lying low on the road, its padlock in a lighter grey, and the line still
 * ahead. The apps read these too.
 */
export const PATH_REST: Record<'light' | 'dark', { fill: string; lip: string; ink: string; line: string }> = {
  light: { fill: '#dce3e7', lip: '#c2cdd3', ink: '#5f717a', line: 'rgba(23,36,43,0.16)' },
  dark: { fill: '#2e3c43', lip: '#222d33', ink: '#8a9ba3', line: 'rgba(238,243,245,0.16)' },
};

/**
 * Finished gold, the same in every chapter: its face, side and the light along its edge, and the ink a number or a mark
 * is written in on it. The apps read these for what they draw on gold.
 */
export const PATH_GOLD: Record<'light' | 'dark', { face: string; side: string; light: string; ink: string; star: string; starEdge: string }> = {
  light: { face: VALLEY.gold, side: VALLEY.goldDark, light: VALLEY.goldLight, ink: '#4a2c0c', star: '#fffaf0', starEdge: '#a8691a' },
  dark: { face: '#e1a33c', side: '#b07421', light: '#f0cf8f', ink: '#3f2508', star: '#fffaf0', starEdge: '#a8691a' },
};

/** A tile's colours: face, side, and the light along its upper edge (none on a flat shut stone). */
interface Token {
  face: string;
  side: string;
  light: string | null;
}

/** Every look's colours, by day and by evening. */
function tokenOf(look: PathStopLook, t: UnitColours, dark: boolean): Token {
  const rest = PATH_REST[dark ? 'dark' : 'light'];
  const slate: Token = { face: rest.fill, side: rest.lip, light: null };
  const unit: Token = { face: t.fill, side: t.lip, light: mix(t.fill, '#ffffff', dark ? 0.42 : 0.3) };
  const g = PATH_GOLD[dark ? 'dark' : 'light'];
  const gold: Token = { face: g.face, side: g.side, light: g.light };
  switch (look) {
    // A chapter's story, open once every topic is done, is the chapter's prize, so it is gold.
    case 'story':
      return gold;
    case 'strong':
      return { face: warm('#f2b632', dark), side: warm('#a8691a', dark), light: warm('#ffe39a', dark) };
    // A finished topic keeps its unit's tile under its wax (`pathWaxSvg`), faded a little when a refresh would help.
    case 'refresh':
      return { face: mix(t.fill, slate.face, 0.35), side: mix(t.lip, slate.side, 0.35), light: mix(unit.light!, slate.face, 0.35) };
    case 'done':
    case 'current':
    case 'available':
    case 'review':
    case 'guide':
    case 'jump':
      return unit;
    default:
      return slate;
  }
}

/** A tile's outline: a rounded square seen from above, from its top middle round clockwise, its corners eased by `k`. */
export function tilePath(cx: number, cy: number, rx: number, ry: number, k: number = TILE_ROUND): string {
  const [l, r, t, b] = [cx - rx, cx + rx, cy - ry, cy + ry];
  return (
    `M${n(cx)} ${n(t)}C${n(cx + k * rx)} ${n(t)} ${n(r)} ${n(cy - k * ry)} ${n(r)} ${n(cy)}` +
    `C${n(r)} ${n(cy + k * ry)} ${n(cx + k * rx)} ${n(b)} ${n(cx)} ${n(b)}` +
    `C${n(cx - k * rx)} ${n(b)} ${n(l)} ${n(cy + k * ry)} ${n(l)} ${n(cy)}` +
    `C${n(l)} ${n(cy - k * ry)} ${n(cx - k * rx)} ${n(t)} ${n(cx)} ${n(t)}Z`
  );
}

/** A slate stone's outline, the same hand-cut stone every time: rounder and a little lopsided, never a tile. */
function stonePoints(cx: number, cy: number, rx: number, ry: number): Pt[] {
  const at: ReadonlyArray<readonly [number, number]> = [
    [-0.06, -1],
    [0.58, -0.94],
    [0.97, -0.34],
    [0.95, 0.42],
    [0.5, 0.96],
    [-0.3, 1],
    [-0.88, 0.58],
    [-1, -0.16],
    [-0.66, -0.84],
  ];
  return at.map(([x, y]) => [cx + x * rx, cy + y * ry] as const);
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
 * One stop, base or face. An open stop is a thick tile in its unit's colour, a rounded square seen from above the road on
 * its darker side, with one line of light along its upper edge; the app sets its glyph. A finished one is the same tile,
 * which the app seals in wax (`pathWaxSvg`). A shut one is a quiet slate stone lying low, not yet laid as a tile. The
 * guide's book, story scroll and jump gate are part of the face; a unit's chest (`chest`, `chestOpen`) is its painted
 * sandûq standing on the road instead.
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
    const body = part === 'base' ? `<path d="${ellipsePath(cx + 4, cy + 26, 36, 7)}" fill="${shade}" fill-opacity="${dark ? 0.4 : 0.14}"/>` : sanduq(cx, cy, look === 'chestOpen', dark, 'whole');
    return wrap(prefix, size, B, body);
  }

  const k = tokenOf(look, t, dark);
  const stone = look === 'locked' || look === 'guideLocked' || look === 'storyLocked';
  const side = stone ? PATH_STOP_ART.stone : look === 'current' ? PATH_STOP_ART.raised : look === 'jump' ? 9 : PATH_STOP_ART.side;
  const outline = (y: number): string => (stone ? smoothPath(stonePoints(cx, y + 2, rx - 1, ry - 3), true) : tilePath(cx, y, rx, ry));

  if (part === 'base') {
    // Its shade on the road, falling to the lower right, then its side: the face swept down by `side`.
    let body = `<path d="${ellipsePath(cx + 5, cy + side + ry * 0.5, rx * 0.98, ry * 0.42)}" fill="${shade}" fill-opacity="${dark ? 0.38 : 0.13}"/>`;
    if (stone) body += fill([side / 3, (2 * side) / 3, side].map((dy) => outline(cy + dy)).join(''), k.side);
    else body += fill(`${tilePath(cx, cy + side, rx, ry)}M${n(cx - rx)} ${n(cy)}H${n(cx + rx)}V${n(cy + side)}H${n(cx - rx)}Z`, k.side);
    if (look === 'strong') body += stroke(`M${n(cx - rx - 2)} ${n(cy + 2)}V${n(cy + side)}`, warm('#ffd96a', dark), 2.4) + stroke(`M${n(cx + rx + 2)} ${n(cy + 2)}V${n(cy + side)}`, warm('#ffd96a', dark), 2.4);
    return wrap(prefix, size, B, body);
  }

  // The face: its colour, and one line of light along its upper left edge, cut by laying the face over the light a
  // little down and right, inside the face's own outline.
  const face = outline(cy);
  let defs = '';
  let body = '';
  if (look === 'strong') body += fill(tilePath(cx, cy, rx + 3, ry + 3), warm('#ffd96a', dark));
  if (k.light) {
    const clip = `${prefix}f`;
    defs += `<clipPath id="${clip}"><path d="${face}"/></clipPath>`;
    body += fill(face, k.light) + `<g clip-path="url(#${clip})">${fill(tilePath(cx + 2.6, cy + 3, rx, ry), k.face)}</g>`;
  } else {
    body += fill(face, k.face);
  }
  if (look === 'guide' || look === 'guideLocked') body += book(cx, cy - 2, look === 'guide' ? t : { fill: PATH_REST[scheme].ink, lip: PATH_REST[scheme].lip }, dark);
  if (look === 'story') body += scroll(cx, cy - 2, dark, false);
  if (look === 'storyLocked') body += scroll(cx, cy - 2, dark, true);
  if (look === 'jump') body += gate(cx, cy + 2, dark);
  return wrap(prefix, size, B, (defs ? `<defs>${defs}</defs>` : '') + body);
}

/**
 * A finished tile's wax seal, in the stop's points: the kilim diamond pressed into the wax, its middle at (`cx`, `cy`) and
 * `w` and `h` from it to its points, high enough on the face to leave the near edge to the topic's stars (shared
 * `roundStars`).
 */
export const PATH_WAX_SEAL = { cx: 36, cy: 27, w: 25, h: 16.5 } as const;

/** The wax for a unit: a deeper, richer tone of its own colour, or gold once a topic has all three stars; its face, its edge's thickness and its light. */
export function pathWaxColours(tone: UnitTone, dark: boolean, gold = false): { face: string; edge: string; light: string } {
  const scheme = dark ? 'dark' : 'light';
  if (gold) {
    const g = PATH_GOLD[scheme];
    // Shiny: its light much brighter than a unit's wax.
    return { face: g.face, edge: g.side, light: dark ? '#fff5d6' : '#fff3cc' };
  }
  const t = PATH_STOP_TONES[scheme][tone];
  if (!t) throw new RangeError(`art: no unit tone ${String(tone)}`);
  return dark
    ? { face: mix(t.fill, t.lip, 0.62), edge: mix(t.lip, '#000000', 0.38), light: mix(t.fill, '#ffffff', 0.4) }
    : { face: mix(t.fill, t.lip, 0.55), edge: mix(t.lip, '#000000', 0.32), light: mix(t.fill, '#ffffff', 0.34) };
}

export interface PathWaxOptions {
  /** The unit whose colour the wax is a deeper tone of. */
  tone: UnitTone;
  /** The stop it is on: the pour's own lip and drips. */
  seed?: string;
  /** Gold wax, for a topic with all three stars. */
  gold?: boolean;
  /** Dulled and a touch matte, where a refresh would help. */
  worn?: boolean;
  /**
   * The whole waxed tile; or, for its moment, the poured wax alone, the seal pressed into it alone, or the drop of wax
   * that falls onto the tile first.
   */
  part?: 'whole' | 'pour' | 'seal' | 'blob';
  dark?: boolean;
  /** Display size in points; the drawing is `PATH_STOP_ART.box` square, laid as the tile is. */
  size?: number;
  idPrefix?: string;
}

/**
 * A finished tile sealed in wax, on the tile's own canvas: the whole tile coated, its wax poured over the face and run a
 * little past its far edge and sides in an uneven lip, its side a shade darker, one or two drips from its foot onto the
 * road, differently on every stop; glossy, its top lit in a band along its upper left edge. Pressed into it, large, a Kurdish kilim diamond: a
 * raised rim round a sunken field, an eye standing up in the middle and a hook from each side point. Each form has one
 * light and one shade. A deeper tone of the unit's colour, or gold; dulled toward slate, its light nearly gone, where a
 * refresh would help.
 */
export function pathWaxSvg(opts: PathWaxOptions): string {
  const { tone, dark = false, gold = false, worn = false } = opts;
  const part = opts.part ?? 'whole';
  if (!['whole', 'pour', 'seal', 'blob'].includes(part)) throw new RangeError(`art: no wax part ${String(part)}`);
  const size = opts.size ?? PATH_STOP_ART.box;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const { box: B, cx, cy, rx, ry, side } = PATH_STOP_ART;
  const prefix = prefixFor(opts.idPrefix, 'wax', tone, opts.seed, gold, worn, part, dark);
  const own = pathWaxColours(tone, dark, gold);
  const dull = (hex: string): string => mix(hex, PATH_REST[dark ? 'dark' : 'light'].lip, 0.3);
  const wax = worn ? { face: dull(own.face), edge: dull(own.edge), light: dull(mix(own.light, own.face, 0.65)) } : own;
  let defs = '';
  // A form lit along its upper left edge: its outline in `top`, the same outline a little down and right over it in
  // `face`, inside its own outline.
  const lit = (d: string, top: string, face: string, dx: number, dy: number): string => {
    const id = `${prefix}${defs.length}`;
    defs += `<clipPath id="${id}"><path d="${d}"/></clipPath>`;
    return fill(d, top) + `<g clip-path="url(#${id})"><path d="${d}" transform="translate(${dx} ${dy})" fill="${face}"/></g>`;
  };
  const wrapIt = (body: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${B} ${B}" ` +
    `aria-hidden="true" focusable="false" id="${prefix}">` +
    `${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;

  if (part === 'blob') {
    // A big drop, round below and drawn up to a point above as it falls, its thickness under it.
    const p = (dx: number, dy: number): string => `${n(cx + dx)} ${n(cy + dy)}`;
    const drop =
      `M${p(0, -20)}C${p(5, -12)} ${p(13, -6)} ${p(13, 2)}C${p(13, 10)} ${p(7, 14)} ${p(0, 14)}` +
      `C${p(-7, 14)} ${p(-13, 10)} ${p(-13, 2)}C${p(-13, -6)} ${p(-5, -12)} ${p(0, -20)}Z`;
    return wrapIt(lit(drop, wax.light, wax.face, 2, 2.4) + `<path d="${drop}" fill="none" stroke="${wax.edge}" stroke-width="1.2"/>`);
  }

  let body = '';
  if (part !== 'seal') {
    const rand = seeded(`wax|${opts.seed ?? ''}`);
    // The pour: the face's rounded square, run out past it a little everywhere and to a lip or two along its far edge
    // and sides.
    const lips = Array.from({ length: 2 + Math.floor(rand() * 2) }, () => ({
      at: -Math.PI * (0.02 + rand() * 0.96),
      out: 1.8 + rand() * 1.6,
      wide: 0.2 + rand() * 0.16,
    }));
    const phase = rand() * Math.PI * 2;
    const round = (v: number): number => Math.sign(v) * Math.abs(v) ** (2 / 3.1);
    const outline = smoothPath(
      Array.from({ length: 56 }, (_, i): Pt => {
        const a = (i / 56) * Math.PI * 2 - Math.PI;
        const [u, v] = [Math.cos(a), Math.sin(a)];
        let out = 1.2 + 0.22 * Math.sin(5 * a + phase) + (rand() - 0.5) * 0.2;
        for (const l of lips) out += l.out * Math.exp(-((Math.atan2(Math.sin(a - l.at), Math.cos(a - l.at)) / l.wide) ** 2));
        return [cx + round(u) * rx + u * out, cy + round(v) * ry + v * out];
      }),
      true,
    );
    // Drips from its foot onto the road: one, or two apart.
    const drips = [rand() * 44 - 22];
    if (rand() < 0.6) drips.push(drips[0]! + (drips[0]! < 0 ? 1 : -1) * (14 + rand() * 12));
    const foot = cy + ry + side - 1;
    const dripPath = drips
      .map((dx) => {
        const [x, w, l] = [cx + dx, 2 + rand() * 1.2, 2 + rand() * 3.5];
        const p = (dx: number, dy: number): string => `${n(x + dx)} ${n(foot + dy)}`;
        return (
          `M${p(-w - 1.5, 0)}C${p(-w, 0.6)} ${p(-w, l * 0.5)} ${p(-w * 0.8, l)}` +
          `C${p(-w * 0.6, l + w * 1.3)} ${p(w * 0.6, l + w * 1.3)} ${p(w * 0.8, l)}` +
          `C${p(w, l * 0.5)} ${p(w, 0.6)} ${p(w + 1.5, 0)}Z`
        );
      })
      .join('');
    // The whole tile coated, its side a shade darker: the pour swept down by the tile's height, and the drips below.
    const swept = [0.25, 0.5, 0.75, 1].map((k) => `<path d="${outline}" transform="translate(0 ${n(side * k)})"/>`).join('');
    body += `<g fill="${wax.edge}">${swept}<path d="${dripPath}"/></g>`;
    // Its glossy top, lit in a band along its upper left edge.
    body += lit(outline, wax.light, wax.face, 2.6, 3.2);
  }
  if (part !== 'pour') {
    // The seal, laid from the stop's points onto the tile's canvas.
    const [mx, my] = [PATH_WAX_SEAL.cx + cx - 36, PATH_WAX_SEAL.cy + cy - 30];
    const { w, h } = PATH_WAX_SEAL;
    const diamond = (a: number, b: number): string => `M${n(mx)} ${n(my - b)}L${n(mx + a)} ${n(my)}L${n(mx)} ${n(my + b)}L${n(mx - a)} ${n(my)}Z`;
    const field = diamond(w - 4.6, h - 3.1);
    const rim = diamond(w, h) + field;
    const eye = diamond(7.6, 5.2) + diamond(3.4, 2.4);
    // A hook from each side point: an arm out along the middle, turned up at its end.
    const hook = (sgn: 1 | -1): string => {
      const x0 = mx + sgn * (w - 1);
      const x1 = mx + sgn * (w + 4.2);
      return `M${n(x0)} ${n(my - 1.2)}H${n(x1)}V${n(my - 4.4)}H${n(x1 + sgn * 2.4)}V${n(my + 1.2)}H${n(x0)}Z`;
    };
    const raised = (dx: number, dy: number, colour: string): string =>
      `<g transform="translate(${dx} ${dy})" fill="${colour}"><path d="${rim}${eye}" fill-rule="evenodd"/><path d="${hook(1)}${hook(-1)}"/></g>`;
    // The field sunk a shade below the wax; the rim, eye and hooks standing up from it, lit above and shaded below.
    body += fill(field, mix(wax.face, wax.edge, 0.45)) + raised(1, 1.2, wax.edge) + raised(-0.8, -0.9, wax.light) + raised(0, 0, wax.face);
  }
  return wrapIt(body);
}

/**
 * Where the stamp stands over a stop's 72-point button as it presses (`x`, `y`, its canvas `w` × `h`): its brass face
 * across the whole tile, its foot over the face's middle.
 */
export const PATH_STAMP_TOOL = { w: 80, h: 64, x: -4, y: -22 } as const;

/**
 * The stamp itself, for the moment a finished tile is sealed: a wide brass plate on a turned wooden handle, seen from
 * the side, its face down, as wide as a tile. On its own `PATH_STAMP_TOOL` canvas, its face along the bottom.
 */
export function pathStampToolSvg(opts: { dark?: boolean; size?: number; idPrefix?: string } = {}): string {
  const { dark = false } = opts;
  const { w: W, h: H } = PATH_STAMP_TOOL;
  const size = opts.size ?? W;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const c = (hex: string): string => dusk(hex, dark, 0.12);
  const g = PATH_GOLD[dark ? 'dark' : 'light'];
  let body = fill('M34 30C34 25 36 22 40 22C44 22 46 25 46 30V41H34Z', c('#8a5428'));
  body += fill('M40 22C44 22 46 25 46 30V41H42V30C42 26 41 23.5 40 22Z', c('#5e3518'));
  body += fill(ellipsePath(40, 13, 10, 10.5), c('#b8773e'));
  body += fill('M40 2.5C45.5 2.5 50 7 50 13C50 17.5 47.8 21 44.5 22.6C46.8 18.6 47.2 9.6 40 2.5Z', c('#8a5428'));
  body += fill(ellipsePath(36.2, 9.6, 2.8, 3.4), c('#d39457'));
  body += fill('M30 41H50L54 46H26Z', g.side);
  body += fill('M6 46H74Q78 46 78 50V56Q78 59 75 59H5Q2 59 2 56V50Q2 46 6 46Z', g.face) + fill('M66 46H74Q78 46 78 50V56Q78 59 75 59H66Z', g.side);
  body += fill('M1 59H79V62Q79 63 78 63H2Q1 63 1 62Z', g.side);
  const id = prefixFor(opts.idPrefix, 'stamp-tool', dark);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2((size * H) / W)}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false" id="${id}">${body}</svg>`;
}

// ───────────────────────────────────────────────────────────── the milestone

/**
 * A unit's last stop, its milestone: a pomegranate seal standing on a carved stone drum, in a box `w` × `h` laid over the
 * stop's button from (`x`, `y`) in the button's points, the seal's middle at (`cx`, `cy`) in the box, where the app writes
 * the unit's number. It stands lower than a tile, so its crown keeps clear of the stop before it.
 */
export const PATH_MILESTONE_ART = { w: 112, h: 136, x: -20, y: -16, cx: 56, cy: 58, r: 33 } as const;

export interface PathMilestoneOptions {
  /** Won: its chapter is done, and the seal is gold; otherwise it is slate, waiting. */
  won: boolean;
  /** The base (its shade and the drum it stands on), or the seal a press pushes down. */
  part: 'base' | 'face';
  dark?: boolean;
  /** Display width in points; the drawing is `PATH_MILESTONE_ART.w` wide and keeps its shape. */
  size?: number;
  idPrefix?: string;
}

/**
 * The milestone: a round seal with a pomegranate's crown, thick enough to stand, on a short drum of cut stone, the
 * chapter's own great stamp. Slate until its chapter is done, then gold. The app writes the chapter's number on it.
 */
export function pathMilestoneSvg(opts: PathMilestoneOptions): string {
  const { won, part, dark = false } = opts;
  const { w: W, h: H, cx, cy, r } = PATH_MILESTONE_ART;
  const size = opts.size ?? W;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const prefix = prefixFor(opts.idPrefix, 'milestone', won, part, dark);
  const shade = dark ? '#05080a' : '#17242b';
  const rest = PATH_REST[dark ? 'dark' : 'light'];
  const g = PATH_GOLD[dark ? 'dark' : 'light'];
  const k: Token = won ? { face: g.face, side: g.side, light: g.light } : { face: rest.fill, side: rest.lip, light: null };
  const stoneC = dark ? { top: '#6d6a62', face: '#57544d', side: '#413f3a' } : { top: '#e8e0cd', face: '#cdbf9f', side: '#a8987a' };
  // The seal's outline: its round body, a short neck and the pomegranate's three-pointed crown.
  const crown = (dx: number, dy: number): string => {
    const p = (x: number, y: number): string => `${n(cx + dx + x)} ${n(cy + dy + y)}`;
    return `M${p(-11, -r + 4)}L${p(-17, -r - 9)}Q${p(-16, -r - 13)} ${p(-12, -r - 11.5)}L${p(-6, -r - 6.5)}L${p(-2.4, -r - 14.5)}Q${p(0, -r - 18)} ${p(2.4, -r - 14.5)}L${p(6, -r - 6.5)}L${p(12, -r - 11.5)}Q${p(16, -r - 13)} ${p(17, -r - 9)}L${p(11, -r + 4)}Z`;
  };
  const seal = (dx: number, dy: number): string => ellipsePath(cx + dx, cy + dy, r, r) + crown(dx, dy);
  const drum = { top: cy + r - 1, rx: 33, ry: 8, h: 21 };

  if (part === 'base') {
    let body = `<path d="${ellipsePath(cx + 6, drum.top + drum.h + 5, 40, 8)}" fill="${shade}" fill-opacity="${dark ? 0.4 : 0.14}"/>`;
    // The drum: its front lit, its foot a step darker, its top the lightest, as cut stone in the road's light.
    body += fill(`M${n(cx - drum.rx)} ${n(drum.top)}V${n(drum.top + drum.h)}A${drum.rx} ${drum.ry} 0 0 0 ${n(cx + drum.rx)} ${n(drum.top + drum.h)}V${n(drum.top)}Z`, stoneC.face);
    body += fill(`M${n(cx - drum.rx)} ${n(drum.top + drum.h - 5)}V${n(drum.top + drum.h)}A${drum.rx} ${drum.ry} 0 0 0 ${n(cx + drum.rx)} ${n(drum.top + drum.h)}V${n(drum.top + drum.h - 5)}A${drum.rx} ${drum.ry} 0 0 1 ${n(cx - drum.rx)} ${n(drum.top + drum.h - 5)}Z`, stoneC.side);
    body += fill(ellipsePath(cx, drum.top, drum.rx, drum.ry), stoneC.top);
    // A cut line round the drum's shoulder, where the light leaves its top.
    body += stroke(`M${n(cx - drum.rx + 1)} ${n(drum.top + 3.5)}A${drum.rx - 1} ${drum.ry} 0 0 0 ${n(cx + drum.rx - 1)} ${n(drum.top + 3.5)}`, stoneC.side, 1.2);
    // The seal's thickness, standing on the drum: the same round a little down and right, in its side colour.
    body += fill(seal(3.5, 4.5), k.side);
    return wrapBox(prefix, size, W, H, body);
  }

  const face = seal(0, 0);
  let defs = '';
  let body = '';
  if (k.light) {
    const clip = `${prefix}f`;
    defs += `<clipPath id="${clip}"><path d="${face}"/></clipPath>`;
    body += fill(face, k.light) + `<g clip-path="url(#${clip})">${fill(seal(2.6, 3), k.face)}</g>`;
  } else {
    body += fill(face, k.face);
  }
  // A seal's rim, cut a step darker just inside its edge, with a row of seeds round the crown's foot.
  body += stroke(ellipsePath(cx, cy, r - 5.5, r - 5.5), k.side, 2.2);
  body += fill(ellipsePath(cx - 5, cy - r + 1.5, 1.6, 1.6) + ellipsePath(cx, cy - r + 0.5, 1.6, 1.6) + ellipsePath(cx + 5, cy - r + 1.5, 1.6, 1.6), k.side);
  return wrapBox(prefix, size, W, H, (defs ? `<defs>${defs}</defs>` : '') + body);
}

// ───────────────────────────────────────────────────────────── the sandûq

/** The sandûq's parts, for an app that opens it: its body, its shut lid, and the open lid with the gold heaped inside. */
export const PATH_CHEST_PARTS = ['whole', 'body', 'lid', 'open'] as const;
export type PathChestPart = (typeof PATH_CHEST_PARTS)[number];

/** Where the lid turns, on the chest's 112-point canvas: its back edge, which a lifting lid pivots on. */
export const PATH_CHEST_HINGE = { x: 36, y: 47 } as const;

export interface PathChestOptions {
  /** Thrown open on its gold, once its unit is done. */
  open?: boolean;
  /** One part alone, laid over the others by an app that moves them; the whole chest by default. */
  part?: PathChestPart;
  dark?: boolean;
  /** Display size in points; the drawing is `PATH_STOP_ART.box` square. */
  size?: number;
  idPrefix?: string;
}

/** A unit's painted sandûq on its own, with its shadow, for beside the road: shut while the unit is ahead, open on gold once it is done. */
export function pathChestSvg(opts: PathChestOptions = {}): string {
  const { open = false, dark = false } = opts;
  const part = opts.part ?? 'whole';
  if (!(PATH_CHEST_PARTS as readonly string[]).includes(part)) throw new RangeError(`art: no chest part ${String(part)}`);
  const size = opts.size ?? PATH_STOP_ART.box;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const { box: B, cx, cy } = PATH_STOP_ART;
  const shade = dark ? '#05080a' : '#17242b';
  const ground = part === 'whole' || part === 'body' ? `<path d="${ellipsePath(cx + 5, cy + 27, 38, 7)}" fill="${shade}" fill-opacity="${dark ? 0.4 : 0.14}"/>` : '';
  return wrap(prefixFor(opts.idPrefix, 'chest', open, part, dark), size, B, ground + sanduq(cx, cy, open, dark, part));
}

/** A gold coin from the sandûq, on its own 24-point square, for the apps to toss out of it as it opens. */
export function pathCoinSvg(opts: { dark?: boolean; size?: number; idPrefix?: string } = {}): string {
  const { dark = false } = opts;
  const size = opts.size ?? 24;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const g = PATH_GOLD[dark ? 'dark' : 'light'];
  const body = fill(ellipsePath(12.8, 12.8, 9, 9), g.side) + fill(ellipsePath(12, 12, 9, 9), g.face) + stroke(ellipsePath(12, 12, 5.6, 5.6), g.side, 1.4) + fill(sparkle(8.4, 8, 2.6), g.light);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" id="${prefixFor(opts.idPrefix, 'coin', dark)}">${body}</svg>`;
}

function wrap(prefix: string, size: number, box: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${box} ${box}" aria-hidden="true" focusable="false" id="${prefix}">${body}</svg>`;
}

function wrapBox(prefix: string, size: number, w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2((size * h) / w)}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false" id="${prefix}">${body}</svg>`;
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
 * A unit's prize: a sandûq, the painted wooden dowry chest, seen from a little above and to the side so it stands
 * solid: its front lit, its end in shade, its barrel lid lit along the crown. A strap of kilim with a madder ground, cream
 * lozenges and indigo eyes wraps it over the lid and down the front, brass caps its corners and its hasp. Open, the lid
 * is thrown back on its hinge, lined in madder, over gold heaped in its mouth. `part` draws one piece alone.
 */
function sanduq(x: number, y: number, open: boolean, dark: boolean, part: PathChestPart): string {
  const c = (hex: string): string => dusk(hex, dark, 0.2);
  const wood = { face: c('#b86f35'), light: c('#d18a4b'), end: c('#8c4f22'), seam: c('#5e3318'), inside: c('#4a2812') };
  const brass = warm('#e2b24a', dark);
  const brassShade = warm('#b07f1e', dark);
  const madder = c('#b8323a');
  const madderDeep = c('#8e2129');
  const cream = c('#f3e1b5');
  const indigo = c(VALLEY.indigo);
  // The chest's corners in the drawing: front face from `l` to `r`, lid seam at `seam`, foot at `foot`; its end recedes `d` up and right.
  const l = x - 29;
  const r = x + 25;
  const seam = y - 4;
  const foot = y + 24;
  const d = { x: 10, y: -7 };
  const g = PATH_GOLD[dark ? 'dark' : 'light'];
  const draws = { body: part === 'whole' || part === 'body', lid: part === 'lid' || (part === 'whole' && !open), open: part === 'open' || (part === 'whole' && open) };
  let out = '';

  if (draws.open) {
    // The lid thrown back on its hinge along the back edge, its lining toward us, the strap running on over it.
    const hl = l + d.x;
    const hr = r + d.x;
    const hy = seam + d.y;
    out += fill(`M${n(hl)} ${n(hy)}L${n(hl - 3)} ${n(hy - 24)}Q${n((hl + hr) / 2)} ${n(hy - 31)} ${n(hr + 3)} ${n(hy - 24)}L${n(hr)} ${n(hy)}Z`, wood.end);
    out += fill(`M${n(hl + 4)} ${n(hy - 1)}L${n(hl + 2)} ${n(hy - 20)}Q${n((hl + hr) / 2)} ${n(hy - 26)} ${n(hr - 2)} ${n(hy - 20)}L${n(hr - 4)} ${n(hy - 1)}Z`, madderDeep);
    out += kilimAlong([0.25, 0.5, 0.75].map((s) => ({ p: [hl + 4 + (hr - hl - 8) * s, hy - 12] as Pt, angle: 0 })), 6, cream, indigo);
    // The mouth: the inside of the chest, and the gold heaped in it, catching the light.
    out += fill(`M${n(l)} ${n(seam)}L${n(l + d.x)} ${n(seam + d.y)}H${n(r + d.x)}L${n(r)} ${n(seam)}Z`, wood.inside);
    out += fill(ellipsePath(x - 12, seam - 4, 10, 4.4) + ellipsePath(x + 4, seam - 6, 12, 5.4) + ellipsePath(x + 19, seam - 3.6, 8, 3.6), g.face);
    out += fill(ellipsePath(x + 2, seam - 8.6, 4.6, 1.9) + ellipsePath(x - 14, seam - 6.2, 3.4, 1.5) + ellipsePath(x + 18, seam - 5.4, 2.6, 1.1), g.light);
    out += fill(sparkle(x - 19, seam - 22, 4.2) + sparkle(x + 25, seam - 30, 3.2) + sparkle(x + 6, seam - 34, 2.6), warm('#fff6dc', dark));
  }

  if (draws.body) {
    // Its end, receding, in shade; then its lit front with a plank seam, and two feet.
    out += fill(`M${n(r)} ${n(seam)}L${n(r + d.x)} ${n(seam + d.y)}V${n(foot + d.y)}L${n(r)} ${n(foot)}Z`, wood.end);
    out += fill(`M${n(l)} ${n(seam)}H${n(r)}V${n(foot - 3)}Q${n(r)} ${n(foot)} ${n(r - 3)} ${n(foot)}H${n(l + 3)}Q${n(l)} ${n(foot)} ${n(l)} ${n(foot - 3)}Z`, wood.face);
    out += stroke(`M${n(l + 2)} ${n(y + 10)}H${n(r - 2)}`, wood.seam, 1.2);
    out += fill(`M${n(l + 2)} ${n(foot)}h7v4h-7ZM${n(r - 9)} ${n(foot)}h7v4h-7Z`, wood.seam);
    // The strap down the front, and brass at the foot's corners and along the end's edge.
    out += strap(x - 4, seam, foot, madder, cream, indigo, open ? [y + 4, y + 16] : [y + 4, y + 16]);
    out += fill(`M${n(l)} ${n(foot - 8)}h8v8h-5q-3 0 -3 -3ZM${n(r)} ${n(foot - 8)}h-8v8h5q3 0 3 -3Z`, brass);
    out += fill(`M${n(r)} ${n(foot - 8)}L${n(r + d.x)} ${n(foot - 8 + d.y)}V${n(foot + d.y)}L${n(r)} ${n(foot)}Z`, brassShade);
    out += stroke(`M${n(l)} ${n(seam)}H${n(r)}L${n(r + d.x)} ${n(seam + d.y)}`, wood.seam, 1.6);
  }

  if (draws.lid) {
    // The barrel lid lying along the chest: its near curve rising from the seam to the crown, lit along the crown, and its
    // end an arch in shade on the end's plane; the strap runs over it to the hasp.
    const rise = 13;
    const crown = { y: seam + d.y / 2 - rise, l: l + d.x / 2, r: r + d.x / 2 };
    out += fill(`M${n(r)} ${n(seam)}Q${n(r)} ${n(seam - rise)} ${n(crown.r)} ${n(crown.y)}Q${n(r + d.x)} ${n(seam + d.y - rise * 0.8)} ${n(r + d.x)} ${n(seam + d.y)}Z`, wood.end);
    out += fill(`M${n(l)} ${n(seam)}Q${n(l)} ${n(seam - rise)} ${n(crown.l)} ${n(crown.y)}H${n(crown.r)}Q${n(r)} ${n(seam - rise)} ${n(r)} ${n(seam)}Z`, wood.face);
    out += fill(`M${n(l + 1.2)} ${n(seam - 8)}Q${n(l + 1.6)} ${n(crown.y + 1)} ${n(crown.l + 1)} ${n(crown.y + 0.6)}H${n(crown.r - 1.2)}Q${n(r - 2)} ${n(crown.y + 2)} ${n(r - 0.8)} ${n(seam - 8)}Q${n(x)} ${n(seam - 11)} ${n(l + 1.2)} ${n(seam - 8)}Z`, wood.light);
    const sx = x - 4;
    out += fill(`M${n(sx - 6)} ${n(seam)}Q${n(sx - 6)} ${n(seam - rise)} ${n(sx - 6 + d.x / 2)} ${n(crown.y)}H${n(sx + 6 + d.x / 2)}Q${n(sx + 6)} ${n(seam - rise)} ${n(sx + 6)} ${n(seam)}Z`, madder);
    out += stroke(`M${n(sx - 4.6)} ${n(seam - 1)}Q${n(sx - 4.6)} ${n(seam - rise + 1)} ${n(sx - 4.6 + d.x / 2)} ${n(crown.y + 1)}M${n(sx + 4.6)} ${n(seam - 1)}Q${n(sx + 4.6)} ${n(seam - rise + 1)} ${n(sx + 4.6 + d.x / 2)} ${n(crown.y + 1)}`, cream, 1);
    out += kilimAlong([{ p: [sx + 2.2, seam - 9.5] as Pt, angle: 0 }], 6.4, cream, indigo);
    // The hasp, brass, hanging over the seam with its keyhole.
    out += fill(`M${n(sx - 6)} ${n(seam - 4)}h12v10a2.5 2.5 0 0 1 -2.5 2.5h-7a2.5 2.5 0 0 1 -2.5 -2.5Z`, brass);
    out += fill(`${ellipsePath(sx, seam + 1.6, 1.7, 1.7)}M${n(sx - 0.8)} ${n(seam + 1.8)}h1.6v3.4h-1.6Z`, wood.seam);
  }
  return out;
}

/** The kilim strap down the sandûq from `top` to `foot`: madder with cream edges and a lozenge at each of `marks`. */
function strap(x: number, top: number, foot: number, madder: string, cream: string, indigo: string, marks: readonly number[]): string {
  return (
    fill(`M${n(x - 6)} ${n(top)}h12V${n(foot)}h-12Z`, madder) +
    stroke(`M${n(x - 4.6)} ${n(top + 1)}V${n(foot - 1)}M${n(x + 4.6)} ${n(top + 1)}V${n(foot - 1)}`, cream, 1) +
    kilimAlong(marks.map((my) => ({ p: [x, my] as Pt, angle: 0 })), 6.4, cream, indigo)
  );
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

