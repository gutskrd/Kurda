/**
 * The valley The Village stands in: a world several times the size of the
 * village, so an app can pan and zoom about it and never come to its edge.
 *
 * The village's terraces step down to a lake under the Zagros, as they always
 * have. Round them now: the lake opens to the left, ringed by a sandy beach,
 * with cliffs on its far shore and a waterfall dropping off them; the valley
 * floor opens to the right, where the road from the village's gate runs out
 * to the town and a farm track climbs to the shepherds' camp at the forest's
 * edge; fields, folds, the coop, the mill on its stream, the threshing floor
 * and an orchard fill the floor as the village grows (games/kingdom/growth);
 * and pines on the slopes, round-crowned trees lower down, close in on every
 * side, so the world fades into woods, cliffs and mountains rather than
 * ending. The shepherds' cairn keeps its crest against the sky.
 *
 * Everything here is in the village's world units and on its screen (iso)
 * coordinates, relative to the scene's origin; `VALLEY` is the screen box the
 * world fills. Everything comes out as `Drawn` pieces with their depth, so
 * the scene can sort them among the buildings and cut them into tiles.
 */
import type { VillageFeature } from '../../games/kingdom/growth.js';
import { n, seeded, wholePath, wholeUnits, type Pt } from '../svg.js';
import { INK, Part, disc, iso, oval, poly, wpoly, type Drawn, type Palette } from './pen.js';
import { HORIZON, TERRACES, WATER_Z, meadow, mountains, terrace } from './land.js';
import * as F from './farm.js';
import * as P from './props.js';
import type { Rand } from './props.js';

/** The screen box the world fills, relative to the scene's origin. */
export const VALLEY = { x0: -1000, y0: -340, x1: 1000, y1: 1040 } as const;

/** The valley floor's height: a step below the village's lowest terrace, so its edge reads as a kerb of stone. */
export const FLOOR_Z = -4;

/**
 * Depth bands, back to front: the lake under everything, the sky and the
 * mountains, the cliffs, the floor and its beach, the woods behind the floor,
 * the stream and the roads on it, the terraces; then the things standing in
 * the world, the floor's sorted with the lowest terrace's.
 */
const DEPTH = {
  water: -900000,
  ripples: -899000,
  sky: -800000,
  mountains: -790000,
  cliffs: -700000,
  floor: -600000,
  beach: -599000,
  woodsBehind: -500000,
  stream: -400000,
  roads: -399000,
  terraces: -300000,
} as const;
const ON_FLOOR = 50000;

/** A point on the floor, on the screen. */
const fl = (x: number, y: number): Pt => iso(x, y, FLOOR_Z);

/**
 * The valley floor, on the screen: from behind the upper terrace out to the
 * right and down to the bottom of the world, its left edge the lake's shore
 * (from the lowest terrace's near corner down and round to the far left).
 */
const SHORE: readonly Pt[] = [
  [106, 393],
  [74, 470],
  [40, 560],
  [0, 650],
  [-70, 735],
  [-230, 812],
  [-470, 846],
  [-760, 842],
  [-1000, 818],
];
// it meets the hill behind the village at the horizon, and runs on under the woods to the right
const FLOOR: readonly Pt[] = [[60, 60], [0, HORIZON], [260, HORIZON], [300, -70], [1000, -70], [1000, 1040], [-1000, 1040], ...[...SHORE].reverse(), [40, 250]];

/** The lake as far as ripples go: inside the shore, the cliffs and the terraces. */
const LAKE: readonly Pt[] = [
  [-880, 70],
  [-420, 60],
  [-200, 0],
  [-140, 30],
  [-160, 160],
  [-190, 250],
  [-160, 330],
  [-60, 380],
  [30, 470],
  [-20, 600],
  [-100, 700],
  [-260, 780],
  [-560, 820],
  [-880, 800],
];

/** The cliffs across the lake's far shore: their top edge, from the left of the world to where they end. */
const CLIFF_TOP: readonly Pt[] = [
  [-1000, -150],
  [-900, -132],
  [-820, -148],
  [-700, -120],
  [-600, -136],
  [-520, -108],
  [-430, -90],
  [-380, -40],
];
/** Where the cliffs stand in the lake. */
const CLIFF_FOOT = 56;

/** The waterfall off the cliffs: where it leaves the top, how wide it is there and where it meets the lake. */
export const WATERFALL = { x: -610, top: -128, bottom: CLIFF_FOOT + 2, w: 26 } as const;

/** Is a screen point inside a polygon. */
function inside(pts: readonly Pt[], [x, y]: Pt): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** A smooth closed shape through screen points: each corner rounded into the next. */
function smooth(pts: readonly Pt[], closed = true): string {
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = closed ? mid(pts[pts.length - 1]!, pts[0]!) : pts[0]!;
  let d = `M${n(m0[0])} ${n(m0[1])}`;
  const last = closed ? pts.length : pts.length - 1;
  for (let i = closed ? 0 : 1; i < last; i++) {
    const p = pts[i]!;
    const m = mid(p, pts[(i + 1) % pts.length]!);
    d += `Q${n(p[0])} ${n(p[1])} ${n(m[0])} ${n(m[1])}`;
  }
  if (!closed) d += `L${n(pts[pts.length - 1]![0])} ${n(pts[pts.length - 1]![1])}`;
  return closed ? `${d}Z` : d;
}

// ───────────────────────────────────────────────────────────── roads

/**
 * The road: from the village's gate (where its own path comes down through
 * the terraces) along the foot of the lowest terrace, then out across the
 * floor and away to the town at the bottom right. A farm track leaves it to
 * climb between the fields to the camp at the forest's edge; the trail over
 * the hill behind the village is the way to the high pastures.
 */
export const ROAD: readonly (readonly [number, number])[] = [
  [314, 336],
  [452, 336],
  [760, 336],
  [760, 470],
  [1400, 470],
];
export const TRACK: readonly (readonly [number, number])[] = [
  [575, 336],
  [575, -40],
  [420, -40],
  [420, -110],
];

/** A strip of beaten earth along world points on the floor (the first stretch on the lowest terrace), its worn edge darker. */
function road(pal: Palette, pts: readonly (readonly [number, number])[], w: number, rand: Rand, z0 = FLOOR_Z): Part {
  let d = '';
  let edge = '';
  let peb = '';
  let ruts = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    // the first stretch runs along the lowest terrace, the rest on the floor
    const z = i === 0 && pts[0]![0] < 450 ? 0 : z0;
    const along = Math.hypot(bx - ax, by - ay);
    const nx = (-(by - ay) / along) * (w / 2);
    const ny = ((bx - ax) / along) * (w / 2);
    d += wpoly([[ax + nx, ay + ny, z], [bx + nx, by + ny, z], [bx - nx, by - ny, z], [ax - nx, ay - ny, z]]) + oval(...iso(bx, by, z), w * 0.72, w * 0.36);
    edge += wpoly([[ax + nx * 1.25, ay + ny * 1.25, z], [bx + nx * 1.25, by + ny * 1.25, z], [bx - nx * 1.25, by - ny * 1.25, z], [ax - nx * 1.25, ay - ny * 1.25, z]]);
    for (let k = 0; k < along / 14; k++) {
      const f = rand();
      const [sx, sy] = iso(ax + (bx - ax) * f + (rand() - 0.5) * w * 0.7, ay + (by - ay) * f + (rand() - 0.5) * w * 0.7, z);
      peb += oval(sx, sy, 1.4 + rand(), 0.8);
    }
    // the ruts of cart wheels down it
    ruts += seg3(ax + nx * 0.4, ay + ny * 0.4, bx + nx * 0.4, by + ny * 0.4, z) + seg3(ax - nx * 0.4, ay - ny * 0.4, bx - nx * 0.4, by - ny * 0.4, z);
  }
  return new Part(DEPTH.roads).flat(edge, pal.path.right).flat(d, pal.path.left).flat(peb, pal.path.right).line(ruts, 0.9, pal.path.right);
}

const seg3 = (ax: number, ay: number, bx: number, by: number, z: number): string => {
  const a = iso(ax, ay, z);
  const b = iso(bx, by, z);
  return `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`;
};

// ───────────────────────────────────────────────────────────── the stream

/** The stream down the right of the valley: out of the forest, past the mill, under the road and away into the woods, in world points. */
export const STREAM: readonly (readonly [number, number])[] = [
  [1010, -140],
  [1000, 80],
  [1012, 300],
  [1000, 470],
  [1010, 700],
];

function streamBed(pal: Palette): Part {
  const p = new Part(DEPTH.stream);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (const [x, y] of STREAM) {
    left.push(fl(x - 9, y));
    right.push(fl(x + 9, y));
  }
  const bank = poly([...left.map(([a, b]): Pt => [a - 3, b + 1.5]), ...[...right].reverse().map(([a, b]): Pt => [a + 3, b - 1.5])]);
  const water = poly([...left, ...[...right].reverse()]);
  p.flat(bank, pal.sand.right).fill(water, pal.water.left);
  let glints = '';
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [ax, ay] = STREAM[i]!;
    const [bx, by] = STREAM[i + 1]!;
    for (const f of [0.3, 0.7]) glints += `M${n(fl(ax + (bx - ax) * f - 2, ay + (by - ay) * f)[0])} ${n(fl(ax + (bx - ax) * f - 2, ay + (by - ay) * f)[1])}l${n(5)} ${n(-1.2)}`;
  }
  p.line(glints, 1.2, pal.foam);
  return p;
}

// ───────────────────────────────────────────────────────────── forests

/**
 * A wood: the shaded floor under its trees, then the trees scattered through
 * the region back to front, as stands of a few side by side: pines on the
 * slopes, round trees lower down. Deep in the world, a wood is drawn in whole
 * units and its pines in two tiers, which no one can tell from across the
 * valley and which keeps a large world light.
 */
function forest(pal: Palette, rand: Rand, region: readonly Pt[], o: { gap: number; row: number; size: number; round: number; depth: (sy: number) => number; avoid?: readonly Pt[][] }): Drawn[] {
  const xs = region.map((p) => p[0]);
  const ys = region.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const out: Drawn[] = [];
  let r = 0;
  for (let y = y0; y <= y1 + o.row; y += o.row, r++) {
    const trees: F.StandTree[] = [];
    for (let x = x0 + (r % 2 ? o.gap / 2 : 0) + (rand() - 0.5) * o.gap * 0.4; x <= x1; x += o.gap * (0.85 + rand() * 0.3)) {
      const at: Pt = [x + (rand() - 0.5) * o.gap * 0.3, y + (rand() - 0.5) * o.row * 0.5];
      if (!inside(region, at)) continue;
      if (o.avoid?.some((a) => inside(a, at))) continue;
      const kind = rand() < o.round ? 'round' : 'pine';
      trees.push({ x: at[0], y: at[1], h: o.size * (0.82 + rand() * 0.36) * (kind === 'round' ? 0.9 : 1), kind });
    }
    // a long row in pieces, so a tile never takes more of it than it shows; the wood's darker floor under each tree's foot
    for (let i = 0; i < trees.length; i += 6) {
      const part = trees.slice(i, i + 6);
      const shade = part.map((t) => oval(t.x, t.y - o.row * 0.3, t.h * 0.62, t.h * 0.34)).join('');
      out.push({ depth: o.depth(y) - 0.5, svg: `<path d="${wholePath(shade)}" fill="${pal.forest}" stroke="none"/>` });
      out.push({ depth: o.depth(y), svg: wholeUnits(F.stand(pal, part, 0, true).svg()) });
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────── the cliffs and the waterfall

/** The cliffs on the lake's far shore: a wall of rock in lit and shaded facets, grass on its brow, foam at its foot. */
function cliffs(pal: Palette, rand: Rand, moving: boolean): Drawn[] {
  const p = new Part(DEPTH.cliffs);
  const foot: Pt[] = CLIFF_TOP.map(([x, y], i) => [x, i === CLIFF_TOP.length - 1 ? y + 10 : CLIFF_FOOT + Math.sin(i * 1.7) * 6]);
  const face = poly([...CLIFF_TOP, ...[...foot].reverse()]);
  p.sil(face).fill(face, pal.rock.left);
  // facets: every other stretch turned from the light
  let shade = '';
  let lit = '';
  let cracks = '';
  for (let i = 0; i < CLIFF_TOP.length - 1; i++) {
    const [ax, ay] = CLIFF_TOP[i]!;
    const [bx, by] = CLIFF_TOP[i + 1]!;
    const fa = foot[i]![1];
    const fb = foot[i + 1]![1];
    const mx = ax + (bx - ax) * (0.45 + rand() * 0.2);
    const my = ay + (by - ay) * 0.5;
    shade += poly([[mx, my], [bx, by], [bx, fb], [mx + 10, (fa + fb) / 2]]);
    lit += poly([[ax + 6, ay + 10], [ax + (mx - ax) * 0.5, ay + 14], [ax + (mx - ax) * 0.4, ay + 40], [ax + 4, ay + 34]]);
    for (let k = 0; k < 3; k++) {
      const cx = ax + (bx - ax) * rand();
      const cy = ay + 20 + rand() * (fa - ay - 40);
      cracks += `M${n(cx)} ${n(cy)}l${n((rand() - 0.5) * 6)} ${n(10 + rand() * 14)}l${n((rand() - 0.5) * 6)} ${n(6 + rand() * 8)}`;
    }
  }
  p.flat(shade, pal.rock.right).flat(lit, pal.rock.top).line(cracks, 1, pal.rock.right);
  // the brow: grass hanging over the top edge
  const brow: Pt[] = [...CLIFF_TOP.map(([x, y]): Pt => [x, y - 4]), ...[...CLIFF_TOP].reverse().map(([x, y], i): Pt => [x, y + 6 + (i % 2) * 4])];
  p.fill(poly(brow), pal.grass.left);
  // foam where it stands in the water
  p.line(foot.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y + 2)}`).join(''), 2.6, pal.foam);
  const out: Drawn[] = [{ depth: DEPTH.cliffs, svg: p.svg() }];
  out.push({ depth: DEPTH.cliffs + 1, svg: waterfall(pal, moving) });
  return out;
}

/** The waterfall: a ribbon of white water down the cliff, broadening as it falls, its foam heaped where it lands (drawn still; an app runs its water). */
function waterfall(pal: Palette, moving: boolean): string {
  const { x, top, bottom, w } = WATERFALL;
  const ribbon = `M${n(x - w / 2)} ${n(top)}Q${n(x - w / 2 - 4)} ${n((top + bottom) / 2)} ${n(x - w / 2 - 8)} ${n(bottom)}H${n(x + w / 2 + 8)}Q${n(x + w / 2 + 4)} ${n((top + bottom) / 2)} ${n(x + w / 2)} ${n(top)}Z`;
  let out = `<path d="${ribbon}" fill="${pal.water.top}" stroke="${INK}" stroke-width="2.2"/>`;
  // the lip it pours over, and its streaks when it is drawn still
  out += `<path d="${oval(x, top, w / 2 + 2, 3)}" fill="${pal.water.left}"/>`;
  if (!moving) {
    let streaks = '';
    for (let i = -2; i <= 2; i++) streaks += `M${n(x + i * (w / 5))} ${n(top + 8 + Math.abs(i) * 6)}l${n(i * 0.8)} ${n(30 + (i % 2) * 12)}`;
    out += `<path d="${streaks}" fill="none" stroke="#ffffff" stroke-width="1.8"/>`;
  }
  // the foam at its foot, and the pool's rings
  const puffs = disc(x - w / 2 - 6, bottom - 2, 7) + disc(x, bottom - 6, 9) + disc(x + w / 2 + 6, bottom - 2, 7) + oval(x, bottom + 2, w + 8, 5);
  out += `<path d="${puffs}" fill="#ffffff" stroke="${pal.foam}" stroke-width="1.2"/>`;
  out += `<path d="${oval(x, bottom + 10, w + 22, 7)}" fill="none" stroke="${pal.foam}" stroke-width="1.6"/>`;
  return out;
}

// ───────────────────────────────────────────────────────────── the ground

/** The sky, the mountains, the lake, the cliffs, the floor and its beach, the stream, the roads, the forests behind, and the terraces. */
export function valleyGround(pal: Palette, rand: Rand, moving: boolean): Drawn[] {
  const { x0, y0, x1, y1 } = VALLEY;
  const out: Drawn[] = [];
  // the lake under everything
  out.push({ depth: DEPTH.water, svg: `<rect x="${x0}" y="${HORIZON}" width="${x1 - x0}" height="${y1 - HORIZON}" fill="${pal.water.left}" stroke="none"/>` });
  // ripples, in a few patches so a tile takes only its own
  for (let band = 0; band < 6; band++) {
    let ripples = '';
    for (let i = 0; i < 22; i++) {
      const at: Pt = [-880 + rand() * 920, 40 + band * 135 + rand() * 135];
      if (!inside(LAKE, at)) continue;
      const w = 8 + rand() * 12;
      ripples += `M${n(at[0])} ${n(at[1])}q${n(w / 2)} -2.4 ${n(w)} 0`;
    }
    if (ripples) out.push({ depth: DEPTH.ripples + band, svg: `<path d="${ripples}" fill="none" stroke="${pal.foam}" stroke-width="1.4" stroke-opacity="0.85"/>` });
  }
  // the sky and the mountains
  out.push({
    depth: DEPTH.sky,
    svg:
      `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${HORIZON - y0 + 4}" fill="${pal.sky}" stroke="none"/>` +
      `<rect x="${x0}" y="${HORIZON - 150}" width="${x1 - x0}" height="154" fill="${pal.skyLow}" stroke="none" fill-opacity="0.7"/>`,
  });
  out.push({ depth: DEPTH.mountains, svg: mountains(pal, x0, x1, HORIZON, rand) });
  // the floor, its beach and its bank down to the water
  const floor = new Part(DEPTH.floor);
  floor.fill(poly(FLOOR), pal.grass.top);
  let patches = '';
  for (let i = 0; i < 40; i++) {
    const at: Pt = [-900 + rand() * 1900, -20 + rand() * 1040];
    if (!inside(FLOOR, at)) continue;
    const r = 18 + rand() * 30;
    patches += oval(at[0], at[1], r * 1.4, r * 0.55);
  }
  floor.flat(patches, pal.meadow, ' fill-opacity="0.7"');
  out.push({ depth: DEPTH.floor, svg: floor.svg() });
  const beach: Pt[] = [...SHORE.map(([x, y]): Pt => [x + 4, y - 2]), ...[...SHORE].reverse().map(([x, y], i): Pt => [x + 30 + (i % 2) * 6, y - 26 + (i % 3) * 3])];
  const bank: Pt[] = [...SHORE, ...[...SHORE].reverse().map(([x, y]): Pt => [x - 4, y + 12])];
  out.push({ depth: DEPTH.beach, svg: new Part(0).fill(smooth(bank), pal.sand.right).fill(smooth(beach), pal.sand.top).line(smooth(SHORE.map(([x, y]): Pt => [x - 4, y + 13]), false), 2.6, pal.foam).svg() });
  // the stream, and the roads on the floor
  out.push({ depth: DEPTH.stream, svg: streamBed(pal).svg() });
  out.push({ depth: DEPTH.roads, svg: road(pal, ROAD, 15, rand).svg() });
  out.push({ depth: DEPTH.roads + 1, svg: road(pal, TRACK, 10, rand).svg() });
  // the cliffs and the waterfall, and the forests behind: on the cliffs, up the slopes either side of the cairn's hill
  out.push(...cliffs(pal, rand, moving));
  const ridge = (sy: number): number => DEPTH.woodsBehind + sy;
  out.push(
    ...forest(pal, rand, [[-1000, -340], [-560, -270], [-380, -180], [-330, -60], [-380, -40], [-520, -100], [-700, -112], [-1000, -142]], { gap: 40, row: 24, size: 60, round: 0.08, depth: ridge }),
    ...forest(pal, rand, [[250, -60], [360, -210], [560, -260], [760, -290], [1000, -320], [1000, -30], [250, -30]], { gap: 40, row: 24, size: 62, round: 0.1, depth: ridge }),
  );
  // the terraces, back to front, each wall down to the lake or the floor in front of it
  const feet: readonly (readonly [number, number])[] = [
    [WATER_Z - 2, FLOOR_Z],
    [FLOOR_Z, FLOOR_Z],
    [WATER_Z - 2, FLOOR_Z],
    [WATER_Z - 2, FLOOR_Z],
    [WATER_Z - 2, FLOOR_Z],
  ];
  TERRACES.forEach((t, i) => out.push({ depth: DEPTH.terraces + i, svg: terrace(t, pal, rand, feet[i] as [number, number]) + meadow(t, pal, rand) }));
  return out;
}

/** The woods closing in at the right, the bottom and the left of the world, sorted among the floor's own things; the groves' trees too, unless an app sways them itself. */
export function valleyWoods(pal: Palette, rand: Rand, moving = false): Drawn[] {
  const near = (sy: number): number => ON_FLOOR + sy * 2;
  const roadGap: Pt[][] = [[[880, 880], [1000, 920], [1000, 1040], [880, 1040], [820, 960]]];
  const out: Drawn[] = [
    ...forest(pal, rand, [[860, -40], [1000, -40], [1000, 1040], [860, 1040], [900, 600], [880, 300]], { gap: 42, row: 26, size: 62, round: 0.25, depth: near, avoid: roadGap }),
    ...forest(pal, rand, [[-1000, 890], [-600, 910], [-250, 880], [0, 800], [200, 930], [500, 940], [860, 910], [860, 1060], [-1000, 1060]], { gap: 46, row: 26, size: 62, round: 0.55, depth: near, avoid: roadGap }),
    ...forest(pal, rand, [[-1000, 60], [-930, 70], [-900, 300], [-930, 560], [-900, 820], [-1000, 840]], { gap: 42, row: 26, size: 58, round: 0.4, depth: near }),
    islet(pal, ISLET, near),
  ];
  if (!moving) for (const t of GROVE_TREES) out.push({ depth: near(t.y), svg: F.stand(pal, [{ ...t, kind: 'round' }], 0).svg() });
  return out;
}

/** The rocky islet out in the lake, a screen point at its middle (its trees are among the groves'). */
const ISLET: Pt = [-560, 300];

function islet(pal: Palette, [gx, gy]: Pt, depth: (sy: number) => number): Drawn {
  const p = new Part(0);
  const top = smooth([[gx - 70, gy], [gx - 30, gy - 22], [gx + 40, gy - 20], [gx + 76, gy + 4], [gx + 30, gy + 22], [gx - 40, gy + 20]]);
  const cliff = smooth([[gx - 70, gy], [gx - 40, gy + 20], [gx + 30, gy + 22], [gx + 76, gy + 4], [gx + 74, gy + 16], [gx + 30, gy + 34], [gx - 42, gy + 32], [gx - 68, gy + 12]]);
  p.sil(top + cliff).fill(cliff, pal.rock.left).fill(top, pal.grass.top);
  p.line(`M${n(gx - 80)} ${n(gy + 18)}q${n(80)} ${n(30)} ${n(160)} ${n(-6)}`, 2.6, pal.foam);
  return { depth: depth(gy - 30), svg: p.svg() };
}

/**
 * The groves standing out on the floor so its open grass is never bare, and
 * the islet's trees: round-crowned trees about a few points, each one where
 * it stands on the screen (its foot) and how tall. The same every time, so
 * the scene and the life that sways them agree.
 */
export const GROVE_TREES: readonly { x: number; y: number; h: number }[] = (() => {
  const rand = seeded('kingdom-groves');
  const out: { x: number; y: number; h: number }[] = [];
  const spots: [number, number, number][] = [[720, 180, 5], [800, 470, 4], [780, 720, 5], [150, 740, 4], [350, 110, 3], [470, 620, 3], [ISLET[0], ISLET[1] - 4, 3]];
  for (const [gx, gy, count] of spots) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand();
      const r = i === 0 ? 0 : (gx === ISLET[0] ? 14 : 22) + rand() * 18;
      out.push({ x: gx + Math.cos(a) * r * 1.4, y: gy + Math.sin(a) * r * 0.6, h: 44 + rand() * 22 });
    }
  }
  return out.sort((a, b) => a.y - b.y);
})();

// ───────────────────────────────────────────────────────────── the farm

/** Where the valley keeps its fields, in world units on the floor: the dug plots become wheat and chickpeas, then tomatoes and onions join them. */
export const FIELDS: readonly { x: number; y: number; w: number; d: number; crop: (has: (f: VillageFeature) => boolean) => F.Crop | null }[] = [
  { x: 470, y: 150, w: 90, d: 66, crop: (has) => (has('wheat') ? 'wheat' : 'plot') },
  { x: 470, y: 30, w: 90, d: 70, crop: (has) => (has('chickpeas') ? 'chickpeas' : 'plot') },
  { x: 595, y: 150, w: 90, d: 66, crop: (has) => (has('tomatoes') ? 'tomatoes' : null) },
  { x: 595, y: 30, w: 90, d: 70, crop: (has) => (has('onions') ? 'onions' : null) },
];

/** The folds, the coop's yard and the paddock, in world units: what the app's animals keep inside. */
export const PENS = {
  sheepfold: { x: 560, y: 368, w: 104, d: 70 },
  goatfold: { x: 676, y: 368, w: 70, d: 70 },
  paddock: { x: 600, y: 470, w: 120, d: 74 },
  /** the hens' yard in front of their coop (the coop's house stands just behind it) */
  coop: { x: 472, y: 266, w: 40, d: 22 },
  camp: { x: 330, y: -180, w: 150, d: 100 },
} as const;

/** The shepherds' camp: their tent, its fire, and where their own few sheep graze. */
export const CAMP = { tent: [360, -170] as const, fire: [372, -120] as const };

/** The mill by the stream, the dock on the lake, the boat at its end, the threshing floor and the orchard's rows, in world units. */
export const MILL = [958, 230] as const;
export const DOCK = { x: 536, y: 470, len: 96 } as const;
export const BOAT = [516, 556] as const;
export const THRESHING = [745, 70, 34] as const;
export const ORCHARD_ROWS: readonly (readonly [number, number, 'apple' | 'pomegranate' | 'walnut'])[] = [
  [830, 520, 'apple'],
  [862, 520, 'pomegranate'],
  [894, 520, 'apple'],
  [830, 556, 'walnut'],
  [862, 556, 'apple'],
  [894, 556, 'pomegranate'],
  [830, 592, 'pomegranate'],
  [862, 592, 'apple'],
  [894, 592, 'walnut'],
];
export const HIVES: readonly (readonly [number, number])[] = [
  [930, 520],
  [930, 540],
  [930, 560],
];
export const LAUNDRY = { x: 360, y: -60, len: 40 } as const;
export const DOVECOTE = [330, 40] as const;
/** The poplars planted along the road towards the town, which sway. */
export const ROAD_POPLARS: readonly (readonly [number, number])[] = [
  [800, 452],
  [860, 452],
  [920, 452],
  [980, 452],
];
export const KILIMS: readonly (readonly [number, number, number])[] = [
  [700, 600, 26],
  [440, -50, 24],
];
export const LANTERNS: readonly (readonly [number, number])[] = [
  [460, 324],
  [600, 324],
  [748, 324],
  [748, 458],
  [900, 458],
  [560, -30],
];

/** Things on the floor, sorted with the lowest terrace's. */
function placed(parts: readonly Part[]): Drawn[] {
  return parts.map((p) => ({ depth: ON_FLOOR + p.depth, svg: p.svg() }));
}

/**
 * Everything on the floor at this point in the village's growth: the camp
 * and the plots from the start, then each field, fold and furnishing as it
 * comes. Things that move (the mill's wheel, the boat, the washing and the
 * kilims on their lines) are left for the app to draw when `moving`.
 */
export function valleyThings(pal: Palette, rand: Rand, has: (f: VillageFeature) => boolean, moving: boolean): Drawn[] {
  const z = FLOOR_Z;
  const out: Drawn[] = [];
  const add = (...parts: Part[]): void => {
    out.push(...placed(parts));
  };
  // the camp at the forest's edge: the black tent, its fire, a loom when the village has one, a few rocks
  add(...F.tent(pal, CAMP.tent[0], CAMP.tent[1], z, 54, 30), F.campfire(pal, CAMP.fire[0], CAMP.fire[1], z));
  if (!moving) {
    const [fx, fy] = iso(CAMP.fire[0], CAMP.fire[1], z);
    out.push({ depth: ON_FLOOR + CAMP.fire[0] + CAMP.fire[1] + 1, svg: F.flame(pal, fx, fy - 1) });
  }
  add(P.rock(pal, 470, -150, z, 8, rand), P.rock(pal, 300, -100, z, 6, rand), P.bush(pal, 480, -120, z, 7, rand, 3));
  if (has('loom')) add(...F.loom(pal, 420, -80, z, 30, 22));
  // the fields
  for (const f of FIELDS) {
    const crop = f.crop(has);
    if (crop) add(...F.field(pal, f.x, f.y, z, f.w, f.d, crop, rand));
  }
  // the folds, the coop and the paddock
  const { sheepfold, goatfold, paddock, coop } = PENS;
  if (has('sheepfold')) add(...F.fold(pal, sheepfold.x, sheepfold.y, z, sheepfold.w, sheepfold.d, rand));
  if (has('goatfold')) add(...F.fold(pal, goatfold.x, goatfold.y, z, goatfold.w, goatfold.d, rand, false), P.rock(pal, goatfold.x + 40, goatfold.y + 30, z, 9, rand));
  if (has('cow') || has('donkey')) add(...F.fold(pal, paddock.x, paddock.y, z, paddock.w, paddock.d, rand));
  if (has('hens')) add(...F.coop(pal, coop.x - 2, coop.y - 20, z, rand));
  if (has('haystack')) add(P.haystack(pal, 690, 452, z, 11), P.haystack(pal, 712, 448, z, 8));
  if (has('threshing')) add(...F.threshingFloor(pal, THRESHING[0], THRESHING[1], z, THRESHING[2], rand));
  // the mill on the stream, and the plank bridge where the road crosses it (stepping stones until then)
  if (has('mill')) add(...F.mill(pal, MILL[0], MILL[1], z, rand, !moving));
  if (has('bridge')) add(...F.bridge(pal, 984, 463, z, 34));
  else add(P.steppingStones(pal, [992, 476, z], [1026, 476, z], 3, rand));
  // the lake: the dock and the boat at its end, reeds and lily pads along the beach
  if (has('dock')) add(...F.dock(pal, DOCK.x, DOCK.y, 0, DOCK.len, WATER_Z));
  if (has('boat') && !moving) {
    const [bx, by] = iso(BOAT[0], BOAT[1], WATER_Z);
    out.push({ depth: ON_FLOOR + BOAT[0] + BOAT[1], svg: F.boat(pal, bx, by) });
  }
  // the orchard's rows and the hives beside them
  if (has('orchardRows')) {
    for (const [x, y, kind] of ORCHARD_ROWS) add(kind === 'walnut' ? P.walnut(pal, x, y, z, 11, rand) : P.fruitTree(pal, x, y, z, 10, rand, { kind, fruit: 5 }));
  }
  if (has('hives')) for (const [x, y] of HIVES) add(P.beehive(pal, x, y, z, 'log'));
  // the washing, the kilims, the jars, the benches, the lanterns, the dovecote, the poplars along the road, the flowers
  if (has('laundry')) add(F.laundry(pal, LAUNDRY.x, LAUNDRY.y, z, LAUNDRY.len, !moving));
  if (has('kilims')) for (const [x, y, len] of KILIMS) add(airing(pal, x, y, z, len, !moving));
  if (has('jars')) add(P.jar(pal, 455, 306, z, 1.2), P.jar(pal, 460, 314, z, 1), P.jar(pal, 940, 248, z, 1.1, pal.copper));
  if (has('benches')) add(F.bench(pal, 520, 312, z, 18), F.bench(pal, 690, 300, z, 18), F.bench(pal, 560, 590, z, 16, 'y'));
  if (has('lanterns')) for (const [x, y] of LANTERNS) add(F.lanternPost(pal, x, y, z));
  if (has('dovecote')) add(F.dovecote(pal, DOVECOTE[0], DOVECOTE[1], z));
  if (has('poplars') && !moving) for (const [x, y] of ROAD_POPLARS) add(P.poplar(pal, x, y, z, 56, 11));
  if (has('flowers')) for (const [x, y] of [[480, 120], [720, 160], [540, 330], [880, 620], [400, 60], [650, 560], [300, 10]] as const) add(F.flowers(pal, x, y, z, 9, rand, 10));
  if (has('signs')) add(F.signpost(pal, 456, 352, z, 'left', 'right'));
  if (has('festival')) add(F.bunting(pal, [460, 324, z + 20], [600, 324, z + 20]), F.bunting(pal, [600, 324, z + 20], [748, 324, z + 20]));
  // trees standing about the floor from the start: a walnut by the road, willows on the beach, oaks along the track
  add(P.walnut(pal, 690, 400, z, 16, rand), P.willow(pal, 560, 720, z, 12, rand), P.willow(pal, 690, 780, z, 13, rand), F.roundTree(pal, 520, -20, z, 46), F.roundTree(pal, 640, -70, z, 50), F.pine(pal, 300, -170, z, 60));
  // the camp's few sheep graze free, so there is nothing to fence; rocks and bushes dot the floor
  add(P.rock(pal, 800, 140, z, 7, rand), P.bush(pal, 780, 260, z, 7, rand, 2), P.bush(pal, 420, 120, z, 6, rand, 3), P.rock(pal, 640, 260, z, 5, rand));
  return out;
}

/** A kilim over a line between two posts, with or without its cloth. */
function airing(pal: Palette, x: number, y: number, z: number, len: number, cloth: boolean): Part {
  const p = new Part(x + y);
  p.box(x - 0.8, y - 0.8, z, 1.6, 1.6, 18, pal.woodDark).box(x + len - 0.8, y - 0.8, z, 1.6, 1.6, 18, pal.woodDark);
  const [ax, ay] = iso(x, y, z + 17);
  const [bx, by] = iso(x + len, y, z + 17);
  p.line(`M${n(ax)} ${n(ay)}L${n(bx)} ${n(by)}`, 0.8);
  if (cloth) P.kilim(p, (u, v) => iso(x + 3 + u, y + 0.4, z + 5 + v), len - 6, 12, pal);
  return p;
}
