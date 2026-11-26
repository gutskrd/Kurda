/**
 * Each chapter's painted vignette for its banner, chosen from the chapter's own lessons, in the painted valley style:
 * flat cut-out planes lit from the upper left, one shade step each, standing on a flat shadow of the banner's own darker
 * colour. Each is drawn still (`part: 'still'`) with its one moving part apart (`part: 'loop'`), which the apps lay over it
 * at `CHAPTER_ART_LOOP` and move gently, or leave at rest under Reduce Motion. Hevalo's head at the first chapter's door is
 * his own drawing from the characters' art, never redrawn.
 */
import { characterArt, headGroup } from '../characters/index.js';
import { n, n2, prefixFor, type Pt } from './svg.js';
import { kilimAlong } from './paint.js';
import { VALLEY, ellipsePath, fill, stroke } from './valley.js';

/**
 * The vignette's canvas in the banner, `w` × `h`, which the apps set against the banner's foot and far end so the
 * banner's edges crop it, a window onto the scene; they size it by its height. The scene is drawn on its own 120 × 100
 * ground (its foot at `ground`) and set into the canvas at `place` (scaled `s`, moved by `dx`, `dy`), or its own, its
 * foot a little below the banner's so the edge cuts it, on a quiet hill a step darker than the banner's colour.
 */
export const CHAPTER_ART = { w: 132, h: 116, ground: 92, place: { s: 1.1, dx: 1, dy: 20.8 } } as const;

/** How a chapter's moving part moves: rising and fading, falling and fading, swinging or swaying about its pivot, a flame's flicker, a bob, or a circle round its pivot. */
export const CHAPTER_LOOP_KINDS = ['rise', 'fall', 'swing', 'creak', 'flicker', 'bob', 'orbit'] as const;
export type ChapterLoopKind = (typeof CHAPTER_LOOP_KINDS)[number];

/** A chapter's moving part: its kind, the box its picture fills on the canvas, and the point it turns about, on the canvas. */
export interface ChapterLoop {
  kind: ChapterLoopKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** the pivot, on the canvas */
  px: number;
  py: number;
}

/** The twelve vignettes, by chapter from 0; a course longer than twelve chapters starts them again. */
export const CHAPTER_ART_IDS = ['door', 'samovar', 'house', 'market', 'clock', 'minibus', 'newroz', 'honey', 'lantern', 'churn', 'harvest', 'tembur'] as const;
export type ChapterArtId = (typeof CHAPTER_ART_IDS)[number];

/** The vignette of a course's chapter, by its place from 0. */
export function chapterArtOf(index: number): ChapterArtId {
  const at = ((Math.floor(index) % CHAPTER_ART_IDS.length) + CHAPTER_ART_IDS.length) % CHAPTER_ART_IDS.length;
  return CHAPTER_ART_IDS[at]!;
}

/** What moves in each vignette, and where. */
export const CHAPTER_ART_LOOP: Readonly<Record<ChapterArtId, ChapterLoop>> = {
  door: { kind: 'creak', x: 24, y: 38, w: 22, h: 58, px: 44, py: 66 },
  samovar: { kind: 'rise', x: 60, y: 8, w: 14, h: 20, px: 67, py: 28 },
  house: { kind: 'rise', x: 86, y: 4, w: 14, h: 24, px: 93, py: 28 },
  market: { kind: 'swing', x: 70, y: 36, w: 30, h: 30, px: 85, py: 36 },
  clock: { kind: 'swing', x: 36, y: 52, w: 16, h: 34, px: 44, py: 52 },
  minibus: { kind: 'bob', x: 8, y: 22, w: 104, h: 62, px: 60, py: 84 },
  newroz: { kind: 'flicker', x: 40, y: 22, w: 40, h: 54, px: 60, py: 76 },
  honey: { kind: 'orbit', x: 64, y: 22, w: 30, h: 30, px: 79, py: 37 },
  lantern: { kind: 'flicker', x: 46, y: 46, w: 12, h: 22, px: 52, py: 68 },
  churn: { kind: 'swing', x: 26, y: 20, w: 68, h: 60, px: 60, py: 20 },
  harvest: { kind: 'fall', x: 80, y: 6, w: 18, h: 18, px: 89, py: 15 },
  tembur: { kind: 'rise', x: 70, y: 8, w: 30, h: 34, px: 85, py: 42 },
};

export interface ChapterArtOptions {
  chapter: ChapterArtId;
  /** The still picture, or its moving part alone at rest, on its own box (`CHAPTER_ART_LOOP`). */
  part?: 'still' | 'loop';
  /** The hill it stands on, a step darker than the banner's colour, and the shade its things cast on it. */
  ground?: string;
  shade?: string;
  /** Display height in points; the width follows the canvas (or the loop's box, scaled as the scene is). */
  height?: number;
  idPrefix?: string;
}

/** A chapter's vignette, still or its moving part, decorative. */
export function chapterArtSvg(opts: ChapterArtOptions): string {
  const { chapter } = opts;
  const draw = DRAW[chapter];
  if (!draw) throw new RangeError(`art: no chapter vignette ${String(chapter)}`);
  const part = opts.part ?? 'still';
  const ground = opts.ground ?? '#5f717a';
  const shade = opts.shade ?? '#17242b';
  for (const colour of [ground, shade]) if (!/^#[0-9a-f]{6}$/i.test(colour)) throw new RangeError(`art: a vignette's ground is a six-digit colour, not ${String(colour)}`);
  const prefix = prefixFor(opts.idPrefix, 'chapter-art', chapter, part, ground, shade);
  const loop = CHAPTER_ART_LOOP[chapter];
  const { s, dx, dy } = draw.place ?? CHAPTER_ART.place;
  if (part === 'loop') {
    const height = opts.height ?? loop.h * s;
    if (!(height > 0) || !Number.isFinite(height)) throw new RangeError(`art: height must be a positive number, got ${String(height)}`);
    const width = (height * loop.w) / loop.h;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(width)}" height="${n2(height)}" viewBox="${n(loop.x)} ${n(loop.y)} ${n(loop.w)} ${n(loop.h)}" aria-hidden="true" focusable="false" id="${prefix}">${draw.loop(prefix)}</svg>`;
  }
  const { w: W, h: H } = CHAPTER_ART;
  const height = opts.height ?? H;
  if (!(height > 0) || !Number.isFinite(height)) throw new RangeError(`art: height must be a positive number, got ${String(height)}`);
  // The hill, rising toward the banner's far end and running off its foot.
  const hill = fill(`M0 ${n(H)}C${n(W * 0.2)} ${n(H - 3)} ${n(W * 0.42)} ${n(H - 12)} ${n(W)} ${n(H - 19)}V${n(H)}Z`, ground);
  const scene = `<g transform="translate(${n(dx)} ${n(dy)}) scale(${n(s)})">${fill(ellipsePath(64, CHAPTER_ART.ground + 1, draw.shadow, 4.5), shade)}${draw.still(prefix)}</g>`;
  const width = (height * W) / H;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(width)}" height="${n2(height)}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false" id="${prefix}">${hill}${scene}</svg>`;
}

/** Where a chapter's moving part lies on the banner's canvas, scaled as the scene is: the box its picture fills, and its pivot. */
export function chapterLoopBox(chapter: ChapterArtId): { x: number; y: number; w: number; h: number; px: number; py: number } {
  const loop = CHAPTER_ART_LOOP[chapter];
  if (!loop) throw new RangeError(`art: no chapter vignette ${String(chapter)}`);
  const { s, dx, dy } = DRAW[chapter].place ?? CHAPTER_ART.place;
  return { x: dx + loop.x * s, y: dy + loop.y * s, w: loop.w * s, h: loop.h * s, px: dx + loop.px * s, py: dy + loop.py * s };
}

// ───────────────────────────────────────────────────────────── the drawings

const V = VALLEY;
/** Wood, lit and in shade. */
const WOOD = { face: '#b8773e', light: '#d39457', shade: '#8a5428', dark: '#5e3518' } as const;
const BRASS = { face: '#e0a640', light: '#f6d27c', shade: '#b07a22' } as const;
const COPPER = { face: '#cf7f45', light: '#eaa56a', shade: '#9c5528' } as const;
const TEA = '#b4421c';
const GLASS = '#fff7ea';

interface Vignette {
  /** The half-width of the shadow it stands on. */
  shadow: number;
  /** Where it is set into the banner's canvas, where it needs its own. */
  place?: { s: number; dx: number; dy: number };
  still: (prefix: string) => string;
  loop: (prefix: string) => string;
}

/** A tulip-shaped tea glass on its saucer, its foot at (x, y). */
function teaGlass(x: number, y: number): string {
  return (
    fill(ellipsePath(x, y, 8, 2.4), '#ffffff') +
    stroke(`M${n(x - 6.6)} ${n(y + 0.4)}Q${n(x)} ${n(y + 2.6)} ${n(x + 6.6)} ${n(y + 0.4)}`, V.red, 1.1) +
    fill(`M${n(x - 4.4)} ${n(y - 15)}H${n(x + 4.4)}Q${n(x + 2.4)} ${n(y - 10)} ${n(x + 3.8)} ${n(y - 4)}Q${n(x + 4.6)} ${n(y - 0.6)} ${n(x)} ${n(y - 0.6)}Q${n(x - 4.6)} ${n(y - 0.6)} ${n(x - 3.8)} ${n(y - 4)}Q${n(x - 2.4)} ${n(y - 10)} ${n(x - 4.4)} ${n(y - 15)}Z`, GLASS) +
    fill(`M${n(x - 3.4)} ${n(y - 12)}H${n(x + 3.4)}Q${n(x + 2)} ${n(y - 8.6)} ${n(x + 3.2)} ${n(y - 4)}Q${n(x + 3.8)} ${n(y - 1.8)} ${n(x)} ${n(y - 1.8)}Q${n(x - 3.8)} ${n(y - 1.8)} ${n(x - 3.2)} ${n(y - 4)}Q${n(x - 2)} ${n(y - 8.6)} ${n(x - 3.4)} ${n(y - 12)}Z`, TEA) +
    stroke(`M${n(x - 2.4)} ${n(y - 10)}Q${n(x - 1.6)} ${n(y - 6)} ${n(x - 2.2)} ${n(y - 3.6)}`, '#ffffff', 1)
  );
}

/** A pomegranate, its crown up. */
function pomegranate(x: number, y: number, r: number): string {
  return (
    fill(ellipsePath(x + r * 0.12, y + r * 0.12, r, r * 0.95), '#9e2430') +
    fill(ellipsePath(x, y, r, r * 0.95), '#d23c45') +
    fill(`M${n(x - r * 0.3)} ${n(y - r * 0.8)}l${n(-r * 0.1)} ${n(-r * 0.5)}l${n(r * 0.25)} ${n(r * 0.22)}l${n(r * 0.15)} ${n(-r * 0.34)}l${n(r * 0.15)} ${n(r * 0.34)}l${n(r * 0.25)} ${n(-r * 0.22)}l${n(-r * 0.1)} ${n(r * 0.5)}Z`, '#9e2430') +
    fill(ellipsePath(x - r * 0.38, y - r * 0.3, r * 0.22, r * 0.14), '#ef7a7f')
  );
}

/** An apple with its leaf. */
function apple(x: number, y: number, r: number, tone: string = V.apple): string {
  return (
    fill(ellipsePath(x + r * 0.14, y + r * 0.1, r, r * 0.92), '#a8322a') +
    fill(`M${n(x)} ${n(y - r * 0.7)}C${n(x + r * 0.9)} ${n(y - r * 1.15)} ${n(x + r * 1.2)} ${n(y - r * 0.1)} ${n(x + r * 0.9)} ${n(y + r * 0.5)}C${n(x + r * 0.6)} ${n(y + r * 1.05)} ${n(x - r * 0.6)} ${n(y + r * 1.05)} ${n(x - r * 0.9)} ${n(y + r * 0.5)}C${n(x - r * 1.2)} ${n(y - r * 0.1)} ${n(x - r * 0.9)} ${n(y - r * 1.15)} ${n(x)} ${n(y - r * 0.7)}Z`, tone) +
    fill(ellipsePath(x - r * 0.42, y - r * 0.28, r * 0.2, r * 0.14), '#f48a76') +
    stroke(`M${n(x)} ${n(y - r * 0.66)}q${n(r * 0.06)} ${n(-r * 0.4)} ${n(r * 0.28)} ${n(-r * 0.56)}`, WOOD.dark, Math.max(1, r * 0.16)) +
    fill(`M${n(x + r * 0.12)} ${n(y - r * 0.9)}q${n(r * 0.5)} ${n(-r * 0.46)} ${n(r * 0.92)} ${n(-r * 0.2)}q${n(-r * 0.44)} ${n(r * 0.38)} ${n(-r * 0.92)} ${n(r * 0.2)}Z`, V.leaf)
  );
}

/** A puff of steam or smoke as three soft rounds, rising from (x, y). */
function puffs(x: number, y: number, colour: string, opacity: number): string {
  return `<path d="${ellipsePath(x, y - 4, 3.6, 3.2)}${ellipsePath(x - 2, y - 11, 4.6, 4)}${ellipsePath(x + 1, y - 19, 4, 3.6)}" fill="${colour}" fill-opacity="${n2(opacity)}"/>`;
}

const DRAW: Readonly<Record<ChapterArtId, Vignette>> = {
  // Hello: Hamo's blue gate in its mud wall, thrown open, and Hevalo's head peeking out round the jamb.
  door: {
    shadow: 50,
    place: { s: 1.12, dx: 10, dy: 21 },
    still: (prefix) => {
      const gap = { l: 44, r: 80, t: 40, b: 92 };
      let out = fill('M12 92V34Q12 26 20 26H100Q108 26 108 34V92Z', V.wall);
      out += fill('M102 27Q108 28 108 34V92H102Z', V.wallSide);
      out += fill('M12 34Q12 26 20 26H100Q108 26 108 34V36H12Z', V.roof);
      out += fill(`M${gap.l - 4} ${gap.t - 7}H${gap.r + 4}V${gap.t}H${gap.l - 4}Z`, WOOD.face) + fill(`M${gap.l - 4} ${gap.t - 2}H${gap.r + 4}V${gap.t}H${gap.l - 4}Z`, WOOD.shade);
      out += fill(`M${gap.l} ${gap.t}H${gap.r}V${gap.b}H${gap.l}Z`, '#3a2519');
      // His head, in the house's shade, the far side of it hidden behind the jamb.
      const art = characterArt('hevalo', `${prefix}h`);
      const s = 0.082;
      const clip = `${prefix}gap`;
      out += `<defs><clipPath id="${clip}"><path d="M${gap.l} ${gap.t + 0.5}H${gap.r}V${gap.b}H${gap.l}Z"/></clipPath></defs>`;
      out += `<g clip-path="url(#${clip})"><g transform="translate(${n(gap.r - 18)} ${n(gap.t + 5)}) rotate(-14) scale(${s}) translate(${-art.bust.x - art.bust.w / 2} ${-art.bust.y})">${headGroup(art)}</g></g>`;
      out += fill(`M${gap.r} ${gap.t}h3v${gap.b - gap.t}h-3Z`, V.wallSide);
      // The step, worn smooth.
      out += fill(`M${gap.l - 6} ${gap.b - 3}H${gap.r + 6}V${gap.b + 1}H${gap.l - 6}Z`, V.stoneSide) + fill(`M${gap.l - 6} ${gap.b - 4}H${gap.r + 6}V${gap.b - 2}H${gap.l - 6}Z`, V.stone);
      return out;
    },
    loop: () => {
      // The gate's leaf, swung open toward us on its hinge at the jamb, carved in two panels with a ring.
      let out = fill('M44 40L26 36V95L44 92Z', V.gate);
      out += fill('M44 40L41 39.4V92.5L44 92Z', V.gateDark);
      out += fill('M38 44.5L29.5 43V62L38 62.8ZM38 67.5L29.5 67.2V88L38 87Z', V.gateDark);
      out += fill('M37 46L30.5 44.9V60.8L37 61.4ZM37 68.6L30.5 68.4V86.4L37 85.6Z', V.gateLight);
      out += stroke(ellipsePath(33.6, 64.8, 2.4, 2.8), BRASS.face, 1.4);
      out += fill(ellipsePath(28, 40, 1.2, 1.2) + ellipsePath(28, 90, 1.2, 1.2), BRASS.face);
      return out;
    },
  },

  // Family: the tea tray at breakfast, a samovar with its teapot on top and glasses round it.
  samovar: {
    shadow: 52,
    still: () => {
      let out = fill(ellipsePath(60, 86, 52, 9), COPPER.shade) + fill(ellipsePath(60, 84, 52, 9), COPPER.face) + fill(ellipsePath(60, 84, 46, 7), COPPER.light);
      // The samovar: its foot, its round body lit from the left, its tap, and its crown.
      out += fill('M50 84L53 74H67L70 84Z', BRASS.shade);
      out += fill('M44 72C42 58 46 46 52 42H68C74 46 78 58 76 72C74 77 46 77 44 72Z', BRASS.face);
      out += fill('M68 42C74 46 78 58 76 72C75 74.5 70 75.6 66 75.8C70 66 70 52 68 42Z', BRASS.shade);
      out += fill('M48 52C49 47 51 44 53 43H56C53 46 51 50 50 56Z', BRASS.light);
      out += fill('M50 42H70V38H50Z', BRASS.shade) + fill('M52 38H68L66 35H54Z', BRASS.face);
      out += fill('M43 62h-5v4h5Z', BRASS.shade) + fill('M38 62v7h-2v-7Z', '#6b4a24');
      // The teapot on top, white with a red flower, its spout toward the steam.
      out += fill('M51 34C50 26 54 22 60 22C66 22 70 26 69 34Z', '#ffffff') + fill('M69 30C72 28 74 26 75 22l2 1C76 28 73 32 69 33Z', '#ffffff');
      out += fill('M63 23C67 24 69 28 69 34H64C65 30 65 26 63 23Z', '#e3ebf2');
      out += fill(ellipsePath(60, 28.6, 3, 2.6), V.red) + fill(ellipsePath(60, 28.6, 1.1, 1), BRASS.light);
      out += fill('M57 22h6v-2.6h-6Z', V.red) + fill(ellipsePath(60, 19, 2, 1.4), V.red);
      out += teaGlass(24, 84) + teaGlass(96, 84) + teaGlass(83, 92) + teaGlass(37, 92);
      return out;
    },
    loop: () => `<g transform="translate(67 28) scale(0.8) translate(-66 -28)">${puffs(66, 28, '#ffffff', 0.9)}</g>`,
  },

  // House and village: a flat-roofed mud-brick house, a ladder up to the roof, a clay jar at its door and its stove's smoke.
  house: {
    shadow: 50,
    place: { s: 1.1, dx: 12, dy: 20.8 },
    still: () => {
      let out = fill('M96 92L106 86V44L96 50Z', V.wallSide);
      out += fill('M22 50H96V92H22Z', V.wall);
      out += fill('M18 44H96L106 38H28Z', V.roof) + fill('M18 44H96V50H18Z', V.parapet) + fill('M96 44L106 38V44L96 50Z', '#c09253');
      // The poplar beams' ends under the roof's edge.
      out += fill([28, 40, 52, 64, 76, 88].map((x) => ellipsePath(x, 52.6, 1.8, 1.6)).join(''), WOOD.shade);
      out += fill('M44 92V70A8 8 0 0 1 60 70V92Z', V.gateDark) + fill('M46 92V71A6 6 0 0 1 58 71V92Z', V.gate);
      out += fill(ellipsePath(55.6, 81, 0.9, 0.9), BRASS.face);
      out += fill('M72 60H84V72H72Z', V.window) + stroke('M78 60V72', WOOD.face, 1.6);
      // The tandûr's chimney on the roof, where the smoke comes from.
      out += fill('M88 36H96V30H88Z', V.parapet) + fill('M88 30h8v2h-8Z', '#c09253');
      // The ladder against the wall, up to the roof.
      out += stroke('M8 93L22 38M18 94L31 40', WOOD.shade, 2.6) + stroke('M10.6 84H20.4M13 75H23M15.4 66H25.4M17.8 57H27.6M20.2 48H30', WOOD.face, 2);
      // A clay jar by the door.
      out += fill('M64 92C60 88 60 80 64 77H74C78 80 78 88 74 92Z', '#c06b3c') + fill('M70 77H74C78 80 78 88 74 92H71C74 88 74 80 70 77Z', '#9a4f27') + fill('M64 76H74V73H64Z', '#a85a30');
      return out;
    },
    loop: () => puffs(93, 28, '#efe9df', 0.92),
  },

  // The market: a striped awning on two poles over a crate of pomegranates, and the trader's scale hanging from it.
  market: {
    shadow: 52,
    place: { s: 1.1, dx: 8, dy: 20.8 },
    still: () => {
      let out = stroke('M16 34V92M104 34V92', WOOD.shade, 3);
      // The awning, stripes of madder and cream with a scalloped edge.
      const stripes = [14, 26, 38, 50, 62, 74, 86, 98];
      out += fill('M10 22H110V36H10Z', '#fff4e0');
      out += fill(stripes.map((x, i) => (i % 2 === 0 ? `M${x} 22h12v14h-12Z` : '')).join(''), V.red);
      let edge = 'M10 36';
      for (let x = 10; x < 110; x += 12.5) edge += `Q${n(x + 6.25)} 44 ${n(x + 12.5)} 36`;
      out += fill(`${edge}Z`, '#fff4e0');
      out += fill('M10 20H110V24H10Z', V.redDark);
      // The crate, and the fruit heaped on it.
      out += fill('M24 72H88V92H24Z', WOOD.face) + fill('M88 72L96 68V88L88 92Z', WOOD.shade) + stroke('M26 82H86', WOOD.dark, 1.2);
      out += pomegranate(34, 68, 7) + pomegranate(48, 66, 7.6) + pomegranate(62, 68, 7) + pomegranate(76, 69, 6.6) + pomegranate(41, 59, 6.6) + pomegranate(56, 58, 7);
      return out;
    },
    loop: () => {
      // The scale on its hook: a beam with two brass pans on cords.
      let out = stroke('M85 36V46', '#6b4a24', 1.4);
      out += stroke('M73 47H97', BRASS.shade, 2.4) + fill(ellipsePath(85, 46.6, 2, 2), BRASS.face);
      out += stroke('M73 47L70 58M73 47L76 58M97 47L94 58M97 47L100 58', '#8a6a3a', 0.9);
      out += fill('M68 58H78Q77 63 73 63Q69 63 68 58Z', BRASS.face) + fill('M92 58H102Q101 63 97 63Q93 63 92 58Z', BRASS.face);
      out += fill(ellipsePath(73, 58, 5, 1.2) + ellipsePath(97, 58, 5, 1.2), BRASS.light);
      return out;
    },
  },

  // Days and time: the wall clock with its pendulum, and the week on the calendar beside it.
  clock: {
    shadow: 48,
    still: () => {
      let out = fill('M34 50H54V88H34Z', WOOD.face) + fill('M54 50L58 47V86L54 88Z', WOOD.shade);
      out += fill('M37 54H51V84H37Z', '#3d2a1f');
      out += fill(ellipsePath(46, 36, 18, 18), WOOD.shade) + fill(ellipsePath(44, 36, 18, 18), WOOD.face) + fill(ellipsePath(44, 36, 14, 14), BRASS.face);
      out += fill(ellipsePath(44, 36, 11.6, 11.6), '#fffaf0');
      out += fill([0, 1, 2, 3].map((i) => ellipsePath(44 + 9 * Math.sin((i * Math.PI) / 2), 36 - 9 * Math.cos((i * Math.PI) / 2), 1.1, 1.1)).join(''), '#3d2a1f');
      out += stroke('M44 36L39 30.5M44 36L50.5 32', '#3d2a1f', 1.8) + fill(ellipsePath(44, 36, 1.4, 1.4), V.red);
      out += fill('M33 88H55V92H33Z', WOOD.shade) + fill('M42 16h4v3h-4Z', BRASS.shade);
      // The calendar: its binding, and a week of days with today marked.
      out += fill('M70 42H102V84H70Z', '#ffffff') + fill('M102 42L106 40V82L102 84Z', '#dfe3e6');
      out += fill('M70 42H102V50H70Z', V.red) + fill([76, 86, 96].map((x) => `M${x - 1} 40h2v4h-2Z`).join(''), '#5f5e66');
      let days = '';
      for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) if (!(row === 1 && col === 2)) days += `M${73 + col * 5.8} ${55 + row * 7}h4v4h-4Z`;
      out += fill(days, '#c9d0d6') + fill('M84.6 61.4h5.6v5.6h-5.6Z', V.red);
      return out;
    },
    loop: () => stroke('M44 52V78', BRASS.shade, 1.4) + fill(ellipsePath(44, 80, 4.4, 4.4), BRASS.face) + fill(ellipsePath(42.8, 78.8, 1.4, 1.4), BRASS.light),
  },

  // The city: the minibus to town, its luggage tied on the roof under a kilim.
  minibus: {
    shadow: 54,
    place: { s: 1.08, dx: 6, dy: 20 },
    still: () => {
      let out = '';
      for (const x of [32, 88]) out += fill(ellipsePath(x, 84, 8, 8), '#2b2b30') + fill(ellipsePath(x, 84, 3.6, 3.6), '#a3a8ae');
      return out;
    },
    loop: () => {
      let out = fill('M12 76V46Q12 38 20 38H90Q98 38 102 46L108 60V76Q108 80 104 80H16Q12 80 12 76Z', '#f3eee2');
      out += fill('M98 44Q100 46 102 46L108 60V76Q108 80 104 80H100V44Z', '#dcd5c4');
      out += fill('M12 62H108V68H12Z', V.red) + fill('M100 62H108V68H100Z', V.redDark);
      // The windows along its side and the windscreen.
      out += fill('M18 44H34V56H18ZM38 44H54V56H38ZM58 44H74V56H58ZM78 44H92V56H78Z', '#36505c');
      out += fill('M94 44H98L104 56H94Z', '#36505c') + stroke('M21 54L28 46M41 54L48 46M61 54L68 46', '#ffffff', 1.2);
      out += fill(ellipsePath(104, 71, 2.4, 2), '#ffd36b') + fill('M10 74h4v4h-4Z', '#5f5e66');
      // The roof rack and its load: a bundle in a kilim and a case, roped down.
      out += stroke('M22 38V34H90V38', '#5f5e66', 1.6);
      out += fill('M26 34C26 24 34 22 48 22C62 22 66 26 66 34Z', V.red);
      out += kilimAlong([34, 46, 58].map((x) => ({ p: [x, 28] as Pt, angle: 0 })), 6.6, '#f3e1b5', V.indigo);
      out += fill('M68 34V26H86V34Z', WOOD.face) + fill('M86 34L89 32V24L86 26Z', WOOD.shade) + fill('M74 24h6v2h-6Z', WOOD.dark);
      out += stroke('M30 34L44 22M54 22L62 34M72 34V26M82 34V26', '#e8d8a8', 1.1);
      return out;
    },
  },

  // Weather and Newroz: the Newroz fire on its ring of stones, with the first tulips of spring.
  newroz: {
    shadow: 48,
    still: () => {
      let out = stroke('M40 84L80 74M40 74L80 84', WOOD.shade, 5) + stroke('M42 83L78 74.5', WOOD.face, 3);
      out += fill([[32, 86, 8], [44, 89, 7], [58, 90, 8], [72, 89, 7], [86, 86, 8]].map(([x, y, r]) => ellipsePath(x!, y!, r!, r! * 0.62)).join(''), V.stoneSide);
      out += fill([[31, 84.6, 7], [43, 87.8, 6], [57, 88.6, 7], [71, 87.8, 6], [85, 84.6, 7]].map(([x, y, r]) => ellipsePath(x!, y!, r!, r! * 0.5)).join(''), V.stone);
      for (const [x, h, tone] of [[14, 22, V.red], [22, 16, '#f2b632'], [100, 20, V.red], [108, 15, '#f2b632']] as const) {
        out += stroke(`M${x} 92V${92 - h}`, V.leafShade, 1.6) + fill(`M${x} ${88 - h * 0.4}q-5 -3 -5 -8q4 1 5 6Z`, V.leaf);
        out += fill(`M${x - 3.4} ${92 - h}q0 -6 3.4 -8q3.4 2 3.4 8q-3.4 2 -6.8 0Z`, tone);
      }
      return out;
    },
    loop: () =>
      fill('M60 24C70 38 80 48 78 62C76 74 44 74 42 62C40 50 50 46 50 34C54 40 56 38 60 24Z', '#f08a3c') +
      fill('M60 42C66 52 70 58 68 66C66 73 54 73 52 66C50 58 56 54 60 42Z', '#ffd36b') +
      fill(ellipsePath(46, 30, 1.6, 1.6) + ellipsePath(74, 34, 1.3, 1.3), '#ffd36b'),
  },

  // Body and health: a jar of honey under its cloth, the dipper dripping, and a bee who wants it.
  honey: {
    shadow: 44,
    still: () => {
      let out = fill('M38 92C32 86 32 64 38 56H74C80 64 80 86 74 92Z', '#e9a52c') + fill('M66 56H74C80 64 80 86 74 92H68C73 84 73 64 66 56Z', '#c57f16');
      out += fill('M42 62C44 60 48 59 50 60C46 66 45 78 46 86C42 80 40 68 42 62Z', '#f7cd6a');
      // Its cloth tied over the mouth with a red cord, and honey run down the side.
      out += fill('M34 54Q56 46 78 54L76 60Q56 56 36 60Z', '#f3e1b5') + fill('M36 60Q56 56 76 60L74 64Q56 61 38 64Z', '#e2cc98');
      out += stroke('M36 59Q56 55 76 59', V.red, 2) + stroke('M74 59q4 4 2 9', V.red, 1.6);
      out += fill('M60 61q3 0 3 6v10a2.4 2.4 0 0 1 -4.8 0v-12q0 -4 1.8 -4Z', '#c57f16');
      // The dipper leaning on the jar.
      out += stroke('M86 92L104 52', WOOD.face, 3) + fill('M80 92a6 4 0 1 0 12 0a6 4 0 1 0 -12 0Z', WOOD.face);
      out += stroke('M80.6 90.6h10.8M81 93.4h10', WOOD.shade, 1.2);
      return out;
    },
    // The bee rides the rim of the loop's box, which the apps turn about its middle.
    loop: () =>
      `<path d="${ellipsePath(77, 21.6, 3.6, 2.2)}${ellipsePath(81.6, 21.2, 3, 1.8)}" fill="#ffffff" fill-opacity="0.9"/>` +
      fill(ellipsePath(79, 26, 5.4, 4), '#2a2018') +
      fill('M76.6 22.6h1.8v6.8h-1.8zM80.2 22.4h1.7v7.2h-1.7z', '#f6c836') +
      fill(ellipsePath(84.2, 25, 1.2, 1.2), '#2a2018'),
  },

  // Yesterday: the old storm lantern of the evenings before electricity, by a bundle of letters tied with string.
  lantern: {
    shadow: 42,
    still: () => {
      let out = stroke('M52 32Q40 32 40 24Q40 16 52 16Q64 16 64 24Q64 32 52 32', '#5f5e66', 1.8);
      out += fill('M42 36H62L60 32H44Z', '#7d7c84') + fill('M40 38H64V42H40Z', '#5f5e66');
      out += fill('M44 42C40 50 40 64 44 70H60C64 64 64 50 60 42Z', '#fdf3dc') + fill('M56 42H60C64 50 64 64 60 70H57C60 62 60 50 56 42Z', '#efdcb4');
      out += stroke('M44 42V70M52 42V70M60 42V70', '#7d7c84', 1.4);
      out += fill('M38 70H66V78H38Z', '#5f5e66') + fill('M40 78H64L66 86H38Z', '#7d7c84') + fill('M36 86H68V90H36Z', '#45444c');
      out += fill(ellipsePath(46, 82, 2.2, 2), '#c9a24a');
      // The letters, tied.
      out += fill('M74 92L76 78L104 80L102 92Z', '#efe3c8') + fill('M76 78L74 74L102 76L104 80Z', '#fbf3e1') + fill('M80 80L86 86L100 82', '#d8c79f');
      out += stroke('M88 75V92M74 85L104 86', V.red, 1.4);
      return out;
    },
    loop: () => fill('M52 47C55 52 57 56 56 61C55 66 49 66 48 61C47 56 50 53 52 47Z', '#f08a3c') + fill('M52 54C53.6 57 54.4 59 54 61.6C53.4 64 50.6 64 50 61.6C49.6 59 50.6 57 52 54Z', '#ffd36b'),
  },

  // The summer pastures: the goatskin churn swinging from its tripod, butter on the way.
  churn: {
    shadow: 50,
    still: () => {
      let out = stroke('M60 20L60 92', WOOD.shade, 2.6) + stroke('M60 20L28 93M60 20L92 93', WOOD.face, 3.2) + stroke('M56 16L64 24M64 16L56 24', WOOD.dark, 1.8);
      for (const x of [14, 106, 40, 80]) out += fill(`M${x - 5} 93q2 -8 5 -10q1 6 1 10ZM${x + 5} 93q-2 -7 -4 -8q0 5 0 8Z`, V.leaf);
      return out;
    },
    loop: () => {
      // Two ropes from the tripod's head to the skin's legs, and the skin itself: its neck tied at one end, its legs tied on top.
      let out = stroke('M60 22L42 52M60 22L78 52', '#8f6b3c', 1.4);
      out += fill('M30 64C30 52 44 49 60 50C78 49 92 54 92 64C92 74 78 78 60 77C44 78 30 76 30 64Z', '#a26a3a');
      out += fill('M30 64C30 52 44 49 60 50C78 49 92 54 92 64C92 66 91.4 68 90 69.6C86 62 74 58.6 60 59.6C46 58.4 36 62 31.4 68.6C30.4 67.2 30 65.6 30 64Z', '#c58c55');
      out += fill('M30 60L20 56Q18 62 20 68L30 66Z', '#a26a3a') + stroke('M24 57V67', '#6b4422', 1.6);
      out += fill('M40 52L38 44L44 43L46 51ZM74 51L76 43L82 44L80 52Z', '#8c5a30') + stroke('M37.6 46H44.4M75.6 46H82.4', '#6b4422', 1.4);
      out += stroke('M44 70Q60 74 80 70', '#8c5a30', 1.2) + fill(ellipsePath(48, 56, 5, 2), '#ddae78');
      return out;
    },
  },

  // Work and school: the apples picked into a basket, and a school satchel leaning on it; an autumn leaf coming down.
  harvest: {
    shadow: 50,
    still: () => {
      let out = apple(34, 52, 8) + apple(50, 50, 8.6) + apple(66, 53, 8) + apple(42, 60, 7.6, '#d6452f') + apple(58, 61, 7.6);
      out += fill('M22 60H82L76 92H28Z', '#c99757') + fill('M70 60H82L76 92H68Z', '#a7783e');
      let weave = '';
      for (let y = 66; y < 92; y += 6) weave += `M${n(23 + (y - 60) * 0.19)} ${y}H${n(81 - (y - 60) * 0.19)}`;
      out += stroke(weave, '#a7783e', 1.4) + fill('M20 58H84V63H20Z', '#b0803f');
      // The satchel: leather with its flap, a buckle and a pencil standing in it.
      out += fill('M78 92V70Q78 66 82 66H102Q106 66 106 70V92Z', '#7a4a2a') + fill('M102 66Q106 66 106 70V92H102Z', '#5d3620');
      out += fill('M78 70Q78 66 82 66H102Q106 66 106 70V80H78Z', '#94603a') + fill(ellipsePath(92, 80, 3, 2.4), BRASS.face);
      out += fill('M96 66L99 50L101.4 50.4L98.8 66Z', '#f2b632') + fill('M99 50L100.6 46L101.4 50.4Z', '#e8c9a0') + fill('M99.8 47.8L100.6 46L101 48Z', '#3d2a1f');
      return out;
    },
    loop: () => fill('M89 6l2 4l4 -1l-1 4l4 2l-4 2l1 4l-4 -1l-2 4l-2 -4l-4 1l1 -4l-4 -2l4 -2l-1 -4l4 1Z', '#e0812a') + stroke('M89 15l4 5', '#a8591c', 1),
  },

  // Stories and songs: the tembûr leaning on a cushion, with its music rising.
  tembur: {
    shadow: 50,
    still: () => {
      let out = fill('M14 92Q14 76 30 74H90Q106 76 106 92Z', V.red) + fill('M14 92Q14 76 30 74H40Q26 78 26 92Z', V.redDark);
      out += kilimAlong([34, 48, 62, 76, 90].map((x) => ({ p: [x, 84] as Pt, angle: 0 })), 7, '#f3e1b5', V.indigo);
      // The tembûr: its pear-shaped bowl, sound holes, the long neck and its pegs.
      out += fill('M70 18L76 16L44 78L38 76Z', WOOD.shade) + fill('M70 18L73 17L41 77L38 76Z', WOOD.face);
      out += fill('M70 12L80 10L78 20L68 22Z', WOOD.dark) + stroke('M68 14L64 13M70 19L66 18M78 11L82 9M80 17L84 16', WOOD.dark, 1.6);
      out += fill('M38 60C26 64 22 78 28 86C34 94 50 92 54 80C58 70 50 58 38 60Z', WOOD.face);
      out += fill('M38 60C50 58 58 70 54 80C50 90 38 93 30 88C42 88 50 80 48 70C47 65 43 61 38 60Z', WOOD.shade);
      out += fill('M30 70C32 66 35 64 38 63C34 67 32 72 32 78Z', WOOD.light);
      out += fill(ellipsePath(40, 76, 1.6, 1.6) + ellipsePath(44, 72, 1.3, 1.3) + ellipsePath(37, 81, 1.3, 1.3), WOOD.dark);
      out += stroke('M72 16L36 86M74 17L39 86', '#f3e1b5', 0.6);
      return out;
    },
    loop: () =>
      fill(`${ellipsePath(78, 36, 3.4, 2.6)}${ellipsePath(92, 24, 3, 2.3)}`, '#fffaf0') +
      stroke('M81.2 35.6V24L84 26M94.8 23.6V13.6Q96 16 98 16', '#fffaf0', 1.6),
  },
};
