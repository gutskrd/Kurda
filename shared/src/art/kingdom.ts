/**
 * The Village ("kingdom" in code), Sêvan, drawn by code: an isometric village
 * on three terraces stepping down a mountainside to a lake, under the Zagros,
 * its six buildings each at its own level — a staked-out plot, a stage being
 * built in scaffolding, then five stages, each richer than the last — in a
 * whole valley that fills in as the village's total level rises (valley.ts,
 * from games/kingdom/growth.ts).
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
 * hung out to air. No flag of any country, and no people drawn into the
 * scene: the village's life (its animals, the deer, and the course's own Hamo
 * and Xezal by the tea house and the school) is laid over it by `kingdomLife`
 * (life.ts).
 *
 * What comes from here:
 * - `kingdomTiles`: the whole world on its `KINGDOM_SCENE` canvas, several
 *   times the village's size, cut into a grid of tiles (`KINGDOM_TILE`), so
 *   an app that pans and zooms about it draws only the tiles near its view.
 * - `kingdomSceneSvg`: the same world as one picture, or with `framed` only
 *   the village's heart (`KINGDOM_FRAME`), for a picture of it on its own.
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
import { DAY, DUSK, Part, SHADOW, castShadow, inked, iso, sorted, type Drawn, type Palette } from './kingdom/pen.js';
import { BUILDING_TOP, PLOT_SIZE, buildingDoors, buildingParts } from './kingdom/buildings.js';
import { TERRACES, WATER_Z, depthAt, groundAt, paths, terraceAt } from './kingdom/land.js';
import * as P from './kingdom/props.js';
import { CAIRN, FEATURE_AT, FLOOR_SHADOWS, FLOOR_Z, GROVE_TREES, VALLEY, valleyGround, valleyThings, valleyWoods, waterAt } from './kingdom/valley.js';
import { markupExtent, overlaps, type Extent } from './kingdom/bounds.js';
import { VILLAGE_MAX_LEVEL, villageHas, villageLevelAt, type VillageFeature } from '../games/kingdom/growth.js';
import { KINGDOM_ANIMAL_HEIGHT, KINGDOM_FIGURE_HEIGHT, KINGDOM_SPRITES, SPRITE_BOX, kingdomActorReach, kingdomSpriteSvg, lifeOf, type KingdomActor, type KingdomFrame, type KingdomLifeKind, type KingdomMotion, type KingdomNode, type KingdomSprite, type KingdomTap } from './kingdom/life.js';

/** The canvas the world is drawn on, in its own units: the whole valley, several times the village's size. */
export const KINGDOM_SCENE = { width: VALLEY.x1 - VALLEY.x0, height: VALLEY.y1 - VALLEY.y0 } as const;

/** Where the world's origin sits on the canvas. */
export const KINGDOM_ORIGIN = { x: -VALLEY.x0, y: -VALLEY.y0 } as const;

/**
 * The village's heart on the canvas: its terraces and the peaks over them,
 * what a picture of the village on its own (the Games tile) shows, and where
 * an app opens its view.
 */
export const KINGDOM_FRAME = { x: KINGDOM_ORIGIN.x - 166, y: KINGDOM_ORIGIN.y - 222, w: 408, h: 654 } as const;

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
/** Where on the canvas a thing the village gains stands, for the camera to go and show it as it arrives. */
export function kingdomFeatureAt(feature: VillageFeature): { x: number; y: number } {
  const [x, y, on] = FEATURE_AT[feature];
  return kingdomPoint(x, y, on === 'village' ? groundAt(x, y) : FLOOR_Z);
}

/** Whether a point on the canvas is out on the open lake (for an app to ring the water where it is touched). */
export function kingdomWaterAt(x: number, y: number): boolean {
  return waterAt(x - KINGDOM_ORIGIN.x, y - KINGDOM_ORIGIN.y);
}

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

/** Where the shepherds' cairn stands, in world units: on its outcrop at the top of the track up to their camp. */
export const KINGDOM_CAIRN = CAIRN;

/** The hand-placed scenery round the buildings: trees, rocks, the cairn, the tenûr, the gate, the haystack, the boat, the stream. */
function scenery(pal: Palette, rand: P.Rand, levels: Readonly<Record<KingdomBuilding, KingdomLevel>>, moving: boolean): Drawn[] {
  const out: Drawn[] = [];
  const put = (make: (x: number, y: number, z: number) => Part | Part[], x: number, y: number, k = BUILDING_SCALE, z = groundAt(x, y)): void => {
    const made = make(x, y, z);
    for (const part of Array.isArray(made) ? made : [made]) out.push({ ...grown(part, x, y, z, k, terraceAt(x, y) < 0 && z > 0 ? part.depth - 2000 : undefined), casts: 'own' });
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
  // the lake: rocks standing out of it with foam round their feet, lily pads off the meadow, reeds by the falls
  out.push({ depth: 100, svg: lakeDetails(pal, rand) });
  // stepping stones down from the gate into the lake (the boat comes later, to the dock)
  out.push({ depth: 60000, svg: P.steppingStones(pal, [314, 346, WATER_Z], [318, 372, WATER_Z], 3, rand).svg() });
  // the stream from the spring, once there is water to run, over the wall's edge into the lake
  if (levels.spring >= 1) out.push({ depth: depthAt(246, 330) - 5000, svg: stream(pal, levels.spring) });
  return out;
}

/** Things in the open lake: a few rocks with foam round them, lily pads, a bed of reeds; drawn before the terraces' things. */
function lakeDetails(pal: Palette, rand: P.Rand): string {
  let out = '';
  for (const [x, y, s] of [[-60, 140, 7], [-48, 152, 4.5], [380, 420, 6], [470, 380, 5], [150, 360, 4]] as const) {
    const [fx, fy] = iso(x, y, WATER_Z);
    out += `<path d="M${n(fx - s * 2.2)} ${n(fy + 1)}q${n(s * 2.2)} ${n(s * 0.9)} ${n(s * 4.4)} 0" fill="none" stroke="${pal.foam}" stroke-width="1.8"/>`;
    out += P.rock(pal, x, y, WATER_Z, s, rand).svg();
  }
  let pads = '';
  for (const [x, y] of [[132, 330], [140, 340], [128, 346], [206, 352]] as const) {
    const [px, py] = iso(x, y, WATER_Z);
    pads += `M${n(px)} ${n(py)}l${n(-3.2)} ${n(-1.2)}a3.6 1.8 0 1 0 1.2 -1.4Z`;
  }
  out += `<path d="${pads}" fill="${pal.leafDark.left}" stroke-width="0.8"/>`;
  const [rx, ry] = iso(232, 352, WATER_Z);
  let reeds = '';
  for (let i = 0; i < 6; i++) reeds += `M${n(rx - 6 + i * 2.4)} ${n(ry)}q${n(i % 2 ? 1.4 : -1)} -6 ${n(i % 2 ? 0.6 : -0.6)} ${n(-(9 + (i % 3) * 2.4))}`;
  out += `<path d="${reeds}" fill="none" stroke-width="2.6"/><path d="${reeds}" fill="none" stroke="${pal.leafDark.left}" stroke-width="1.2"/>`;
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
  /** only the frame the village stands in, not the whole canvas: for a picture of the village on its own, such as a tile */
  framed?: boolean;
  /** only this window onto the canvas (it wins over `framed`), and only what is drawn in it: a band for a small picture, much lighter than the whole */
  window?: { x: number; y: number; w: number; h: number };
  /** how wide it is drawn, in pixels; its height follows */
  width?: number;
  /** for a dark screen: the village at dusk, its windows lit */
  dark?: boolean;
  /**
   * The village's own level, which says how far the valley round the
   * buildings has filled in (`villageStanding`); without it, the level their
   * levels alone reach.
   */
  village?: number;
  title?: string;
  idPrefix?: string;
}

function levelOf(levels: Readonly<Record<KingdomBuilding, KingdomLevel>>, b: KingdomBuilding): KingdomLevel {
  const l = levels[b];
  if (!Number.isInteger(l) || l < 0 || l > 5) throw new RangeError(`art: no level ${String(l)} for ${b}`);
  return l;
}

/** The total of the levels shown. */
export function kingdomTotal(levels: Readonly<Record<KingdomBuilding, KingdomLevel>>): number {
  return KINGDOM_BUILDINGS.reduce((sum, b) => sum + levels[b], 0);
}

/** The village level the valley is drawn at: the one given, or the one the buildings' levels alone reach. */
function villageOf(levels: Readonly<Record<KingdomBuilding, KingdomLevel>>, village: number | undefined): number {
  if (village === undefined) return villageLevelAt(kingdomTotal(levels));
  if (!Number.isInteger(village) || village < 1 || village > VILLAGE_MAX_LEVEL) throw new RangeError(`art: no village level ${String(village)}`);
  return village;
}

/**
 * Every shadow in the world, all one colour and falling one way: each
 * building's and each thing's on a terrace just under it, the valley
 * floor's gathered into one path for each tile they fall in, and the
 * groves' trees'.
 */
function shadowsOf(drawn: readonly Drawn[]): Drawn[] {
  const out: Drawn[] = [];
  const floor = new Map<string, string>();
  const onFloor = (d: string, at: { x: number; y: number }): void => {
    const key = `${Math.floor((at.x + KINGDOM_ORIGIN.x) / KINGDOM_TILE.w)},${Math.floor((at.y + KINGDOM_ORIGIN.y) / KINGDOM_TILE.h)}`;
    floor.set(key, (floor.get(key) ?? '') + d);
  };
  const fill = `fill="${SHADOW.colour}" fill-opacity="${SHADOW.opacity}" stroke="none"`;
  for (const piece of drawn) {
    if (!piece.casts) continue;
    const e = markupExtent(piece.svg);
    const d = e && castShadow(e);
    if (!e || !d) continue;
    if (piece.casts === 'own') out.push({ depth: piece.depth - 0.5, svg: `<path d="${d}" ${fill}/>` });
    else onFloor(d, { x: (e.x0 + e.x1) / 2, y: e.y1 });
  }
  // the groves' trees (which sway over the scene when an app draws them moving, their feet staying where they are)
  for (const t of GROVE_TREES) {
    const w = (48 * t.h) / 58;
    const d = castShadow({ x0: t.x - w / 2, y0: t.y - t.h, x1: t.x + w / 2, y1: t.y });
    if (d) onFloor(d, t);
  }
  for (const [, d] of floor) out.push({ depth: FLOOR_SHADOWS, svg: `<path d="${d}" ${fill}/>` });
  return out;
}

/** One piece of the world, its depth among the rest, and the box it covers on the canvas. */
interface Placed extends Drawn {
  at: Extent;
}

/**
 * Every piece of the world at these levels, sorted back to front, each with
 * the box it covers on the canvas: the valley's ground, the village's paths
 * and scenery, the valley's things as far as the village has grown, the
 * woods, and the six buildings. Kept for the last few worlds asked for, since
 * an app asks for the same one again as it redraws its tiles.
 */
function world(o: KingdomSceneOptions): Placed[] {
  const levels = Object.fromEntries(KINGDOM_BUILDINGS.map((b) => [b, levelOf(o.levels, b)])) as Record<KingdomBuilding, KingdomLevel>;
  const rising = new Set(o.rising ?? []);
  const moving = o.moving === true;
  const village = villageOf(levels, o.village);
  const key = `${KINGDOM_BUILDINGS.map((b) => `${levels[b]}${rising.has(b) ? 'r' : ''}`).join('')}|${village}|${o.dark === true}|${o.without ?? ''}|${moving}`;
  const kept = WORLDS.get(key);
  if (kept) return kept;
  const pal = o.dark ? DUSK : DAY;
  const has = (f: VillageFeature): boolean => villageHas(village, f);
  const drawn: Drawn[] = valleyGround(pal, seeded('kingdom-land'), moving);
  drawn.push(...paths(pal, seeded('kingdom-paths')).map((part) => ({ depth: part.depth, svg: part.svg() })));
  drawn.push(...scenery(pal, seeded('kingdom-scenery'), levels, moving));
  drawn.push(...valleyThings(pal, seeded('kingdom-valley'), has, moving));
  drawn.push(...valleyWoods(pal, seeded('kingdom-woods'), moving));
  for (const b of KINGDOM_BUILDINGS) {
    if (b === o.without) continue;
    const level = levels[b];
    drawn.push({ depth: buildingDepth(b), svg: placedBuilding(b, level, pal, rising.has(b) && level < 5), casts: 'own' });
  }
  drawn.push(...shadowsOf(drawn));
  const out: Placed[] = [];
  for (const [d] of drawn.map((p, i) => [p, i] as const).sort((a, b) => a[0].depth - b[0].depth || a[1] - b[1])) {
    const e = markupExtent(d.svg);
    if (e) out.push({ ...d, at: { x0: e.x0 + KINGDOM_ORIGIN.x, y0: e.y0 + KINGDOM_ORIGIN.y, x1: e.x1 + KINGDOM_ORIGIN.x, y1: e.y1 + KINGDOM_ORIGIN.y } });
  }
  WORLDS.set(key, out);
  if (WORLDS.size > 4) WORLDS.delete(WORLDS.keys().next().value!);
  return out;
}
const WORLDS = new Map<string, Placed[]>();

/** The pieces of the world that reach into a box on the canvas, as markup in canvas units. */
function within(pieces: readonly Placed[], box: { x: number; y: number; w: number; h: number }): string {
  const e: Extent = { x0: box.x, y0: box.y, x1: box.x + box.w, y1: box.y + box.h };
  let body = '';
  for (const piece of pieces) if (overlaps(piece.at, e)) body += piece.svg;
  return `<g transform="translate(${KINGDOM_ORIGIN.x} ${KINGDOM_ORIGIN.y})">${inked(body)}</g>`;
}

/** The whole world (or, `framed`, the village's heart alone), each building at its level, as one picture. */
export function kingdomSceneSvg(o: KingdomSceneOptions): string {
  const view = o.window ?? (o.framed ? KINGDOM_FRAME : { x: 0, y: 0, w: KINGDOM_SCENE.width, h: KINGDOM_SCENE.height });
  const width = checkSize(o.width, view.w);
  const height = (width * view.h) / view.w;
  const levels = Object.fromEntries(KINGDOM_BUILDINGS.map((b) => [b, levelOf(o.levels, b)])) as Record<KingdomBuilding, KingdomLevel>;
  const rising = new Set(o.rising ?? []);
  const key = `${KINGDOM_BUILDINGS.map((b) => `${levels[b]}${rising.has(b) ? 'r' : ''}`).join('')}v${villageOf(levels, o.village)}`;
  const p = prefixFor(o.idPrefix, 'kingdom', key, o.dark === true, o.without ?? '', o.moving === true);
  const t = `${p}t`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(width)}" height="${n2(height)}" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" role="img" aria-labelledby="${t}">` +
    `<title id="${t}">${escapeXml(o.title ?? 'Your village')}</title>` +
    `${within(world(o), view)}</svg>`
  );
}

/** How the world is cut into tiles: a grid of this size on the canvas, each a picture of its own. */
export const KINGDOM_TILE = { w: 400, h: 345 } as const;
/** How far each tile reaches past its neighbour, in canvas units. */
export const KINGDOM_TILE_OVERLAP = 2;

/** One tile of the world: where it sits on the canvas, and its picture (which reaches `KINGDOM_TILE_OVERLAP` units past its right and bottom edges, so neighbours overlap and never show a seam, whatever the scale and the screen's rounding). */
export interface KingdomTile {
  x: number;
  y: number;
  w: number;
  h: number;
  svg: string;
}

/**
 * The world cut into tiles, so an app draws only those near what is in view
 * and a world this large stays cheap. Each tile holds every piece that
 * reaches into it, in the same order as the whole picture, so laid side by
 * side they are that picture.
 */
export function kingdomTiles(o: Omit<KingdomSceneOptions, 'framed' | 'width' | 'title' | 'idPrefix'>): KingdomTile[] {
  const pieces = world(o);
  const out: KingdomTile[] = [];
  for (let y = 0; y < KINGDOM_SCENE.height; y += KINGDOM_TILE.h) {
    for (let x = 0; x < KINGDOM_SCENE.width; x += KINGDOM_TILE.w) {
      const w = Math.min(KINGDOM_TILE.w, KINGDOM_SCENE.width - x) + KINGDOM_TILE_OVERLAP;
      const h = Math.min(KINGDOM_TILE.h, KINGDOM_SCENE.height - y) + KINGDOM_TILE_OVERLAP;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}" aria-hidden="true">${within(pieces, { x, y, w, h })}</svg>`;
      out.push({ x, y, w, h, svg });
    }
  }
  return out;
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
const ISLAND_FIT: Readonly<Record<KingdomBuilding, number>> = { houses: 0.72, school: 0.8, teahouse: 0.76, spring: 0.86, market: 0.77, orchard: 0.68 };

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
  island.box(-2, -2, -9, w + 4, d + 4, 9, { top: pal.grass.top, left: pal.cliff.left, right: pal.cliff.right });
  const body = sorted([{ depth: -1000, svg: island.svg() }, ...buildingParts(o.building, o.level, pal, o.rising === true && o.level < 5).map((q) => ({ depth: q.depth, svg: q.svg() }))]);
  // the island's middle on the canvas, a little below centre so the tallest stage has room
  const k = ISLAND_FIT[o.building];
  const [mx, my] = iso(w / 2, d / 2, 0);
  const tx = 60 - mx * k;
  const ty = 78 - my * k;
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
export function kingdomLife(levels: Readonly<Record<KingdomBuilding, KingdomLevel>>, village?: number): KingdomActor[] {
  const checked = Object.fromEntries(KINGDOM_BUILDINGS.map((b) => [b, levelOf(levels, b)])) as Record<KingdomBuilding, KingdomLevel>;
  return lifeOf(checked, villageOf(checked, village), kingdomPoint, inPlot, KINGDOM_SWAYING, KINGDOM_ORIGIN);
}

export { KINGDOM_ANIMAL_HEIGHT, KINGDOM_FIGURE_HEIGHT, KINGDOM_SPRITES, SPRITE_BOX as KINGDOM_SPRITE_BOX, buildingDoors as kingdomBuildingDoors, kingdomActorReach, kingdomSpriteSvg, type KingdomActor, type KingdomFrame, type KingdomLifeKind, type KingdomMotion, type KingdomNode, type KingdomSprite, type KingdomTap };
