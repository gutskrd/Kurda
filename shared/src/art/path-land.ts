/**
 * The lesson path's world in the painted valley style (valley.ts): each unit's land, the road through it and its
 * stops; chapter landmarks are in path-landmark.ts. Each land opens under its banner with hills, then terraced fields,
 * orchards, poplars, an optional stream, and an earth road through every stop: warm dirt where walked, paler ahead.
 *
 * - `pathLandSvg`: one unit's ground at its display size, with scatter kept off the stops, road, landmark and places
 *   people stand (`landClear`), and the shepherds' cairn in open-country lands (`cairnBox`).
 * - `pathStonesSvg`: the walked stretches of road, laid over the road ahead stop to stop (found by `trailStones`).
 * - `pathStopSvg`: a stop as a base and a face, so a press can push the face into the base. A skill's glyph is set by
 *   the app; the guide's book, story scroll, jump gate and chapter saddlebag are drawn here.
 * - `pathSignpostSvg`: the signpost at the end of the path while the next unit is being made.
 *
 * Deterministic: ids come from a hash of the request (svg.ts) and scatter from a generator seeded with it.
 */
import type { UnitTone } from '../lesson-path.js';
import { PATH_GEOMETRY } from '../lesson-path.js';
import { PATH_CAIRN_GROUNDS, cairnBox, landClear, type PathBox, type PathGround, type TrailStone, type WorldStop } from '../path-world.js';
import { CANVAS, mix, n, n2, prefixFor, seeded, type Pt } from './svg.js';
import {
  VALLEY,
  bush,
  dusk,
  ellipsePath,
  fill,
  foliage,
  poplar,
  poplarLeaves,
  roundTree,
  sheep,
  smoothPath,
  stroke,
  warm,
  type Foliage,
} from './valley.js';

// ───────────────────────────────────────────────────────────── the lands

/** What grows in a land: trees and things that stand about like them. */
type Growth = 'fruit' | 'apple' | 'walnut' | 'poplar' | 'blossom' | 'autumn' | 'autumnPoplar' | 'bush' | 'bare' | 'pine' | 'snowpine' | 'rock' | 'hay';

/** A unit's land: its ground and the shade cast on it, fields, hills, growth, and whether a stream crosses. */
interface Land {
  base: string;
  shade: string;
  /** The terraces, each a face with a step of shade at its foot, furrowed where ploughed or cut. */
  fields: readonly { face: string; step: string; furrow?: string }[];
  /** The hills under the unit's banner: the far ridge and the near one. */
  hills: { far: string; near: string; snow?: boolean };
  growth: readonly Growth[];
  /** Trees per 10 000 square points. */
  density: number;
  flowers: readonly string[];
  stream: boolean;
  sheep: number;
  /** The road ahead and its edge, where the land's ground needs another colour (snow). */
  road?: { face: string; edge: string };
}

const SPRING_FIELDS = [
  { face: VALLEY.wheat, step: VALLEY.wheatShade, furrow: VALLEY.furrowWheat },
  { face: VALLEY.green, step: VALLEY.greenShade },
] as const;

/** The twelve lands of the road's year, from spring orchards to the winter stove (`PATH_LANDS` assigns them to units). */
const LANDS: Record<PathGround, Land> = {
  orchard: { base: VALLEY.meadow, shade: VALLEY.meadowShade, fields: SPRING_FIELDS, hills: { far: VALLEY.far, near: VALLEY.mid, snow: true }, growth: ['fruit', 'fruit', 'poplar', 'bush'], density: 0.74, flowers: ['#ffffff', VALLEY.blossom], stream: false, sheep: 2 },
  meadow: { base: '#cfe2a0', shade: '#b8d08a', fields: [{ face: VALLEY.green, step: VALLEY.greenShade }, { face: '#dce8a8', step: '#c3d68e' }], hills: { far: VALLEY.far, near: '#b3c99a' }, growth: ['poplar', 'walnut', 'bush', 'fruit'], density: 0.78, flowers: ['#ffffff', '#ffe68a'], stream: true, sheep: 2 },
  lanes: { base: '#dfdcac', shade: '#c7c393', fields: [{ face: VALLEY.earth, step: VALLEY.earthShade, furrow: VALLEY.furrow }, { face: VALLEY.green, step: VALLEY.greenShade }], hills: { far: VALLEY.far, near: '#bcc79c' }, growth: ['walnut', 'poplar', 'bush'], density: 0.75, flowers: ['#ffffff', '#f2a0a0'], stream: true, sheep: 1 },
  town: { base: '#e4d6aa', shade: '#ccbd8f', fields: [{ face: '#ecd9a6', step: '#d6c08a', furrow: '#dcc58e' }, { face: '#cfdc9c', step: '#b6c784' }], hills: { far: '#d3d2d6', near: '#c9c6a2' }, growth: ['poplar', 'bush', 'fruit'], density: 0.55, flowers: [VALLEY.red, '#ffe68a'], stream: false, sheep: 0 },
  stubble: { base: '#e9d79c', shade: '#d2bd80', fields: [{ face: '#efd98e', step: '#d6bd6c', furrow: '#dcc376' }, { face: '#e6cf8c', step: '#cfb46e', furrow: '#d8bd76' }], hills: { far: '#d6d0c8', near: '#d3c38e' }, growth: ['hay', 'poplar', 'hay', 'bush'], density: 0.7, flowers: [VALLEY.red, '#ffffff'], stream: false, sheep: 2 },
  plaza: { base: '#dcd5c3', shade: '#c4bca7', fields: [{ face: '#d3cbb6', step: '#bbb29b' }, { face: '#cfd6ad', step: '#b7bf95' }], hills: { far: '#cccdd6', near: '#bdbba9' }, growth: ['bush', 'poplar', 'rock'], density: 0.45, flowers: [VALLEY.red, '#ffe68a'], stream: false, sheep: 0 },
  bloom: { base: '#cfe59a', shade: '#b6d083', fields: [{ face: '#dbeaa6', step: '#c2d68c' }, { face: VALLEY.green, step: VALLEY.greenShade }], hills: { far: '#cbd3e2', near: '#aecb8d', snow: true }, growth: ['blossom', 'blossom', 'poplar', 'bush'], density: 0.74, flowers: [VALLEY.red, '#ffe68a', '#ffffff', VALLEY.red], stream: true, sheep: 2 },
  honey: { base: '#d9e4a0', shade: '#c1cd88', fields: [{ face: '#ecdf92', step: '#d5c674' }, { face: VALLEY.green, step: VALLEY.greenShade }], hills: { far: VALLEY.far, near: '#bfcb92' }, growth: ['apple', 'bush', 'blossom', 'poplar'], density: 0.74, flowers: ['#f6c836', '#f6c836', '#ffffff', '#c48ad0'], stream: false, sheep: 1 },
  valley: { base: '#c9df98', shade: '#b1c983', fields: [{ face: VALLEY.green, step: VALLEY.greenShade }, { face: '#d6e7a3', step: '#bcd28a' }], hills: { far: '#c7cfdc', near: '#a7c587' }, growth: ['poplar', 'poplar', 'walnut', 'bush'], density: 0.9, flowers: ['#ffffff', '#8cc4e8', '#ffe68a'], stream: true, sheep: 2 },
  alpine: { base: '#c8d6a0', shade: '#b0bf8a', fields: [{ face: '#d4dfae', step: '#bcc996' }, { face: '#c3d39a', step: '#aabb84' }], hills: { far: '#c4cad8', near: '#aab89a', snow: true }, growth: ['rock', 'rock', 'pine', 'bush'], density: 0.6, flowers: ['#ffffff', '#c48ad0', '#ffe68a'], stream: true, sheep: 4 },
  autumn: { base: '#e3cf98', shade: '#cbb57f', fields: [{ face: VALLEY.earth, step: VALLEY.earthShade, furrow: VALLEY.furrow }, { face: '#e9c27c', step: '#d2a966' }], hills: { far: '#d2ccd2', near: '#c9b183' }, growth: ['autumn', 'autumn', 'autumnPoplar', 'bush'], density: 0.85, flowers: ['#e0662f', '#c9412f'], stream: false, sheep: 1 },
  snow: {
    base: VALLEY.snow,
    shade: VALLEY.snowShade,
    fields: [{ face: '#f1f4f8', step: '#d9e1ea', furrow: '#e2e8ef' }, { face: '#f8fafc', step: '#e0e7ef' }],
    hills: { far: '#d6dde8', near: '#e4eaf1', snow: true },
    growth: ['snowpine', 'bare', 'snowpine'],
    density: 0.7,
    flowers: ['#c9412f'],
    stream: false,
    sheep: 0,
    road: { face: '#e7ddcc', edge: '#d1c4ad' },
  },
};

/** The ground's base colour, for an app filling a unit that is not drawn yet (far off screen). */
export function pathGroundColour(ground: PathGround, dark = false): string {
  const land = LANDS[ground];
  if (!land) throw new RangeError(`art: no ground ${String(ground)}`);
  return dusk(land.base, dark);
}

/** The shade cast on a land's ground by day or evening; a landmark stands in it as the trees do. */
export function pathGroundShade(ground: PathGround, dark = false): string {
  const land = LANDS[ground];
  if (!land) throw new RangeError(`art: no ground ${String(ground)}`);
  return dusk(land.shade, dark);
}

/** The road's widths: its edge, the track, and the two ruts in it. */
const ROAD = { edge: 46, face: 38, ruts: 20 } as const;

/** A point `t` along the S-curve between two stops, as the trail's stones lie (path-world.ts). */
function along(a: { x: number; y: number }, b: { x: number; y: number }, t: number): Pt {
  const bend = PATH_GEOMETRY.step / 2;
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
  return [w[0] * a.x + w[1] * a.x + w[2] * b.x + w[3] * b.x, w[0] * a.y + w[1] * (a.y + bend) + w[2] * (b.y - bend) + w[3] * b.y];
}

/** The road through a unit in logical x: from the top edge's middle through every stop to the bottom edge's middle, where the next unit's road starts. */
function roadLine(stops: readonly WorldStop[], height: number): Pt[] {
  const anchors = [{ x: 0, y: -6 }, ...stops, { x: 0, y: height + 6 }];
  const out: Pt[] = [];
  for (let i = 1; i < anchors.length; i++) {
    for (let k = i === 1 ? 0 : 1; k <= 12; k++) out.push(along(anchors[i - 1]!, anchors[i]!, k / 12));
  }
  return out;
}

export interface PathLandOptions {
  ground: PathGround;
  /** Display width in points: the unit's path, edge to edge. */
  width: number;
  height: number;
  /** The unit's stops and stones in the path's logical terms (`lessonPath`, `trailStones`). */
  stops: readonly WorldStop[];
  stones: readonly TrailStone[];
  dark?: boolean;
  /** Drawn for a right-to-left page: what leans toward the end of the line stands on the left. */
  rtl?: boolean;
  /** Varies the scatter, so two units on the same ground differ. */
  seed?: string;
  idPrefix?: string;
}

/** One unit's land, edge to edge. Decorative and hidden from screen readers; the stops carry the meaning. */
export function pathLandSvg(opts: PathLandOptions): string {
  const { width: W, height: H, dark = false, rtl = false } = opts;
  if (!(W > 0) || !(H > 0) || !Number.isFinite(W) || !Number.isFinite(H)) throw new RangeError(`art: land size must be positive, got ${W}×${H}`);
  const land = LANDS[opts.ground];
  if (!land) throw new RangeError(`art: no ground ${String(opts.ground)}`);
  const sign = rtl ? -1 : 1;
  const X = (x: number): number => W / 2 + sign * x;
  const random = seeded(`valley|${opts.ground}|${opts.seed ?? ''}|${Math.round(W)}|${Math.round(H)}`);
  const c = (hex: string, amount?: number): string => dusk(hex, dark, amount);
  const ground = c(land.shade);
  const out: string[] = [];

  out.push(`<rect width="${n(W)}" height="${n(H)}" fill="${c(land.base)}"/>`);

  // The hills under the banner: the far ridge, snowy where the land has mountains, then the near one.
  const ridge = (base: number, amp: number, step: number): Pt[] => {
    const pts: Pt[] = [];
    for (let x = -step; x <= W + step; x += step) pts.push([x, base - random() * amp]);
    return pts;
  };
  const far = ridge(54, 34, Math.max(26, W / 13));
  out.push(fill(`M${far.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}L${n(W + 60)} 120L-60 120Z`, c(land.hills.far, 0.32)));
  if (land.hills.snow) {
    const peaks = far.filter((p, i) => i > 0 && i < far.length - 1 && p[1] < far[i - 1]![1] && p[1] < far[i + 1]![1] && p[1] < 36);
    out.push(fill(peaks.map(([x, y]) => `M${n(x)} ${n(y)}l-7 7l3 -1l4 3l4 -3l3 1Z`).join(''), c(VALLEY.farSnow, 0.32)));
  }
  const near: Pt[] = [];
  for (let x = -40; x <= W + 40; x += Math.max(60, W / 6)) near.push([x, 62 + (random() - 0.5) * 22]);
  out.push(fill(`${smoothPath(near)}L${n(W + 40)} 130L-40 130Z`, c(land.hills.near)));
  out.push(fill(`${smoothPath(near.map(([x, y]) => [x, y + 22] as Pt))}L${n(W + 40)} 140L-40 140Z`, c(land.base)));

  // Where the stream crosses, between the first two stops after the unit's head.
  const streamY = land.stream && opts.stops.length > 2 ? (opts.stops[1]!.y + opts.stops[2]!.y) / 2 + 6 : null;
  // A shepherds' cairn in open-country lands, where there is room beside the path and away from the water.
  const cairnAt = PATH_CAIRN_GROUNDS.includes(opts.ground) ? cairnBox(opts.stops, W, streamY === null ? [] : [{ x: 0, y: streamY - 26, w: 2 * W, h: 52 }]) : null;
  const { solid, tall } = landClear(opts.stops, W, opts.stones, cairnAt);
  // Sample the road every few points, so nothing grows on it.
  const road = roadLine(opts.stops, H);
  const onRoad: PathBox[] = road.filter((_, i) => i % 2 === 0).map(([x, y]) => ({ x, y: y - 26, w: ROAD.edge + 12, h: 52 }));
  const free = (x: number, y: number, w: number, h: number, also: readonly PathBox[] = []): boolean => {
    if (Math.abs(x) + w / 2 > W / 2 + w * 0.3) return false;
    if (y < 70 || y + h > H - 4) return false;
    for (const b of [...solid, ...onRoad, ...also]) if (Math.abs(x - b.x) * 2 < w + b.w && y < b.y + b.h && b.y < y + h) return false;
    return true;
  };

  // Terraces down the slope, each with a step of shade at its foot, furrowed where ploughed or cut.
  const bands = Math.max(2, Math.round((H - 140) / 170));
  for (let i = 0; i < bands; i++) {
    const field = land.fields[i % land.fields.length]!;
    const y0 = 120 + ((H - 160) * (i + 0.15 + random() * 0.3)) / bands;
    const y1 = y0 + 46 + random() * 30;
    const top: Pt[] = [];
    const foot: Pt[] = [];
    for (let x = -40; x <= W + 40; x += Math.max(55, W / 6)) {
      top.push([x, y0 + (random() - 0.5) * 16]);
      foot.push([x, y1 + (random() - 0.5) * 16]);
    }
    const back = smoothPath([...foot].reverse()).replace(/^M/, 'L');
    const stepped = smoothPath([...foot].reverse().map(([x, y]) => [x, y + 5] as Pt)).replace(/^M/, 'L');
    out.push(fill(`${smoothPath(foot.map(([x, y]) => [x, y - 4] as Pt))}${stepped}Z`, c(field.step)));
    out.push(fill(`${smoothPath(top)}${back}Z`, c(field.face)));
    if (field.furrow) {
      const rows: string[] = [];
      for (let k = 1; k < 4; k++) rows.push(smoothPath(top.map(([x, y], j) => [x, y + ((y1 - y0) * k) / 4 + Math.sin(j) * 1.5] as Pt)));
      out.push(stroke(rows.join(''), c(field.furrow), 1.4));
    }
  }

  // The stream, under the road's bridge.
  if (streamY !== null) {
    const pts: Pt[] = [];
    const steps = Math.max(5, Math.round(W / 70));
    for (let i = 0; i <= steps; i++) pts.push([-20 + ((W + 40) * i) / steps, streamY + 9 * Math.sin(i * 1.3 + 0.5)]);
    const line = smoothPath(pts);
    out.push(stroke(line, c(VALLEY.bank), 34));
    out.push(stroke(line, c(VALLEY.water), 22));
    let ripples = '';
    for (let i = 0; i < steps; i += 1) {
      const [x, y] = pts[i]!;
      ripples += `M${n(x + 18)} ${n(y + 1)}q8 -3 16 0`;
    }
    out.push(stroke(ripples, c(VALLEY.waterLight), 2));
  }

  // The road ahead, pale; walked stretches are laid over it in warm dirt (`pathStonesSvg`).
  const roadD = smoothPath(road.map(([x, y]) => [X(x), y] as Pt));
  out.push(stroke(roadD, c(land.road?.edge ?? VALLEY.pathEdge), ROAD.edge));
  out.push(stroke(roadD, c(land.road?.face ?? VALLEY.path), ROAD.face));

  // A plank bridge where the road crosses the stream.
  if (streamY !== null) {
    let best = road[0]!;
    for (const p of road) if (Math.abs(p[1] - streamY) < Math.abs(best[1] - streamY)) best = p;
    const bx = X(best[0]);
    let planks = '';
    for (let i = 0; i < 6; i++) planks += `M${n(bx - 25)} ${n(streamY - 17 + i * 7)}h50`;
    out.push(fill(`M${n(bx - 27)} ${n(streamY - 19)}h54v38h-54Z`, c('#a87545')));
    out.push(stroke(planks, c('#8f6038'), 1.6));
    out.push(fill(`M${n(bx - 31)} ${n(streamY - 22)}h6v44h-6ZM${n(bx + 25)} ${n(streamY - 22)}h6v44h-6Z`, c('#7d5130')));
    out.push(fill([[-28, -22], [28, -22], [-28, 22], [28, 22]].map(([dx, dy]) => ellipsePath(bx + dx!, streamY + dy!, 3.6, 3.6)).join(''), c('#6a4428')));
  }

  // Flowers and pebbles: many small shapes in few elements, one path per colour.
  const blooms: string[] = land.flowers.map(() => '');
  let pebbles = '';
  const smalls = Math.round((W * H) / 9000);
  for (let i = 0; i < smalls; i++) {
    const lx = (random() - 0.5) * W;
    const y = 80 + random() * (H - 90);
    if (!free(lx, y - 6, 14, 10)) continue;
    const k = Math.floor(random() * (blooms.length + 1));
    if (k < blooms.length) blooms[k] += flowersPath(X(lx), y);
    else pebbles += ellipsePath(X(lx), y, 2.6, 1.7);
  }
  blooms.forEach((d, i) => out.push(fill(d, dark ? mix(land.flowers[i]!, '#2a2448', 0.3) : land.flowers[i]!)));
  out.push(fill(pebbles, c(VALLEY.pebble)));

  // Trees, rocks and hay, back to front, clear of the road and anyone standing by it.
  const want = Math.round(((W * H) / 10000) * land.density);
  const placed: { x: number; y: number; kind: Growth; s: number }[] = [];
  for (let tries = 0; tries < want * 14 && placed.length < want; tries++) {
    const kind = land.growth[Math.floor(random() * land.growth.length)]!;
    const s = 0.85 + random() * 0.35;
    const tallOne = kind === 'poplar' || kind === 'autumnPoplar' || kind === 'pine' || kind === 'snowpine';
    const fw = (tallOne ? 24 : kind === 'rock' || kind === 'hay' ? 34 : 36) * s;
    const fh = (tallOne ? 56 : kind === 'rock' || kind === 'hay' ? 24 : 44) * s;
    const lx = (random() - 0.5) * (W + fw * 0.6);
    const y = 70 + random() * (H - fh - 74);
    if (!free(lx, y, fw, fh, tall)) continue;
    if (placed.some((p) => Math.abs(p.x - lx) < fw * 0.9 && Math.abs(p.y - (y + fh)) < fh * 0.7)) continue;
    placed.push({ x: lx, y: y + fh, kind, s });
  }
  // Sheep grazing where there is grass and room.
  const flock: Pt[] = [];
  for (let tries = 0; tries < 60 && flock.length < land.sheep; tries++) {
    const lx = (random() - 0.5) * (W - 40);
    const y = 100 + random() * (H - 140);
    if (!free(lx, y - 10, 30, 18, tall) || placed.some((p) => Math.abs(p.x - lx) < 30 && Math.abs(p.y - y) < 30)) continue;
    flock.push([lx, y]);
  }
  const things: { y: number; svg: string }[] = [
    ...placed.map((p) => ({ y: p.y, svg: growth(X(p.x), p.y, p.kind, p.s, dark, ground, random) })),
    ...flock.map(([x, y], i) => ({ y, svg: sheep(X(x), y, i % 2 === 0 ? 1 : -1, ground, dark) })),
  ];
  if (cairnAt) things.push({ y: cairnAt.y + cairnAt.h, svg: cairnOn(cairnAt, X, dark) });
  things.sort((a, b) => a.y - b.y);
  for (const t of things) out.push(t.svg);

  const prefix = prefixFor(opts.idPrefix, 'land', opts.ground, dark, rtl, opts.seed ?? '', Math.round(W), Math.round(H));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}" height="${n(H)}" viewBox="0 0 ${n(W)} ${n(H)}" aria-hidden="true" focusable="false" id="${prefix}">${out.join('')}</svg>`;
}

/** Four small flowers in a patch, as one path. */
function flowersPath(x: number, y: number): string {
  return [[0, 0], [5, 2], [2, 5], [-4, 3]].map(([dx, dy]) => ellipsePath(x + dx!, y + dy!, 1.6, 1.6)).join('');
}
/** A tree, a rock or a stack of hay, its foot at (x, y). */
function growth(x: number, y: number, kind: Growth, s: number, dark: boolean, ground: string, random: () => number): string {
  const c = (hex: string): string => dusk(hex, dark);
  const leaves = (face: string, light: string, shade: string, dots?: string): Foliage => ({ face: c(face), light: c(light), shade: c(shade), ...(dots ? { dots: dusk(dots, dark, 0.2) } : {}) });
  switch (kind) {
    case 'fruit':
      return roundTree(x, y, s, foliage(dark, VALLEY.fruit), ground, random);
    case 'apple':
      return roundTree(x, y, s, foliage(dark, VALLEY.apple), ground, random);
    case 'walnut':
      return roundTree(x, y, s * 1.15, leaves('#5f9c45', '#7fb860', '#447a37'), ground, random);
    case 'blossom':
      return roundTree(x, y, s, leaves('#f6c4d4', '#fde4ec', '#e39bb5', '#ffffff'), ground, random);
    case 'autumn':
      return roundTree(x, y, s, leaves('#e48a34', '#f7c45c', '#b85e26'), ground, random);
    case 'autumnPoplar':
      return poplar(x, y, s, leaves('#e6b443', '#f5d27a', '#b98a2c'), ground);
    case 'poplar':
      return poplar(x, y, s, poplarLeaves(dark), ground);
    case 'bush':
      return bush(x, y, s, foliage(dark), ground, random);
    case 'pine':
    case 'snowpine': {
      const leaf = leaves('#4f8a5a', '#6aa874', '#356a44');
      let shade = '';
      let lit = '';
      let caps = '';
      for (let k = 0; k < 3; k++) {
        const top = y - (52 - k * 13) * s;
        const half = (9 + k * 3.5) * s;
        const foot = top + 21 * s;
        shade += `M${n(x)} ${n(top)}L${n(x + half)} ${n(foot)}L${n(x - half)} ${n(foot)}Z`;
        lit += `M${n(x)} ${n(top + 1.5 * s)}L${n(x + half * 0.1)} ${n(foot - 1.2 * s)}L${n(x - half + 1.5 * s)} ${n(foot - 1.2 * s)}Z`;
        caps += `M${n(x)} ${n(top + 1 * s)}L${n(x + half * 0.42)} ${n(top + 9 * s)}L${n(x - half * 0.48)} ${n(top + 9 * s)}Z`;
      }
      return (
        fill(ellipsePath(x + 6 * s, y + 1, 12 * s, 3.4 * s), ground) +
        fill(`M${n(x - 1.6 * s)} ${n(y)}h${n(3.2 * s)}v${n(-9 * s)}h${n(-3.2 * s)}Z`, c(VALLEY.trunk)) +
        fill(shade, leaf.shade) +
        fill(lit, leaf.face) +
        (kind === 'snowpine' ? fill(caps, c(VALLEY.snow)) : '')
      );
    }
    case 'bare': {
      const limbs = `M${n(x)} ${n(y)}L${n(x)} ${n(y - 34 * s)}M${n(x)} ${n(y - 16 * s)}L${n(x - 11 * s)} ${n(y - 30 * s)}M${n(x)} ${n(y - 22 * s)}L${n(x + 10 * s)} ${n(y - 36 * s)}M${n(x - 5 * s)} ${n(y - 23 * s)}L${n(x - 6 * s)} ${n(y - 33 * s)}`;
      return (
        fill(ellipsePath(x + 6 * s, y + 1, 12 * s, 3.4 * s), ground) +
        stroke(limbs, c('#7a5a3f'), 2.8 * s) +
        fill(ellipsePath(x - 10 * s, y - 31 * s, 4 * s, 1.8 * s) + ellipsePath(x + 9 * s, y - 37 * s, 4 * s, 1.8 * s), c(VALLEY.snow))
      );
    }
    case 'rock': {
      const d = `M${n(x - 15 * s)} ${n(y)}L${n(x - 11 * s)} ${n(y - 13 * s)}L${n(x - 2 * s)} ${n(y - 19 * s)}L${n(x + 10 * s)} ${n(y - 14 * s)}L${n(x + 15 * s)} ${n(y)}Z`;
      return (
        fill(ellipsePath(x + 5 * s, y + 1, 16 * s, 4 * s), ground) +
        fill(d, c('#cfc8b8')) +
        fill(`M${n(x + 2 * s)} ${n(y - 18 * s)}L${n(x + 10 * s)} ${n(y - 14 * s)}L${n(x + 14 * s)} ${n(y - 1 * s)}L${n(x + 3 * s)} ${n(y - 1 * s)}Z`, c('#aea591')) +
        fill(`M${n(x - 10 * s)} ${n(y - 12 * s)}L${n(x - 2 * s)} ${n(y - 17 * s)}L${n(x)} ${n(y - 13 * s)}L${n(x - 7 * s)} ${n(y - 9 * s)}Z`, c('#e6e1d6'))
      );
    }
    case 'hay':
      return (
        fill(ellipsePath(x + 5 * s, y + 1, 16 * s, 4 * s), ground) +
        fill(`M${n(x - 14 * s)} ${n(y)}C${n(x - 14 * s)} ${n(y - 28 * s)} ${n(x + 14 * s)} ${n(y - 28 * s)} ${n(x + 14 * s)} ${n(y)}Z`, c('#e2bb5a')) +
        fill(`M${n(x + 3 * s)} ${n(y - 20 * s)}C${n(x + 11 * s)} ${n(y - 16 * s)} ${n(x + 13 * s)} ${n(y - 7 * s)} ${n(x + 13 * s)} ${n(y - 1 * s)}L${n(x + 4 * s)} ${n(y - 1 * s)}Z`, c('#c39a42')) +
        stroke(`M${n(x - 8 * s)} ${n(y - 13 * s)}q${n(7 * s)} ${n(-5 * s)} ${n(14 * s)} 0`, c('#f6dc8a'), 1.8 * s)
      );
  }
}

/**
 * The shepherds' cairn on a knoll of golden grass, fitted to its box: flat stones shrinking upward, lit on the left and
 * shaded on the right, with a red rag tied to the top as a waymark.
 */
function cairnOn(box: PathBox, X: (x: number) => number, dark: boolean): string {
  const c = (hex: string): string => dusk(hex, dark);
  const cx = X(box.x);
  const foot = box.y + box.h;
  const k = box.h / 57;
  const s = (v: number): number => v * k;
  let out = fill(ellipsePath(cx + s(6), foot - s(2), s(28), s(7)), c('#c9b46e'));
  out += fill(`M${n(cx - s(26))} ${n(foot - s(3))}C${n(cx - s(20))} ${n(foot - s(14))} ${n(cx + s(18))} ${n(foot - s(15))} ${n(cx + s(26))} ${n(foot - s(3))}Z`, c('#e2c77a'));
  const stones: [number, number, number][] = [
    [0, 13, 15],
    [-1, 22, 12],
    [1, 30, 10],
    [-1, 37.5, 8],
    [0.5, 44, 6],
    [0, 49.5, 4.5],
  ];
  for (const [dx, up, r] of stones) {
    const y = foot - s(up);
    out += fill(ellipsePath(cx + s(dx), y, s(r), s(r * 0.42)), c('#a99f8c'));
    out += fill(ellipsePath(cx + s(dx) - s(r * 0.12), y - s(r * 0.1), s(r * 0.86), s(r * 0.32)), c('#d6cfc0'));
  }
  out += fill(`M${n(cx + s(2))} ${n(foot - s(52))}l${n(s(9))} ${n(s(-3))}l${n(s(-2))} ${n(s(4))}l${n(s(3))} ${n(s(3))}l${n(s(-10))} ${n(s(-1))}Z`, dark ? '#c98f3c' : '#e2a334');
  return out;
}

// ───────────────────────────────────────────────────────────── the road walked

export interface PathStonesOptions {
  width: number;
  height: number;
  stones: readonly TrailStone[];
  /** Walked: lay the road in warm dirt over the pale road ahead; ahead: nothing to lay. */
  walked: boolean;
  dark?: boolean;
  rtl?: boolean;
}

/**
 * The walked stretches of road between stops, in warm dirt over the pale road ahead (`pathLandSvg`): edge, face and two
 * ruts, three elements however many stretches. A stretch is found by its stones (`trailStones`) and extended past its
 * first and last stone to the stops' edges, which the stops then cover.
 */
export function pathStonesSvg(opts: PathStonesOptions): string {
  const { width: W, height: H, dark = false, rtl = false, walked } = opts;
  if (!(W > 0) || !(H > 0)) throw new RangeError(`art: stones need a size, got ${W}×${H}`);
  const sign = rtl ? -1 : 1;
  const X = (x: number): number => W / 2 + sign * x;
  let d = '';
  if (walked) {
    const stretches = new Map<string, TrailStone[]>();
    for (const s of opts.stones) stretches.set(s.to, [...(stretches.get(s.to) ?? []), s]);
    for (const list of stretches.values()) {
      const pts: Pt[] = list.map((s) => [X(s.x), s.y]);
      // Extend to the stops it joins, along its heading.
      const reach = (from: Pt, toward: Pt): Pt => {
        const dx = from[0] - toward[0];
        const dy = from[1] - toward[1];
        const len = Math.hypot(dx, dy) || 1;
        return [from[0] + (dx / len) * 24, from[1] + (dy / len) * 24];
      };
      if (pts.length === 1) {
        d += `M${n(pts[0]![0])} ${n(pts[0]![1] - 30)}L${n(pts[0]![0])} ${n(pts[0]![1] + 30)}`;
        continue;
      }
      d += smoothPath([reach(pts[0]!, pts[1]!), ...pts, reach(pts[pts.length - 1]!, pts[pts.length - 2]!)]);
    }
  }
  const body = d
    ? stroke(d, dusk(VALLEY.dirtEdge, dark), ROAD.edge) +
      stroke(d, dusk(VALLEY.dirt, dark), ROAD.face) +
      `<path d="${d}" fill="none" stroke="${dusk(VALLEY.dirtTrack, dark)}" stroke-width="${ROAD.ruts}" stroke-dasharray="2 9" stroke-linecap="round"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}" height="${n(H)}" viewBox="0 0 ${n(W)} ${n(H)}" aria-hidden="true" focusable="false">${body}</svg>`;
}

// ───────────────────────────────────────────────────────────── the stops

/**
 * A stop's picture: `box` points square with the stop's centre at (`cx`, `cy`). The token's face is `rx` × `ry`,
 * standing `side` above the road (`raised` for the current skill); `press` is how far the face sinks under a finger.
 */
export const PATH_STOP_ART = { box: 112, cx: 56, cy: 58, rx: 36, ry: 31, side: 8, raised: 12, press: 6 } as const;

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
  const stone: Token = dark
    ? { face: '#6a6670', side: '#4a4651', ring: '#7a7680', glint: '#8f8b95' }
    : { face: '#e6ddca', side: '#bdb09a', ring: '#f3ede1', glint: '#ffffff' };
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
      return { face: t.fill, side: t.lip, ring: mix(t.fill, '#ffffff', dark ? 0.45 : 0.55), glint: '#ffffff' };
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
    // The current stop sits in a soft ring of its own colour, so the eye finds it.
    if (look === 'current') {
      body += `<path d="${ellipsePath(cx, cy + 4, rx + 16, ry + 13)}" fill="${t.fill}" fill-opacity="0.16"/>`;
      body += `<path d="${ellipsePath(cx, cy + 4, rx + 9, ry + 7)}" fill="${t.fill}" fill-opacity="0.18"/>`;
    }
    // Its shade on the road, then its side: the face extended down by `side`.
    body += `<path d="${ellipsePath(cx + 4, cy + side + ry * 0.55, rx * 0.98, ry * 0.4)}" fill="${shade}" fill-opacity="${dark ? 0.32 : 0.16}"/>`;
    body += fill(`M${n(cx - rx)} ${n(cy)}L${n(cx - rx)} ${n(cy + side)}A${n(rx)} ${n(ry)} 0 0 0 ${n(cx + rx)} ${n(cy + side)}L${n(cx + rx)} ${n(cy)}Z${ellipsePath(cx, cy + side, rx, ry)}`, k.side);
    if (look === 'strong') body += stroke(`M${n(cx - rx - 2)} ${n(cy + side)}A${n(rx + 2)} ${n(ry + 2)} 0 0 0 ${n(cx + rx + 2)} ${n(cy + side)}`, warm('#f2b632', dark), 3);
    return wrap(prefix, size, B, body);
  }

  // The face: its colour, the ring inside its rim, and its highlight along the upper left.
  let body = '';
  if (look === 'strong') body += fill(ellipsePath(cx, cy, rx + 3, ry + 3), warm('#ffd96a', dark));
  body += fill(ellipsePath(cx, cy, rx, ry), k.face);
  body += `<path d="${ellipsePath(cx, cy, rx - 6, ry - 5.5)}" fill="none" stroke="${k.ring}" stroke-width="2.6"/>`;
  body += `<path d="M${n(cx - rx * 0.74)} ${n(cy - ry * 0.28)}A${n(rx - 4)} ${n(ry - 4)} 0 0 1 ${n(cx - rx * 0.18)} ${n(cy - ry * 0.84)}" fill="none" stroke="${k.glint}" stroke-width="3" stroke-linecap="round" stroke-opacity="${dark ? 0.4 : 0.6}"/>`;
  if (look === 'locked') body += fill(ellipsePath(cx + 14, cy + 10, 3.6, 2.2) + ellipsePath(cx - 16, cy + 8, 2.4, 1.5), k.side);
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

