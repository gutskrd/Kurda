/**
 * Where a learner's tree stands: a sky that is the hour's own — dawn, day,
 * dusk or night — with the sun or the moon in it, a soft light where the
 * tree will be, and the mountains far off under it, ridge behind ridge, paler
 * the further they are. A cloud is its own drawing, so an app can let two or
 * three of them drift.
 *
 * It is drawn the way the trees are (`trees.ts`): flat shapes, the same
 * string on every machine, and only what the phone draws as the browser
 * does. The picture is square and meant to be laid at the foot of whatever
 * it fills, so on a wide page it is the top of the sky that is cut off, never
 * the mountains.
 */
import type { TreeHealth, TreeSeason, TreeStage } from '../tree.js';
import { Drawing, checkSize, linearAt, mix, n, prefixFor, radialAt, seeded, type Pt } from './svg.js';

/** The skies there are, in the order a day goes through them. */
export const TREE_SKIES = ['dawn', 'day', 'dusk', 'night'] as const;
export type TreeSky = (typeof TREE_SKIES)[number];

/** The sky at an hour of the learner's own clock (0–23). */
export function treeSkyAt(hour: number): TreeSky {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

/** What is in the air round a tree: light in the sun, petals or leaves coming down, or the night tree's fireflies. */
export type TreeAir = 'motes' | 'petals' | 'leaves' | 'fireflies';

/** What is in the air round this tree, if anything: a tree left to wilt has still air round it. */
export function treeAir(species: string, stage: TreeStage, health: TreeHealth): TreeAir | null {
  if (health === 'wilting' || health === 'withered') return null;
  if (stage >= 3 && species === 'sev') return 'fireflies';
  if (stage >= 3 && species === 'behiv') return 'petals';
  if (stage >= 3 && species === 'payiz') return 'leaves';
  return health === 'fresh' ? 'motes' : null;
}

export interface Sky {
  /** the sky itself, from its top to the horizon */
  air: readonly [string, string, string];
  /** the light the tree stands in, and how strong it is */
  glow: readonly [string, number];
  /** the sun or the moon: where, how big, its colour and the colour of the light round it */
  orb: readonly [x: number, y: number, r: number, colour: string, halo: string];
  /** the mountains, far to near */
  ridges: readonly [string, string, string];
  /** a cloud: its body and its underside */
  cloud: readonly [string, string];
}

/** Each sky's colours: the air, the light, the sun or moon, the mountains and the clouds. The horizon over a profile is painted from the same ones (`horizon.ts`). */
export const SKIES: Record<TreeSky, Sky> = {
  dawn: { air: ['#86bdea', '#f4cbbd', '#ffe9cc'], glow: ['#fff6dc', 0.7], orb: [25, 82, 10, '#fff4c8', '#ffd58a'], ridges: ['#d3c0d6', '#b5a4c9', '#978cb8'], cloud: ['#fff5ec', '#f4c6bd'] },
  day: { air: ['#52aeee', '#a3daf8', '#e2f5ff'], glow: ['#ffffff', 0.62], orb: [95, 41, 8, '#fff8d2', '#fff0a2'], ridges: ['#bcdbf0', '#98c4e5', '#7aadd8'], cloud: ['#ffffff', '#d2eafa'] },
  dusk: { air: ['#3b3d84', '#c75d8e', '#ffb47c'], glow: ['#ffe2c0', 0.5], orb: [96, 85, 11, '#ffdca6', '#ff9c68'], ridges: ['#94608f', '#704a84', '#523a75'], cloud: ['#ffc7ad', '#c56d98'] },
  night: { air: ['#0b1130', '#1a2656', '#33407e'], glow: ['#b8c6ff', 0.3], orb: [94, 42, 7, '#f6f2da', '#a6b4ff'], ridges: ['#2c3b74', '#232f62', '#1a2450'], cloud: ['#41528f', '#2d3a74'] },
};

/** What the colours fade toward round a tree that has gone without water: the dust of a dry day. */
const DUST = '#b9b0a2';

/**
 * A ridge of mountains across the picture: peaks of uneven height about
 * `base`, as high as `rise`, cut in straight slopes the way far mountains
 * look, down to the foot of the picture.
 */
function ridge(base: number, rise: number, step: number, rand: () => number): string {
  const points: Pt[] = [];
  for (let x = -6; x <= 126 + step; x += step) {
    // a peak, then the saddle after it
    points.push([x + (rand() - 0.5) * step * 0.3, base - rise * (0.45 + rand() * 0.55)]);
    points.push([x + step * (0.42 + rand() * 0.16), base - rise * rand() * 0.28]);
  }
  let d = `M-6 120L-6 ${n(base)}`;
  for (const [x, y] of points) d += `L${n(x)} ${n(y)}`;
  return `${d}L126 120Z`;
}

export interface TreeSceneOptions {
  sky: TreeSky;
  /** how far the tree has gone dry, 0 (watered) to 1 (withered): the colours go to dust with it */
  dry?: number;
  /** how big it is shown, in points or CSS pixels (it is square) */
  size?: number;
  /** what a screen reader is told it is; empty where it is only behind a tree that is named */
  title?: string;
  idPrefix?: string;
}

/** The scene a tree stands in, as an SVG. */
export function treeSceneSvg(opts: TreeSceneOptions): string {
  const size = checkSize(opts.size, 360);
  const dry = Math.max(0, Math.min(1, opts.dry ?? 0));
  const sky = SKIES[opts.sky];
  const dr = new Drawing(prefixFor(opts.idPrefix, 'tree-scene', opts.sky, Math.round(dry * 10)));
  const c = (colour: string): string => mix(colour, DUST, dry * 0.5);
  const rand = seeded(`tree-scene:${opts.sky}`);
  // the air
  const air = dr.id('a');
  dr.def(linearAt(air, [[0, c(sky.air[0])], [0.62, c(sky.air[1])], [1, c(sky.air[2])]], 0, 0, 0, 108));
  dr.add(`<rect x="0" y="0" width="120" height="120" fill="url(#${air})"/>`);
  if (opts.sky === 'night' || opts.sky === 'dusk') {
    // the stars: all of them at night, the first few at dusk, high up
    const count = opts.sky === 'night' ? 34 : 9;
    let dots = '';
    for (let i = 0; i < count; i++) {
      const [x, y, r] = [rand() * 120, 22 + rand() * (opts.sky === 'night' ? 62 : 30), 0.22 + rand() * 0.42];
      dots += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#ffffff" opacity="${i % 3 === 0 ? '0.95' : '0.6'}"/>`;
    }
    dr.add(dots);
  }
  // the sun or the moon, in its own light
  const [ox, oy, or, colour, haloColour] = sky.orb;
  const halo = dr.id('h');
  dr.def(radialAt(halo, [[0, haloColour, 0.75 * (1 - dry * 0.4)], [0.4, haloColour, 0.3], [1, haloColour, 0]], ox, oy, or * 4.4));
  dr.add(`<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(or * 4.4)}" fill="url(#${halo})"/>`);
  if (opts.sky === 'night') {
    // a young moon's horn: the round of it on one side, and a shallower round back, which is its own shadow's edge.
    // (The way back used to be a tighter round than the horn is wide, which no arc can be, so the moon was not drawn at all.)
    dr.add(`<path d="M${n(ox)} ${n(oy - or)}A${n(or)} ${n(or)} 0 1 0 ${n(ox)} ${n(oy + or)}A${n(or * 1.35)} ${n(or * 1.35)} 0 0 1 ${n(ox)} ${n(oy - or)}Z" fill="${c(colour)}" transform="rotate(-24 ${n(ox)} ${n(oy)})"/>`);
  } else {
    dr.add(`<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(or)}" fill="${c(colour)}"/>`);
  }
  // the light the tree stands in
  const glow = dr.id('g');
  dr.def(radialAt(glow, [[0, sky.glow[0], sky.glow[1] * (1 - dry * 0.6)], [0.55, sky.glow[0], sky.glow[1] * 0.3], [1, sky.glow[0], 0]], 60, 66, 50));
  dr.add(`<circle cx="60" cy="66" r="50" fill="url(#${glow})"/>`);
  // the mountains, ridge behind ridge
  dr.add(`<path d="${ridge(95, 13, 17, rand)}" fill="${c(sky.ridges[0])}"/>`);
  dr.add(`<path d="${ridge(101, 10, 21, rand)}" fill="${c(sky.ridges[1])}"/>`);
  dr.add(`<path d="${ridge(108, 8, 26, rand)}" fill="${c(sky.ridges[2])}"/>`);
  // the haze at their feet, which is what the tree's island stands out of
  const haze = dr.id('z');
  dr.def(linearAt(haze, [[0, c(sky.air[2]), 0], [1, c(sky.air[2]), 0.7]], 0, 96, 0, 120));
  dr.add(`<rect x="0" y="96" width="120" height="24" fill="url(#${haze})"/>`);
  return dr.svg(size, opts.title ?? '');
}

/**
 * A cloud for that sky, alone on its canvas: a soft heap, lit from above and
 * shaded underneath. An app lays two or three across the scene and lets them
 * drift.
 */
export function treeCloudSvg(opts: { sky: TreeSky; size?: number; title?: string; idPrefix?: string }): string {
  const size = checkSize(opts.size, 120);
  const [body, under] = SKIES[opts.sky].cloud;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'tree-cloud', opts.sky));
  const heap: readonly (readonly [number, number, number, number])[] = [[60, 70, 44, 11], [34, 66, 17, 11], [56, 55, 22, 17], [82, 61, 19, 13], [98, 69, 12, 8]];
  const whole = heap.map(([cx, cy, rx, ry]) => `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0Z`).join('');
  const clip = dr.clip(whole);
  dr.add(`<path d="${whole}" fill="${body}"/>`);
  dr.add(`<g clip-path="url(#${clip})"><ellipse cx="62" cy="80" rx="48" ry="9" fill="${under}" opacity="0.75"/></g>`);
  return dr.svg(size, opts.title ?? '');
}

/**
 * The seasons' backdrops, traced from the owner's reference: a soft wall of
 * one colour and a floor a shade deeper, with the horizon between them only
 * just there — blush pink for spring's blossom, sky blue for summer's green,
 * cream for autumn's orange, and a deep blue that winter's white stands out
 * on. The wall is lightest just above the horizon, where the light is.
 */
export const TREE_STUDIO: Readonly<Record<TreeSeason, { wall: readonly [string, string]; floor: readonly [string, string] }>> = {
  spring: { wall: ['#fbe0ea', '#fdeef3'], floor: ['#f9e6ee', '#f4d9e4'] },
  summer: { wall: ['#b3e2f6', '#d0eefa'], floor: ['#c4e9f8', '#a9dcf1'] },
  autumn: { wall: ['#fbeccb', '#fdf6e4'], floor: ['#fbf0d8', '#f6e2b8'] },
  winter: { wall: ['#2f84cc', '#4a9bdb'], floor: ['#3f92d6', '#2c7ac0'] },
};

/** Where the wall meets the floor, as a share of the picture's height: under it lies the floor the tree's round and its shadow are on. */
export const TREE_STUDIO_HORIZON = 0.62;

/**
 * Where a tree stands in its season's scene, the same on the phone as on the
 * website: drawn at `share` of the scene's height, with its foot `foot` of
 * the way down, so the round it stands on lies on the floor well under the
 * horizon and there is air over the tallest crown.
 */
export const TREE_STUDIO_PLACE = { share: 0.8, foot: 0.84 } as const;

export interface TreeStudioOptions {
  season: TreeSeason;
  /** how far the tree has gone dry, 0 (watered) to 1 (withered): the colours go to dust with it */
  dry?: number;
  size?: number;
  title?: string;
  idPrefix?: string;
}

/**
 * The scene a tree stands in in a season: the wall and the floor and,
 * in winter, a few flakes already in the air (the apps let more fall).
 */
export function treeStudioSvg(opts: TreeStudioOptions): string {
  const size = checkSize(opts.size, 360);
  const studio = TREE_STUDIO[opts.season];
  if (!studio) throw new RangeError(`art: no season called ${String(opts.season)}`);
  const dry = Math.max(0, Math.min(1, opts.dry ?? 0));
  const c = (colour: string): string => mix(colour, DUST, dry * 0.35);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'tree-studio', opts.season, Math.round(dry * 10)));
  const h = 120 * TREE_STUDIO_HORIZON;
  const wall = dr.id('w');
  dr.def(linearAt(wall, [[0, c(studio.wall[0])], [1, c(studio.wall[1])]], 0, 0, 0, h));
  const floor = dr.id('f');
  dr.def(linearAt(floor, [[0, c(studio.floor[0])], [1, c(studio.floor[1])]], 0, h, 0, 120));
  dr.add(`<rect x="0" y="0" width="120" height="120" fill="url(#${wall})"/>`);
  dr.add(`<rect x="0" y="${n(h)}" width="120" height="${n(120 - h)}" fill="url(#${floor})"/>`);
  // the horizon softened: the wall's light carried a little way onto the floor
  const soft = dr.id('s');
  dr.def(linearAt(soft, [[0, c(studio.wall[1]), 0.9], [1, c(studio.wall[1]), 0]], 0, h, 0, h + 7));
  dr.add(`<rect x="0" y="${n(h)}" width="120" height="7" fill="url(#${soft})"/>`);
  if (opts.season === 'winter') {
    const rand = seeded('tree-studio:snow');
    let flakes = '';
    for (let i = 0; i < 22; i++) flakes += `<circle cx="${n(rand() * 120)}" cy="${n(rand() * 100)}" r="${n(0.35 + rand() * 0.45)}" fill="#ffffff" opacity="${i % 3 === 0 ? '0.9' : '0.6'}"/>`;
    dr.add(flakes);
  }
  return dr.svg(size, opts.title ?? '');
}
