/**
 * The lesson path's world, drawn by code: the land each unit's route crosses,
 * the stepping stones between its stops, the stops themselves as chunky
 * raised discs, and the landmark that stands beside each unit.
 *
 * The one place, with the Kurdish Kingdom's village, where Hevalo's art has
 * depth: the owner asked for the path and the village to read as one small
 * world seen from a little above, like a board of stones on a sunny meadow.
 * So these pieces are drawn the way the village is — isometric where they
 * have walls, outlined in one dark warm ink, and cel shaded with the light
 * from the upper left: every form has its lit top, its face, and its side in
 * shade, and nothing else. Still no gradients on forms, no glows, no bevels,
 * and no people: the course's people stand on the path as their own rigs.
 *
 * - `pathLandSvg`: one unit's ground at the size it is shown, in points — its
 *   grass or snow or paving, patches of light and shade, a stream, trees,
 *   tufts, flowers and pebbles — kept off the stops, the trail, the landmark
 *   and the places people stand (`landClear`).
 * - `pathStonesSvg`: the trail's stepping stones (`trailStones`), walked or
 *   still ahead.
 * - `pathStopSvg`: a stop as two pictures, its base and its face, so a press
 *   can push the face down into the base; a skill's glyph is the app's own
 *   (a check, a number, a padlock), the guide's book, a story's scroll, the
 *   jump's gate and the unit's chest are drawn here.
 * - `pathLandmarkSvg` and `pathLoopSvg`: a unit's landmark on the 120-unit
 *   canvas, and the one small thing in it that moves (`PATH_LANDMARK_LOOP`
 *   says where), which the apps lay over it and move gently.
 *
 * Deterministic: the same inputs give the same string, ids from a hash of
 * what was asked for (svg.ts), scatter from a generator seeded with it.
 */
import type { UnitTone } from '../lesson-path.js';
import { landClear, type PathBox, type PathGround, type PathLandmark, type TrailStone, type WorldStop } from '../path-world.js';
import { chestDrawing, type ChestLayerId } from './chest.js';
import { CANVAS, escapeXml, mix, n, n2, prefixFor, seeded, type Pt } from './svg.js';

// ───────────────────────────────────────────────────────────── the palette

/** One form's three tones: its lit top, its face, and its side in shade. */
interface Tones {
  light: string;
  face: string;
  shade: string;
}

/**
 * The one ink every outline is drawn in, by day and by evening: the village's
 * own dark brown (art/kingdom/pen.ts), so the path and the village read as
 * one world.
 */
const INK = { day: '#4a2a1a', dusk: '#3a2016' } as const;

/**
 * The evening, for a dark screen: the same land in the last light, every
 * colour of the day taken a little toward the dusk's violet — as the village
 * is at dusk — keeping lit windows and fire bright.
 */
const DUSK = '#2a2448';
const dusk = (hex: string, dark: boolean, amount = 0.24): string => (dark ? mix(hex, DUSK, amount) : hex);
const tones = (t: Tones, dark: boolean): Tones => (dark ? { light: dusk(t.light, true, 0.18), face: dusk(t.face, true), shade: dusk(t.shade, true, 0.3) } : t);

const STONE: Tones = { light: '#f6e8cc', face: '#e2c9a0', shade: '#b99870' };
const STONE_GREY: Tones = { light: '#eee9df', face: '#d2c9b9', shade: '#a59a87' };
const BASALT: Tones = { light: '#8b8a8f', face: '#5f5e66', shade: '#3f3e46' };
const WOOD: Tones = { light: '#d29a63', face: '#ab743f', shade: '#7c522b' };
const EARTH: Tones = { light: '#e8cf9f', face: '#cfa670', shade: '#a77c4a' };
const BLUE: Tones = { light: '#7fb8e6', face: '#3f86c6', shade: '#2b5f95' };
const WHITE: Tones = { light: '#ffffff', face: '#f1ece3', shade: '#cfc6b6' };
const RED: Tones = { light: '#f07a64', face: '#d6493a', shade: '#a13027' };
const CLOTH: Tones = { light: '#5a4a44', face: '#3b302d', shade: '#272020' };
const LEAF: Tones = { light: '#a6d571', face: '#71ae4c', shade: '#4b8537' };
const POPLAR: Tones = { light: '#86bd61', face: '#559248', shade: '#386c34' };
const WATER: Tones = { light: '#c7ecf7', face: '#6cc0e0', shade: '#3c91bd' };
const SNOW: Tones = { light: '#ffffff', face: '#eef3f8', shade: '#c9d5e3' };
const GOLD = '#f2b632';
const FIRE = { outer: '#e8572e', mid: '#f59a2b', core: '#ffd96a' } as const;
const WINDOW_LIT = '#ffd77a';
const OPENING = '#3a2a22';

/** A unit's ground: its base, its lighter and darker patches, the tufts on it, and the trees that grow there. */
interface Ground {
  base: string;
  light: string;
  shade: string;
  tuft: string;
  flowers: readonly string[];
  trees: readonly TreeKind[];
  /** how many trees to every 10 000 square points */
  density: number;
  stream: boolean;
  pebbles: string;
}

type TreeKind = 'apple' | 'poplar' | 'walnut' | 'bush' | 'blossom' | 'autumn' | 'bare' | 'pine' | 'rock' | 'hay' | 'snowpine';

const GROUNDS: Record<PathGround, Ground> = {
  orchard: { base: '#a9cf6e', light: '#c3df8a', shade: '#8fbb59', tuft: '#5d913c', flowers: ['#ffffff', '#f6d34c', '#e8574a'], trees: ['apple', 'apple', 'poplar', 'bush'], density: 1.3, stream: false, pebbles: '#e9e2d1' },
  meadow: { base: '#b3d374', light: '#cbe496', shade: '#97bf5e', tuft: '#638f3f', flowers: ['#ffffff', '#f6d34c', '#c86fd0'], trees: ['poplar', 'bush', 'walnut'], density: 1.1, stream: true, pebbles: '#ece6d6' },
  lanes: { base: '#d9c08f', light: '#e8d4a8', shade: '#c4a674', tuft: '#7f9c45', flowers: ['#ffffff', '#e8574a'], trees: ['walnut', 'bush', 'poplar'], density: 0.9, stream: true, pebbles: '#f1e6cd' },
  town: { base: '#d6b98d', light: '#e6cfa6', shade: '#bf9d6e', tuft: '#86a04a', flowers: ['#e8574a', '#f6d34c'], trees: ['bush', 'poplar'], density: 0.6, stream: false, pebbles: '#efe2c6' },
  stubble: { base: '#dcc274', light: '#ead592', shade: '#c4a85c', tuft: '#a48a3c', flowers: ['#e8574a', '#ffffff'], trees: ['hay', 'poplar', 'hay'], density: 0.9, stream: false, pebbles: '#f0e5c6' },
  plaza: { base: '#cfc6b6', light: '#ddd6c9', shade: '#b4aa98', tuft: '#7c9a4b', flowers: ['#e8574a', '#f6d34c'], trees: ['bush', 'poplar'], density: 0.5, stream: false, pebbles: '#e8e2d6' },
  bloom: { base: '#9fd06a', light: '#bce089', shade: '#84b955', tuft: '#4f8a35', flowers: ['#e8394a', '#f6d34c', '#ffffff', '#e8394a'], trees: ['blossom', 'poplar', 'bush'], density: 1, stream: true, pebbles: '#ebe5d4' },
  honey: { base: '#bcd466', light: '#d3e283', shade: '#a2bd52', tuft: '#6d8f35', flowers: ['#f6c836', '#f6c836', '#ffffff', '#c86fd0'], trees: ['apple', 'bush', 'blossom'], density: 1, stream: false, pebbles: '#ece5cf' },
  valley: { base: '#97c866', light: '#b2d985', shade: '#7cb153', tuft: '#4b8433', flowers: ['#ffffff', '#6fb4e8', '#f6d34c'], trees: ['poplar', 'poplar', 'walnut'], density: 1.1, stream: true, pebbles: '#e7e3d8' },
  alpine: { base: '#b9cf8e', light: '#d0e0aa', shade: '#9db677', tuft: '#6c8a4a', flowers: ['#ffffff', '#c86fd0', '#f6d34c'], trees: ['rock', 'rock', 'pine'], density: 0.9, stream: true, pebbles: '#dcdcd6' },
  autumn: { base: '#d0b26a', light: '#e2c98a', shade: '#b89655', tuft: '#8f7a36', flowers: ['#e0662f', '#c9412f', '#f2b632'], trees: ['autumn', 'autumn', 'poplar'], density: 1.1, stream: false, pebbles: '#efe3c8' },
  snow: { base: '#eef2f6', light: '#ffffff', shade: '#d3dce7', tuft: '#9fb0c2', flowers: ['#c9412f'], trees: ['snowpine', 'bare', 'snowpine'], density: 0.9, stream: false, pebbles: '#c9d2dc' },
};

/** The ground's own colours for an app that fills a unit not drawn yet (far from the screen) with its base alone. */
export function pathGroundColour(ground: PathGround, dark = false): string {
  return dusk(GROUNDS[ground].base, dark);
}

// ───────────────────────────────────────────────────────────── the pen

/** Collects shapes in one ink and line weight. */
class Pen {
  readonly parts: string[] = [];
  constructor(
    readonly ink: string,
    readonly weight: number,
  ) {}

  /** A form with its outline. */
  face(d: string, colour: string, weight = this.weight): void {
    this.parts.push(`<path d="${d}" fill="${colour}" stroke="${this.ink}" stroke-width="${n2(weight)}" stroke-linejoin="round"/>`);
  }

  /** A flat patch of light or shade, inside a form already outlined. */
  flat(d: string, colour: string, opacity = 1): void {
    this.parts.push(`<path d="${d}" fill="${colour}"${opacity === 1 ? '' : ` fill-opacity="${n2(opacity)}"`}/>`);
  }

  /** A line with round ends. */
  line(d: string, colour: string, width: number, opacity = 1): void {
    this.parts.push(
      `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n2(width)}" stroke-linecap="round" stroke-linejoin="round"${opacity === 1 ? '' : ` stroke-opacity="${n2(opacity)}"`}/>`,
    );
  }

  add(markup: string): void {
    this.parts.push(markup);
  }

  markup(): string {
    return this.parts.join('');
  }
}

const poly = (points: readonly Pt[]): string => `M${points.map((p) => `${n(p[0])} ${n(p[1])}`).join('L')}Z`;
const ovalPath = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-2 * rx)} 0z`;

/** A point on the ground, `u` toward the lower right, `v` toward the lower left, `z` up, from an origin on the canvas. */
const iso = (o: Pt, u: number, v: number, z: number): Pt => [o[0] + (u - v), o[1] + (u + v) / 2 - z];

/** A box standing on the ground: its face toward the lower left lit, the one toward the lower right in shade, its top lightest. */
function box(pen: Pen, o: Pt, u: number, v: number, w: number, d: number, h: number, t: Tones, z = 0): void {
  const a = (du: number, dv: number, dz: number): Pt => iso(o, u + du, v + dv, z + dz);
  pen.face(poly([a(0, d, 0), a(w, d, 0), a(w, d, h), a(0, d, h)]), t.face);
  pen.face(poly([a(w, 0, 0), a(w, d, 0), a(w, d, h), a(w, 0, h)]), t.shade);
  pen.face(poly([a(0, 0, h), a(w, 0, h), a(w, d, h), a(0, d, h)]), t.light);
}

/** A standing cylinder: its round top lit, its side lit on the left half and shaded on the right. */
function drum(pen: Pen, c: Pt, r: number, h: number, t: Tones): void {
  const rx = r * Math.SQRT2;
  const ry = rx / 2;
  const [x, y] = c;
  pen.face(`M${n(x - rx)} ${n(y - h)}L${n(x - rx)} ${n(y)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x + rx)} ${n(y)}L${n(x + rx)} ${n(y - h)}Z`, t.face);
  pen.flat(`M${n(x + rx * 0.25)} ${n(y - h)}L${n(x + rx * 0.25)} ${n(y + ry * 0.97)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x + rx - 0.8)} ${n(y)}L${n(x + rx - 0.8)} ${n(y - h)}Z`, t.shade);
  pen.face(ovalPath(x, y - h, rx, ry), t.light);
}

/** A round crown of leaves: its shade, its face shifted up and left over it, a spot of light, and its outline. */
function crown(pen: Pen, cx: number, cy: number, r: number, t: Tones): void {
  pen.face(ovalPath(cx, cy, r, r), t.shade);
  pen.flat(ovalPath(cx - r * 0.14, cy - r * 0.16, r * 0.84, r * 0.82), t.face);
  pen.flat(ovalPath(cx - r * 0.38, cy - r * 0.4, r * 0.32, r * 0.26), t.light);
}

/** The pool of shade a thing stands in, flat on the ground. */
function shadow(pen: Pen, cx: number, cy: number, rx: number, ry: number, dark: boolean): void {
  pen.flat(ovalPath(cx, cy, rx, ry), dark ? '#05060c' : '#2c3b16', dark ? 0.32 : 0.18);
}

// ───────────────────────────────────────────────────────────── the ground

export interface PathLandOptions {
  ground: PathGround;
  /** the size it is shown, in points: the unit's path, edge to edge */
  width: number;
  height: number;
  /** the unit's stops and stones, in the path's logical terms (`lessonPath`, `trailStones`) */
  stops: readonly WorldStop[];
  stones: readonly TrailStone[];
  dark?: boolean;
  /** drawn for a right-to-left page: what leans toward the end of the line stands on the left */
  rtl?: boolean;
  /** varies the scatter, so two units on the same ground are not the same picture */
  seed?: string;
  idPrefix?: string;
}

/**
 * One unit's ground, edge to edge, its top and foot gently waved so one land
 * gives way to the next under a unit's banner. Decorative: the stops on it
 * say everything there is to say, so it is hidden from screen readers.
 */
export function pathLandSvg(opts: PathLandOptions): string {
  const { width: W, height: H, dark = false, rtl = false } = opts;
  if (!(W > 0) || !(H > 0) || !Number.isFinite(W) || !Number.isFinite(H)) throw new RangeError(`art: land size must be positive, got ${W}×${H}`);
  const g = GROUNDS[opts.ground];
  if (!g) throw new RangeError(`art: no ground ${String(opts.ground)}`);
  const sign = rtl ? -1 : 1;
  const X = (x: number): number => W / 2 + sign * x;
  const ink = dark ? INK.dusk : INK.day;
  const pen = new Pen(ink, 1.4);
  const random = seeded(`land|${opts.ground}|${opts.seed ?? ''}|${Math.round(W)}|${Math.round(H)}`);
  const c = (hex: string): string => dusk(hex, dark);

  // the ground, its top and foot waved
  const wave = (y: number, amp: number, phase: number): string => {
    const steps = Math.max(4, Math.round(W / 60));
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const x = (W * i) / steps;
      d += `${i === 0 ? 'M' : 'L'}${n(x)} ${n(y + amp * Math.sin(i * 1.7 + phase))}`;
    }
    return d;
  };
  const top = wave(7, 5, random() * 6);
  const foot = wave(H - 7, 5, random() * 6)
    .replace(/^M/, 'L')
    .split('L')
    .filter(Boolean)
    .reverse()
    .join('L');
  pen.flat(`${top}L${foot}Z`, c(g.base));

  const { solid, tall } = landClear(opts.stops, W, opts.stones);
  const free = (x: number, y: number, w: number, h: number, also: readonly PathBox[] = []): boolean => {
    if (Math.abs(x) + w / 2 > W / 2 + w * 0.3) return false;
    if (y < 10 || y + h > H - 6) return false;
    for (const b of [...solid, ...also]) if (Math.abs(x - b.x) * 2 < w + b.w && y < b.y + b.h && b.y < y + h) return false;
    return true;
  };

  // broad patches of light and shade, under everything
  const patches = Math.max(3, Math.round((W * H) / 26000));
  for (let i = 0; i < patches; i++) {
    const x = random() * W;
    const y = 30 + random() * (H - 60);
    const rx = 40 + random() * 70;
    const ry = rx * (0.32 + random() * 0.18);
    pen.flat(ovalPath(x, y, rx, ry), c(i % 2 === 0 ? g.light : g.shade), 0.85);
  }

  // a stream across the unit, between two stops, which the stepping stones cross
  if (g.stream && opts.stops.length > 2) {
    const a = opts.stops[1]!;
    const b = opts.stops[2]!;
    const y0 = (a.y + b.y) / 2 + 6;
    const pts: Pt[] = [];
    const steps = Math.max(6, Math.round(W / 40));
    for (let i = 0; i <= steps; i++) {
      const x = (W * i) / steps;
      pts.push([x, y0 + 12 * Math.sin(i * 0.9 + 1) + (i % 2 === 0 ? 3 : -3)]);
    }
    const bank = (dy: number): string => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p[0])} ${n(p[1] + dy)}`).join('');
    const back = (dy: number): string =>
      pts
        .slice()
        .reverse()
        .map((p) => `L${n(p[0])} ${n(p[1] + dy)}`)
        .join('');
    const water = tones(WATER, dark);
    pen.face(`${bank(-11)}${back(11)}Z`, water.face, 1.4);
    pen.flat(`${bank(5)}${back(11)}Z`, water.shade, 0.7);
    for (let i = 0; i < steps; i += 2) {
      const [x, y] = pts[i]!;
      pen.line(`M${n(x + 8)} ${n(y - 3)}l${n(14)} ${n(-1)}`, water.light, 2.2, 0.9);
    }
  }

  // tufts, flowers and pebbles: small, many, and few elements (one path per colour)
  const tufts: string[] = [];
  const pebbles: string[] = [];
  const flowers: string[][] = g.flowers.map(() => []);
  const smalls = Math.round((W * H) / 2600);
  for (let i = 0; i < smalls; i++) {
    const lx = (random() - 0.5) * W;
    const y = 14 + random() * (H - 28);
    if (!free(lx, y - 6, 12, 10)) continue;
    const x = X(lx);
    const kind = random();
    if (kind < 0.55) tufts.push(`M${n(x - 4)} ${n(y)}l2.5 -6M${n(x)} ${n(y)}l0 -8M${n(x + 4)} ${n(y)}l-2.5 -6`);
    else if (kind < 0.85) flowers[Math.floor(random() * flowers.length)]!.push(ovalPath(x, y - 2, 2.2, 2.2));
    else pebbles.push(ovalPath(x, y - 1.5, 3.4, 2.2));
  }
  if (tufts.length > 0) pen.line(tufts.join(''), c(g.tuft), 1.7);
  if (pebbles.length > 0) pen.face(pebbles.join(''), c(g.pebbles), 1);
  flowers.forEach((list, i) => {
    if (list.length > 0) pen.flat(list.join(''), dark ? mix(g.flowers[i]!, DUSK, 0.3) : g.flowers[i]!);
  });

  // trees and rocks, back to front, out of the way of the path and of anyone standing by it
  const want = Math.round(((W * H) / 10000) * g.density);
  const placed: { x: number; y: number; kind: TreeKind; s: number }[] = [];
  for (let tries = 0; tries < want * 12 && placed.length < want; tries++) {
    const kind = g.trees[Math.floor(random() * g.trees.length)]!;
    const s = 0.8 + random() * 0.45;
    const fw = (kind === 'poplar' || kind === 'pine' || kind === 'snowpine' ? 26 : 40) * s;
    const fh = (kind === 'poplar' || kind === 'pine' || kind === 'snowpine' ? 70 : kind === 'rock' || kind === 'hay' ? 30 : 56) * s;
    const lx = (random() - 0.5) * (W + fw * 0.6);
    const y = 6 + random() * (H - fh - 10);
    if (!free(lx, y, fw, fh, tall)) continue;
    if (placed.some((p) => Math.abs(p.x - lx) < fw * 0.8 && Math.abs(p.y - y) < fh * 0.6)) continue;
    placed.push({ x: lx, y: y + fh, kind, s });
  }
  placed.sort((a, b) => a.y - b.y);
  for (const p of placed) tree(pen, X(p.x), p.y, p.kind, p.s, dark);

  const prefix = prefixFor(opts.idPrefix, 'land', opts.ground, dark, rtl, opts.seed ?? '', Math.round(W), Math.round(H));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}" height="${n(H)}" viewBox="0 0 ${n(W)} ${n(H)}" aria-hidden="true" focusable="false" id="${prefix}">` +
    `${pen.markup()}</svg>`
  );
}

/** A tree, a rock or a stack of hay, its foot at (x, y). */
function tree(pen: Pen, x: number, y: number, kind: TreeKind, s: number, dark: boolean): void {
  const T = (t: Tones): Tones => tones(t, dark);
  const trunk = T(WOOD);
  switch (kind) {
    case 'poplar':
    case 'pine':
    case 'snowpine': {
      shadow(pen, x + 4 * s, y, 13 * s, 4 * s, dark);
      pen.face(`M${n(x - 2.5 * s)} ${n(y)}l0 ${n(-12 * s)}l${n(5 * s)} 0l0 ${n(12 * s)}z`, trunk.shade, 1.3);
      if (kind === 'poplar') {
        const leaf = T(POPLAR);
        const d = `M${n(x)} ${n(y - 70 * s)}C${n(x + 13 * s)} ${n(y - 52 * s)} ${n(x + 13 * s)} ${n(y - 22 * s)} ${n(x)} ${n(y - 10 * s)}C${n(x - 13 * s)} ${n(y - 22 * s)} ${n(x - 13 * s)} ${n(y - 52 * s)} ${n(x)} ${n(y - 70 * s)}Z`;
        pen.face(d, leaf.shade);
        pen.flat(`M${n(x - 1 * s)} ${n(y - 68 * s)}C${n(x - 12 * s)} ${n(y - 50 * s)} ${n(x - 11 * s)} ${n(y - 24 * s)} ${n(x - 1 * s)} ${n(y - 12 * s)}C${n(x + 5 * s)} ${n(y - 30 * s)} ${n(x + 6 * s)} ${n(y - 52 * s)} ${n(x - 1 * s)} ${n(y - 68 * s)}Z`, leaf.face);
        pen.line(`M${n(x - 5 * s)} ${n(y - 54 * s)}q${n(-1 * s)} ${n(10 * s)} 0 ${n(20 * s)}`, leaf.light, 2.4 * s);
      } else {
        const leaf = T(kind === 'snowpine' ? { light: '#5f9a6a', face: '#3f7552', shade: '#2b5640' } : { light: '#6faa5c', face: '#447f45', shade: '#2f5f36' });
        // three tiers, each in shade with its lit side and (in snow) a cap, as three paths for the whole tree
        const shade: string[] = [];
        const lit: string[] = [];
        const caps: string[] = [];
        for (let k = 0; k < 3; k++) {
          const top = y - (64 - k * 16) * s;
          const half = (11 + k * 4) * s;
          const base = top + 26 * s;
          shade.push(`M${n(x)} ${n(top)}L${n(x + half)} ${n(base)}L${n(x - half)} ${n(base)}Z`);
          lit.push(`M${n(x)} ${n(top + 2 * s)}L${n(x + half * 0.15)} ${n(base - 1.5 * s)}L${n(x - half + 2 * s)} ${n(base - 1.5 * s)}Z`);
          caps.push(`M${n(x)} ${n(top + 1 * s)}L${n(x + half * 0.45)} ${n(top + 11 * s)}L${n(x - half * 0.5)} ${n(top + 11 * s)}Z`);
        }
        pen.face(shade.reverse().join(''), leaf.shade, 1.3);
        pen.flat(lit.join(''), leaf.face);
        if (kind === 'snowpine') pen.flat(caps.join(''), dusk(SNOW.light, dark, 0.35));
      }
      return;
    }
    case 'rock': {
      const r = T(STONE_GREY);
      shadow(pen, x + 3 * s, y, 17 * s, 4.5 * s, dark);
      const d = `M${n(x - 16 * s)} ${n(y)}L${n(x - 12 * s)} ${n(y - 15 * s)}L${n(x - 2 * s)} ${n(y - 22 * s)}L${n(x + 11 * s)} ${n(y - 16 * s)}L${n(x + 16 * s)} ${n(y)}Z`;
      pen.face(d, r.face);
      pen.flat(`M${n(x + 2 * s)} ${n(y - 20.5 * s)}L${n(x + 11 * s)} ${n(y - 16 * s)}L${n(x + 15 * s)} ${n(y - 1 * s)}L${n(x + 3 * s)} ${n(y - 1 * s)}Z`, r.shade);
      pen.flat(`M${n(x - 11 * s)} ${n(y - 14 * s)}L${n(x - 2 * s)} ${n(y - 20 * s)}L${n(x + 1 * s)} ${n(y - 15 * s)}L${n(x - 8 * s)} ${n(y - 10 * s)}Z`, r.light);
      return;
    }
    case 'hay': {
      const h = T({ light: '#f6dc8a', face: '#e2bb5a', shade: '#b98e38' });
      shadow(pen, x + 3 * s, y, 16 * s, 4.5 * s, dark);
      pen.face(`M${n(x - 15 * s)} ${n(y)}C${n(x - 15 * s)} ${n(y - 30 * s)} ${n(x + 15 * s)} ${n(y - 30 * s)} ${n(x + 15 * s)} ${n(y)}Z`, h.face);
      pen.flat(`M${n(x + 3 * s)} ${n(y - 22 * s)}C${n(x + 12 * s)} ${n(y - 18 * s)} ${n(x + 14 * s)} ${n(y - 8 * s)} ${n(x + 14 * s)} ${n(y - 1 * s)}L${n(x + 4 * s)} ${n(y - 1 * s)}Z`, h.shade);
      pen.line(`M${n(x - 9 * s)} ${n(y - 14 * s)}q${n(8 * s)} ${n(-6 * s)} ${n(16 * s)} 0`, h.light, 1.8 * s);
      return;
    }
    case 'bare': {
      shadow(pen, x + 4 * s, y, 14 * s, 4 * s, dark);
      const b = T({ light: '#a07a58', face: '#7a5a3f', shade: '#5a412d' });
      pen.line(`M${n(x)} ${n(y)}L${n(x)} ${n(y - 34 * s)}M${n(x)} ${n(y - 18 * s)}L${n(x - 12 * s)} ${n(y - 32 * s)}M${n(x)} ${n(y - 24 * s)}L${n(x + 11 * s)} ${n(y - 38 * s)}M${n(x - 6 * s)} ${n(y - 25 * s)}L${n(x - 7 * s)} ${n(y - 36 * s)}`, pen.ink, 5 * s);
      pen.line(`M${n(x)} ${n(y)}L${n(x)} ${n(y - 34 * s)}M${n(x)} ${n(y - 18 * s)}L${n(x - 12 * s)} ${n(y - 32 * s)}M${n(x)} ${n(y - 24 * s)}L${n(x + 11 * s)} ${n(y - 38 * s)}M${n(x - 6 * s)} ${n(y - 25 * s)}L${n(x - 7 * s)} ${n(y - 36 * s)}`, b.face, 2.6 * s);
      pen.flat(ovalPath(x - 11 * s, y - 33 * s, 4 * s, 2 * s), dusk(SNOW.light, dark, 0.35));
      pen.flat(ovalPath(x + 10 * s, y - 39 * s, 4 * s, 2 * s), dusk(SNOW.light, dark, 0.35));
      return;
    }
    default: {
      const leaf =
        kind === 'blossom'
          ? T({ light: '#ffe6ef', face: '#f6bfd2', shade: '#df92ad' })
          : kind === 'autumn'
            ? T({ light: '#f7c45c', face: '#e48a34', shade: '#b85e26' })
            : kind === 'walnut'
              ? T({ light: '#99cb6a', face: '#5f9c45', shade: '#3f7435' })
              : T(LEAF);
      const r = (kind === 'bush' ? 13 : 19) * s;
      shadow(pen, x + 5 * s, y, r * 0.95, r * 0.28, dark);
      if (kind !== 'bush') pen.face(`M${n(x - 3 * s)} ${n(y)}l${n(1 * s)} ${n(-22 * s)}l${n(4 * s)} 0l${n(1 * s)} ${n(22 * s)}z`, trunk.face, 1.3);
      const cy = kind === 'bush' ? y - r * 0.8 : y - 24 * s - r * 0.7;
      crown(pen, x, cy, r, leaf);
      if (kind === 'apple') {
        const red = dark ? mix('#e0403a', DUSK, 0.3) : '#e0403a';
        pen.flat([ovalPath(x - 7 * s, cy + 3 * s, 2.6 * s, 2.6 * s), ovalPath(x + 6 * s, cy - 4 * s, 2.6 * s, 2.6 * s), ovalPath(x + 2 * s, cy + 9 * s, 2.6 * s, 2.6 * s)].join(''), red);
      }
    }
  }
}

// ───────────────────────────────────────────────────────────── the trail

export interface PathStonesOptions {
  width: number;
  height: number;
  stones: readonly TrailStone[];
  /** walked: pale limestone, laid proud of the grass; ahead: the same stones, sunk and grey */
  walked: boolean;
  dark?: boolean;
  rtl?: boolean;
}

/** Stepping stones from one stop to the next, each with its foot of shade, its face and its outline; three elements whatever their number. */
export function pathStonesSvg(opts: PathStonesOptions): string {
  const { width: W, height: H, dark = false, rtl = false, walked } = opts;
  if (!(W > 0) || !(H > 0)) throw new RangeError(`art: stones need a size, got ${W}×${H}`);
  const sign = rtl ? -1 : 1;
  const ink = dark ? INK.dusk : INK.day;
  const t = walked ? tones(STONE, dark) : dark ? { light: '#5d6170', face: '#474a57', shade: '#30323d' } : { light: '#d9d6c8', face: '#c3bfae', shade: '#a19d8b' };
  const sides: string[] = [];
  const faces: string[] = [];
  const lights: string[] = [];
  for (const s of opts.stones) {
    const x = W / 2 + sign * s.x;
    const rx = s.r;
    const ry = s.r * 0.62;
    const lip = walked ? 3.4 : 1.6;
    sides.push(ovalPath(x, s.y + lip, rx, ry));
    faces.push(ovalPath(x, s.y, rx, ry));
    if (walked) lights.push(`M${n(x - rx * 0.55)} ${n(s.y - ry * 0.2)}q${n(rx * 0.25)} ${n(-ry * 0.55)} ${n(rx * 0.75)} ${n(-ry * 0.6)}`);
  }
  const body =
    `<path d="${sides.join('')}" fill="${t.shade}" stroke="${ink}" stroke-width="1.4"/>` +
    `<path d="${faces.join('')}" fill="${t.face}" stroke="${ink}" stroke-width="1.4"/>` +
    (lights.length > 0 ? `<path d="${lights.join('')}" fill="none" stroke="${t.light}" stroke-width="2" stroke-linecap="round"/>` : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}" height="${n(H)}" viewBox="0 0 ${n(W)} ${n(H)}" aria-hidden="true" focusable="false">${opts.stones.length > 0 ? body : ''}</svg>`;
}

// ───────────────────────────────────────────────────────────── the stops

/**
 * A stop's picture: `box` points square, the stop's centre at (`cx`, `cy`)
 * in it. The disc's face is `rx` × `ry`, standing `side` proud of the ground
 * (`raised` for the current skill, lifted higher); `press` is how far the
 * face goes down into its base under a finger.
 */
export const PATH_STOP_ART = { box: 112, cx: 56, cy: 58, rx: 36, ry: 26, side: 10, raised: 15, press: 7 } as const;

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
  'jump',
  'chest',
  'chestOpen',
] as const;
export type PathStopLook = (typeof PATH_STOP_LOOKS)[number];

/**
 * The stops' colours by unit tone: the same `fill` and `lip` the apps paint a
 * unit's banner with (mobile coursemap/path.ts, web learn/path.css), so a
 * unit's stops and its banner are one colour — deep by day, light by evening.
 */
export const PATH_STOP_TONES: Record<'light' | 'dark', Record<UnitTone, { fill: string; lip: string }>> = {
  light: {
    meadow: { fill: '#2e7a52', lip: '#1f5739' },
    river: { fill: '#2a6a93', lip: '#1c4c6b' },
    clay: { fill: '#a9532f', lip: '#7d3c21' },
    dusk: { fill: '#6551a6', lip: '#493a7d' },
    pine: { fill: '#56692b', lip: '#3e4c1e' },
    rose: { fill: '#a3446b', lip: '#78304e' },
    saffron: { fill: '#9a6508', lip: '#6f4806' },
  },
  dark: {
    meadow: { fill: '#7fcf9f', lip: '#4d9a6c' },
    river: { fill: '#86bfe8', lip: '#4f88b3' },
    clay: { fill: '#eda585', lip: '#b46e50' },
    dusk: { fill: '#b9aaf0', lip: '#8273bd' },
    pine: { fill: '#bcd283', lip: '#849a4f' },
    rose: { fill: '#eda0bf', lip: '#b56a8a' },
    saffron: { fill: '#f0c060', lip: '#b88a2a' },
  },
};

/** What is not open yet: a muted field stone. */
const REST_STONE = { light: { face: '#d8d3c6', side: '#aaa290', glint: '#efebe2' }, dark: { face: '#5a5d6a', side: '#3e404b', glint: '#7d8090' } } as const;
/** An open stop's face, and the guide's and a story's parchment. */
const PAPER = { light: { face: '#fbf5e6', side: '#d9c9a5', glint: '#ffffff' }, dark: { face: '#ece2cb', side: '#bba984', glint: '#fff8e8' } } as const;

export interface PathStopOptions {
  look: PathStopLook;
  tone: UnitTone;
  /** the base (its shade on the ground and its side) or the face that a press pushes down */
  part: 'base' | 'face';
  dark?: boolean;
  /** how big it is shown, in points; the drawing is `PATH_STOP_ART.box` square */
  size?: number;
  idPrefix?: string;
}

/**
 * One stop, base or face. The face of a skill carries nothing but its colour
 * and its one highlight: the app sets its glyph on it. The guide's book, a
 * story's scroll, the jump's gate and the unit's chest are part of the face.
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
  const ink = dark ? INK.dusk : INK.day;
  const restInk = ink;
  const prefix = prefixFor(opts.idPrefix, 'stop', look, tone, part, dark);
  const side = look === 'current' ? PATH_STOP_ART.raised : look === 'chest' || look === 'chestOpen' || look === 'jump' ? 6 : PATH_STOP_ART.side;

  // the disc's colours, by look
  const rest = REST_STONE[scheme];
  const paper = PAPER[scheme];
  const disc = ((): { face: string; side: string; glint: string; ink: string; ring?: string } => {
    switch (look) {
      case 'locked':
      case 'guideLocked':
        return { face: rest.face, side: rest.side, glint: rest.glint, ink: restInk };
      case 'available':
        return { face: paper.face, side: t.lip, glint: paper.glint, ink, ring: t.fill };
      case 'review':
        return { face: paper.face, side: rest.side, glint: paper.glint, ink, ring: mix(t.fill, paper.face, 0.35) };
      case 'guide':
      case 'story':
        return { face: paper.face, side: t.lip, glint: paper.glint, ink };
      case 'refresh':
        return { face: mix(t.fill, rest.face, 0.45), side: mix(t.lip, rest.side, 0.45), glint: mix(t.fill, '#ffffff', 0.45), ink };
      case 'chest':
      case 'chestOpen':
      case 'jump':
        return { face: rest.face, side: rest.side, glint: rest.glint, ink: restInk };
      default:
        return { face: t.fill, side: t.lip, glint: mix(t.fill, '#ffffff', dark ? 0.5 : 0.35), ink };
    }
  })();
  const line = disc.ink;
  const p = new Pen(line, 2.2);

  if (part === 'base') {
    // its shade on the ground, then its side: the face's lower half, carried down by `side`
    shadow(p, cx + 3, cy + side + 4, rx + 4, ry * 0.5, dark);
    p.face(`M${n(cx - rx)} ${n(cy)}L${n(cx - rx)} ${n(cy + side)}A${n(rx)} ${n(ry)} 0 0 0 ${n(cx + rx)} ${n(cy + side)}L${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 0 1 ${n(cx - rx)} ${n(cy)}Z`, disc.side);
    if (look === 'strong') p.line(`M${n(cx - rx - 3)} ${n(cy + 2)}A${n(rx + 3)} ${n(ry + 3)} 0 0 0 ${n(cx + rx + 3)} ${n(cy + 2)}`, GOLD, 3);
    return wrap(prefix, size, B, p.markup());
  }

  // the face: its colour, its outline, and its one highlight along the upper left
  if (look === 'strong') p.face(ovalPath(cx, cy, rx + 4, ry + 4), GOLD, 2);
  p.face(ovalPath(cx, cy, rx, ry), disc.face);
  if (disc.ring) p.line(ovalPath(cx, cy, rx - 6.5, ry - 5), disc.ring, 4.5);
  p.line(`M${n(cx - rx + 8)} ${n(cy - 6)}Q${n(cx - rx + 14)} ${n(cy - ry + 4)} ${n(cx - 6)} ${n(cy - ry + 3.5)}`, disc.glint, 3.2, dark ? 0.55 : 0.8);
  if (look === 'locked') {
    // a field stone: two old chips in it
    p.flat(ovalPath(cx + 14, cy + 9, 4, 2.4), rest.side, 0.7);
    p.flat(ovalPath(cx - 17, cy + 6, 2.6, 1.6), rest.side, 0.7);
  }
  if (look === 'guide' || look === 'guideLocked') book(p, cx, cy - 6, look === 'guideLocked' ? { light: rest.glint, face: rest.face, shade: rest.side } : { light: mix(t.fill, '#ffffff', 0.3), face: t.fill, shade: t.lip }, dark);
  if (look === 'story') scroll(p, cx, cy - 6, dark);
  if (look === 'jump') gate(p, cx, cy + 4, t, dark);
  if (look === 'chest' || look === 'chestOpen') p.add(chestOn(cx, cy + 2, look === 'chestOpen', prefix));
  return wrap(prefix, size, B, p.markup());
}

function wrap(prefix: string, size: number, box: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${box} ${box}" aria-hidden="true" focusable="false" id="${prefix}">${body}</svg>`;
}

/** An open book standing on the disc, its cover in the unit's colour, two pages of lines. */
function book(p: Pen, x: number, y: number, cover: Tones, dark: boolean): void {
  const page = dark ? '#e9e2d0' : '#fffaf0';
  const pageShade = dark ? '#c9bfa8' : '#ead9b5';
  p.face(`M${n(x - 27)} ${n(y - 2)}L${n(x - 25)} ${n(y + 8)}Q${n(x - 12)} ${n(y + 4)} ${n(x)} ${n(y + 11)}Q${n(x + 12)} ${n(y + 4)} ${n(x + 25)} ${n(y + 8)}L${n(x + 27)} ${n(y - 2)}Z`, cover.shade);
  p.face(`M${n(x)} ${n(y + 8)}Q${n(x - 11)} ${n(y)} ${n(x - 24)} ${n(y + 4)}L${n(x - 22)} ${n(y - 22)}Q${n(x - 10)} ${n(y - 26)} ${n(x)} ${n(y - 18)}Z`, page);
  p.face(`M${n(x)} ${n(y + 8)}Q${n(x + 11)} ${n(y)} ${n(x + 24)} ${n(y + 4)}L${n(x + 22)} ${n(y - 22)}Q${n(x + 10)} ${n(y - 26)} ${n(x)} ${n(y - 18)}Z`, pageShade);
  for (let k = 0; k < 3; k++) {
    const dy = y - 15 + k * 6;
    p.line(`M${n(x - 18)} ${n(dy)}Q${n(x - 10)} ${n(dy - 2.5)} ${n(x - 4)} ${n(dy + 1)}M${n(x + 4)} ${n(dy + 1)}Q${n(x + 10)} ${n(dy - 2.5)} ${n(x + 18)} ${n(dy)}`, cover.face, 1.6, 0.8);
  }
}

/** A scroll, half unrolled, standing on the disc. */
function scroll(p: Pen, x: number, y: number, dark: boolean): void {
  const paper = dark ? '#e3d6b6' : '#f7e7c2';
  const roll = dark ? '#b79d6d' : '#d9b97a';
  p.face(`M${n(x - 20)} ${n(y - 18)}L${n(x + 20)} ${n(y - 18)}L${n(x + 20)} ${n(y + 8)}L${n(x - 20)} ${n(y + 8)}Z`, paper);
  p.line(`M${n(x - 13)} ${n(y - 10)}l26 0M${n(x - 13)} ${n(y - 4)}l22 0M${n(x - 13)} ${n(y + 2)}l18 0`, roll, 1.8);
  for (const yy of [y - 18, y + 8]) {
    p.face(`M${n(x - 24)} ${n(yy - 4)}L${n(x + 24)} ${n(yy - 4)}A4 4 0 0 1 ${n(x + 24)} ${n(yy + 4)}L${n(x - 24)} ${n(yy + 4)}A4 4 0 0 1 ${n(x - 24)} ${n(yy - 4)}Z`, roll);
  }
  p.flat(ovalPath(x + 24, y - 18, 1.6, 2.6), RED.face);
}

/** The jump's gate: two stone pillars, an arch, and doors in the unit's colour, standing on its slab. */
function gate(p: Pen, x: number, y: number, t: { fill: string; lip: string }, dark: boolean): void {
  const stone = tones(STONE, dark);
  const o: Pt = [x, y];
  box(p, o, -22, -4, 9, 8, 34, stone);
  box(p, o, 13, -4, 9, 8, 34, stone);
  // the doors between the pillars, across the front, shut
  const door = (u0: number, u1: number): string => poly([iso(o, u0, 4, 0), iso(o, u1, 4, 0), iso(o, u1, 4, 28), iso(o, u0, 4, 28)]);
  p.face(door(-13, 0), t.fill);
  p.face(door(0, 13), t.lip);
  for (const u of [-2.5, 2.5]) {
    const k = iso(o, u, 4, 14);
    p.flat(ovalPath(k[0], k[1], 1.5, 1.5), GOLD);
  }
  // the lintel over them, and a band of kilim along it
  box(p, o, -24, -5, 48, 10, 6, stone, 34);
  const k0 = iso(o, -22, 5, 37);
  const k1 = iso(o, 22, 5, 37);
  p.line(`M${n(k0[0])} ${n(k0[1])}L${n(k1[0])} ${n(k1[1])}`, RED.face, 2.6);
  p.line(`M${n(k0[0])} ${n(k0[1])}L${n(k1[0])} ${n(k1[1])}`, GOLD, 1.2);
}

/** The app's own chest (chest.ts), small, on the stop's slab; open once its unit is done. */
function chestOn(x: number, y: number, open: boolean, prefix: string): string {
  const drawing = chestDrawing('common', { size: 64, idPrefix: `${prefix}c` });
  const layers: readonly ChestLayerId[] = open ? ['shadow', 'lidOpen', 'body', 'light', 'lock'] : ['shadow', 'body', 'lock', 'lid'];
  const s = 0.56;
  // the chest's foot (60, 104 on its canvas) on the slab's middle
  const tx = x - 60 * s;
  const ty = y + 6 - 104 * s;
  return `<g transform="translate(${n(tx)} ${n(ty)}) scale(${n2(s)})">${layers.map((id) => drawing.layers[id].markup).join('')}</g>`;
}

// ───────────────────────────────────────────────────────────── the landmarks

/** What moves in each landmark, where, on its 120-unit canvas: a box the sprite fills, and the point it moves about. */
export type PathLoopKind = 'kilim' | 'steam' | 'water' | 'flag' | 'flame' | 'smoke' | 'bee' | 'sign';
export interface PathLoop {
  kind: PathLoopKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How each landmark is fitted to its canvas: scaled about the canvas's
 * origin and moved, so that what it draws (measured once, its outline
 * included) fills the canvas from 4 to 116 across and stands on 114.
 */
const FIT: Record<PathLandmark, { s: number; x: number; y: number }> = {
  gate: { s: 0.8, x: 10.2, y: 11.2 },
  teahouse: { s: 0.9, x: -0.5, y: 3.8 },
  spring: { s: 0.99, x: -1.5, y: -2.1 },
  bazaar: { s: 1.02, x: -1.1, y: -7.1 },
  busstop: { s: 1.05, x: -1.3, y: -12.8 },
  citywall: { s: 0.98, x: 1.1, y: -1.0 },
  newroz: { s: 1.08, x: -5.7, y: 0.9 },
  hives: { s: 1.02, x: -1.1, y: -16.8 },
  bridge: { s: 0.88, x: 0.5, y: 1.6 },
  tents: { s: 0.93, x: 3.1, y: -15.7 },
  school: { s: 0.98, x: 1.1, y: -0.9 },
  hearth: { s: 0.98, x: 1.1, y: -0.9 },
};

/** Where each loop sits in the landmark's own drawing, before it is fitted to the canvas (`FIT`). */
const LOOP_AT: Record<PathLandmark, PathLoop> = {
  gate: { kind: 'kilim', x: 42, y: -6, w: 18, h: 22 },
  teahouse: { kind: 'steam', x: 49, y: 62, w: 16, h: 24 },
  spring: { kind: 'water', x: 36, y: 80, w: 30, h: 12 },
  bazaar: { kind: 'kilim', x: 103, y: 59, w: 14, h: 20 },
  busstop: { kind: 'sign', x: 69, y: 55, w: 18, h: 26 },
  citywall: { kind: 'flag', x: 86, y: 10, w: 20, h: 16 },
  newroz: { kind: 'flame', x: 47, y: 42, w: 26, h: 40 },
  hives: { kind: 'bee', x: 43, y: 31, w: 34, h: 34 },
  bridge: { kind: 'water', x: 20, y: 104, w: 30, h: 12 },
  tents: { kind: 'smoke', x: 72, y: 103, w: 16, h: 30 },
  school: { kind: 'flag', x: 76, y: 26, w: 20, h: 16 },
  hearth: { kind: 'smoke', x: 74, y: 4, w: 16, h: 30 },
};

/** What moves in each landmark, where, on its 120-unit canvas: the box its sprite (`pathLoopSvg`) fills. */
export const PATH_LANDMARK_LOOP: Record<PathLandmark, PathLoop> = Object.fromEntries(
  (Object.keys(LOOP_AT) as PathLandmark[]).map((k) => {
    const at = LOOP_AT[k];
    const fit = FIT[k];
    const r = (v: number): number => Math.round(v * 10) / 10;
    return [k, { kind: at.kind, x: r(fit.x + fit.s * at.x), y: r(fit.y + fit.s * at.y), w: r(fit.s * at.w), h: r(fit.s * at.h) }];
  }),
) as Record<PathLandmark, PathLoop>;

export interface PathLandmarkOptions {
  landmark: PathLandmark;
  dark?: boolean;
  size?: number;
  /** its name for a screen reader; without one the drawing is decorative and hidden */
  title?: string;
  idPrefix?: string;
}

/**
 * A unit's landmark on the 120-unit canvas, standing with its foot near the
 * bottom middle, in its pool of shade. Its moving part (`PATH_LANDMARK_LOOP`)
 * is drawn at rest here; the apps lay `pathLoopSvg` over it.
 */
export function pathLandmarkSvg(opts: PathLandmarkOptions): string {
  const { landmark, dark = false } = opts;
  const draw = LANDMARKS[landmark];
  if (!draw) throw new RangeError(`art: no landmark ${String(landmark)}`);
  const size = opts.size ?? CANVAS;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const prefix = prefixFor(opts.idPrefix, 'landmark', landmark, dark);
  const fit = FIT[landmark];
  // drawn at its own scale, then fitted to the canvas: the outline keeps one weight whatever the fit
  const pen = new Pen(dark ? INK.dusk : INK.day, 1.4 / fit.s);
  draw(pen, dark);
  const body = `<g transform="translate(${n(fit.x)} ${n(fit.y)}) scale(${n2(fit.s)})">${pen.markup()}</g>`;
  const label = opts.title
    ? ` role="img" aria-labelledby="${prefix}t"><title id="${prefix}t">${escapeXml(opts.title)}</title>`
    : ' aria-hidden="true" focusable="false">';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${CANVAS} ${CANVAS}"${label}${body}</svg>`;
}



type Draw = (pen: Pen, dark: boolean) => void;
const O: Pt = [60, 100];

const LANDMARKS: Record<PathLandmark, Draw> = {
  /** Sêvan's blue gate: two stone pillars and their lintel, the gate's two leaves, low walls running off, and a kilim on a pole. */
  gate(p, dark) {
    const stone = tones(STONE, dark);
    const blue = tones(BLUE, dark);
    shadow(p, 64, 102, 52, 12, dark);
    crown(p, 92, 36, 18, tones(LEAF, dark));
    p.flat([ovalPath(86, 38, 2.4, 2.4), ovalPath(97, 30, 2.4, 2.4), ovalPath(99, 43, 2.4, 2.4)].join(''), dusk('#e0403a', dark, 0.3));
    box(p, O, -48, -6, 22, 10, 16, stone);
    box(p, O, 26, -6, 24, 10, 16, stone);
    box(p, O, -26, -8, 12, 14, 48, stone);
    box(p, O, 14, -8, 12, 14, 48, stone);
    const leaf = (u0: number, u1: number): string => poly([iso(O, u0, 2, 0), iso(O, u1, 2, 0), iso(O, u1, 2, 40), iso(O, u0, 2, 40)]);
    p.face(leaf(-14, 0), blue.face);
    p.face(leaf(0, 14), blue.shade);
    for (const u of [-10, -5, 4, 9]) {
      const a = iso(O, u, 2, 3);
      const b = iso(O, u, 2, 37);
      p.line(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, blue.light, 1.2, 0.7);
    }
    const knob = iso(O, -2, 2, 19);
    p.flat(ovalPath(knob[0], knob[1], 1.5, 1.5), GOLD);
    box(p, O, -30, -10, 60, 18, 9, stone, 48);
    // the kilim's pole on the left pillar; the kilim itself is the loop
    const foot = iso(O, -20, -1, 57);
    p.line(`M${n(foot[0])} ${n(foot[1])}l0 -40`, tones(WOOD, dark).shade, 2.2);
    p.flat(ovalPath(foot[0], foot[1] - 41, 2, 2), GOLD);
  },

  /** Hamo's tea: a flat-roofed stone house with a blue door, a porch on two posts, a table, a samovar and a glass. */
  teahouse(p, dark) {
    const stone = tones(STONE, dark);
    const wood = tones(WOOD, dark);
    shadow(p, 60, 104, 54, 12, dark);
    box(p, O, -10, -34, 40, 30, 34, stone);
    box(p, O, -12, -36, 44, 34, 4, tones(EARTH, dark), 34);
    // a door and a window in the lit face
    const door = poly([iso(O, -2, -4, 0), iso(O, 8, -4, 0), iso(O, 8, -4, 22), iso(O, -2, -4, 22)]);
    p.face(door, tones(BLUE, dark).face);
    const win = poly([iso(O, 16, -4, 14), iso(O, 24, -4, 14), iso(O, 24, -4, 24), iso(O, 16, -4, 24)]);
    p.face(win, dark ? WINDOW_LIT : OPENING);
    // the porch: a thin roof on two posts
    for (const u of [-6, 26]) {
      const a = iso(O, u, 16, 0);
      p.line(`M${n(a[0])} ${n(a[1])}l0 -26`, wood.shade, 2.6);
    }
    box(p, O, -10, -4, 40, 22, 3, tones(RED, dark), 26);
    // the table, the samovar and a tea glass
    box(p, O, 2, 6, 12, 10, 9, wood);
    drum(p, iso(O, 7, 10, 9), 3.2, 11, tones({ light: '#f3d7a0', face: '#d9a75a', shade: '#a8783a' }, dark));
    const lid = iso(O, 7, 10, 21);
    p.face(`M${n(lid[0] - 3)} ${n(lid[1])}L${n(lid[0])} ${n(lid[1] - 4)}L${n(lid[0] + 3)} ${n(lid[1])}Z`, tones(WOOD, dark).face, 1.2);
    const glass = iso(O, 12, 12, 9);
    p.face(`M${n(glass[0] - 1.8)} ${n(glass[1] - 5)}L${n(glass[0] + 1.8)} ${n(glass[1] - 5)}L${n(glass[0] + 1.2)} ${n(glass[1])}L${n(glass[0] - 1.2)} ${n(glass[1])}Z`, dusk('#b5452e', dark, 0.25), 1);
  },

  /** The spring under the walnut tree: a stone arch in a wall, the spout's water falling into a long basin. */
  spring(p, dark) {
    const stone = tones(STONE_GREY, dark);
    const water = tones(WATER, dark);
    shadow(p, 62, 104, 54, 12, dark);
    crown(p, 82, 30, 24, tones({ light: '#99cb6a', face: '#5f9c45', shade: '#3f7435' }, dark));
    const trunk = tones(WOOD, dark);
    p.face(`M80 52l1 -6l4 0l1 6z`, trunk.face, 1.2);
    box(p, O, -34, -24, 50, 12, 46, stone);
    // the arch, dark, cut into the lit face, and the spout in it
    const a0 = iso(O, -24, -12, 0);
    const a1 = iso(O, 4, -12, 0);
    const top = iso(O, -10, -12, 34);
    p.face(`M${n(a0[0])} ${n(a0[1] - 14)}L${n(a0[0])} ${n(a0[1] - 24)}Q${n(top[0] - 4)} ${n(top[1] - 6)} ${n(a1[0])} ${n(a1[1] - 24)}L${n(a1[0])} ${n(a1[1] - 14)}Z`, OPENING);
    const spout = iso(O, -10, -12, 22);
    p.line(`M${n(spout[0])} ${n(spout[1])}l0 13`, water.light, 3.4);
    // the basin in front, full
    box(p, O, -30, -8, 42, 16, 10, stone);
    const w0 = iso(O, -27, -5, 10);
    p.face(poly([w0, iso(O, 9, -5, 10), iso(O, 9, 5, 10), iso(O, -27, 5, 10)]), water.face, 1.2);
    p.line(`M${n(w0[0] + 10)} ${n(w0[1] + 6)}l14 7`, water.light, 1.6);
  },

  /** Market day: a stall with a striped awning on two poles, crates of apples and melons, and a hanging kilim. */
  bazaar(p, dark) {
    const wood = tones(WOOD, dark);
    shadow(p, 60, 104, 54, 12, dark);
    // the poles at the back, then the counter and its crates
    for (const u of [-28, 26]) {
      const a = iso(O, u, -18, 0);
      p.line(`M${n(a[0])} ${n(a[1])}l0 -50`, wood.shade, 2.6);
    }
    box(p, O, -28, -14, 56, 22, 18, wood);
    box(p, O, -24, -10, 16, 14, 7, tones({ light: '#e7c58b', face: '#c99a58', shade: '#9b7139' }, dark), 18);
    box(p, O, -4, -10, 16, 14, 7, tones({ light: '#e7c58b', face: '#c99a58', shade: '#9b7139' }, dark), 18);
    const apples = [iso(O, -18, -4, 27), iso(O, -14, -6, 27), iso(O, -20, -8, 26), iso(O, -12, -2, 26)];
    p.face(apples.map((a) => ovalPath(a[0], a[1], 3, 3)).join(''), dusk('#e0403a', dark, 0.25), 1.1);
    const melons = [iso(O, 3, -4, 28), iso(O, 8, -6, 28)];
    p.face(melons.map((a) => ovalPath(a[0], a[1], 5, 3.6)).join(''), dusk('#6fae45', dark, 0.3), 1.2);
    // the awning: stripes of red and cream, sloping toward the front
    const stripes = 7;
    for (let i = 0; i < stripes; i++) {
      const u0 = -32 + (64 * i) / stripes;
      const u1 = -32 + (64 * (i + 1)) / stripes;
      const quad = [iso(O, u0, -22, 50), iso(O, u1, -22, 50), iso(O, u1, 10, 38), iso(O, u0, 10, 38)];
      p.face(poly(quad), i % 2 === 0 ? tones(RED, dark).face : tones(WHITE, dark).face, 1.3);
    }
    const front = iso(O, -32, 10, 38);
    let scallops = `M${n(front[0])} ${n(front[1])}`;
    for (let i = 0; i < 8; i++) {
      const a = iso(O, -32 + 8 * (i + 1), 10, 38);
      const mid = iso(O, -32 + 8 * i + 4, 10, 33);
      scallops += `Q${n(mid[0])} ${n(mid[1] + 4)} ${n(a[0])} ${n(a[1])}`;
    }
    p.face(`${scallops}Z`, tones(RED, dark).shade, 1.3);
    // the kilim's hook on the right pole
    const hook = iso(O, 26, -18, 44);
    p.flat(ovalPath(hook[0], hook[1], 1.6, 1.6), GOLD);
  },

  /** The bus stop to Amed: a shelter of three walls and a roof, a bench in it, and a round sign on a post. */
  busstop(p, dark) {
    const grey = tones(STONE_GREY, dark);
    shadow(p, 58, 104, 52, 12, dark);
    box(p, O, -30, -20, 46, 6, 34, grey);
    box(p, O, -30, -14, 6, 22, 34, grey);
    box(p, O, -26, -12, 36, 10, 7, tones(WOOD, dark));
    box(p, O, -34, -24, 54, 34, 4, tones(BLUE, dark), 34);
    // the sign's post; the sign itself swings
    const post = iso(O, 28, 10, 0);
    p.line(`M${n(post[0])} ${n(post[1])}l0 -62`, tones(STONE_GREY, dark).shade, 2.8);
    // a milestone: a plain stone with a red top
    box(p, O, 30, -6, 8, 6, 12, tones(WHITE, dark));
    box(p, O, 30, -6, 8, 6, 4, tones(RED, dark), 12);
  },

  /** Amed's black walls: a round tower of basalt with its battlements, the wall running off, and a flag on the top. */
  citywall(p, dark) {
    const basalt = tones(BASALT, dark);
    shadow(p, 60, 104, 56, 12, dark);
    box(p, O, -50, -8, 42, 14, 34, basalt);
    for (let i = 0; i < 4; i++) box(p, O, -50 + i * 11, -8, 6, 14, 5, basalt, 34);
    const c = iso(O, 6, -2, 0);
    drum(p, c, 20, 54, basalt);
    // battlements round the tower's top, and a dark loophole
    for (const dx of [-20, -8, 4, 16]) {
      p.face(`M${n(c[0] + dx)} ${n(c[1] - 54 + (dx > 0 ? 3 : 0))}l0 -7l7 0l0 7z`, basalt.light, 1.4);
    }
    p.face(`M${n(c[0] - 10)} ${n(c[1] - 26)}l0 -10q3 -4 6 0l0 10z`, dark ? WINDOW_LIT : OPENING, 1.2);
    // a band of lighter stone, as the walls of Amed have
    p.line(`M${n(c[0] - 28)} ${n(c[1] - 18)}A${n(28.3)} ${n(14.1)} 0 0 0 ${n(c[0] + 28)} ${n(c[1] - 18)}`, basalt.light, 2.6);
    const pole: Pt = [c[0] + 18, c[1] - 62];
    p.line(`M${n(pole[0])} ${n(pole[1] + 6)}l0 -36`, tones(WOOD, dark).shade, 2.2);
  },

  /** The Newroz fire on the hill: a ring of stones round a stack of logs, and the flames over them. */
  newroz(p, dark) {
    const hill = tones({ light: '#c6e08f', face: '#9fc96b', shade: '#78a650' }, dark);
    p.face(`M10 104Q30 74 60 72Q92 74 112 104Z`, hill.face);
    p.flat(`M60 73Q92 75 111 103L86 103Q78 84 60 73Z`, hill.shade);
    const wood = tones(WOOD, dark);
    p.face(`M40 88l38 -10l3 6l-38 10z`, wood.face, 1.4);
    p.face(`M42 78l36 10l-3 6l-36 -10z`, wood.shade, 1.4);
    const stone = tones(STONE_GREY, dark);
    for (const [x, y] of [[32, 90], [44, 96], [60, 98], [76, 95], [87, 89], [38, 82], [83, 81]] as const) {
      p.face(ovalPath(x, y, 5.5, 3.6), stone.face, 1.3);
      p.flat(ovalPath(x - 1.5, y - 1.2, 2.5, 1.4), stone.light);
    }
    // the fire at rest: the loop lays the living flame over it
    p.face(`M60 30C70 46 80 56 74 74C70 84 50 84 46 74C40 60 52 50 52 40C56 46 58 44 60 30Z`, FIRE.outer, 1.6);
    p.flat(`M60 50C66 58 70 66 66 74C62 80 54 80 52 74C50 66 56 62 60 50Z`, FIRE.mid);
    p.flat(ovalPath(60, 72, 5, 6), FIRE.core);
  },

  /** The hives whose honey went missing: three painted boxes on a bench, a jar beside them, and flowers round about. */
  hives(p, dark) {
    shadow(p, 60, 104, 54, 12, dark);
    box(p, O, -40, -10, 76, 18, 6, tones(WOOD, dark));
    const paint = [tones({ light: '#fff5d6', face: '#f2d580', shade: '#c9a64c' }, dark), tones(WHITE, dark), tones({ light: '#d7f0ff', face: '#8ec8ea', shade: '#5e9cc2' }, dark)];
    [-36, -10, 16].forEach((u, i) => {
      box(p, O, u, -8, 20, 14, 12, paint[i]!, 6);
      box(p, O, u, -8, 20, 14, 10, paint[(i + 1) % 3]!, 18);
      box(p, O, u - 2, -10, 24, 18, 3, tones(WOOD, dark), 28);
      const door = iso(O, u + 10, 6, 9);
      p.flat(`M${n(door[0] - 4)} ${n(door[1])}l8 0l0 -2l-8 0z`, OPENING);
    });
    // the honey jar, its lid tied with cloth
    const jar = iso(O, 34, 14, 0);
    drum(p, jar, 5, 12, tones({ light: '#ffd779', face: '#f0a92a', shade: '#bf7a17' }, dark));
    p.face(ovalPath(jar[0], jar[1] - 14, 7, 3), tones(RED, dark).face, 1.3);
    p.flat([ovalPath(14, 98, 2.4, 2.4), ovalPath(104, 92, 2.4, 2.4), ovalPath(22, 90, 2.2, 2.2)].join(''), dusk('#f6c836', dark, 0.3));
  },

  /** The river Bozo ran off along: a hump of a stone bridge over it, the water passing under its one arch. */
  bridge(p, dark) {
    const water = tones(WATER, dark);
    const stone = tones(STONE, dark);
    shadow(p, 60, 102, 54, 11, dark);
    // the river, crossing under the bridge from the upper right to the lower left
    p.face(poly([iso(O, -15, -56, 0), iso(O, 15, -56, 0), iso(O, 15, 40, 0), iso(O, -15, 40, 0)]), water.face, 1.4);
    const r0 = iso(O, 4, 14, 0);
    p.line(`M${n(r0[0])} ${n(r0[1])}l-10 5M${n(r0[0] + 14)} ${n(r0[1] - 18)}l-10 5`, water.light, 1.8);
    const hump = (v: number, z0: number, peak: number): string => {
      const a = iso(O, -42, v, z0);
      const c = iso(O, 0, v, 2 * peak - z0);
      const b = iso(O, 42, v, z0);
      return `M${n(a[0])} ${n(a[1])}Q${n(c[0])} ${n(c[1])} ${n(b[0])} ${n(b[1])}`;
    };
    // the far end, in shade, then the near side with its arch, then the walk along the top
    p.face(poly([iso(O, 42, -9, 0), iso(O, 42, 9, 0), iso(O, 42, 9, 7), iso(O, 42, -9, 7)]), stone.shade);
    const g0 = iso(O, 42, 9, 0);
    const g1 = iso(O, -42, 9, 0);
    p.face(`${hump(9, 7, 22)}L${n(g0[0])} ${n(g0[1])}L${n(g1[0])} ${n(g1[1])}Z`, stone.face);
    const a0 = iso(O, -15, 9, 0);
    const ac = iso(O, 0, 9, 30);
    const a1 = iso(O, 15, 9, 0);
    p.face(`M${n(a0[0])} ${n(a0[1])}Q${n(ac[0])} ${n(ac[1])} ${n(a1[0])} ${n(a1[1])}Z`, OPENING, 1.4);
    p.flat(poly([iso(O, -13, 9, 0), iso(O, 13, 9, 0), iso(O, 13, 3, 0), iso(O, -13, 3, 0)]), water.shade);
    // a few stones of the arch's ring
    for (const t of [0.2, 0.5, 0.8]) {
      const u = -15 + 30 * t;
      const z = 15 * 4 * t * (1 - t) + 2;
      const q = iso(O, u, 9, z);
      p.line(`M${n(q[0])} ${n(q[1])}l${n(-(u / 15) * 2)} -4`, stone.shade, 1.2);
    }
    const t0 = iso(O, 42, -9, 7);
    const tc = iso(O, 0, -9, 37);
    const t1 = iso(O, -42, -9, 7);
    p.face(`${hump(9, 7, 22)}L${n(t0[0])} ${n(t0[1])}Q${n(tc[0])} ${n(tc[1])} ${n(t1[0])} ${n(t1[1])}Z`, stone.light);
  },

  /** The summer pastures: a long black tent of goat hair, open along its front on a kilim, roped down, a fire beside it. */
  tents(p, dark) {
    const cloth = tones(CLOTH, dark);
    const wood = tones(WOOD, dark);
    shadow(p, 58, 104, 56, 12, dark);
    // the far end in shade, the open front, the panels at its ends, then the roof over all of it
    p.face(poly([iso(O, 34, -26, 0), iso(O, 34, 12, 0), iso(O, 34, 12, 17), iso(O, 34, -8, 30), iso(O, 34, -26, 14)]), cloth.shade);
    p.face(poly([iso(O, -40, 12, 0), iso(O, 34, 12, 0), iso(O, 34, 12, 17), iso(O, -40, 12, 17)]), OPENING);
    p.face(poly([iso(O, -18, 14, 0), iso(O, 8, 14, 0), iso(O, 8, 26, 0), iso(O, -18, 26, 0)]), tones(RED, dark).face, 1.2);
    const k = iso(O, -5, 20, 0);
    p.flat(`M${n(k[0])} ${n(k[1] - 3)}l5 3l-5 3l-5 -3z`, dusk(GOLD, dark, 0.25));
    p.face(poly([iso(O, -40, 12, 0), iso(O, -28, 12, 0), iso(O, -28, 12, 17), iso(O, -40, 12, 17)]), cloth.face);
    p.face(poly([iso(O, 22, 12, 0), iso(O, 34, 12, 0), iso(O, 34, 12, 17), iso(O, 22, 12, 17)]), cloth.face);
    // the roof: a front slope sagging between its three poles, with the stripes the weave leaves
    const ridge = (u: number): Pt => iso(O, u, -8, 30);
    const eave = (u: number, z = 17): Pt => iso(O, u, 12, z);
    let d = `M${n(ridge(-40)[0])} ${n(ridge(-40)[1])}L${n(ridge(34)[0])} ${n(ridge(34)[1])}L${n(eave(34)[0])} ${n(eave(34)[1])}`;
    for (const [u, mid] of [[9, 21.5], [-16, 4], [-40, -28]] as const) {
      const c = iso(O, mid, 12, 13);
      d += `Q${n(c[0])} ${n(c[1])} ${n(eave(u)[0])} ${n(eave(u)[1])}`;
    }
    p.face(`${d}Z`, cloth.light);
    for (const u of [-28, -16, -4, 9, 22]) {
      const a = iso(O, u, -8, 30);
      const b = iso(O, u, 11, 16);
      p.line(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, cloth.face, 1.3, 0.9);
    }
    // the poles under the eave, and the ropes to their pegs
    for (const u of [-16, 9]) {
      const a = iso(O, u, 12, 0);
      p.line(`M${n(a[0])} ${n(a[1])}l0 -15`, wood.face, 2.4);
      const peg = iso(O, u + 6, 30, 0);
      const top = iso(O, u, 12, 15);
      p.line(`M${n(top[0])} ${n(top[1])}L${n(peg[0])} ${n(peg[1])}`, tones(EARTH, dark).light, 1.1);
    }
    // the fire's ring of stones beside the tent; its smoke is the loop
    const fire = iso(O, 44, 24, 0);
    p.face(ovalPath(fire[0], fire[1], 8, 4), tones(STONE_GREY, dark).face, 1.3);
    p.flat(ovalPath(fire[0], fire[1] - 1, 4, 2), FIRE.mid);
  },

  /** The school: a two-storey house, white with blue windows, a red edge to its roof, a bell, and a flag. */
  school(p, dark) {
    const white = tones(WHITE, dark);
    shadow(p, 60, 104, 56, 12, dark);
    box(p, O, -30, -26, 52, 32, 46, white);
    box(p, O, -32, -28, 56, 36, 5, tones(RED, dark), 46);
    // windows in two rows on the lit face, a door in the middle
    for (const z of [8, 28]) {
      for (const u of [-24, -10, 4, 14]) {
        if (z === 8 && u === -10) continue;
        const w = poly([iso(O, u, 6, z), iso(O, u + 6, 6, z), iso(O, u + 6, 6, z + 10), iso(O, u, 6, z + 10)]);
        p.face(w, dark ? WINDOW_LIT : tones(BLUE, dark).face, 1.3);
      }
    }
    const door = poly([iso(O, -11, 6, 0), iso(O, -2, 6, 0), iso(O, -2, 6, 18), iso(O, -11, 6, 18)]);
    p.face(door, tones(WOOD, dark).shade);
    // the flagpole; the flag is the loop
    const pole = iso(O, 24, 8, 0);
    p.line(`M${n(pole[0])} ${n(pole[1])}l0 -90`, tones(STONE_GREY, dark).shade, 2.4);
    p.flat(ovalPath(pole[0], pole[1] - 91, 2, 2), GOLD);
  },

  /** The last winter: a stone house under snow, its window lit, its chimney smoking, a woodpile by the wall. */
  hearth(p, dark) {
    const stone = tones(STONE, dark);
    const snow = tones(SNOW, dark);
    p.flat(ovalPath(60, 102, 56, 13), snow.shade, 0.8);
    box(p, O, -28, -24, 50, 34, 36, stone);
    // a snowy roof slab, overhanging
    box(p, O, -31, -27, 56, 40, 6, snow, 36);
    const drift = iso(O, 22, 13, 40);
    p.flat(ovalPath(drift[0] - 6, drift[1], 9, 3), snow.light);
    // the chimney, with snow on its cap
    box(p, O, 4, -18, 9, 9, 18, stone, 42);
    box(p, O, 3, -19, 11, 11, 3, snow, 60);
    // a warm window and the door
    const win = poly([iso(O, -18, 10, 12), iso(O, -8, 10, 12), iso(O, -8, 10, 24), iso(O, -18, 10, 24)]);
    p.face(win, WINDOW_LIT, 1.4);
    p.line(`M${n(iso(O, -13, 10, 12)[0])} ${n(iso(O, -13, 10, 12)[1])}l0 -12`, tones(WOOD, dark).shade, 1.4);
    const door = poly([iso(O, 2, 10, 0), iso(O, 12, 10, 0), iso(O, 12, 10, 22), iso(O, 2, 10, 22)]);
    p.face(door, tones(BLUE, dark).shade);
    // the woodpile under the right wall
    for (const [u, z] of [[24, 2], [24, 7], [24, 12]] as const) {
      const a = iso(O, u, -10 + z, z);
      p.face(ovalPath(a[0], a[1], 3, 3), tones(WOOD, dark).face, 1.2);
    }
  },
};

export interface PathLoopOptions {
  kind: PathLoopKind;
  dark?: boolean;
  /** how wide it is shown; its height follows its own box (`PATH_LANDMARK_LOOP`) */
  size?: number;
  idPrefix?: string;
}

/** The sprite's own canvas for each kind: the sprite fills it, and the apps move it about its anchor. */
const LOOP_VIEW: Record<PathLoopKind, { w: number; h: number }> = {
  kilim: { w: 18, h: 22 },
  steam: { w: 16, h: 24 },
  water: { w: 30, h: 12 },
  flag: { w: 20, h: 16 },
  flame: { w: 26, h: 40 },
  smoke: { w: 16, h: 30 },
  bee: { w: 34, h: 34 },
  sign: { w: 18, h: 26 },
};

/**
 * The one small moving thing of a landmark, as a picture of its own: a kilim
 * or a flag on its pole, steam or smoke going up, a ripple on water, the
 * Newroz flame, a bee, the bus stop's swinging sign. Decorative.
 */
export function pathLoopSvg(opts: PathLoopOptions): string {
  const { kind, dark = false } = opts;
  const view = LOOP_VIEW[kind];
  if (!view) throw new RangeError(`art: no loop ${String(kind)}`);
  const size = opts.size ?? view.w;
  const p = new Pen(dark ? INK.dusk : INK.day, 1.2);
  switch (kind) {
    case 'kilim':
    case 'flag': {
      // a kilim's stripes and its diamond, hung from the top edge, the free end a little ragged
      const w = view.w;
      const h = kind === 'flag' ? 13 : 20;
      p.face(`M1 1L${w - 1} 1L${w - 1} ${h - 2}L${w - 4} ${h}L${w - 7} ${h - 2}L${w - 10} ${h}L${w - 13} ${h - 2}L1 ${h - 2}Z`, dusk(RED.face, dark, 0.3));
      p.flat(`M1 ${n(h * 0.32)}L${w - 1} ${n(h * 0.32)}L${w - 1} ${n(h * 0.42)}L1 ${n(h * 0.42)}Z`, dusk('#f6e3b0', dark, 0.3));
      p.flat(`M${n(w / 2)} ${n(h * 0.5)}l4 ${n(h * 0.17)}l-4 ${n(h * 0.17)}l-4 ${n(-h * 0.17)}Z`, dusk(GOLD, dark, 0.25));
      p.flat(`M1 ${n(h * 0.86)}L${w - 1} ${n(h * 0.86)}`, dusk('#2f5f95', dark, 0.3));
      break;
    }
    case 'steam':
    case 'smoke': {
      const colour = kind === 'steam' ? (dark ? '#c9cfdc' : '#ffffff') : dark ? '#7d8394' : '#d9d6d0';
      const puffs: [number, number, number][] = [
        [8, view.h - 5, 4],
        [6, view.h - 13, 5],
        [9, view.h - 22, 4.5],
      ];
      p.flat(puffs.map(([x, y, r]) => ovalPath(x, y, r, r)).join(''), colour, kind === 'steam' ? 0.85 : 0.9);
      break;
    }
    case 'water': {
      p.line(ovalPath(15, 6, 11, 3.6), dark ? '#9fd2e6' : '#ffffff', 1.6, 0.9);
      p.line(ovalPath(15, 6, 5, 1.8), dark ? '#9fd2e6' : '#ffffff', 1.2, 0.8);
      break;
    }
    case 'flame': {
      p.flat(`M13 2C19 12 24 20 21 30C19 37 7 37 5 30C2 22 9 16 9 9C11 13 12 12 13 2Z`, FIRE.mid);
      p.flat(`M13 16C16 21 18 25 16 30C14 34 10 34 9 30C8 26 11 22 13 16Z`, FIRE.core);
      break;
    }
    case 'bee': {
      // on the rim of its circle; the apps turn the circle
      p.flat(ovalPath(17, 4, 3.4, 2.4), '#2a2018');
      p.flat(`M15.6 2.2l1.2 0l0 3.6l-1.2 0zM18 2.2l1.1 0l0 3.6l-1.1 0z`, '#f6c836');
      p.flat(ovalPath(16, 1.2, 2.2, 1.4), '#ffffff', 0.85);
      break;
    }
    case 'sign': {
      p.line('M9 1l0 4', dusk(STONE_GREY.shade, dark), 1.4);
      p.face(ovalPath(9, 14, 8, 8), dusk(BLUE.face, dark, 0.3));
      p.flat('M4 12.4l10 0l0 3.2l-10 0z', '#ffffff');
      break;
    }
  }
  const prefix = prefixFor(opts.idPrefix, 'loop', kind, dark);
  const height = (size * view.h) / view.w;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(height)}" viewBox="0 0 ${view.w} ${view.h}" aria-hidden="true" focusable="false" id="${prefix}">${p.markup()}</svg>`;
}
