/**
 * Crests: what a rank or a league is drawn as.
 *
 * A cut stone set in a chiselled bezel, and around it a setting that grows
 * with the tier: blades of metal swept back like wings, more of them and
 * longer at each step, then a chevron under the stone, then a crown over it,
 * and at the very top a crown with a stone of its own, rays of light behind
 * and a glow. So the ladder reads by its outline first — a lone stone at the
 * foot, a winged crest at the top — then by its colour, then by the cut of the
 * stone, which is each tier's own.
 *
 * The stone is faceted the way a jeweller cuts one: a ring of facets round a
 * flat table, each facet lit by how it faces the light from the upper left,
 * and the table split into a crown of small facets that catch it. Nothing is
 * blurred and nothing is a bitmap, so the phone draws exactly what the browser
 * does, at any size.
 *
 * Everything is worked out in the crest's own units — the stone about one
 * unit across its middle — and placed on the 120 square at the end, so a tier
 * can grow outward without anything being redrawn by hand.
 */
import type { Metal } from './palette.js';
import { pinShadow } from './paint.js';
import type { Detail } from './scenes.js';
import type { Drawing, Pt } from './svg.js';
import { linearAt, mix, n, n2, radialAt } from './svg.js';

/** The stone's cut: each tier's own outline. */
export type Cut = 'drop' | 'shield' | 'kite' | 'hexagon' | 'peak' | 'octagon' | 'brilliant' | 'star' | 'pentagon';

/** What is drawn into the stone's table: path data in the glyph's own −1…1 square, through `p`. */
export type Glyph = (p: (x: number, y: number) => string) => { fill?: string; faint?: string; stroke?: string; width?: number };

export interface Crest {
  cut: Cut;
  /** the stone's colours */
  gem: Metal;
  /** the setting's metal: the bezel, the blades, the crown */
  metal: Metal;
  /** how grand the setting is: 0 the stone alone … 5 the full crest */
  wings: 0 | 1 | 2 | 3 | 4 | 5;
  /** under the stone: nothing, a chevron, or a chevron with a stone hanging from it */
  base: 0 | 1 | 2;
  crown: 'none' | 'spikes' | 'jewel';
  /** the light behind it, 0–1 */
  glow: number;
  rays: boolean;
  glyph?: Glyph;
}

// ──────────────────────────────────────────────────────────────── the cuts

function regular(k: number, rotDeg: number, sy = 1): Pt[] {
  return Array.from({ length: k }, (_, i) => {
    const a = ((rotDeg + (360 * i) / k) * Math.PI) / 180;
    return [Math.cos(a), Math.sin(a) * sy] as Pt;
  });
}

/** A drop: its point straight up, its round body under, the sides running into the circle where they meet it. */
function dropCut(): Pt[] {
  const tip: Pt = [0, -1.3];
  const c: Pt = [0, 0.16];
  const r = 0.86;
  const d = c[1] - tip[1];
  const theta = (Math.acos(r / d) * 180) / Math.PI;
  const from = -90 + theta;
  const to = 270 - theta;
  const arc = Array.from({ length: 11 }, (_, i) => {
    const a = ((from + ((to - from) * i) / 10) * Math.PI) / 180;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r] as Pt;
  });
  return [tip, ...arc];
}

/** Each cut's outline, clockwise on the screen from the top, about one unit across. */
const CUTS: Record<Cut, () => Pt[]> = {
  drop: dropCut,
  shield: () => [
    [-0.78, -0.95],
    [0.78, -0.95],
    [0.93, -0.8],
    [0.93, 0.16],
    [0, 1.1],
    [-0.93, 0.16],
    [-0.93, -0.8],
  ],
  kite: () => [
    [0, -1.22],
    [0.9, -0.2],
    [0, 1.14],
    [-0.9, -0.2],
  ],
  hexagon: () => regular(6, -90, 1.08),
  peak: () => [
    [0, -1.2],
    [0.62, -0.4],
    [0.96, 0.26],
    [0.64, 0.98],
    [-0.64, 0.98],
    [-0.96, 0.26],
    [-0.62, -0.4],
  ],
  octagon: () => regular(8, -90 + 22.5, 1.04),
  brilliant: () => regular(12, -90 + 15),
  star: () => Array.from({ length: 16 }, (_, i) => {
    const a = ((-90 + 22.5 * i) * Math.PI) / 180;
    const r = i % 2 === 0 ? 1.18 : 0.66;
    return [Math.cos(a) * r, Math.sin(a) * r] as Pt;
  }),
  pentagon: () => regular(5, -90, 1.04),
};

/** A cut's outline, as points. */
export function cutPoints(cut: Cut): Pt[] {
  return CUTS[cut]();
}

const scale = (pts: readonly Pt[], k: number, dy = 0): Pt[] => pts.map(([x, y]) => [x * k, y * k + dy] as Pt);

/** How far the bezel stands out from the stone, as a share of the stone. */
const BEZEL = 1.22;
/** The table: the stone's flat top, a little smaller and a little up. */
const TABLE = 0.56;
const TABLE_UP = -0.05;
/** Where the table's facets meet: up and left of the middle, toward the light. */
const APEX: Pt = [-0.08, -0.16];

// ──────────────────────────────────────────────────────────────── the light

/** The light comes from the upper left. */
const LIGHT: Pt = [-0.5, -0.866];

/** How a face pointing along `normal` is lit: −1 turned away … 1 full on. */
function litBy(normal: Pt): number {
  return normal[0] * LIGHT[0] + normal[1] * LIGHT[1];
}

/** A face's colour, from its metal or stone, by how it is lit. */
function shade(m: Metal, b: number): string {
  if (b > 0.55) return mix(m.light, m.hi, Math.min(1, (b - 0.55) / 0.45) * 0.75);
  if (b > 0) return mix(m.mid, m.light, b / 0.55);
  if (b > -0.55) return mix(m.dark, m.mid, (b + 0.55) / 0.55);
  return mix(m.deep, m.dark, Math.max(0, (b + 1) / 0.45) * 0.8 + 0.2);
}

/** The outward normal of the edge a→b of a shape round `centre`. */
function outward(a: Pt, b: Pt, centre: Pt): Pt {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len = Math.hypot(ex, ey) || 1;
  let nx = ey / len;
  let ny = -ex / len;
  const mx = (a[0] + b[0]) / 2 - centre[0];
  const my = (a[1] + b[1]) / 2 - centre[1];
  if (nx * mx + ny * my < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

// ──────────────────────────────────────────────────────────────── the setting

interface Blade {
  /** where it starts, as an angle round the stone (0 = right, 90 = down) */
  a: number;
  /** which way it points */
  d: number;
  /** length, width at its foot, and how far its tip sweeps up */
  L: number;
  W: number;
  s: number;
}

/**
 * The blades on the right; the left are their mirror. They leave the stone's
 * sides and sweep out and up like the feathers of a wing, each a little lower
 * and shorter than the one behind it, their tips curling upward. Back ones
 * first, so each lies over the one above it.
 */
const UPPER: Record<0 | 1 | 2 | 3 | 4 | 5, readonly Blade[]> = {
  0: [],
  1: [
    { a: -8, d: -16, L: 1.0, W: 0.5, s: 0.32 },
    { a: 14, d: 4, L: 0.74, W: 0.42, s: 0.2 },
  ],
  2: [
    { a: -14, d: -24, L: 1.2, W: 0.52, s: 0.34 },
    { a: 4, d: -4, L: 1.0, W: 0.48, s: 0.26 },
    { a: 20, d: 12, L: 0.74, W: 0.42, s: 0.18 },
  ],
  3: [
    { a: -18, d: -30, L: 1.42, W: 0.54, s: 0.38 },
    { a: -2, d: -10, L: 1.26, W: 0.52, s: 0.32 },
    { a: 14, d: 8, L: 0.98, W: 0.46, s: 0.22 },
  ],
  4: [
    { a: -22, d: -34, L: 1.62, W: 0.58, s: 0.4 },
    { a: -6, d: -14, L: 1.5, W: 0.56, s: 0.34 },
    { a: 10, d: 4, L: 1.22, W: 0.52, s: 0.26 },
    { a: 24, d: 18, L: 0.9, W: 0.46, s: 0.18 },
  ],
  5: [
    { a: -28, d: -42, L: 1.86, W: 0.6, s: 0.44 },
    { a: -12, d: -22, L: 1.78, W: 0.6, s: 0.4 },
    { a: 4, d: -4, L: 1.55, W: 0.56, s: 0.32 },
    { a: 18, d: 12, L: 1.22, W: 0.5, s: 0.24 },
    { a: 30, d: 26, L: 0.92, W: 0.44, s: 0.16 },
  ],
};

/** Blades swept down and out from under the stone, from the fourth step: the crest's lower wings. */
const LOWER: Record<0 | 1 | 2 | 3 | 4 | 5, readonly Blade[]> = {
  0: [],
  1: [],
  2: [],
  3: [{ a: 60, d: 56, L: 0.74, W: 0.38, s: -0.24 }],
  4: [{ a: 58, d: 52, L: 0.92, W: 0.42, s: -0.26 }],
  5: [
    { a: 54, d: 46, L: 1.06, W: 0.46, s: -0.3 },
    { a: 70, d: 70, L: 0.78, W: 0.38, s: -0.2 },
  ],
};

/** The crown's three points over the stone: the middle one tall, the two beside it leaning out. */
const CROWN: readonly (Blade & { x: number; y: number })[] = [
  { x: -0.42, y: 0.08, a: 0, d: -108, L: 0.74, W: 0.4, s: 0 },
  { x: 0.42, y: 0.08, a: 0, d: -72, L: 0.74, W: 0.4, s: 0 },
  { x: 0, y: 0, a: 0, d: -90, L: 1.06, W: 0.5, s: 0 },
];

/** A blade's points: its two feet, its tip, the controls of its two edges, and where its spine starts. */
interface BladeShape {
  up: Pt;
  down: Pt;
  tip: Pt;
  c1: Pt;
  c2: Pt;
  foot: Pt;
}

function bladeAt(foot: Pt, b: Blade): BladeShape {
  const d = (b.d * Math.PI) / 180;
  const u: Pt = [Math.cos(d), Math.sin(d)];
  const nu: Pt = [Math.sin(d), -Math.cos(d)];
  const at = (along: number, across: number): Pt => [foot[0] + u[0] * along + nu[0] * across, foot[1] + u[1] * along + nu[1] * across];
  return {
    up: at(0, b.W / 2),
    down: at(0, -b.W / 2),
    tip: at(b.L, b.s * b.L * 0.35),
    c1: at(b.L * 0.5, b.W * 0.85 + b.s * b.L * 0.3),
    c2: at(b.L * 0.62, b.s * b.L * 0.3 - b.W * 0.14),
    foot,
  };
}

const onRing = (deg: number, r: number): Pt => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r];
const mirror = (p: Pt): Pt => [-p[0], p[1]];
const mirrorBlade = (s: BladeShape): BladeShape => ({ up: mirror(s.up), down: mirror(s.down), tip: mirror(s.tip), c1: mirror(s.c1), c2: mirror(s.c2), foot: mirror(s.foot) });

/** How many blades a crest shows at a size: the small drawings keep the long ones, which make the outline. */
function bladesFor(c: Crest, detail: Detail): { upper: readonly Blade[]; lower: readonly Blade[] } {
  const upper = UPPER[c.wings];
  const lower = LOWER[c.wings];
  if (detail === 0) return { upper, lower };
  if (detail === 1) return { upper: upper.length > 2 ? upper.slice(0, -1) : upper, lower: lower.slice(0, 2) };
  // tiny: the two longest, and one under
  const longest = [...upper].sort((x, y) => y.L - x.L).slice(0, 2).sort((x, y) => x.a - y.a);
  return { upper: longest, lower: lower.slice(0, 1) };
}

/** The setting's pieces as blade shapes, right and left, back to front. */
function settingOf(c: Crest, detail: Detail): { wings: BladeShape[][]; crown: BladeShape[] } {
  const { upper, lower } = bladesFor(c, detail);
  const pair = (b: Blade): BladeShape[] => {
    const right = bladeAt(onRing(b.a, 0.92), b);
    return [mirrorBlade(right), right];
  };
  const wings = [...lower, ...upper].map(pair);
  // the crown stands on the bezel's top edge, its feet over it like a tiara's
  const top = Math.min(...scale(cutPoints(c.cut), BEZEL).map((p) => p[1])) + 0.1;
  const crown = c.crown === 'none' ? [] : (detail === 2 ? CROWN.slice(2) : CROWN).map((b) => bladeAt([b.x, top + b.y], b));
  return { wings, crown };
}

/** Where the crown's stone sits: on its middle point, a little under the tip. */
function crownJewel(c: Crest): Pt {
  const top = Math.min(...scale(cutPoints(c.cut), BEZEL).map((p) => p[1])) + 0.1;
  return [0, top - 0.72];
}

/** The chevron under the stone: a V of metal, its left arm lit and its right in shade. */
const CHEVRON = {
  outer: [
    [-1.16, 0.34],
    [0, 1.64],
    [1.16, 0.34],
  ] as Pt[],
  inner: [
    [0.8, 0.5],
    [0, 1.28],
    [-0.8, 0.5],
  ] as Pt[],
};

// ──────────────────────────────────────────────────────────────── placing it

interface Place {
  s: number;
  ox: number;
  oy: number;
}

const P = (pl: Place, p: Pt): Pt => [pl.ox + p[0] * pl.s, pl.oy + p[1] * pl.s];
const ps = (pl: Place, p: Pt): string => {
  const q = P(pl, p);
  return `${n(q[0])},${n(q[1])}`;
};
const poly = (pl: Place, pts: readonly Pt[]): string => `M${pts.map((p) => ps(pl, p)).join('L')}Z`;

function bladePath(pl: Place, b: BladeShape): string {
  return `M${ps(pl, b.up)}Q${ps(pl, b.c1)} ${ps(pl, b.tip)}Q${ps(pl, b.c2)} ${ps(pl, b.down)}Z`;
}
/** The half of a blade on its upper edge, from its spine: the half that catches the light. */
function bladeLit(pl: Place, b: BladeShape): string {
  return `M${ps(pl, b.up)}Q${ps(pl, b.c1)} ${ps(pl, b.tip)}L${ps(pl, b.foot)}Z`;
}

/** Every point a crest reaches, for fitting it to its square. */
function extent(c: Crest, detail: Detail): { minX: number; maxX: number; minY: number; maxY: number } {
  const pts: Pt[] = [...scale(cutPoints(c.cut), BEZEL)];
  const { wings, crown } = settingOf(c, detail);
  for (const b of [...wings.flat(), ...crown]) pts.push(b.up, b.down, b.tip, b.c1, b.c2);
  if (c.base > 0) pts.push(...CHEVRON.outer);
  if (c.base === 2) pts.push([0, 1.92]);
  if (c.crown === 'jewel') pts.push([crownJewel(c)[0], crownJewel(c)[1] - 0.26]);
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    maxX: Math.max(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxY: Math.max(...pts.map((p) => p[1])),
  };
}

export interface CrestBox {
  /** the square's room for it: top and bottom on the canvas */
  top: number;
  bottom: number;
  /** the most a unit of the stone may be, in canvas pixels: the lone stones stop growing here */
  cap: number;
}

/** Where a crest sits: as large as its box allows, never larger than the cap, centred. */
export function placeCrest(c: Crest, detail: Detail, box: CrestBox): Place & { centre: Pt } {
  const e = extent(c, detail);
  const s = Math.min(box.cap, 112 / (e.maxX - e.minX), (box.bottom - box.top) / (e.maxY - e.minY));
  const ox = 60 - ((e.minX + e.maxX) / 2) * s;
  const oy = box.top + (box.bottom - box.top - (e.maxY - e.minY) * s) / 2 - e.minY * s;
  return { s, ox, oy, centre: [ox, oy] };
}

// ──────────────────────────────────────────────────────────────── painting it

/** A four-pointed glint. */
function sparkle(x: number, y: number, r: number): string {
  const w = r * 0.22;
  return `M${n(x)},${n(y - r)}Q${n(x + w)},${n(y - w)} ${n(x + r)},${n(y)}Q${n(x + w)},${n(y + w)} ${n(x)},${n(y + r)}Q${n(x - w)},${n(y + w)} ${n(x - r)},${n(y)}Q${n(x - w)},${n(y - w)} ${n(x)},${n(y - r)}Z`;
}

/**
 * The stone: its ring of facets, its table split into small facets toward
 * the light, and the glint on it. `table` colours the table's facets one by
 * one when given (the placement count), the stone's own light otherwise.
 */
function stone(pl: Place, cut: Cut, gem: Metal, detail: Detail, table?: (i: number) => Metal): string {
  const outer = cutPoints(cut);
  const inner = scale(outer, TABLE, TABLE_UP);
  const out: string[] = [];
  const k = outer.length;
  for (let i = 0; i < k; i++) {
    const a = outer[i]!;
    const b = outer[(i + 1) % k]!;
    out.push(`<path d="${poly(pl, [a, b, inner[(i + 1) % k]!, inner[i]!])}" fill="${shade(gem, litBy(outward(a, b, [0, 0])) * 0.9)}"/>`);
  }
  if (detail === 2 && !table) {
    out.push(`<path d="${poly(pl, inner)}" fill="${mix(gem.light, gem.mid, 0.35)}"/>`);
  } else {
    // the table's own facets: each a little lighter than the ring, turned toward the light by where it lies
    for (let i = 0; i < k; i++) {
      const a = inner[i]!;
      const b = inner[(i + 1) % k]!;
      const lit = litBy(outward(a, b, APEX));
      const g = table ? table(i) : gem;
      out.push(`<path d="${poly(pl, [APEX, a, b])}" fill="${mix(g.mid, g.hi, Math.max(0, (lit + 1) / 2) * 0.78)}"/>`);
    }
  }
  if (detail === 0) out.push(`<path d="${poly(pl, outer)}" fill="none" stroke="${gem.deep}" stroke-opacity="0.5" stroke-width="${n2(Math.max(0.8, pl.s * 0.035))}" stroke-linejoin="round"/>`);
  return out.join('');
}

/** The bezel: the stone's outline grown out, its facets chiselled and lit like the stone's, edged in its darkest tone. */
function bezel(dr: Drawing, pl: Place & { centre: Pt }, cut: Cut, m: Metal, detail: Detail): string {
  const seat = cutPoints(cut);
  const rim = scale(seat, BEZEL);
  const out: string[] = [];
  const stroke = n2(detail === 2 ? 2.4 : detail === 1 ? 1.8 : 1.3);
  if (detail === 2) {
    const id = dr.id('m');
    const [cx, cy] = pl.centre;
    dr.def(linearAt(id, [[0, m.hi], [0.35, m.light], [0.7, m.mid], [1, m.dark]], cx - pl.s, cy - pl.s * 1.2, cx + pl.s, cy + pl.s * 1.2));
    out.push(`<path d="${poly(pl, rim)}" fill="url(#${id})" stroke="${m.deep}" stroke-width="${stroke}" stroke-linejoin="round"/>`);
    return out.join('');
  }
  out.push(`<path d="${poly(pl, rim)}" fill="${m.mid}" stroke="${m.deep}" stroke-width="${stroke}" stroke-linejoin="round"/>`);
  const k = seat.length;
  for (let i = 0; i < k; i++) {
    const a = seat[i]!;
    const b = seat[(i + 1) % k]!;
    out.push(`<path d="${poly(pl, [rim[i]!, rim[(i + 1) % k]!, b, a])}" fill="${shade(m, litBy(outward(a, b, [0, 0])))}"/>`);
  }
  // the rim's own bright edge, where the light catches it
  if (detail === 0) out.push(`<path d="${poly(pl, rim)}" fill="none" stroke="${m.hi}" stroke-opacity="0.55" stroke-width="0.8" stroke-linejoin="round"/>`);
  return out.join('');
}

function blades(pl: Place, pieces: readonly BladeShape[][], m: Metal, detail: Detail): string {
  const out: string[] = [];
  const edge = detail === 0 ? ` stroke="${m.deep}" stroke-opacity="0.75" stroke-width="0.9" stroke-linejoin="round"` : '';
  for (const [left, right] of pieces) {
    // the left wing faces the light, the right one turns from it
    out.push(`<path d="${bladePath(pl, left!)}" fill="${m.mid}"${edge}/><path d="${bladeLit(pl, left!)}" fill="${m.hi}"/>`);
    out.push(`<path d="${bladePath(pl, right!)}" fill="${m.dark}"${edge}/><path d="${bladeLit(pl, right!)}" fill="${m.light}"/>`);
  }
  return out.join('');
}

function crownOf(pl: Place, pieces: readonly BladeShape[], m: Metal, detail: Detail): string {
  const edge = detail === 0 ? ` stroke="${m.deep}" stroke-opacity="0.75" stroke-width="0.9" stroke-linejoin="round"` : '';
  return pieces.map((b) => `<path d="${bladePath(pl, b)}" fill="${m.mid}"${edge}/><path d="${bladeLit(pl, b)}" fill="${m.hi}"/>`).join('');
}

/** A small four-faceted stone, set in the crown or hung from the chevron. */
function smallStone(pl: Place, at: Pt, r: number, gem: Metal, m: Metal): string {
  const [x, y] = at;
  const top: Pt = [x, y - r * 1.25];
  const right: Pt = [x + r, y];
  const foot: Pt = [x, y + r * 1.25];
  const left: Pt = [x - r, y];
  const mid: Pt = [x - r * 0.12, y - r * 0.15];
  return (
    `<path d="${poly(pl, [top, right, foot, left])}" fill="${gem.dark}" stroke="${m.deep}" stroke-width="1" stroke-linejoin="round"/>` +
    `<path d="${poly(pl, [top, mid, left])}" fill="${gem.hi}"/>` +
    `<path d="${poly(pl, [top, right, mid])}" fill="${gem.light}"/>` +
    `<path d="${poly(pl, [left, mid, foot])}" fill="${gem.mid}"/>`
  );
}

function chevron(pl: Place, m: Metal, detail: Detail): string {
  const [l, tip, r] = CHEVRON.outer as [Pt, Pt, Pt];
  const [ir, itip, il] = CHEVRON.inner as [Pt, Pt, Pt];
  const edge = detail === 0 ? ` stroke="${m.deep}" stroke-opacity="0.75" stroke-width="0.9" stroke-linejoin="round"` : '';
  return (
    `<path d="${poly(pl, CHEVRON.outer.concat(CHEVRON.inner))}" fill="${m.dark}"${edge}/>` +
    `<path d="${poly(pl, [l, tip, itip, il])}" fill="${m.light}"/>` +
    (detail === 0 ? `<path d="${poly(pl, [tip, r, ir, itip])}" fill="${m.mid}" fill-opacity="0.6"/>` : '')
  );
}

/** Rays of light from behind the stone, fading before the square's edge. */
function rays(dr: Drawing, centre: Pt, gem: Metal, count: number): string {
  const [cx, cy] = centre;
  const reach = Math.min(cx, cy, 120 - cx, 120 - cy) - 1;
  const id = dr.id('o');
  dr.def(radialAt(id, [[0, gem.hi, 0.75], [0.45, gem.light, 0.35], [1, gem.light, 0]], cx, cy, reach));
  const d: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = ((i * 360) / count - 90 + 180 / count) * (Math.PI / 180);
    const w = (Math.PI / count) * 0.32;
    const p1: Pt = [cx + Math.cos(a - w) * reach, cy + Math.sin(a - w) * reach];
    const p2: Pt = [cx + Math.cos(a + w) * reach, cy + Math.sin(a + w) * reach];
    d.push(`M${n(cx)},${n(cy)}L${n(p1[0])},${n(p1[1])}L${n(p2[0])},${n(p2[1])}Z`);
  }
  return `<path d="${d.join('')}" fill="url(#${id})"/>`;
}

/** The light behind a crest: a soft round glow, inside the square. */
function glowOf(dr: Drawing, centre: Pt, colour: string, opacity: number): string {
  const [cx, cy] = centre;
  const reach = Math.min(cx, cy, 120 - cx, 120 - cy) - 1;
  const id = dr.id('o');
  dr.def(radialAt(id, [[0, colour, opacity], [0.35, colour, opacity * 0.8], [0.7, colour, opacity * 0.3], [1, colour, 0]], cx, cy, reach));
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(reach)}" fill="url(#${id})"/>`;
}

export interface CrestOptions {
  detail: Detail;
  box: CrestBox;
  /** the table's facets coloured one by one (the placement count) */
  table?: (i: number) => Metal;
}

/** A whole crest, as markup, with where it was placed. */
export function crestMarkup(dr: Drawing, c: Crest, o: CrestOptions): { markup: string; place: Place & { centre: Pt } } {
  const pl = placeCrest(c, o.detail, o.box);
  const { wings, crown } = settingOf(c, o.detail);
  const out: string[] = [];
  const centre = P(pl, [0, 0]);

  if (c.glow > 0) out.push(glowOf(dr, centre, c.gem.light, c.glow));
  if (c.rays && o.detail < 2) out.push(rays(dr, centre, c.gem, o.detail === 0 ? 12 : 8));

  // the crest's own thickness under it, and its shadow on the page
  const rimOutline = poly(pl, scale(cutPoints(c.cut), BEZEL));
  const rimFoot = P(pl, [0, Math.max(...scale(cutPoints(c.cut), BEZEL).map((p) => p[1]))]);
  out.push(pinShadow(dr, rimOutline, c.metal.deep, centre[0], rimFoot[1], pl.s * 2.2, o.detail === 0 ? 2.4 : 1.8));

  out.push(blades(pl, wings, c.metal, o.detail));
  if (c.base > 0) out.push(chevron(pl, c.metal, o.detail));
  if (c.base === 2 && o.detail < 2) out.push(smallStone(pl, [0, 1.7], 0.17, c.gem, c.metal));
  // the crown sits on the bezel, so it is drawn over it, and the stone over both
  out.push(bezel(dr, { ...pl, centre }, c.cut, c.metal, o.detail));
  out.push(crownOf(pl, crown, c.metal, o.detail));
  if (c.crown === 'jewel' && o.detail < 2) out.push(smallStone(pl, crownJewel(c), 0.2, c.gem, c.metal));
  out.push(stone(pl, c.cut, c.gem, o.detail, o.table));

  if (c.glyph && o.detail < 2) out.push(glyphOn(pl, c.glyph, c.gem, o.detail));

  // the glint: on the stone always, and from the fourth step on the bezel and in the air too
  if (o.detail < 2) {
    const g = P(pl, [-0.3, -0.42]);
    out.push(`<path d="${sparkle(g[0], g[1], pl.s * (o.detail === 0 ? 0.2 : 0.24))}" fill="#ffffff" fill-opacity="0.95"/>`);
    if (o.detail === 0 && c.wings >= 3) {
      const marks: Pt[] = c.wings >= 5 ? [[-1.02, -0.72], [1.5, -1.25], [-1.75, 0.35], [1.15, 0.95]] : [[-1.02, -0.72], [1.3, -1.05]];
      out.push(`<path d="${marks.map((m, i) => {
        const q = P(pl, m);
        return sparkle(q[0], q[1], pl.s * (i === 0 ? 0.16 : 0.13));
      }).join('')}" fill="#ffffff" fill-opacity="0.9"/>`);
    }
  }
  return { markup: out.join(''), place: { ...pl, centre } };
}

/** What is drawn into the table, in the stone's own deep tone, as if cut into it. */
function glyphOn(pl: Place, glyph: Glyph, gem: Metal, detail: Detail): string {
  const size = 0.4;
  const g = glyph((x, y) => ps(pl, [x * size, y * size + 0.02]));
  const out: string[] = [];
  const ink = gem.deep;
  if (g.faint) out.push(`<path d="${g.faint}" fill="${ink}" fill-opacity="0.32"/>`);
  if (g.fill) out.push(`<path d="${g.fill}" fill="${ink}" fill-opacity="${detail === 0 ? '0.72' : '0.8'}"/>`);
  if (g.stroke) out.push(`<path d="${g.stroke}" fill="none" stroke="${ink}" stroke-opacity="${detail === 0 ? '0.72' : '0.8'}" stroke-width="${n2((g.width ?? 0.16) * size * pl.s)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  return out.join('');
}

/**
 * A crest's outline alone, flat: a tier not reached yet. Its shape is still
 * its own — the cut, the blades, the crown — so the ladder reads, and the
 * keyhole in the middle says it waits.
 */
export function crestSilhouette(c: Crest, detail: Detail, box: CrestBox, body: string, mark: string): string {
  const pl = placeCrest(c, detail, box);
  const { wings, crown } = settingOf(c, detail);
  const parts = [...wings.flat(), ...crown].map((b) => bladePath(pl, b));
  if (c.base > 0) parts.push(poly(pl, CHEVRON.outer.concat(CHEVRON.inner)));
  const out = [`<path d="${parts.join('')}" fill="${body}"/>`, `<path d="${poly(pl, scale(cutPoints(c.cut), BEZEL))}" fill="${body}"/>`];
  out.push(`<path d="${keyhole(P(pl, [0, 0.02]), pl.s)}" fill="${mark}"/>`);
  return out.join('');
}

/** A keyhole: a round head and a slot widening under it. */
function keyhole([cx, cy]: Pt, s: number): string {
  const head = s * 0.2;
  const top = cy - s * 0.14;
  const slotTop = top + head * 0.6;
  const slotFoot = cy + s * 0.36;
  const neck = s * 0.08;
  const foot = s * 0.15;
  return (
    `M${n(cx - head)},${n(top)}A${n(head)},${n(head)} 0 1 1 ${n(cx + head)},${n(top)}A${n(head)},${n(head)} 0 1 1 ${n(cx - head)},${n(top)}Z` +
    `M${n(cx - neck)},${n(slotTop)}L${n(cx + neck)},${n(slotTop)}L${n(cx + foot)},${n(slotFoot)}L${n(cx - foot)},${n(slotFoot)}Z`
  );
}

/**
 * The division under a rank's crest: small cut stones in a row, as many lit as
 * the player has climbed — one for III, two for II, three for I — and the
 * rest empty settings, told apart by shape and fill as well as by colour.
 */
export function divisionStones(dr: Drawing, gem: Metal, m: Metal, count: number, lit: number, cx: number, cy: number, w: number, h: number, gap: number): string {
  const id = dr.id('pip');
  dr.def(linearAt(id, [[0, gem.hi], [0.45, gem.light], [1, gem.mid]], 0, cy - h / 2, 0, cy + h / 2));
  const x0 = cx - ((count - 1) * (w + gap)) / 2;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = x0 + i * (w + gap);
    const d = `M${n(x)},${n(cy - h / 2)}L${n(x + w / 2)},${n(cy)}L${n(x)},${n(cy + h / 2)}L${n(x - w / 2)},${n(cy)}Z`;
    if (i < lit) {
      out.push(`<path d="${d}" fill="url(#${id})" stroke="${m.deep}" stroke-width="1.3" stroke-linejoin="round"/>`);
      out.push(`<path d="M${n(x)},${n(cy - h / 2)}L${n(x - w / 2)},${n(cy)}L${n(x - w * 0.08)},${n(cy - h * 0.06)}Z" fill="#ffffff" fill-opacity="0.7"/>`);
    } else {
      out.push(`<path d="${d}" fill="${m.deep}" fill-opacity="0.25" stroke="${m.mid}" stroke-width="1.3" stroke-linejoin="round"/>`);
    }
  }
  return out.join('');
}
