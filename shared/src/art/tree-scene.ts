/**
 * The backdrops a learner's tree stands in: the hour's sky (dawn, day, dusk or night) with sun or moon, a soft light
 * where the tree stands, and far mountain ridges; separate clouds an app can drift; and the seasonal studio backdrops.
 * Drawn like the trees (`trees.ts`). The square picture is meant to sit at the foot of whatever it fills, so on a wide
 * page the top of the sky is cut off, never the mountains.
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

/** What is in the air round a tree: sunlit motes, falling petals or leaves, or the night tree's fireflies. */
export type TreeAir = 'motes' | 'petals' | 'leaves' | 'fireflies';

/** What is in the air round this tree, if anything; a wilting tree has still air. */
export function treeAir(species: string, stage: TreeStage, health: TreeHealth): TreeAir | null {
  if (health === 'wilting' || health === 'withered') return null;
  if (stage >= 3 && species === 'sev') return 'fireflies';
  if (stage >= 3 && species === 'behiv') return 'petals';
  if (stage >= 3 && species === 'payiz') return 'leaves';
  return health === 'fresh' ? 'motes' : null;
}

export interface Sky {
  /** The sky from its top to the horizon. */
  air: readonly [string, string, string];
  /** The light the tree stands in, and its strength. */
  glow: readonly [string, number];
  /** The sun or moon: position, radius, colour and the colour of its halo. */
  orb: readonly [x: number, y: number, r: number, colour: string, halo: string];
  /** The mountains, far to near. */
  ridges: readonly [string, string, string];
  /** A cloud's body and underside. */
  cloud: readonly [string, string];
}

/**
 * Each sky's colours; the profile horizon (`horizon.ts`) is painted from the same ones. They keep to the app's warm
 * palette: an amber morning over sandstone ridges, a clear day, a terracotta dusk under a teal-slate sky, and a deep
 * teal night.
 */
export const SKIES: Record<TreeSky, Sky> = {
  dawn: { air: ['#9cc8d8', '#f6d0a6', '#ffecc6'], glow: ['#fff3d6', 0.7], orb: [25, 82, 10, '#fff1c4', '#ffcf7a'], ridges: ['#dcc6aa', '#c2a78a', '#a1876d'], cloud: ['#fff6ea', '#f2cdae'] },
  day: { air: ['#52aeee', '#a3daf8', '#e2f5ff'], glow: ['#ffffff', 0.62], orb: [95, 41, 8, '#fff8d2', '#fff0a2'], ridges: ['#bcdbf0', '#98c4e5', '#7aadd8'], cloud: ['#ffffff', '#d2eafa'] },
  dusk: { air: ['#2c4652', '#d6795a', '#ffbe7d'], glow: ['#ffe2c0', 0.5], orb: [96, 85, 11, '#ffdca6', '#ff9c68'], ridges: ['#9c6150', '#7b4a40', '#5a3834'], cloud: ['#ffc8a6', '#c97559'] },
  night: { air: ['#0a1c21', '#123136', '#1e484c'], glow: ['#bfe3d8', 0.28], orb: [94, 42, 7, '#f6f0d8', '#9fd3c6'], ridges: ['#1f3f43', '#173337', '#10272b'], cloud: ['#2c5356', '#1d3e42'] },
};

/** What the colours fade toward round a tree gone without water: the dust of a dry day. */
const DUST = '#b9b0a2';

/** A ridge of straight-sloped peaks of uneven height about `base`, up to `rise` high, filled down to the picture's foot. */
function ridge(base: number, rise: number, step: number, rand: () => number): string {
  const points: Pt[] = [];
  for (let x = -6; x <= 126 + step; x += step) {
    // A peak, then the saddle after it.
    points.push([x + (rand() - 0.5) * step * 0.3, base - rise * (0.45 + rand() * 0.55)]);
    points.push([x + step * (0.42 + rand() * 0.16), base - rise * rand() * 0.28]);
  }
  let d = `M-6 120L-6 ${n(base)}`;
  for (const [x, y] of points) d += `L${n(x)} ${n(y)}`;
  return `${d}L126 120Z`;
}

export interface TreeSceneOptions {
  sky: TreeSky;
  /** How dry the tree is, 0 (watered) to 1 (withered); the colours fade to dust with it. */
  dry?: number;
  /** Size in points or CSS pixels; the drawing is square. */
  size?: number;
  /** The accessible label; empty where it only sits behind a named tree. */
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
  // The air.
  const air = dr.id('a');
  dr.def(linearAt(air, [[0, c(sky.air[0])], [0.62, c(sky.air[1])], [1, c(sky.air[2])]], 0, 0, 0, 108));
  dr.add(`<rect x="0" y="0" width="120" height="120" fill="url(#${air})"/>`);
  if (opts.sky === 'night' || opts.sky === 'dusk') {
    // Stars: all of them at night, a few high up at dusk.
    const count = opts.sky === 'night' ? 34 : 9;
    let dots = '';
    for (let i = 0; i < count; i++) {
      const [x, y, r] = [rand() * 120, 22 + rand() * (opts.sky === 'night' ? 62 : 30), 0.22 + rand() * 0.42];
      dots += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#ffffff" opacity="${i % 3 === 0 ? '0.95' : '0.6'}"/>`;
    }
    dr.add(dots);
  }
  // The sun or moon, in its own light.
  const [ox, oy, or, colour, haloColour] = sky.orb;
  const halo = dr.id('h');
  dr.def(radialAt(halo, [[0, haloColour, 0.75 * (1 - dry * 0.4)], [0.4, haloColour, 0.3], [1, haloColour, 0]], ox, oy, or * 4.4));
  dr.add(`<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(or * 4.4)}" fill="url(#${halo})"/>`);
  if (opts.sky === 'night') {
    // A young moon's horn: an outer arc and a wider, shallower arc back, the edge of its shadow. The return arc must be
    // wider than the horn, or no arc fits and nothing is drawn.
    dr.add(`<path d="M${n(ox)} ${n(oy - or)}A${n(or)} ${n(or)} 0 1 0 ${n(ox)} ${n(oy + or)}A${n(or * 1.35)} ${n(or * 1.35)} 0 0 1 ${n(ox)} ${n(oy - or)}Z" fill="${c(colour)}" transform="rotate(-24 ${n(ox)} ${n(oy)})"/>`);
  } else {
    dr.add(`<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(or)}" fill="${c(colour)}"/>`);
  }
  // The light the tree stands in.
  const glow = dr.id('g');
  dr.def(radialAt(glow, [[0, sky.glow[0], sky.glow[1] * (1 - dry * 0.6)], [0.55, sky.glow[0], sky.glow[1] * 0.3], [1, sky.glow[0], 0]], 60, 66, 50));
  dr.add(`<circle cx="60" cy="66" r="50" fill="url(#${glow})"/>`);
  // Mountain ridges, far to near.
  dr.add(`<path d="${ridge(95, 13, 17, rand)}" fill="${c(sky.ridges[0])}"/>`);
  dr.add(`<path d="${ridge(101, 10, 21, rand)}" fill="${c(sky.ridges[1])}"/>`);
  dr.add(`<path d="${ridge(108, 8, 26, rand)}" fill="${c(sky.ridges[2])}"/>`);
  // The haze at their feet, which the tree's island stands out of.
  const haze = dr.id('z');
  dr.def(linearAt(haze, [[0, c(sky.air[2]), 0], [1, c(sky.air[2]), 0.7]], 0, 96, 0, 120));
  dr.add(`<rect x="0" y="96" width="120" height="24" fill="url(#${haze})"/>`);
  return dr.svg(size, opts.title ?? '');
}

/** A cloud for that sky, alone on its canvas, lit from above and shaded underneath; apps drift two or three across the scene. */
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
 * The seasonal backdrops, traced from the owner's reference: a wall of one colour over a floor a shade deeper, the
 * horizon barely visible, lightest just above it. Blush pink for spring, sky blue for summer, cream for autumn, deep
 * blue for winter.
 */
export const TREE_STUDIO: Readonly<Record<TreeSeason, { wall: readonly [string, string]; floor: readonly [string, string] }>> = {
  spring: { wall: ['#fbe0ea', '#fdeef3'], floor: ['#f9e6ee', '#f4d9e4'] },
  summer: { wall: ['#b3e2f6', '#d0eefa'], floor: ['#c4e9f8', '#a9dcf1'] },
  autumn: { wall: ['#fbeccb', '#fdf6e4'], floor: ['#fbf0d8', '#f6e2b8'] },
  winter: { wall: ['#2f84cc', '#4a9bdb'], floor: ['#3f92d6', '#2c7ac0'] },
};

/** Where the wall meets the floor, as a share of the height; the tree's round and its shadow lie on the floor below. */
export const TREE_STUDIO_HORIZON = 0.62;

/**
 * Where a tree stands in its season's scene, alike on both apps: drawn at `share` of the scene's height with its foot
 * `foot` of the way down, so its round lies well under the horizon and there is air above the tallest crown.
 */
export const TREE_STUDIO_PLACE = { share: 0.8, foot: 0.84 } as const;

export interface TreeStudioOptions {
  season: TreeSeason;
  /** How dry the tree is, 0 (watered) to 1 (withered); the colours fade to dust with it. */
  dry?: number;
  size?: number;
  title?: string;
  idPrefix?: string;
}

/** The season's backdrop: wall and floor and, in winter, a few flakes already falling (the apps add more). */
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
  // Soften the horizon by carrying the wall's light a little onto the floor.
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
