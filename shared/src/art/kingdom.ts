/**
 * Kurdish Kingdom's village, Sêvan, drawn by code: an isometric village on
 * three terraces stepping down a mountainside to a lake, under the Zagros,
 * its six buildings each at its own level — a staked-out plot, a stage being
 * built in scaffolding, then five stages, each richer than the last.
 *
 * The look is a painted board game's: every object has a heavy dark-brown
 * outline and is cel-shaded in flat planes of its own colour, lit from the
 * upper left (its top lit, the face turned down-left in the middle tone, the
 * face turned down-right in shade), with no gradients and no blurs anywhere.
 * The village is Hewraman: flat-roofed stone houses stepping up the slope,
 * the round ends of their roof beams under the eaves; a tenûr; a tea house
 * with its samovar, low stools and a kilim on the bench; a kanî with its
 * carved basin; a bazaar stall under a striped awning; a school with its
 * bell; apples and pomegranates in the orchard; poplars; beehives; kilims
 * hung out to air. No flag of any country, and no people: the village's life
 * is its animals, laid over the scene by `kingdomLife` (life.ts).
 *
 * What comes from here:
 * - `kingdomSceneSvg`: the whole village on its `KINGDOM_SCENE` canvas. The
 *   canvas is wider and taller than the village itself (`KINGDOM_FRAME`), so
 *   an app can fill a screen of any shape with it and keep the frame in view.
 * - `KINGDOM_PLOTS`: where each building stands on the canvas — the box a
 *   tap on it covers, and the spot under it where the app sets its level
 *   badge and progress bar (in the app's own type, never baked in here).
 * - `kingdomBuildingSvg`: one building at one stage on a small island of its
 *   own, on the shared 120-unit canvas, for its sheet and the list.
 * - `kingdomPlotSvg`: one building at one stage alone, in canvas units at
 *   its plot, for the upgrade: the apps lay it over a scene drawn without it
 *   and let the scaffolding drop and the new stage pop in.
 *
 * Deterministic: the same levels give the same string, and every hand-placed
 * irregularity comes from a seeded random source.
 */
import { KINGDOM_BUILDINGS, type KingdomBuilding, type KingdomLevel } from '../games/kingdom/buildings.js';
import { CANVAS, checkSize, escapeXml, n, n2, prefixFor, seeded } from './svg.js';
import { DAY, DUSK, Part, inked, iso, sorted, type Drawn, type Palette } from './kingdom/pen.js';
import { BUILDING_TOP, PLOT_SIZE, buildingParts } from './kingdom/buildings.js';
import { TERRACES, WATER_Z, depthAt, groundAt, land, paths, terraceAt } from './kingdom/land.js';
import * as P from './kingdom/props.js';
import { KINGDOM_SPRITES, SPRITE_BOX, kingdomSpriteSvg, lifeOf, type KingdomActor, type KingdomFrame, type KingdomLifeKind, type KingdomMotion, type KingdomNode, type KingdomSprite } from './kingdom/life.js';

/** The canvas the scene is drawn on, in its own units. */
export const KINGDOM_SCENE = { width: 1000, height: 860 } as const;

/** Where the world's origin sits on the canvas. */
export const KINGDOM_ORIGIN = { x: 452, y: 318 } as const;

/** The part of the canvas that holds the village and the peaks over it: what an app keeps in view however it crops the rest. */
export const KINGDOM_FRAME = { x: 286, y: 96, w: 408, h: 654 } as const;

/** Buildings are drawn this much larger than their plots' own units. */
export const BUILDING_SCALE = 1.25;

/** Each plot's back corner on the ground, in world units: two buildings side by side on each terrace. */
const PLOT_CORNER: Readonly<Record<KingdomBuilding, readonly [number, number]>> = {
  houses: [2, 6],
  school: [126, 14],
  teahouse: [110, 134],
  market: [238, 116],
  spring: [220, 250],
  orchard: [334, 232],
};

/** Where a building stands on the canvas: its foot's middle, the box a tap on it covers, and the spot its badge goes. */
export interface KingdomPlot {
  /** the middle of its plot on the ground, on the canvas */
  x: number;
  y: number;
  /** the box a tap on it covers, on the canvas */
  box: { x: number; y: number; w: number; h: number };
  /** the top middle of its level badge, just inside its front corner */
  badge: { x: number; y: number };
  /** which terrace it stands on, 0 the highest */
  tier: number;
}

/** A point in the world on the canvas. */
export function kingdomPoint(x: number, y: number, z: number): { x: number; y: number } {
  const [sx, sy] = iso(x, y, z);
  return { x: KINGDOM_ORIGIN.x + sx, y: KINGDOM_ORIGIN.y + sy };
}

/** A plot's back corner, its size on the ground, and its terrace. */
function plotCorner(b: KingdomBuilding): { x: number; y: number; z: number; w: number; d: number; tier: number } {
  const [x, y] = PLOT_CORNER[b];
  const w = PLOT_SIZE[b].w * BUILDING_SCALE;
  const d = PLOT_SIZE[b].d * BUILDING_SCALE;
  const tier = terraceAt(x + w / 2, y + d / 2);
  return { x, y, z: TERRACES[tier]!.z, w, d, tier };
}

function plotOf(b: KingdomBuilding): KingdomPlot {
  const c = plotCorner(b);
  const mid = kingdomPoint(c.x + c.w / 2, c.y + c.d / 2, c.z);
  const left = kingdomPoint(c.x, c.y + c.d, c.z);
  const right = kingdomPoint(c.x + c.w, c.y, c.z);
  const front = kingdomPoint(c.x + c.w, c.y + c.d, c.z);
  const top = kingdomPoint(c.x, c.y, c.z + BUILDING_TOP[b] * BUILDING_SCALE);
  // the middle three-fifths of the plot across: neighbours on a terrace never share a spot, and the badge below stays clear
  const half = (right.x - left.x) * 0.3;
  const x0 = mid.x - half;
  const x1 = mid.x + half;
  return { x: mid.x, y: mid.y, box: { x: x0, y: top.y, w: x1 - x0, h: front.y - 10 - top.y }, badge: { x: front.x, y: front.y - 16 }, tier: c.tier };
}

export const KINGDOM_PLOTS: Readonly<Record<KingdomBuilding, KingdomPlot>> = Object.fromEntries(KINGDOM_BUILDINGS.map((b) => [b, plotOf(b)])) as Record<KingdomBuilding, KingdomPlot>;

/** Every stroke width in a piece of markup divided by k, so a drawing scaled up by k keeps the village's line. */
function keepLine(markup: string, k: number): string {
  return markup.replace(/stroke-width="([\d.]+)"/g, (_, w: string) => `stroke-width="${n2(Number(w) / k)}"`);
}

/**
 * A building at its level (or being raised towards the next), placed at its
 * plot, as markup in world units; `scaffold` keeps only the builders' work
 * round it, or leaves it out.
 */
function placedBuilding(b: KingdomBuilding, level: KingdomLevel, pal: Palette, rising: boolean, scaffold: 'with' | 'only' | 'none' = 'with'): string {
  const c = plotCorner(b);
  const [sx, sy] = iso(c.x, c.y, c.z);
  const parts = buildingParts(b, level, pal, rising).filter((part) => scaffold === 'with' || (scaffold === 'only') === (part.tag === 'scaffold'));
  const body = sorted(parts.map((p) => ({ depth: p.depth, svg: p.svg() })));
  return `<g transform="translate(${n(sx)} ${n(sy)}) scale(${BUILDING_SCALE})" stroke-width="${n2(1.1 / BUILDING_SCALE)}">${keepLine(body, BUILDING_SCALE)}</g>`;
}

/** The depth a building sorts at among the scenery: its terrace first, then how near its middle stands. */
function buildingDepth(b: KingdomBuilding): number {
  const c = plotCorner(b);
  return depthAt(c.x + c.w / 2, c.y + c.d / 2);
}

/** Scenery a little larger than drawn, as the buildings are: grown about its foot. */
function grown(part: Part, x: number, y: number, z: number, k = BUILDING_SCALE, depth?: number): Drawn {
  const [fx, fy] = iso(x, y, z);
  const svg = k === 1 ? part.svg() : `<g transform="translate(${n(fx * (1 - k))} ${n(fy * (1 - k))}) scale(${n2(k)})" stroke-width="${n2(1.1 / k)}">${keepLine(part.svg(), k)}</g>`;
  return { depth: depth ?? depthAt(x, y) + (part.depth - x - y), svg };
}

/**
 * What in the scenery sways, and so is left out of the scene when an app
 * draws it moving over the scene instead: poplars on the hill behind the
 * village and at its corners (x, y, z, height, width), the kilim aired on
 * its line, and the kilim banners by the gate.
 */
export const KINGDOM_SWAYING = {
  poplars: [
    [-14, 34, 48, 70, 13],
    [-10, 76, 48, 60, 12],
    [62, -12, 48, 66, 12],
    [444, 336, 0, 58, 11],
  ],
  kilim: [262, 214, 24],
  banners: [
    [302, 336, 0],
    [326, 336, 0],
  ],
} as const;

/** The hand-placed scenery round the buildings: trees, rocks, the tenûr, the gate, the haystack, the boat, the stream. */
function scenery(pal: Palette, rand: P.Rand, levels: Readonly<Record<KingdomBuilding, KingdomLevel>>, moving: boolean): Drawn[] {
  const out: Drawn[] = [];
  const put = (make: (x: number, y: number, z: number) => Part | Part[], x: number, y: number, k = BUILDING_SCALE, z = groundAt(x, y)): void => {
    const made = make(x, y, z);
    for (const part of Array.isArray(made) ? made : [made]) out.push(grown(part, x, y, z, k, terraceAt(x, y) < 0 && z > 0 ? part.depth - 2000 : undefined));
  };
  // on the hill behind, by the trail from the pass: poplars, an old walnut, rocks where the goats climb
  if (!moving) for (const [x, y, z, tall, wide] of KINGDOM_SWAYING.poplars) put((a, b, c) => P.poplar(pal, a, b, c, tall, wide), x, y, 1, z);
  put((a, b, c) => P.poplar(pal, a, b, c, 56, 11), 170, -14, 1, 48);
  put((a, b, c) => P.walnut(pal, a, b, c, 18, rand), -18, 4, BUILDING_SCALE, 48);
  put((a, b, c) => P.rock(pal, a, b, c, 7, rand), 132, -20, BUILDING_SCALE, 48);
  put((a, b, c) => P.bush(pal, a, b, c, 6, rand, 3), 98, -16, BUILDING_SCALE, 48);
  // the upper terrace: a signpost at the top of the path, a bench and flowers along its front
  put((a, b, c) => P.sign(pal, a, b, c, 'arrow'), 124, 2);
  put((a, b, c) => P.bush(pal, a, b, c, 5, rand, 4), 220, 106);
  put((a, b, c) => P.geraniums(pal, a, b, c, 3, rand, 'x'), 96, 106, 1.2);
  // the hens' ledge: the tenûr in the lee of the wall, a jar, firewood
  put((a, b, c) => P.tenur(pal, a, b, c), 230, 62);
  put((a, b, c) => P.jar(pal, a, b, c, 1.1), 252, 66);
  put((a, b, c) => P.logPile(pal, a, b, c, 3), 266, 80);
  put((a, b, c) => P.bush(pal, a, b, c, 5, rand, 0), 284, 108);
  // the middle terrace: the half-eaten apple on the path, the kilim aired in front of the market, a bush
  put((a, b, c) => halfApple(pal, a, b, c), 194, 127, 1.4);
  const [kx, ky, klen] = KINGDOM_SWAYING.kilim;
  put((a, b, c) => airingKilim(pal, a, b, c, klen, !moving), kx, ky);
  put((a, b, c) => P.bush(pal, a, b, c, 6, rand, 5), 330, 222);
  put((a, b, c) => P.jar(pal, a, b, c, 1), 244, 222);
  put((a, b, c) => P.rock(pal, a, b, c, 4, rand), 112, 118);
  // the sheep's meadow below it: the walnut's shade, the haystack, a wattle fold
  put((a, b, c) => P.walnut(pal, a, b, c, 18, rand), 160, 240);
  put((a, b, c) => P.haystack(pal, a, b, c, 9), 204, 292);
  put((a, b, c) => P.wattle(pal, a, b, c, 26, 'x'), 154, 298);
  put((a, b, c) => P.rock(pal, a, b, c, 5, rand), 172, 300);
  // the lower terrace: the gate down to the water, its banners, a crate left by it
  put((a, b, c) => P.gate(pal, a, b, c, 22, 'x'), 303, 334);
  for (const [x, y] of KINGDOM_SWAYING.banners) put((a, b, c) => P.bannerPole(pal, a, b, c, 30, !moving), x, y);
  put((a, b, c) => P.crate(pal, a, b, c, 8, pal.apple, rand), 330, 326);
  put((a, b, c) => P.bush(pal, a, b, c, 5, rand, 4), 222, 334);
  if (!moving) put((a, b, c) => P.poplar(pal, a, b, c, 58, 11), 444, 336, 1);
  // the boat drawn up by the steps into the lake
  out.push({ depth: 60000, svg: P.steppingStones(pal, [314, 346, WATER_Z], [318, 372, WATER_Z], 3, rand).svg() });
  out.push(grown(boat(pal, 340, 356, WATER_Z), 340, 356, WATER_Z, BUILDING_SCALE, 60001));
  // the stream from the spring, once there is water to run, over the wall's edge into the lake
  if (levels.spring >= 1) out.push({ depth: depthAt(246, 330) - 5000, svg: stream(pal, levels.spring) });
  return out;
}

/** The stream from the spring's plot: a ribbon of water across the grass and down the wall into the lake. */
function stream(pal: Palette, level: number): string {
  const w = level >= 4 ? 6.5 : level >= 2 ? 5 : 3.6;
  const [a0, a1] = iso(244, 324, 0);
  const [b0, b1] = iso(247, 340, 0);
  const [c0, c1] = iso(247, 340, WATER_Z);
  const ribbon = `M${n(a0 - w)} ${n(a1)}Q${n((a0 + b0) / 2 - w - 2)} ${n((a1 + b1) / 2)} ${n(b0 - w)} ${n(b1)}L${n(c0 - w * 0.8)} ${n(c1)}L${n(c0 + w * 0.8)} ${n(c1)}L${n(b0 + w)} ${n(b1)}Q${n((a0 + b0) / 2 + w - 2)} ${n((a1 + b1) / 2)} ${n(a0 + w)} ${n(a1)}Z`;
  return (
    `<path d="${ribbon}" fill="${pal.water.left}"/>` +
    `<path d="M${n(b0 - w * 0.25)} ${n(b1 + 1)}L${n(c0 - w * 0.2)} ${n(c1 - 2)}M${n(b0 + w * 0.4)} ${n(b1 + 3)}L${n(c0 + w * 0.35)} ${n(c1 - 4)}" fill="none" stroke="${pal.foam}" stroke-width="1.2"/>` +
    `<path d="M${n(c0 - w - 4)} ${n(c1 + 1.5)}q${n(w + 4)} 3.4 ${n(2 * w + 8)} 0" fill="none" stroke="${pal.foam}" stroke-width="2.4"/>`
  );
}

/** A kilim hung over a line between two posts to air; without its cloth, for an app that hangs the cloth itself and sways it. */
export function airingKilim(pal: Palette, x: number, y: number, z: number, len = 26, cloth = true): Part {
  const p = new Part(x + y);
  p.box(x - 0.8, y - 0.8, z, 1.6, 1.6, 18, pal.woodDark).box(x + len - 0.8, y - 0.8, z, 1.6, 1.6, 18, pal.woodDark);
  const [ax, ay] = iso(x, y, z + 17);
  const [bx, by] = iso(x + len, y, z + 17);
  p.line(`M${n(ax)} ${n(ay)}L${n(bx)} ${n(by)}`, 0.8);
  if (cloth) airingCloth(p, pal, x, y, z, len);
  return p;
}

/** The kilim itself, thrown over the line. */
export function airingCloth(p: Part, pal: Palette, x: number, y: number, z: number, len: number): void {
  P.kilim(p, (u, v) => iso(x + 3 + u, y + 0.4, z + 5 + v), len - 6, 12, pal);
}

/** A half-eaten apple left on the path, its bitten side showing white. */
function halfApple(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(x + y);
  const [cx, cy] = iso(x, y, z);
  const body = `M${n(cx - 2.6)} ${n(cy - 2)}A2.6 2.6 0 1 0 ${n(cx + 2.4)} ${n(cy - 2.6)}Q${n(cx + 0.6)} ${n(cy - 2.2)} ${n(cx + 0.8)} ${n(cy - 0.6)}Q${n(cx - 0.4)} ${n(cy - 3.2)} ${n(cx - 2.6)} ${n(cy - 2)}Z`;
  p.sil(body).fill(body, pal.apple).flat(`M${n(cx + 0.8)} ${n(cy - 0.6)}Q${n(cx + 0.6)} ${n(cy - 2.2)} ${n(cx + 2.4)} ${n(cy - 2.6)}Q${n(cx + 1.4)} ${n(cy - 1)} ${n(cx + 0.8)} ${n(cy - 0.6)}Z`, pal.cream.top);
  p.line(`M${n(cx - 1)} ${n(cy - 4.4)}l0.4 -1.4`, 0.8);
  return p;
}

/** A rowing boat drawn up at the water's edge, its rope to a post. */
function boat(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(x + y);
  const [cx, cy] = iso(x, y, z);
  const hull = `M${n(cx - 12)} ${n(cy - 6)}Q${n(cx - 2)} ${n(cy + 4)} ${n(cx + 12)} ${n(cy + 1)}L${n(cx + 13)} ${n(cy - 3)}Q${n(cx)} ${n(cy - 2)} ${n(cx - 12)} ${n(cy - 6)}Z`;
  const inside = `M${n(cx - 10)} ${n(cy - 5.6)}Q${n(cx)} ${n(cy - 2.6)} ${n(cx + 11.6)} ${n(cy - 2.6)}Q${n(cx + 2)} ${n(cy - 7)} ${n(cx - 10)} ${n(cy - 5.6)}Z`;
  p.sil(hull).fill(hull, pal.woodDark.left).fill(inside, pal.wood.right).line(`M${n(cx - 2)} ${n(cy - 5)}l2.6 2`, 1.4);
  return p;
}

export interface KingdomSceneOptions {
  levels: Readonly<Record<KingdomBuilding, KingdomLevel>>;
  /** buildings past half-way to their next level, drawn with that level being built */
  rising?: readonly KingdomBuilding[];
  /** a building left off its plot (only its ground drawn), for an app laying it over the scene as it is upgraded */
  without?: KingdomBuilding;
  /**
   * The app lays the moving things over the scene (`kingdomLife`), so what
   * sways is left out of the scene and drawn there instead; false (the
   * default) draws everything still, for a picture on its own.
   */
  moving?: boolean;
  /** how wide it is drawn, in pixels; its height follows */
  width?: number;
  /** for a dark screen: the village at dusk, its windows lit */
  dark?: boolean;
  title?: string;
  idPrefix?: string;
}

function levelOf(levels: Readonly<Record<KingdomBuilding, KingdomLevel>>, b: KingdomBuilding): KingdomLevel {
  const l = levels[b];
  if (!Number.isInteger(l) || l < 0 || l > 5) throw new RangeError(`art: no level ${String(l)} for ${b}`);
  return l;
}

/** The whole village, each building at its level. */
export function kingdomSceneSvg(o: KingdomSceneOptions): string {
  const width = checkSize(o.width, KINGDOM_SCENE.width);
  const height = (width * KINGDOM_SCENE.height) / KINGDOM_SCENE.width;
  const levels = Object.fromEntries(KINGDOM_BUILDINGS.map((b) => [b, levelOf(o.levels, b)])) as Record<KingdomBuilding, KingdomLevel>;
  const rising = new Set(o.rising ?? []);
  const key = KINGDOM_BUILDINGS.map((b) => `${levels[b]}${rising.has(b) ? 'r' : ''}`).join('');
  const p = prefixFor(o.idPrefix, 'kingdom', key, o.dark === true, o.without ?? '', o.moving === true);
  const pal = o.dark ? DUSK : DAY;
  const rand = seeded('kingdom-land');
  const view = { x: -KINGDOM_ORIGIN.x, y: -KINGDOM_ORIGIN.y, w: KINGDOM_SCENE.width, h: KINGDOM_SCENE.height };
  const ground = land(pal, rand, view);
  const drawn: Drawn[] = paths(pal, seeded('kingdom-paths')).map((part) => ({ depth: part.depth, svg: part.svg() }));
  drawn.push(...scenery(pal, seeded('kingdom-scenery'), levels, o.moving === true));
  for (const b of KINGDOM_BUILDINGS) {
    if (b === o.without) continue;
    const level = levels[b];
    drawn.push({ depth: buildingDepth(b), svg: placedBuilding(b, level, pal, rising.has(b) && level < 5) });
  }
  const t = `${p}t`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(width)}" height="${n2(height)}" viewBox="0 0 ${KINGDOM_SCENE.width} ${KINGDOM_SCENE.height}" role="img" aria-labelledby="${t}">` +
    `<title id="${t}">${escapeXml(o.title ?? 'Your village')}</title>` +
    `<g transform="translate(${KINGDOM_ORIGIN.x} ${KINGDOM_ORIGIN.y})">${inked(ground + sorted(drawn))}</g></svg>`
  );
}

export interface KingdomPlotOptions {
  building: KingdomBuilding;
  level: KingdomLevel;
  /** drawn with its next level being built in scaffolding */
  rising?: boolean;
  /** the builders' scaffolding, planks and tools: with the building (the default), on their own, or left off */
  scaffold?: 'with' | 'only' | 'none';
  dark?: boolean;
}

/** The box on the canvas a building alone is drawn in, for `kingdomPlotSvg`: its plot's tap box, with room round it for the tallest stage. */
export function kingdomPlotBox(b: KingdomBuilding): { x: number; y: number; w: number; h: number } {
  const box = KINGDOM_PLOTS[b].box;
  return { x: box.x - 30, y: box.y - 30, w: box.w + 60, h: box.h + 64 };
}

/** One building alone, on a transparent ground, in canvas units within `kingdomPlotBox`, to lay over the scene at its plot. */
export function kingdomPlotSvg(o: KingdomPlotOptions): string {
  const pal = o.dark ? DUSK : DAY;
  const box = kingdomPlotBox(o.building);
  const body = placedBuilding(o.building, o.level, pal, o.rising === true && o.level < 5, o.scaffold ?? 'with');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}" aria-hidden="true">` +
    `<g transform="translate(${KINGDOM_ORIGIN.x} ${KINGDOM_ORIGIN.y})">${inked(body)}</g></svg>`
  );
}

export interface KingdomBuildingOptions {
  building: KingdomBuilding;
  level: KingdomLevel;
  /** drawn with its next level being built */
  rising?: boolean;
  /** how big it is drawn, in pixels (it is square) */
  size?: number;
  dark?: boolean;
  title?: string;
  idPrefix?: string;
}

/** How each building is framed on its own island: the scale that fits its fullest stage on the 120 canvas. */
const ISLAND_FIT: Readonly<Record<KingdomBuilding, number>> = { houses: 0.62, school: 0.68, teahouse: 0.66, spring: 0.74, market: 0.66, orchard: 0.6 };

/** One building at one stage on a small island of grass with its earth edge showing: its sheet's and the list's picture. */
export function kingdomBuildingSvg(o: KingdomBuildingOptions): string {
  const size = checkSize(o.size, 120);
  if (!(KINGDOM_BUILDINGS as readonly string[]).includes(o.building)) throw new RangeError(`art: no building ${String(o.building)}`);
  if (!Number.isInteger(o.level) || o.level < 0 || o.level > 5) throw new RangeError(`art: no level ${String(o.level)}`);
  const pal = o.dark ? DUSK : DAY;
  const p = prefixFor(o.idPrefix, 'kingdomb', o.building, o.level, o.dark === true, o.rising === true);
  const t = `${p}t`;
  const { w, d } = PLOT_SIZE[o.building];
  const island = new Part(-1000);
  island.box(-5, -5, -9, w + 10, d + 10, 9, { top: pal.grass.top, left: pal.cliff.left, right: pal.cliff.right });
  const body = sorted([{ depth: -1000, svg: island.svg() }, ...buildingParts(o.building, o.level, pal, o.rising === true && o.level < 5).map((q) => ({ depth: q.depth, svg: q.svg() }))]);
  // the island's middle on the canvas, a little below centre so the tallest stage has room
  const k = ISLAND_FIT[o.building];
  const [mx, my] = iso(w / 2, d / 2, 0);
  const tx = 60 - mx * k;
  const ty = 76 - my * k;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-labelledby="${t}">` +
    `<title id="${t}">${escapeXml(o.title ?? o.building)}</title>` +
    `<g transform="translate(${n(tx)} ${n(ty)}) scale(${n2(k)})" stroke-width="${n2(1.1 / k)}">${keepLine(inked(body), k)}</g></svg>`
  );
}


// ───────────────────────────────────────────────────────────── the life

/** A point in a building's own units (its plot's back corner at the origin), on the canvas. */
function inPlot(b: KingdomBuilding, x: number, y: number, z: number): { x: number; y: number } {
  const c = plotCorner(b);
  return kingdomPoint(c.x + x * BUILDING_SCALE, c.y + y * BUILDING_SCALE, c.z + z * BUILDING_SCALE);
}

/**
 * Everything that moves in the village at these levels, back to front, on
 * the canvas: the apps lay each actor's nodes over a scene drawn with
 * `moving: true`, and play each node's frames (or show its still pose).
 */
export function kingdomLife(levels: Readonly<Record<KingdomBuilding, KingdomLevel>>): KingdomActor[] {
  const checked = Object.fromEntries(KINGDOM_BUILDINGS.map((b) => [b, levelOf(levels, b)])) as Record<KingdomBuilding, KingdomLevel>;
  return lifeOf(checked, kingdomPoint, inPlot, KINGDOM_SWAYING);
}

export { KINGDOM_SPRITES, SPRITE_BOX as KINGDOM_SPRITE_BOX, kingdomSpriteSvg, type KingdomActor, type KingdomFrame, type KingdomLifeKind, type KingdomMotion, type KingdomNode, type KingdomSprite };
