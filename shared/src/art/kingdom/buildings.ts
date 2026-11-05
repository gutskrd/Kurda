/**
 * The six buildings, each from its staked-out plot to its fifth stage, and
 * the look of a stage still being built.
 *
 * Each building is drawn on its own patch of ground, its back corner at the
 * origin, `PLOT_SIZE` across, and is a list of pieces, each with the level it
 * arrives at (and the level it gives way at, if a later stage replaces it).
 * A stage is every piece that has arrived; a stage being built is the stage
 * before it with the next stage's new pieces half-raised — walls standing to
 * half their height with no roof, saplings on their stakes — inside
 * scaffolding, with planks and cut stone stacked by it. Every stage keeps what
 * the stage before it had, so a new level reads as something added.
 *
 * The houses are Hewraman houses: flat earth roofs on poplar beams whose
 * round ends show under the eaves, a stone roller on the roof to firm it
 * after rain, each house stepping up the slope so that one's roof is the next
 * one's yard.
 */
import type { KingdomBuilding, KingdomLevel } from '../../games/kingdom/buildings.js';
import { n, seeded, type Pt } from '../svg.js';
import { INK, Part, arched, disc, iso, onLeft, onRight, oval, panel, poly, polyline, rim, seg, wpoly, type Palette, type Tri } from './pen.js';
import * as P from './props.js';
import type { Rand } from './props.js';

/** Each building's patch of ground, along x and along y. */
export const PLOT_SIZE: Readonly<Record<KingdomBuilding, { w: number; d: number }>> = {
  houses: { w: 80, d: 76 },
  school: { w: 74, d: 66 },
  teahouse: { w: 76, d: 70 },
  spring: { w: 66, d: 62 },
  market: { w: 78, d: 66 },
  orchard: { w: 88, d: 78 },
};

/** A box on the ground that a piece being raised fills, for the scaffolding round it. */
type Bounds = readonly [x: number, y: number, z: number, w: number, d: number, h: number];

interface Piece {
  /** the level it arrives at */
  from: number;
  /** the level a later stage replaces it at */
  until?: number;
  /** its parts, `built` the share of it standing (1 finished, 0.5 half-raised) */
  draw: (built: number) => Part[];
  /** what scaffolding goes round it while it is being raised; none for things that are planted or set down */
  bounds?: Bounds;
}

// ───────────────────────────────────────────────────────────── the house

interface Opening {
  side: 'left' | 'right';
  at: number;
  w?: number;
  h?: number;
  v?: number;
}

interface HouseOptions {
  wall?: Tri;
  door?: Opening & { arch?: boolean; tone?: Tri };
  windows?: readonly Opening[];
  /** where on the roof the roller lies and the chimney stands, as shares along x and y */
  roller?: Pt;
  chimney?: Pt;
  /** the wooden spout that drains the roof, on the left face, as a share along it */
  spout?: number;
  beams?: boolean;
  /** grass grown on the earth roof */
  grassy?: boolean;
}

/** Stone courses on a wall face: thin joints a step darker than its shade, and a few stones catching the light. */
function stonework(p: Part, at: (u: number, v: number) => Pt, len: number, h: number, wall: Tri, rand: Rand, lit: string): void {
  // not every joint: a stone here and there drawn by its top and one side, as a hand would hint at a wall
  let joints = '';
  let light = '';
  const course = 5.2;
  for (let v = 0, row = 0; v < h - 2; v += course, row++) {
    let u = (row % 2) * 3 + rand() * 4;
    const top = Math.min(h - 0.6, v + course - 0.6);
    while (u < len - 4) {
      const step = 6 + rand() * 6;
      const end = Math.min(len - 0.8, u + step - 0.8);
      const r = rand();
      if (r < 0.42) joints += polyline([at(u + 0.8, top), at(end, top), at(end, v + 0.9)]);
      else if (r < 0.54) light += poly([at(u + 0.8, v + 0.8), at(end, v + 0.8), at(end, top), at(u + 0.8, top)]);
      u += step;
    }
  }
  if (light) p.flat(light, lit, ' fill-opacity="0.7"');
  p.line(joints, 0.6, darker(wall.right));
}

/** A colour a step darker. */
function darker(hex: string, k = 0.78): string {
  const c = hex.replace('#', '');
  return `#${[0, 2, 4].map((i) => Math.round(parseInt(c.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;
}

/** A small deep window in its painted frame under a timber lintel, dark by day and lamp-lit at dusk. */
function windowOn(p: Part, pal: Palette, at: (u: number, v: number) => Pt, u: number, v: number, w: number, h: number): void {
  p.fill(panel(at, u - 0.9, v - 0.9, w + 1.8, h + 1.8), pal.frame);
  p.fill(panel(at, u + 0.1, v + 0.1, w - 0.2, h - 0.2) + seg(at(u + w / 2, v), at(u + w / 2, v + h)), pal.dusk ? pal.glow : pal.glass, ' stroke-width="0.7"');
  p.fill(panel(at, u - 2, v + h + 0.9, w + 4, 1.8), pal.wood.left, ' stroke-width="0.8"');
}

/** A door of painted planks under a timber lintel, square-headed or arched. */
function doorOn(p: Part, pal: Palette, at: (u: number, v: number) => Pt, u: number, w: number, h: number, arch: boolean, tone: Tri, side: 'left' | 'right'): void {
  p.fill(arch ? arched(at, u, 0, w, h) : panel(at, u, 0, w, h), side === 'left' ? tone.left : tone.right);
  let planks = '';
  for (let k = 1; k < 3; k++) planks += seg(at(u + (w * k) / 3, 0.4), at(u + (w * k) / 3, h - (arch ? w * 0.3 : 0.6)));
  p.line(planks, 0.6);
  if (!arch) p.fill(panel(at, u - 2, h, w + 4, 2), pal.wood.left, ' stroke-width="0.8"');
}

/**
 * A Hewraman house: stone walls, a flat earth roof overhanging them on its
 * slab, the round ends of the roof's poplar beams in a row under the eaves,
 * a door, small deep windows, and on the roof the roller and the chimney.
 * `built` below 1 leaves the walls standing that far up with no roof yet,
 * the room open to the sky.
 */
export function house(pal: Palette, x: number, y: number, z: number, w: number, d: number, h: number, o: HouseOptions, rand: Rand, built = 1): Part {
  const p = new Part(x + w / 2 + y + d / 2);
  const wall = o.wall ?? pal.stone;
  const raised = built < 1;
  const hh = raised ? Math.max(5, Math.round((h * built) / 4.6) * 4.6) : h;
  p.box(x, y, z, w, d, hh, wall, { top: false });
  const left = onLeft(x, y + d, z);
  const right = onRight(x + w, y, z);
  stonework(p, left, w, hh, wall, rand, wall.top);
  stonework(p, right, d, hh, wall, rand, wall.left);
  if (o.door && (!raised || o.door.h === undefined || o.door.h < hh)) {
    const dw = o.door.w ?? Math.min(7, w * 0.26);
    const dh = Math.min(o.door.h ?? Math.min(11.5, h * 0.62), hh - 1);
    const len = o.door.side === 'left' ? w : d;
    const at = o.door.side === 'left' ? left : right;
    doorOn(p, pal, at, o.door.at * len - dw / 2, dw, dh, o.door.arch ?? false, o.door.tone ?? pal.door, o.door.side);
  }
  for (const win of o.windows ?? []) {
    const ww = win.w ?? Math.min(5, w * 0.2);
    const wh = win.h ?? ww;
    const v = win.v ?? h * 0.48;
    if (v + wh > hh - 1) continue;
    const len = win.side === 'left' ? w : d;
    windowOn(p, pal, win.side === 'left' ? left : right, win.at * len - ww / 2, v, ww, wh);
  }
  if (raised) {
    // the open top of the walls: their thickness lit, the room below in shade
    const t = 2.4;
    p.fill(wpoly([[x, y, z + hh], [x + w, y, z + hh], [x + w, y + d, z + hh], [x, y + d, z + hh]]), wall.top);
    p.fill(wpoly([[x + t, y + t, z + hh], [x + w - t, y + t, z + hh], [x + w - t, y + d - t, z + hh], [x + t, y + d - t, z + hh]]), darker(wall.right, 0.7));
    return p;
  }
  // the beam ends under the eaves
  if (o.beams !== false) {
    let ends = '';
    const v = h - 1.3;
    for (let u = 3; u < w - 1.5; u += 4.6) {
      const [bx, by] = left(u, v);
      ends += disc(bx, by, 1.05);
    }
    for (let u = 3; u < d - 1.5; u += 4.6) {
      const [bx, by] = right(u, v);
      ends += disc(bx, by, 1.05);
    }
    p.fill(ends, pal.beam, ' stroke-width="0.7"');
  }
  // the roof slab, a little over the walls all round
  const e = 1.6;
  p.box(x - e, y - e, z + h, w + 2 * e, d + 2 * e, 2.6, pal.roof);
  if (o.grassy) {
    const [gx, gy] = iso(x + w * 0.3, y + d * 0.6, z + h + 2.6);
    p.flat(oval(gx, gy, w * 0.3, d * 0.12), pal.grass.left);
  }
  if (o.spout !== undefined) {
    const [sx, sy] = left(o.spout * w, h + 1);
    p.fill(`M${n(sx - 1)} ${n(sy)}l-3 1.6l0 1.6l3 -1.4Z`, pal.wood.left, ' stroke-width="0.7"');
  }
  if (o.roller) {
    const [rx, ry] = o.roller;
    const cx = x + rx * w;
    const cy = y + ry * d;
    const [a, b] = iso(cx, cy, z + h + 2.6);
    // a stone cylinder lying along x: its round end towards us
    p.sil(`M${n(a - 5)} ${n(b - 5.2)}L${n(a + 3)} ${n(b - 9.2)}L${n(a + 3)} ${n(b - 3.6)}L${n(a - 5)} ${n(b + 0.4)}Z` + disc(a - 5, b - 2.4, 2.8));
    p.fill(`M${n(a - 5)} ${n(b - 5.2)}L${n(a + 3)} ${n(b - 9.2)}L${n(a + 3)} ${n(b - 3.6)}L${n(a - 5)} ${n(b + 0.4)}Z`, pal.stoneGrey.right);
    p.fill(disc(a - 5, b - 2.4, 2.8), pal.stoneGrey.top).flat(disc(a - 5, b - 2.4, 0.8), INK);
  }
  if (o.chimney) {
    const [cxs, cys] = o.chimney;
    p.box(x + cxs * w - 2.4, y + cys * d - 2.4, z + h + 2.6, 4.8, 4.8, 6.4, pal.stoneGrey);
    const [mx, my] = iso(x + cxs * w, y + cys * d, z + h + 9);
    p.flat(oval(mx, my, 2.4, 1.2), '#3a2318');
  }
  return p;
}

/** A raised stone platform: a terrace wall a house above stands on. */
function platform(pal: Palette, x: number, y: number, z: number, w: number, d: number, h: number, rand: Rand): Part {
  const p = new Part(x + y);
  p.box(x, y, z, w, d, h, pal.stoneGrey, { top: false });
  stonework(p, onLeft(x, y + d, z), w, h, pal.stoneGrey, rand, pal.stoneGrey.top);
  stonework(p, onRight(x + w, y, z), d, h, pal.stoneGrey, rand, pal.stoneGrey.left);
  p.fill(wpoly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]), pal.earth.top);
  return p;
}

/** Steps up against a wall that faces down-right (the plane x = X), climbing towards it: the tallest at the wall, each lit on its top. */
function stairUp(pal: Palette, X: number, y: number, z: number, wide: number, rise: number, count: number): Part {
  const p = new Part(X + y + wide);
  for (let k = 0; k < count; k++) p.box(X + k * 3.4, y, z, 3.4, wide, (count - k) * rise, pal.stoneGrey);
  return p;
}

// ───────────────────────────────────────────────────────────── the six

type Painter = (pal: Palette, rand: Rand) => readonly Piece[];

const houses: Painter = (pal, rand) => [
  {
    from: 1,
    bounds: [36, 40, 0, 26, 24, 20],
    draw: (b) => [
      house(pal, 36, 40, 0, 26, 24, 20, { door: { side: 'left', at: 0.3 }, windows: [{ side: 'left', at: 0.76 }, { side: 'right', at: 0.5 }], roller: [0.55, 0.35], spout: 0.95 }, rand, b),
      ...(b < 1 ? [] : [P.logPile(pal, 65, 62, 0, 5), P.stumpWithAxe(pal, 72, 71, 0)]),
    ],
  },
  {
    from: 2,
    bounds: [2, 2, 0, 34, 34, 37],
    draw: (b) => [
      platform(pal, 2, 2, 0, 34, 34, 20, rand),
      stairUp(pal, 36, 24, 0, 6, 4, 5),
      house(pal, 4, 4, 20, 26, 26, 17, { wall: pal.stoneWarm, door: { side: 'left', at: 0.62 }, windows: [{ side: 'left', at: 0.25 }, { side: 'right', at: 0.55 }], roller: [0.3, 0.5] }, rand, b),
      ...(b < 1 ? [] : [P.geraniums(pal, 39, 66, 0.5, 3, rand)]),
    ],
  },
  {
    from: 3,
    bounds: [56, 4, 0, 22, 24, 19],
    draw: (b) => [
      house(pal, 56, 4, 0, 22, 24, 19, { wall: pal.plaster, door: { side: 'left', at: 0.5, arch: true }, windows: [{ side: 'right', at: 0.35 }, { side: 'right', at: 0.75 }], chimney: [0.7, 0.3] }, rand, b),
      ...(b < 1 ? [] : [P.washingLine(pal, 39, 47, 22.6, 19, rand)]),
    ],
  },
  {
    from: 4,
    bounds: [2, 48, 0, 20, 24, 16],
    draw: (b) => [
      house(pal, 2, 48, 0, 20, 24, 16, { wall: pal.stoneWarm, door: { side: 'left', at: 0.62 }, windows: [{ side: 'right', at: 0.5 }], roller: [0.5, 0.4] }, rand, b),
      ...(b < 1 ? [] : [hungKilim(pal, 24, 36, 20, 10, 12), P.jar(pal, 27, 64, 0, 1.1), P.jar(pal, 29, 69, 0, 0.9, pal.copper)]),
    ],
  },
  {
    from: 5,
    bounds: [8, 8, 37, 20, 18, 15],
    draw: (b) => [
      house(pal, 8, 8, 39.6, 18, 16, 15, { wall: pal.plaster, windows: [{ side: 'left', at: 0.5 }, { side: 'right', at: 0.5 }], chimney: [0.3, 0.6], grassy: true }, rand, b),
      ...(b < 1 ? [] : [P.fruitTree(pal, 30, 74, 0, 8, rand, { kind: 'pomegranate', fruit: 5 }), peppers(pal, 6, 54, 18.6)]),
    ],
  },
];

/** A kilim thrown over a terrace's edge to air, hanging down its face (the plane y = Y) from a rail along the top. */
function hungKilim(pal: Palette, x: number, Y: number, top: number, w: number, h: number): Part {
  const p = new Part(x + Y + 2);
  const face = onLeft(x, Y + 0.4, top);
  P.kilim(p, (u, v) => face(u, -v), w, h, pal);
  const rail = onLeft(x - 2, Y, top);
  const [a, b] = [rail(0, 4), rail(w + 4, 4)];
  let posts = '';
  for (const u of [0, w + 4]) {
    const [c, d] = rail(u, 0);
    posts += `M${n(c)} ${n(d)}l0 -4`;
  }
  p.line(posts + `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, 2.4).line(posts + `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, 1, pal.wood.top);
  return p;
}

/** Red peppers spread on a cloth to dry on a roof. */
function peppers(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(x + y + 30);
  p.fill(wpoly([[x, y, z], [x + 12, y, z], [x + 12, y + 8, z], [x, y + 8, z]]), pal.cloth.top);
  let d = '';
  for (let i = 0; i < 9; i++) {
    const [a, b] = iso(x + 2 + (i % 3) * 4, y + 1.5 + Math.floor(i / 3) * 2.6, z);
    d += `M${n(a - 1.4)} ${n(b)}q1.4 -1.2 2.8 0.4q-1.4 0.6 -2.8 -0.4Z`;
  }
  p.fill(d, pal.red.left, ' stroke-width="0.5"');
  return p;
}

/** A bell hung in a little wooden frame. */
function bellFrame(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(x + y);
  p.box(x - 1, y - 7, z, 2, 2, 16, pal.woodDark).box(x - 1, y + 5, z, 2, 2, 16, pal.woodDark).box(x - 1.5, y - 8, z + 16, 3, 16, 2, pal.wood);
  const [bx, by] = iso(x, y, z + 15);
  const bell = `M${n(bx - 3)} ${n(by + 6)}Q${n(bx - 3)} ${n(by + 1)} ${n(bx)} ${n(by + 0.6)}Q${n(bx + 3)} ${n(by + 1)} ${n(bx + 3)} ${n(by + 6)}Z`;
  p.sil(bell).fill(bell, pal.saffron.left).flat(`M${n(bx + 0.8)} ${n(by + 1.2)}Q${n(bx + 3)} ${n(by + 1.6)} ${n(bx + 3)} ${n(by + 6)}H${n(bx + 1.4)}Z`, pal.saffron.right);
  p.line(`M${n(bx)} ${n(by)}l0 -1.2`, 0.8);
  return p;
}

/** A covered porch along a left face: posts and a slab roof. */
function porch(pal: Palette, x: number, y: number, z: number, w: number, depth: number, h: number): Part[] {
  const posts: Part[] = [];
  for (let k = 0; k <= 3; k++) posts.push(new Part(x + (k * w) / 3 + y + depth + 1).box(x + (k * w) / 3 - 1, y + depth - 2, z, 2, 2, h, pal.wood));
  const roof = new Part(x + w / 2 + y + depth / 2 + 2);
  roof.box(x - 1.5, y - 1, z + h, w + 3, depth + 1.5, 2, pal.roof);
  let ends = '';
  for (let u = 2; u < w; u += 4.2) {
    const [a, b] = iso(x + u, y + depth + 0.5, z + h - 0.8);
    ends += disc(a, b, 0.9);
  }
  roof.fill(ends, pal.beam, ' stroke-width="0.6"');
  return [...posts, roof];
}

const school: Painter = (pal, rand) => [
  {
    from: 1,
    bounds: [16, 22, 0, 40, 28, 19],
    draw: (b) => [house(pal, 16, 22, 0, 40, 28, 19, { door: { side: 'left', at: 0.5, arch: true }, windows: [{ side: 'right', at: 0.5 }], roller: [0.25, 0.3] }, rand, b)],
  },
  { from: 1, draw: (b) => (b < 1 ? [] : [bench(pal, 24, 58, 0)]) },
  {
    from: 2,
    draw: (b) => (b < 1 ? [] : [bellFrame(pal, 62, 54, 0), P.geraniums(pal, 20, 52, 0.5, 2, rand), windowsOnly(pal, 16, 22, 0, 40, 28, 19, [{ side: 'left', at: 0.2 }, { side: 'left', at: 0.8 }])]),
  },
  {
    from: 3,
    bounds: [20, 2, 0, 30, 18, 22],
    draw: (b) => [
      house(pal, 20, 2, 0, 30, 18, 22, { wall: pal.stoneWarm, windows: [{ side: 'right', at: 0.5 }], chimney: [0.3, 0.4], spout: 0.15 }, rand, b),
      ...(b < 1 ? [] : [...P.fence(pal, 4, 64, 0, 26, 'x', 1), ...P.fence(pal, 44, 64, 0, 24, 'x')]),
    ],
  },
  { from: 4, bounds: [16, 50, 0, 40, 8, 14], draw: (b) => (b < 1 ? [] : porch(pal, 16, 50, 0, 40, 8, 13)) },
  {
    from: 5,
    bounds: [24, 26, 21.6, 24, 20, 14],
    draw: (b) => [
      house(pal, 26, 26, 21.6, 22, 18, 13, { wall: pal.plaster, windows: [{ side: 'left', at: 0.3 }, { side: 'left', at: 0.75 }, { side: 'right', at: 0.5 }], roller: [0.7, 0.4] }, rand, b),
      ...(b < 1 ? [] : [P.fruitTree(pal, 66, 10, 0, 10, rand, { fruit: 4 }), P.bannerPole(pal, 6, 8, 0, 30)]),
    ],
  },
];

/** The windows a stage adds to a house already standing, drawn over its walls. */
function windowsOnly(pal: Palette, x: number, y: number, z: number, w: number, d: number, h: number, wins: readonly Opening[]): Part {
  const p = new Part(x + w / 2 + y + d / 2 + 0.1);
  const left = onLeft(x, y + d, z);
  const right = onRight(x + w, y, z);
  for (const win of wins) {
    const ww = win.w ?? Math.min(5, w * 0.2);
    windowOn(p, pal, win.side === 'left' ? left : right, win.at * (win.side === 'left' ? w : d) - ww / 2, win.v ?? h * 0.48, ww, win.h ?? ww);
  }
  return p;
}

/** A wooden bench along x. */
function bench(pal: Palette, x: number, y: number, z: number, len = 16): Part {
  const p = new Part(x + len / 2 + y);
  p.box(x + 1, y, z, 1.6, 4, 3, pal.woodDark).box(x + len - 2.6, y, z, 1.6, 4, 3, pal.woodDark).box(x, y - 0.5, z + 3, len, 5, 1.4, pal.wood);
  return p;
}

/** The raised wooden platform tea is drunk on, a kilim laid over it and cushions along its back. */
function takht(pal: Palette, x: number, y: number, z: number, w: number, d: number): Part {
  const p = new Part(x + w / 2 + y + d / 2);
  p.box(x, y, z, w, d, 4.4, pal.wood);
  // the kilim laid flat on the boards
  const at = (u: number, v: number): Pt => iso(x + 2 + u, y + 2 + v, z + 4.4);
  P.kilim(p, at, w - 4, d - 4, pal, false);
  p.box(x + 1, y + 0.6, z + 4.4, w - 2, 3, 3.2, pal.red);
  return p;
}

/** A pergola of poles and beams with a grapevine over it, bunches of grapes hanging. */
function pergola(pal: Palette, x: number, y: number, z: number, w: number, d: number, h: number, rand: Rand, lanterns: boolean): Part[] {
  const out: Part[] = [];
  for (const [px, py] of [[x, y], [x + w, y], [x, y + d], [x + w, y + d]] as const) out.push(new Part(px + py).box(px - 1, py - 1, z, 2, 2, h, pal.woodDark));
  const top = new Part(x + w + y + d + 3);
  top.box(x - 2, y - 1, z + h, w + 4, 2, 1.6, pal.wood).box(x - 2, y + d - 1, z + h, w + 4, 2, 1.6, pal.wood);
  let leaves: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const [a, b] = iso(x + 2 + rand() * (w - 4), y + 2 + rand() * (d - 4), z + h + 2);
    leaves.push([a, b, 3.2 + rand() * 1.6]);
  }
  leaves = leaves.sort((a, b) => a[1] - b[1]);
  for (const [a, b, r] of leaves) top.sil(disc(a, b, r));
  top.flat(leaves.map(([a, b, r]) => disc(a, b, r)).join(''), pal.leaf.right).flat(leaves.map(([a, b, r]) => disc(a - r * 0.15, b - r * 0.2, r * 0.8)).join(''), pal.leaf.left);
  let grapes = '';
  for (let i = 0; i < 4; i++) {
    const [a, b] = iso(x + 4 + (i * (w - 8)) / 3, y + d, z + h - 1);
    grapes += disc(a, b + 1.4, 1.1) + disc(a - 1, b + 2.8, 1) + disc(a + 1, b + 2.8, 1) + disc(a, b + 4, 0.9);
  }
  top.fill(grapes, '#7b3f8c', ' stroke-width="0.5"');
  if (lanterns) for (let i = 0; i < 3; i++) top.raw(P.lantern(pal, ...iso(x + 6 + (i * (w - 12)) / 2, y + d, z + h)));
  out.push(top);
  return out;
}

const teahouse: Painter = (pal, rand) => [
  {
    from: 1,
    draw: (b) =>
      b < 1
        ? [P.planks(pal, 30, 40, 0)]
        : [takht(pal, 26, 38, 0, 26, 18), P.samovar(pal, 20, 62, 0, 1.25), P.stool(pal, 34, 62, 0), P.stool(pal, 44, 64, 0), P.teaGlasses(pal, 40, 47, 4.4), P.sign(pal, 66, 60, 0, 'cup')],
  },
  {
    from: 2,
    bounds: [6, 4, 0, 36, 30, 19],
    draw: (b) => [house(pal, 6, 4, 0, 36, 30, 19, { wall: pal.plaster, door: { side: 'left', at: 0.3, arch: true }, windows: [{ side: 'left', at: 0.72 }, { side: 'right', at: 0.5 }], chimney: [0.72, 0.3], spout: 0.95 }, rand, b)],
  },
  { from: 3, bounds: [24, 36, 0, 30, 22, 18], draw: (b) => (b < 1 ? [] : [...pergola(pal, 24, 36, 0, 30, 22, 17, rand, false), P.stool(pal, 58, 48, 0)]) },
  {
    from: 4,
    bounds: [44, 6, 0, 26, 26, 16],
    draw: (b) => [
      house(pal, 44, 6, 0, 26, 26, 16, { wall: pal.stoneWarm, windows: [{ side: 'left', at: 0.35, w: 7 }, { side: 'right', at: 0.5 }], roller: [0.5, 0.4] }, rand, b),
      ...(b < 1 ? [] : [lanternsOn(pal, 24, 58, 17)]),
    ],
  },
  {
    from: 5,
    draw: (b) =>
      b < 1
        ? []
        : [roofTerrace(pal, 6, 4, 21.6, rand), P.bannerPole(pal, 72, 4, 0, 30), P.geraniums(pal, 4, 38, 0, 3, rand, 'y'), P.jar(pal, 70, 64, 0, 1.2)],
  },
];

/** Lanterns strung along a pergola's front beam. */
function lanternsOn(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(x + y + 40);
  for (let i = 0; i < 3; i++) p.raw(P.lantern(pal, ...iso(x + 6 + i * 9, y, z)));
  return p;
}

/** Cushions and a kilim on a roof, and a low railing round it. */
function roofTerrace(pal: Palette, x: number, y: number, z: number, rand: Rand): Part {
  const p = new Part(x + y + 30);
  const at = (u: number, v: number): Pt => iso(x + 4 + u, y + 6 + v, z + 0.2);
  P.kilim(p, at, 18, 12, pal, false);
  p.box(x + 4, y + 3, z, 18, 3, 2.6, pal.indigo).box(x + 2, y + 6, z, 2.6, 12, 2.6, pal.saffron);
  void rand;
  return p;
}

/** Rocks round a pool where the water comes out of the ground. */
function springRocks(pal: Palette, rand: Rand): Part[] {
  return [P.rock(pal, 18, 14, 0, 7, rand), P.rock(pal, 30, 10, 0, 5, rand), P.rock(pal, 10, 26, 0, 5.5, rand)];
}

/** A pool of water on the ground: an ellipse of water with a lighter rim. */
function pool(pal: Palette, x: number, y: number, z: number, r: number): Part {
  const p = new Part(x + y - r);
  const [cx, cy] = iso(x, y, z);
  const [rx, ry] = rim(r);
  p.sil(oval(cx, cy, rx, ry)).fill(oval(cx, cy, rx, ry), pal.water.right).flat(oval(cx - rx * 0.06, cy - ry * 0.1, rx * 0.88, ry * 0.78), pal.water.left);
  p.line(`M${n(cx - rx * 0.5)} ${n(cy - ry * 0.2)}q${n(rx * 0.2)} -1.4 ${n(rx * 0.4)} 0`, 1, pal.foam);
  return p;
}

/** A carved stone basin full of water, the back slab with its spout above it. */
function basin(pal: Palette, x: number, y: number, z: number, w: number, d: number): Part[] {
  const back = new Part(x + y);
  back.box(x + w * 0.3, y - 3, z, w * 0.4, 3, 16, pal.stone);
  // the slab is plain stone, carved with a lozenge
  const at = onLeft(x + w * 0.3, y, z);
  back.line(poly([at(w * 0.2, 9), at(w * 0.28, 12), at(w * 0.2, 15), at(w * 0.12, 12)]), 0.7);
  const [sx, sy] = iso(x + w * 0.5, y, z + 9);
  back.fill(`M${n(sx - 1)} ${n(sy)}l-2.6 1.4l0 1.6l2.6 -1.2Z`, pal.copper.left, ' stroke-width="0.7"');
  const trough = new Part(x + w / 2 + y + d / 2);
  trough.box(x, y, z, w, d, 6, pal.stone, { top: false });
  trough.fill(wpoly([[x, y, z + 6], [x + w, y, z + 6], [x + w, y + d, z + 6], [x, y + d, z + 6]]), pal.stone.top);
  trough.fill(wpoly([[x + 2, y + 2, z + 6], [x + w - 2, y + 2, z + 6], [x + w - 2, y + d - 2, z + 6], [x + 2, y + d - 2, z + 6]]), pal.water.left);
  return [back, trough];
}

/** A stone niche built over a spout: two piers and a pointed arch with a slab on top. */
function niche(pal: Palette, x: number, y: number, z: number, w: number, h: number, dome: boolean): Part {
  const p = new Part(x + w / 2 + y + 4);
  p.box(x, y - 2, z, 4, 6, h, pal.stoneWarm).box(x + w - 4, y - 2, z, 4, 6, h, pal.stoneWarm);
  const face = onLeft(x, y + 4, z);
  const arch = `M${n(face(0, h)[0])} ${n(face(0, h)[1])}L${n(face(w, h)[0])} ${n(face(w, h)[1])}L${n(face(w, h + 6)[0])} ${n(face(w, h + 6)[1])}L${n(face(0, h + 6)[0])} ${n(face(0, h + 6)[1])}Z`;
  p.fill(arch, pal.stoneWarm.left);
  const inner = `M${n(face(4, h)[0])} ${n(face(4, h)[1])}Q${n(face(w / 2, h + 9)[0])} ${n(face(w / 2, h + 9)[1])} ${n(face(w - 4, h)[0])} ${n(face(w - 4, h)[1])}Z`;
  p.fill(inner, darker(pal.stoneWarm.right, 0.8));
  p.box(x - 1.4, y - 3, z + h + 6, w + 2.8, 8, 2.4, pal.stone);
  if (dome) {
    const [cx, cy] = iso(x + w / 2, y + 1, z + h + 8.4);
    const r = w * 0.48;
    const shape = `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r * 0.95)} 0 0 1 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r * 0.42)} 0 0 1 ${n(cx - r)} ${n(cy)}Z`;
    p.sil(shape).fill(shape, pal.plaster.left).flat(`M${n(cx + r * 0.15)} ${n(cy - r * 0.93)}A${n(r)} ${n(r * 0.95)} 0 0 1 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r * 0.42)} 0 0 1 ${n(cx + r * 0.35)} ${n(cy + r * 0.4)}Q${n(cx + r * 0.5)} ${n(cy - r * 0.4)} ${n(cx + r * 0.15)} ${n(cy - r * 0.93)}Z`, pal.plaster.right);
    p.box(x + w / 2 - 1, y, z + h + 8.4 + r * 0.95, 2, 2, 3, pal.copper);
  }
  return p;
}

const spring: Painter = (pal, rand) => [
  { from: 1, until: 2, draw: (b) => (b < 1 ? [] : [pool(pal, 30, 32, 0, 11), ...springRocks(pal, rand), reeds(pal, 44, 24, 0)]) },
  { from: 2, bounds: [16, 22, 0, 30, 14, 16], draw: (b) => (b < 1 ? [P.planks(pal, 30, 44, 0)] : [...basin(pal, 16, 22, 0, 30, 14), P.jar(pal, 50, 42, 0, 1, pal.copper), ...springRocks(pal, rand).slice(0, 2), reeds(pal, 52, 22, 0)]) },
  { from: 3, bounds: [18, 16, 0, 26, 8, 22], draw: (b) => (b < 1 ? [] : [niche(pal, 18, 18, 0, 26, 14, false), P.steppingStones(pal, [34, 48, 0], [44, 60, 0], 3, rand)]) },
  { from: 4, draw: (b) => (b < 1 ? [] : [bench(pal, 4, 46, 0, 14), P.bush(pal, 56, 50, 0, 6, rand, 6), P.geraniums(pal, 48, 18, 0, 2, rand, 'y')]) },
  { from: 5, bounds: [18, 16, 20, 26, 8, 14], draw: (b) => (b < 1 ? [] : [niche(pal, 18, 18, 0, 26, 14, true), P.willow(pal, 6, 14, 0, 13, rand), P.bush(pal, 8, 34, 0, 5, rand, 5)]) },
];

/** Reeds at the water's edge. */
function reeds(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(x + y);
  const [a, b] = iso(x, y, z);
  let d = '';
  for (let i = 0; i < 5; i++) d += `M${n(a - 4 + i * 2)} ${n(b)}q${n(i % 2 ? 1.5 : -1)} -5 ${n(i % 2 ? 0.5 : -0.8)} -${n(8 + (i % 3) * 2)}`;
  p.line(d, 2.4).line(d, 1.1, pal.leafDark.left);
  p.fill(`M${n(a - 1)} ${n(b - 9)}l0.8 -3.6l0.8 3.6Z`, pal.woodDark.left, ' stroke-width="0.6"');
  return p;
}

/**
 * A market stall: a wooden counter heaped with what is sold, four posts, and
 * a striped awning sloping down to the front with a scalloped edge.
 */
function stall(pal: Palette, x: number, y: number, z: number, w: number, d: number, stripes: readonly [Tri, Tri], goods: readonly string[], rand: Rand): Part[] {
  const back = new Part(x + y);
  back.box(x, y, z, 1.6, 1.6, 20, pal.woodDark).box(x + w - 1.6, y, z, 1.6, 1.6, 20, pal.woodDark);
  const counter = new Part(x + w / 2 + y + d / 2);
  counter.box(x, y + 2, z, w, d - 2, 8, pal.wood);
  const plank = onLeft(x, y + d, z);
  const [p0, p1] = [plank(0, 4), plank(w, 4)];
  counter.line(`M${n(p0[0])} ${n(p0[1])}L${n(p1[0])} ${n(p1[1])}`, 0.7);
  // what is sold, heaped along the counter
  let k = 0;
  for (const colour of goods) {
    let heap = '';
    let shine = '';
    const gx = x + 3 + (k * (w - 6)) / Math.max(1, goods.length - 1 || 1);
    for (let i = 0; i < 5; i++) {
      const [a, b] = iso(gx + (i % 3) * 2.2 - 2, y + 4 + (i > 2 ? 2.4 : 0) + rand(), z + 8 + (i > 2 ? 1.6 : 0));
      heap += disc(a, b - 1.6, 1.9);
      shine += disc(a - 0.6, b - 2.3, 0.6);
    }
    counter.fill(heap, colour, ' stroke-width="0.6"').flat(shine, '#ffffff', ' fill-opacity="0.5"');
    k++;
  }
  const front = new Part(x + w + y + d + 2);
  front.box(x, y + d - 1.6, z, 1.6, 1.6, 16, pal.woodDark).box(x + w - 1.6, y + d - 1.6, z, 1.6, 1.6, 16, pal.woodDark);
  // the awning: strips along x, sloping from the back top to the front
  const count = Math.max(4, Math.round(w / 5));
  const sw = w / count;
  const hb = z + 21;
  const hf = z + 16;
  const ext = 3;
  let a = '';
  let b = '';
  for (let i = 0; i < count; i++) {
    const strip = wpoly([[x - 1 + i * sw, y - 1, hb], [x - 1 + (i + 1) * sw + (i === count - 1 ? 2 : 0), y - 1, hb], [x - 1 + (i + 1) * sw + (i === count - 1 ? 2 : 0), y + d + ext, hf], [x - 1 + i * sw, y + d + ext, hf]]);
    if (i % 2) b += strip;
    else a += strip;
  }
  front.sil(wpoly([[x - 1, y - 1, hb], [x + w + 1, y - 1, hb], [x + w + 1, y + d + ext, hf], [x - 1, y + d + ext, hf]]));
  front.fill(a, stripes[0].top).fill(b, stripes[1].top);
  // the valance: a band hanging at the front edge, scalloped
  const val = onLeft(x - 1, y + d + ext, hf - 3.4);
  let va = '';
  let vb = '';
  for (let i = 0; i < count; i++) {
    const u0 = i * sw;
    const u1 = (i + 1) * sw + (i === count - 1 ? 2 : 0);
    const [q0, q1, q2, q3] = [val(u0, 3.4), val(u1, 3.4), val(u1, 0.4), val(u0, 0.4)];
    const mid = val((u0 + u1) / 2, -1.2);
    const piece = `M${n(q0[0])} ${n(q0[1])}L${n(q1[0])} ${n(q1[1])}L${n(q2[0])} ${n(q2[1])}Q${n(mid[0])} ${n(mid[1])} ${n(q3[0])} ${n(q3[1])}Z`;
    if (i % 2) vb += piece;
    else va += piece;
  }
  front.sil(va + vb).fill(va, stripes[0].left).fill(vb, stripes[1].left);
  return [back, counter, front];
}

/** A row of stone arches: the covered bazaar behind the stalls. */
function arcade(pal: Palette, x: number, y: number, z: number, w: number, h: number, rand: Rand): Part {
  const p = new Part(x + y + 2);
  p.box(x, y, z, w, 8, h, pal.stoneWarm, { top: false });
  const face = onLeft(x, y + 8, z);
  stonework(p, face, w, h, pal.stoneWarm, rand, pal.stoneWarm.top);
  stonework(p, onRight(x + w, y, z), 8, h, pal.stoneWarm, rand, pal.stoneWarm.left);
  const bays = 3;
  const bw = w / bays;
  let dark = '';
  for (let i = 0; i < bays; i++) dark += arched(face, i * bw + 3, 0, bw - 6, h - 6);
  p.fill(dark, '#4a3226');
  p.box(x - 1.5, y - 1.5, z + h, w + 3, 11, 2.4, pal.roof);
  for (let i = 0; i < bays; i++) {
    const [lx, ly] = face(i * bw + bw / 2, h - 4.5);
    p.raw(P.lantern(pal, lx, ly));
  }
  // three small domes along the roof
  for (let i = 0; i < bays; i++) {
    const [cx, cy] = iso(x + i * bw + bw / 2, y + 4, z + h + 2.4);
    const r = 5;
    const dome = `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 0 1 ${n(cx + r)} ${n(cy)}Z`;
    p.sil(dome).fill(dome, pal.plaster.left).flat(`M${n(cx + 1)} ${n(cy - r * 0.98)}A${n(r)} ${n(r)} 0 0 1 ${n(cx + r)} ${n(cy)}H${n(cx + 1.6)}Z`, pal.plaster.right);
  }
  return p;
}

/** Kilims hung over a rail for sale. */
function kilimRail(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(x + y + 12);
  p.box(x, y, z, 1.6, 1.6, 18, pal.woodDark).box(x + 22, y, z, 1.6, 1.6, 18, pal.woodDark);
  const top = onLeft(x, y + 1.6, z + 17);
  P.kilim(p, (u, v) => top(1.5 + u, -v), 9, 13, pal);
  const second = { ...pal, red: pal.indigo, indigo: pal.red };
  P.kilim(p, (u, v) => top(12 + u, -v), 9, 11, second);
  const [a, b] = [top(0, 0.5), top(23.6, 0.5)];
  p.line(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, 2.2).line(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, 1, pal.wood.top);
  return p;
}

const market: Painter = (pal, rand) => [
  {
    from: 1,
    until: 2,
    draw: (b) => {
      if (b < 1) return [];
      const cloth = new Part(20);
      cloth.fill(wpoly([[18, 30, 0], [52, 30, 0], [52, 52, 0], [18, 52, 0]]), pal.cloth.top);
      return [cloth, P.crate(pal, 22, 33, 0, 9, pal.apple, rand), P.crate(pal, 34, 33, 0, 9, pal.pomegranate, rand), P.sack(pal, 46, 44, 0, pal.saffron.left), P.breadStack(pal, 28, 47, 0.2)];
    },
  },
  {
    from: 2,
    bounds: [14, 28, 0, 26, 12, 21],
    draw: (b) => (b < 1 ? [P.planks(pal, 18, 40, 0)] : [...stall(pal, 14, 28, 0, 26, 12, [pal.red, pal.cream], [pal.apple, pal.pomegranate, pal.bread.left], rand), P.crate(pal, 22, 46, 0, 9, pal.apple, rand), P.breadStack(pal, 40, 48, 0)]),
  },
  {
    from: 3,
    bounds: [46, 18, 0, 24, 12, 21],
    draw: (b) => (b < 1 ? [] : [...stall(pal, 46, 18, 0, 24, 12, [pal.green, pal.cream], [pal.pomegranate, pal.saffron.left, pal.apple], rand), P.cart(pal, 54, 44, 0, pal.apple, rand)]),
  },
  {
    from: 4,
    bounds: [8, 4, 0, 26, 12, 21],
    draw: (b) => (b < 1 ? [] : [kilimRail(pal, 6, 8, 0), P.sack(pal, 34, 14, 0, pal.red.left), P.sack(pal, 38, 18, 0, pal.saffron.left), P.jar(pal, 6, 56, 0, 1.2, pal.copper), P.jar(pal, 10, 60, 0, 1)]),
  },
  { from: 5, bounds: [26, 0, 0, 44, 8, 26], draw: (b) => (b < 1 ? [] : [arcade(pal, 28, -2, 0, 44, 25, rand), P.bannerPole(pal, 74, 2, 0, 32)]) },
];

/** Rows of dug earth where the orchard will be planted. */
function rows(pal: Palette): Part {
  const p = new Part(-10);
  let d = '';
  for (let i = 0; i < 4; i++) d += wpoly([[12, 14 + i * 15, 0], [74, 14 + i * 15, 0], [74, 20 + i * 15, 0], [12, 20 + i * 15, 0]]);
  p.flat(d, pal.earth.left);
  return p;
}

/** The orchard's trees, by the level each is planted at: apples, with pomegranates nearer the wall. */
const TREES: readonly [x: number, y: number, size: number, from: number, kind: 'apple' | 'pomegranate'][] = [
  [42, 40, 11, 1, 'apple'],
  [20, 24, 10, 2, 'apple'],
  [66, 22, 10, 2, 'apple'],
  [22, 60, 10, 3, 'pomegranate'],
  [66, 58, 11, 3, 'apple'],
  [44, 12, 9, 4, 'pomegranate'],
  [80, 42, 9, 5, 'pomegranate'],
];

const orchard: Painter = (pal, rand) => {
  const pieces: Piece[] = [{ from: 1, until: 3, draw: (b) => (b < 1 ? [] : [rows(pal)]) }];
  for (const [x, y, size, from, kind] of TREES) {
    pieces.push({ from, until: from + 1, draw: (b) => [b < 1 ? P.sapling(pal, x, y, 0, size * 0.55, rand) : P.fruitTree(pal, x, y, 0, size * 0.75, rand, { kind, young: true })] });
    pieces.push({ from: from + 1, draw: (b) => (b < 1 ? [] : [P.fruitTree(pal, x, y, 0, size, rand, { kind, fruit: from + 1 >= 4 ? 7 : 4 })]) });
  }
  pieces.push(
    { from: 2, draw: (b) => (b < 1 ? [] : [P.wattle(pal, 4, 2, 0, 70, 'x')]) },
    { from: 3, draw: (b) => (b < 1 ? [] : [P.beehive(pal, 82, 14, 0, 'skep')]) },
    { from: 4, draw: (b) => (b < 1 ? [] : [P.beehive(pal, 82, 26, 0, 'skep'), P.beehive(pal, 6, 44, 0, 'log'), P.crate(pal, 50, 66, 0, 9, pal.apple, rand), P.ladder(pal, [60, 70, 0], [62, 60, 14])]) },
    { from: 5, draw: (b) => (b < 1 ? [] : [P.beehive(pal, 6, 60, 0, 'log'), P.cart(pal, 32, 66, 0, pal.apple, rand), P.crate(pal, 58, 72, 0, 9, pal.pomegranate, rand)]) },
  );
  return pieces;
};

const PAINTERS: Readonly<Record<KingdomBuilding, Painter>> = { houses, school, teahouse, spring, market, orchard };

/** Where the builders work on a stage whose new pieces are set down rather than built (a bench and its kilim, a pool, crates on a cloth). */
const WORK_SITE: Readonly<Partial<Record<KingdomBuilding, Bounds>>> = {
  houses: [32, 36, 0, 30, 28, 18],
  school: [16, 22, 0, 40, 28, 16],
  teahouse: [24, 36, 0, 30, 20, 12],
  spring: [18, 18, 0, 28, 22, 12],
  market: [14, 26, 0, 32, 18, 14],
};

/** What each plot's sign shows. */
const SIGN: Readonly<Record<KingdomBuilding, 'house' | 'arrow' | 'cup'>> = { houses: 'house', school: 'house', teahouse: 'cup', spring: 'arrow', market: 'arrow', orchard: 'arrow' };

/**
 * One building at one level, in its plot's own units (its back corner on the
 * ground at the origin): the parts, back to front still to be sorted. With
 * `rising`, the next level's new pieces are shown half-raised in
 * scaffolding, over the stage the building stands at.
 */
export function buildingParts(building: KingdomBuilding, level: KingdomLevel, pal: Palette, rising = false): Part[] {
  const rand = seeded(`kingdom-${building}`);
  const pieces = PAINTERS[building](pal, rand);
  const { w, d } = PLOT_SIZE[building];
  const out: Part[] = [];
  const next = level + 1;
  if (level === 0) out.push(...P.stakedPlot(pal, 4, 4, 0, w - 8, d - 8, seeded(`kingdom-plot-${building}`), SIGN[building]));
  // the scaffolding goes round each new piece that is built (not planted or set down); a stage with none has its work site
  const raisedIn: Bounds[] = [];
  for (const piece of pieces) {
    const standing = piece.from <= level && (piece.until === undefined || level < piece.until);
    const raising = rising && piece.from === next;
    if (standing) out.push(...piece.draw(1));
    else if (raising) {
      out.push(...piece.draw(0.5));
      if (piece.bounds) raisedIn.push(piece.bounds);
    }
  }
  if (rising) {
    if (raisedIn.length === 0 && WORK_SITE[building]) raisedIn.push(WORK_SITE[building]!);
    for (const [x, y, z, bw, bd, bh] of raisedIn) {
      const s = P.scaffold(pal, x, y, z, bw, bd, Math.max(10, bh * 0.75));
      out.push(s.back, s.front);
    }
    // a ladder up the front of the last scaffold, or against a stake where trees are being planted
    const [x, y, z, bw, bd, bh] = raisedIn[raisedIn.length - 1] ?? [w * 0.4, d * 0.4, 0, 10, 10, 14];
    const ladderPart = P.ladder(pal, [x + bw * 0.72, y + bd + 9, z], [x + bw * 0.72, y + bd + 3.4, z + Math.max(10, bh * 0.75)]);
    const work = [ladderPart, P.planks(pal, w - 22, d - 4, 0), P.tools(pal, 6, d - 2, 0)];
    out.push(...work);
    for (const part of out.slice(-(work.length + raisedIn.length * 2))) part.tag = 'scaffold';
  }
  return out;
}

/** How tall each building stands at its fullest, for framing it on its own. */
export const BUILDING_TOP: Readonly<Record<KingdomBuilding, number>> = { houses: 62, school: 40, teahouse: 32, spring: 40, market: 34, orchard: 26 };

export { INK, darker };
