/**
 * Crests: what a rank or a league is drawn as.
 *
 * A cut stone in a rounded metal bezel, and around it a setting that grows
 * with the tier: soft feathers of metal that sweep out and up like a pair of
 * wings, more of them and longer at each step; a laurel under the stone; a
 * crown on it, with pearls and then a star; and at the very top a stone
 * hanging from the laurel, the twenty-one rays of the sun behind and a glow.
 * So the ladder reads by its outline first — a lone stone at the foot, a
 * winged crest at the top — then by its colour, then by the cut of the stone,
 * which is each tier's own.
 *
 * It is drawn in Hevalo's own hand, the badges' family: every corner rounded,
 * the bezel smooth metal with a ring of beads set into it like the badges'
 * rims, the laurel and the crown theirs, and the glyph in the stone a bold
 * white cut-out like theirs. And it is mirror-symmetric: the light falls from
 * straight above, so the left half of every crest is the right half's mirror,
 * the stone's facets and the feathers included, and every glyph is drawn about
 * the middle.
 *
 * Everything is worked out in the crest's own units — the stone about one
 * unit across its middle — and placed on the 120 square at the end, so a tier
 * can grow outward without anything being redrawn by hand. Nothing is blurred
 * and nothing is a bitmap, so the phone draws exactly what the browser does.
 */
import { roundPath } from './geometry.js';
import { laurel, softStar } from './paint.js';
import type { Metal } from './palette.js';
import type { Detail } from './scenes.js';
import type { Drawing, Pt } from './svg.js';
import { linearAt, linearBox, mix, n, n2, radialAt } from './svg.js';

/** The stone's cut: each tier's own outline. */
export type Cut = 'drop' | 'shield' | 'kite' | 'hexagon' | 'peak' | 'octagon' | 'brilliant' | 'pentagon';

/**
 * What is cut into the stone, in the glyph's own −1…1 square, drawn about its
 * middle line: path data through `p`. `fill` is solid (holes by even-odd),
 * `faint` half seen, `stroke` lines of `width`.
 */
export type Glyph = (p: (x: number, y: number) => string) => { fill?: string; faint?: string; stroke?: string; width?: number };

export interface Crest {
  cut: Cut;
  /** the stone's colours */
  gem: Metal;
  /** the setting's metal: the bezel, the feathers, the laurel, the crown */
  metal: Metal;
  /** how grand the wings are: 0 none … 5 the full pair */
  wings: 0 | 1 | 2 | 3 | 4 | 5;
  /** under the stone: nothing, a laurel, or a laurel with a stone hanging from it */
  base: 0 | 1 | 2;
  crown: 'none' | 'pearls' | 'star';
  /** beads set round the bezel, as the badges' rims have */
  beads: boolean;
  /** the light behind it, 0–1 */
  glow: number;
  /** the sun's twenty-one rays behind it */
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
  const theta = (Math.acos(r / (c[1] - tip[1])) * 180) / Math.PI;
  const from = -90 + theta;
  const to = 270 - theta;
  const arc = Array.from({ length: 11 }, (_, i) => {
    const a = ((from + ((to - from) * i) / 10) * Math.PI) / 180;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r] as Pt;
  });
  return [tip, ...arc];
}

/** Each cut's outline, clockwise on the screen from the top, about one unit across, and its own mirror image. */
const CUTS: Record<Cut, () => Pt[]> = {
  drop: dropCut,
  shield: () => [
    [-0.8, -0.96],
    [0.8, -0.96],
    [0.94, -0.78],
    [0.94, 0.16],
    [0, 1.1],
    [-0.94, 0.16],
    [-0.94, -0.78],
  ],
  kite: () => [
    [0, -1.22],
    [0.92, -0.18],
    [0, 1.14],
    [-0.92, -0.18],
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
  pentagon: () => regular(5, -90, 1.04),
};

/** A cut's outline, as points. */
export function cutPoints(cut: Cut): Pt[] {
  return CUTS[cut]();
}

const scale = (pts: readonly Pt[], k: number, dy = 0): Pt[] => pts.map(([x, y]) => [x * k, y * k + dy] as Pt);

/** How far the bezel stands out from the stone, as a share of the stone. */
const BEZEL = 1.24;
/** The table: the stone's flat top, a little smaller and a little up. */
const TABLE = 0.56;
const TABLE_UP = -0.06;
/** Where the table's facets meet: on the middle line, a little up. */
const APEX: Pt = [0, -0.14];
/** How round a corner is, in the crest's units: the badges' soft corners, scaled to a stone. */
const CORNER = 0.16;

const bezelOf = (cut: Cut): Pt[] => scale(cutPoints(cut), BEZEL);
const topOf = (pts: readonly Pt[]): number => Math.min(...pts.map((p) => p[1]));
const footOf = (pts: readonly Pt[]): number => Math.max(...pts.map((p) => p[1]));

// ──────────────────────────────────────────────────────────────── the light

/** How a face pointing along `normal` is lit, by a light from straight above: −1 turned away … 1 full on. */
const litBy = (normal: Pt): number => -normal[1];

/** A face's colour, from its metal or stone, by how it is lit. */
function shade(m: Metal, b: number): string {
  if (b > 0.55) return mix(m.light, m.hi, Math.min(1, (b - 0.55) / 0.45) * 0.7);
  if (b > 0) return mix(m.mid, m.light, b / 0.55);
  if (b > -0.55) return mix(m.dark, m.mid, (b + 0.55) / 0.55);
  return mix(m.deep, m.dark, Math.max(0, (b + 1) / 0.45) * 0.7 + 0.3);
}

/** The outward normal of the edge a→b of a shape round `centre`. */
function outward(a: Pt, b: Pt, centre: Pt): Pt {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len = Math.hypot(ex, ey) || 1;
  let nx = ey / len;
  let ny = -ex / len;
  if (nx * ((a[0] + b[0]) / 2 - centre[0]) + ny * ((a[1] + b[1]) / 2 - centre[1]) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

// ──────────────────────────────────────────────────────────────── the wings

interface Feather {
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
 * The feathers on the right; the left are their mirror. They leave the stone's
 * sides and sweep out and up, each a little lower and shorter than the one
 * behind it, their rounded tips curling upward. Back ones first, so each lies
 * over the one above it.
 */
const WINGS: Record<0 | 1 | 2 | 3 | 4 | 5, readonly Feather[]> = {
  0: [],
  1: [
    { a: -10, d: -18, L: 0.98, W: 0.5, s: 0.32 },
    { a: 14, d: 4, L: 0.74, W: 0.44, s: 0.22 },
  ],
  2: [
    { a: -16, d: -26, L: 1.18, W: 0.52, s: 0.34 },
    { a: 2, d: -6, L: 1.0, W: 0.5, s: 0.28 },
    { a: 20, d: 12, L: 0.76, W: 0.44, s: 0.2 },
  ],
  3: [
    { a: -20, d: -32, L: 1.38, W: 0.54, s: 0.38 },
    { a: -4, d: -12, L: 1.24, W: 0.52, s: 0.32 },
    { a: 12, d: 6, L: 0.98, W: 0.48, s: 0.24 },
    { a: 26, d: 22, L: 0.72, W: 0.42, s: 0.16 },
  ],
  4: [
    { a: -26, d: -40, L: 1.56, W: 0.56, s: 0.4 },
    { a: -10, d: -20, L: 1.48, W: 0.56, s: 0.36 },
    { a: 6, d: -2, L: 1.24, W: 0.52, s: 0.28 },
    { a: 20, d: 14, L: 0.96, W: 0.46, s: 0.2 },
    { a: 32, d: 28, L: 0.7, W: 0.4, s: 0.14 },
  ],
  5: [
    { a: -32, d: -48, L: 1.74, W: 0.58, s: 0.44 },
    { a: -16, d: -28, L: 1.72, W: 0.6, s: 0.4 },
    { a: 0, d: -8, L: 1.5, W: 0.56, s: 0.32 },
    { a: 14, d: 8, L: 1.2, W: 0.5, s: 0.24 },
    { a: 26, d: 22, L: 0.92, W: 0.44, s: 0.18 },
    { a: 36, d: 34, L: 0.66, W: 0.38, s: 0.12 },
  ],
};

/** A feather's points: its two feet, the round of its tip, the controls of its edges, and its spine. */
interface FeatherShape {
  up: Pt;
  down: Pt;
  c1: Pt;
  c2: Pt;
  tipUp: Pt;
  tipCtl: Pt;
  tipDown: Pt;
  foot: Pt;
  mid: Pt;
  end: Pt;
}

function featherAt(foot: Pt, f: Feather): FeatherShape {
  const d = (f.d * Math.PI) / 180;
  const u: Pt = [Math.cos(d), Math.sin(d)];
  const nu: Pt = [Math.sin(d), -Math.cos(d)];
  const at = (along: number, across: number): Pt => [foot[0] + u[0] * along + nu[0] * across, foot[1] + u[1] * along + nu[1] * across];
  const R = f.W * 0.32;
  const lift = f.s * f.L * 0.35;
  return {
    up: at(0, f.W / 2),
    down: at(0, -f.W / 2),
    c1: at(f.L * 0.5, f.W * 0.8 + f.s * f.L * 0.3),
    c2: at(f.L * 0.6, f.s * f.L * 0.3 - f.W * 0.12),
    tipUp: at(f.L - R, R * 0.8 + lift),
    tipCtl: at(f.L + R * 0.6, lift),
    tipDown: at(f.L - R * 0.9, -R * 0.75 + lift),
    foot,
    mid: at(f.L * 0.52, f.s * f.L * 0.2),
    end: at(f.L - R * 1.2, lift * 0.95),
  };
}

const onRing = (deg: number, r: number): Pt => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r];
const mirror = (p: Pt): Pt => [-p[0], p[1]];
function mirrored(s: FeatherShape): FeatherShape {
  const out = {} as FeatherShape;
  for (const k of Object.keys(s) as (keyof FeatherShape)[]) out[k] = mirror(s[k]);
  return out;
}

/** The feathers a crest shows at a size: the small drawings keep the long ones, which make the outline. */
function feathersFor(c: Crest, detail: Detail): readonly Feather[] {
  const all = WINGS[c.wings];
  if (detail === 0) return all;
  if (detail === 1) return all.length > 3 ? all.slice(0, -1) : all;
  return [...all].sort((x, y) => y.L - x.L).slice(0, 2).sort((x, y) => x.a - y.a);
}

/** The wings as pairs of feathers, left and right, back to front. */
function wingsOf(c: Crest, detail: Detail): [FeatherShape, FeatherShape][] {
  return feathersFor(c, detail).map((f) => {
    const right = featherAt(onRing(f.a, 0.92), f);
    return [mirrored(right), right];
  });
}

// ──────────────────────────────────────────────────────────────── the crown

/** The crown's outline: three rounded points, the middle one tallest, its foot tucked behind the bezel. */
function crownPoints(c: Crest): { v: Pt[]; radii: number[]; pearls: Pt[] } {
  const w = 1.32;
  const h = 0.88;
  const foot = topOf(bezelOf(c.cut)) + 0.32;
  const v: Pt[] = [
    [-w / 2, foot],
    [-w * 0.42, foot - h * 0.72],
    [-w * 0.2, foot - h * 0.44],
    [0, foot - h],
    [w * 0.2, foot - h * 0.44],
    [w * 0.42, foot - h * 0.72],
    [w / 2, foot],
  ];
  return {
    v,
    radii: [0, h * 0.26, h * 0.14, h * 0.3, h * 0.14, h * 0.26, 0],
    pearls: [
      [-w * 0.42, foot - h * 0.72 - 0.02],
      [0, foot - h - 0.02],
      [w * 0.42, foot - h * 0.72 - 0.02],
    ],
  };
}

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
/** A cut's outline on the canvas with its corners rounded. */
const rounded = (pl: Place, pts: readonly Pt[], r = CORNER): string => roundPath(pts.map((p) => P(pl, p)), r * pl.s);

/** How far under the bezel the laurel reaches, in the crest's units. */
const LAUREL_REACH = 0.4;

/** Every point a crest reaches, for fitting it to its square. */
function extent(c: Crest, detail: Detail): { minX: number; maxX: number; minY: number; maxY: number } {
  const rim = bezelOf(c.cut);
  const pts: Pt[] = [...rim];
  for (const [l, r] of wingsOf(c, detail)) for (const s of [l, r]) pts.push(s.up, s.down, s.tipUp, s.tipCtl, s.tipDown, s.c1);
  if (c.crown !== 'none') pts.push([0, topOf(crownPoints(c).v) - (c.crown === 'star' ? 0.34 : 0.1)]);
  if (c.base > 0) pts.push([0, footOf(rim) + LAUREL_REACH], [-1.3, footOf(rim) * 0.62], [1.3, footOf(rim) * 0.62]);
  if (c.base === 2) pts.push([0, footOf(rim) + 0.62]);
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

/**
 * Where a crest sits: as large as its box allows, never larger than the cap,
 * centred — and always on the square's middle line, so the crest's own mirror
 * line is the drawing's.
 */
export function placeCrest(c: Crest, detail: Detail, box: CrestBox): Place {
  const e = extent(c, detail);
  const half = Math.max(-e.minX, e.maxX);
  const s = Math.min(box.cap, 56 / half, (box.bottom - box.top) / (e.maxY - e.minY));
  const oy = box.top + (box.bottom - box.top - (e.maxY - e.minY) * s) / 2 - e.minY * s;
  return { s, ox: 60, oy };
}

// ──────────────────────────────────────────────────────────────── painting it

/** A four-pointed glint. */
function sparkle(x: number, y: number, r: number): string {
  const w = r * 0.22;
  return `M${n(x)},${n(y - r)}Q${n(x + w)},${n(y - w)} ${n(x + r)},${n(y)}Q${n(x + w)},${n(y + w)} ${n(x)},${n(y + r)}Q${n(x - w)},${n(y + w)} ${n(x - r)},${n(y)}Q${n(x - w)},${n(y - w)} ${n(x)},${n(y - r)}Z`;
}

/** A circle as path data, so many can share one element. */
function dot(x: number, y: number, r: number): string {
  const d = n(r * 2);
  return `M${n(x - r)},${n(y)}a${n(r)},${n(r)} 0 1 0 ${d},0a${n(r)},${n(r)} 0 1 0 -${d},0Z`;
}

/** Each drawing's metals, so the bezel, the crown and the plaque share one. */
const METALS = new WeakMap<Drawing, Map<Metal, string>>();

/** A metal lit from straight above, across whatever shape it fills: what the bezel, the crown and the plaque are made of. */
function metalDown(dr: Drawing, m: Metal): string {
  const mine = METALS.get(dr) ?? new Map<Metal, string>();
  METALS.set(dr, mine);
  const known = mine.get(m);
  if (known) return known;
  const id = dr.id('m');
  dr.def(
    linearBox(id, [
      [0, m.hi],
      [0.3, m.light],
      [0.68, m.mid],
      [1, m.dark],
    ]),
  );
  mine.set(m, id);
  return id;
}

/**
 * The stone: its ring of facets and its table split into small facets, all
 * lit from above and clipped to its rounded outline; a soft gloss over its
 * top. `table` colours the table's facets one by one when given (the
 * placement count), the stone's own light otherwise.
 */
function stone(dr: Drawing, pl: Place, cut: Cut, gem: Metal, detail: Detail, table?: (i: number) => Metal): string {
  const outer = cutPoints(cut);
  // the ring runs a little past the outline, so the rounded clip trims it cleanly
  const ring = scale(outer, 1.08);
  const inner = scale(outer, TABLE, TABLE_UP);
  const k = outer.length;
  // facets lit alike — a facet and its mirror — share an element
  const byColour = new Map<string, string>();
  const face = (pts: readonly Pt[], colour: string): void => {
    byColour.set(colour, (byColour.get(colour) ?? '') + poly(pl, pts));
  };
  for (let i = 0; i < k; i++) {
    const a = outer[i]!;
    const b = outer[(i + 1) % k]!;
    face([ring[i]!, ring[(i + 1) % k]!, inner[(i + 1) % k]!, inner[i]!], shade(gem, litBy(outward(a, b, [0, 0])) * 0.85));
  }
  if (detail === 2 && !table) {
    face(inner, mix(gem.light, gem.mid, 0.3));
  } else {
    for (let i = 0; i < k; i++) {
      const a = inner[i]!;
      const b = inner[(i + 1) % k]!;
      const g = table ? table(i) : gem;
      face([APEX, a, b], mix(g.mid, g.hi, Math.max(0, (litBy(outward(a, b, APEX)) + 1) / 2) * 0.8));
    }
  }
  const faces = [...byColour].map(([colour, d]) => `<path d="${d}" fill="${colour}"/>`);
  if (detail < 2) {
    const gloss = dr.id('g');
    dr.def(linearAt(gloss, [[0, '#ffffff', 0.42], [1, '#ffffff', 0]], 0, P(pl, [0, -0.66])[1], 0, P(pl, [0, -0.22])[1]));
    const [gx, gy] = P(pl, [0, -0.44]);
    faces.push(`<ellipse cx="${n(gx)}" cy="${n(gy)}" rx="${n(pl.s * 0.62)}" ry="${n(pl.s * 0.24)}" fill="url(#${gloss})"/>`);
  }
  const outline = rounded(pl, outer);
  const clip = dr.clip(outline);
  return (
    `<g clip-path="url(#${clip})">${faces.join('')}</g>` +
    `<path d="${outline}" fill="none" stroke="${gem.deep}" stroke-opacity="0.55" stroke-width="${n2(Math.max(0.9, pl.s * 0.04))}" stroke-linejoin="round"/>`
  );
}

/**
 * Points spaced evenly along an outline, the first where it crosses the
 * middle line at the top — so they fall the same either side of the middle.
 */
function alongOutline(pts: readonly Pt[], count: number): Pt[] {
  const k = pts.length;
  const edges = pts.map((a, i) => {
    const b = pts[(i + 1) % k]!;
    return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  });
  const total = edges.reduce((sum, e) => sum + e.len, 0);
  // where the outline crosses the middle line going right across its top
  let start = 0;
  let startY = Infinity;
  let run = 0;
  for (const e of edges) {
    if (e.a[0] <= 0 && e.b[0] >= 0 && e.b[0] > e.a[0]) {
      const t = -e.a[0] / (e.b[0] - e.a[0]);
      const y = e.a[1] + (e.b[1] - e.a[1]) * t;
      if (y < startY) {
        startY = y;
        start = run + e.len * t;
      }
    }
    run += e.len;
  }
  return Array.from({ length: count }, (_, i) => {
    let at = (start + (total * i) / count) % total;
    for (const e of edges) {
      if (at <= e.len) {
        const t = e.len === 0 ? 0 : at / e.len;
        return [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t] as Pt;
      }
      at -= e.len;
    }
    return pts[0]!;
  });
}

/**
 * The bezel: the stone's outline grown out and rounded, smooth metal lit from
 * above, edged in its darkest tone, with a bright inner line where the light
 * catches it — or, from the middle of the ladder, a ring of beads set into it,
 * the badges' own.
 */
function bezel(dr: Drawing, pl: Place, c: Crest, detail: Detail): string {
  const rim = bezelOf(c.cut);
  const m = c.metal;
  const outline = rounded(pl, rim, CORNER * BEZEL);
  const id = metalDown(dr, m);
  const out = [`<path d="${outline}" fill="url(#${id})" stroke="${m.deep}" stroke-width="${n2(detail === 2 ? 2.4 : detail === 1 ? 1.8 : 1.4)}" stroke-linejoin="round"/>`];
  // a bright line where the light catches the rim — or, from the middle of the ladder, beads set into it
  if (detail === 0 && !c.beads) out.push(`<path d="${rounded(pl, scale(cutPoints(c.cut), BEZEL - 0.05), CORNER * (BEZEL - 0.05))}" fill="none" stroke="${m.hi}" stroke-opacity="0.6" stroke-width="0.9" stroke-linejoin="round"/>`);
  if (c.beads && detail < 2) {
    const mid = scale(cutPoints(c.cut), (1 + BEZEL) / 2 + 0.01);
    const count = detail === 0 ? 20 : 12;
    const r = pl.s * (detail === 0 ? 0.04 : 0.055);
    const dots = alongOutline(mid, count).map((p) => {
      const [x, y] = P(pl, p);
      return dot(x, y, r);
    });
    out.push(`<path d="${dots.join('')}" fill="${m.hi}"/>`);
  }
  return out.join('');
}

function featherPath(pl: Place, f: FeatherShape): string {
  return `M${ps(pl, f.up)}Q${ps(pl, f.c1)} ${ps(pl, f.tipUp)}Q${ps(pl, f.tipCtl)} ${ps(pl, f.tipDown)}Q${ps(pl, f.c2)} ${ps(pl, f.down)}Z`;
}
/** The upper half of a feather, from its edge to its spine: the half that catches the light. */
function featherLit(pl: Place, f: FeatherShape): string {
  return `M${ps(pl, f.up)}Q${ps(pl, f.c1)} ${ps(pl, f.tipUp)}L${ps(pl, f.end)}Q${ps(pl, f.mid)} ${ps(pl, f.foot)}Z`;
}

function wings(pl: Place, pairs: readonly [FeatherShape, FeatherShape][], m: Metal, detail: Detail): string {
  if (pairs.length === 0) return '';
  // a pair never overlaps itself, so its two feathers share their elements; where the lit half meets the shaded one is the spine
  const out = pairs.map(
    (pair) =>
      `<path d="${pair.map((f) => featherPath(pl, f)).join('')}"/>` +
      (detail < 2 ? `<path d="${pair.map((f) => featherLit(pl, f)).join('')}" fill="${m.light}"${detail === 0 ? ' stroke="none"' : ''}/>` : ''),
  );
  const edge = detail === 0 ? ` stroke="${m.deep}" stroke-opacity="0.7" stroke-width="0.9" stroke-linejoin="round"` : '';
  return `<g fill="${m.mid}"${edge}>${out.join('')}</g>`;
}

/** The crown: the badges' three rounded points, lit from above, with a pearl on each — or a star on the middle one. */
function crownOf(dr: Drawing, pl: Place, c: Crest, detail: Detail): string {
  const m = c.metal;
  const cr = crownPoints(c);
  const id = metalDown(dr, m);
  const d = roundPath(cr.v.map((p) => P(pl, p)), cr.radii.map((r) => r * pl.s));
  const out = [`<path d="${d}" fill="url(#${id})" stroke="${m.deep}" stroke-width="${n2(detail === 0 ? 1.2 : 1.6)}" stroke-linejoin="round"/>`];
  if (detail === 2) return out.join('');
  const r = pl.s * 0.1;
  const pearls = (c.crown === 'star' ? [cr.pearls[0]!, cr.pearls[2]!] : cr.pearls).map((p) => {
    const [x, y] = P(pl, p);
    return dot(x, y, r);
  });
  out.push(`<path d="${pearls.join('')}" fill="${m.hi}" stroke="${m.deep}" stroke-width="0.9"/>`);
  if (c.crown === 'star') {
    const [x, y] = P(pl, [0, topOf(cr.v) - 0.1]);
    out.push(`<path d="${softStar(x, y, pl.s * 0.3)}" fill="url(#${id})" stroke="${m.deep}" stroke-width="1.1" stroke-linejoin="round"/>`);
  }
  return out.join('');
}

/** A small stone, cut in faces lit from above, hung from the laurel. */
function smallStone(pl: Place, at: Pt, r: number, gem: Metal, m: Metal): string {
  const [x, y] = at;
  const top: Pt = [x, y - r * 1.3];
  const right: Pt = [x + r, y];
  const foot: Pt = [x, y + r * 1.3];
  const left: Pt = [x - r, y];
  const mid: Pt = [x, y - r * 0.1];
  return (
    `<path d="${poly(pl, [top, right, foot, left])}" fill="${gem.dark}" stroke="${m.deep}" stroke-width="1" stroke-linejoin="round"/>` +
    `<path d="${poly(pl, [top, right, mid])}${poly(pl, [top, mid, left])}" fill="${gem.light}"/>` +
    `<path d="${poly(pl, [left, mid, right, foot])}" fill="${gem.mid}"/>`
  );
}

/** The sun's twenty-one rays behind the crest, one straight up, fading before the square's edge. */
function rays(dr: Drawing, centre: Pt, colour: string): string {
  const [cx, cy] = centre;
  const reach = Math.min(cx, cy, 120 - cx, 120 - cy) - 1;
  const id = dr.id('o');
  dr.def(radialAt(id, [[0, colour, 0.9], [0.5, colour, 0.42], [1, colour, 0]], cx, cy, reach));
  const d: string[] = [];
  const count = 21;
  const w = (Math.PI / count) * 0.42;
  for (let i = 0; i < count; i++) {
    const a = ((i * 360) / count - 90) * (Math.PI / 180);
    d.push(`M${n(cx)},${n(cy)}L${n(cx + Math.cos(a - w) * reach)},${n(cy + Math.sin(a - w) * reach)}L${n(cx + Math.cos(a + w) * reach)},${n(cy + Math.sin(a + w) * reach)}Z`);
  }
  return `<path d="${d.join('')}" fill="url(#${id})"/>`;
}

/** The light behind a crest: a soft round glow, inside the square. */
function glowOf(dr: Drawing, centre: Pt, colour: string, opacity: number): string {
  const [cx, cy] = centre;
  const reach = Math.min(cx, cy, 120 - cx, 120 - cy) - 1;
  const id = dr.id('o');
  dr.def(radialAt(id, [[0, colour, opacity], [0.5, colour, opacity * 0.6], [1, colour, 0]], cx, cy, reach));
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(reach)}" fill="url(#${id})"/>`;
}

/**
 * What is cut into the stone: a bold white cut-out like the badges' glyphs,
 * lit from above and lifted off the stone by a shadow in its own deep tone.
 */
function glyphOn(dr: Drawing, pl: Place, glyph: Glyph, gem: Metal, detail: Detail): string {
  const size = 0.54;
  const g = glyph((x, y) => ps(pl, [x * size, y * size + 0.02]));
  const drop = n2(pl.s * 0.04);
  const rim = n2(pl.s * 0.06);
  const id = dr.id('gl');
  dr.def(linearAt(id, [[0, '#ffffff'], [1, mix(gem.hi, gem.light, 0.45)]], 0, P(pl, [0, -size])[1], 0, P(pl, [0, size])[1]));
  const width = n2((g.width ?? 0.16) * size * pl.s);
  const out: string[] = [];
  const shadow = `transform="translate(0 ${drop})"`;
  // the shadow that lifts it is under a pixel in the small drawings, so it goes there
  const lifted = detail === 0;
  if (g.faint) out.push(`<path d="${g.faint}" fill="#ffffff" fill-opacity="0.5" fill-rule="evenodd"/>`);
  if (g.fill && lifted) out.push(`<path d="${g.fill}" ${shadow} fill="${gem.deep}" fill-opacity="0.5" fill-rule="evenodd" stroke="${gem.deep}" stroke-opacity="0.5" stroke-width="${rim}" stroke-linejoin="round"/>`);
  if (g.stroke && lifted) out.push(`<path d="${g.stroke}" ${shadow} fill="none" stroke="${gem.deep}" stroke-opacity="0.5" stroke-width="${n2((g.width ?? 0.16) * size * pl.s + pl.s * 0.06)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  if (g.fill) out.push(`<path d="${g.fill}" fill="url(#${id})" fill-rule="evenodd"/>`);
  if (g.stroke) out.push(`<path d="${g.stroke}" fill="none" stroke="url(#${id})" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`);
  return out.join('');
}

export interface CrestOptions {
  detail: Detail;
  box: CrestBox;
  /** the table's facets coloured one by one (the placement count) */
  table?: (i: number) => Metal;
}

/** A whole crest, as markup, with where it was placed. */
export function crestMarkup(dr: Drawing, c: Crest, o: CrestOptions): { markup: string; place: Place } {
  const pl = placeCrest(c, o.detail, o.box);
  const out: string[] = [];
  const centre = P(pl, [0, 0]);
  const rim = bezelOf(c.cut);

  if (c.glow > 0) out.push(glowOf(dr, centre, c.gem.light, c.glow));
  if (c.rays && o.detail < 2) out.push(rays(dr, centre, c.metal.light));

  // the crest's own thickness under it, and its shadow on the page
  const pool = dr.id('w');
  const [, py] = P(pl, [0, footOf(rim)]);
  dr.def(radialAt(pool, [[0, '#000000', 0.22], [1, '#000000', 0]], centre[0], py + 2, Math.min(pl.s * 1.1, 117 - py)));
  out.push(`<ellipse cx="${n(centre[0])}" cy="${n(py + 2)}" rx="${n(pl.s * 1.1)}" ry="${n(Math.max(2, pl.s * 0.18))}" fill="url(#${pool})"/>`);
  out.push(`<path d="${rounded(pl, rim, CORNER * BEZEL)}" transform="translate(0 ${n2(o.detail === 0 ? 2.4 : 1.8)})" fill="${c.metal.deep}" fill-opacity="0.55"/>`);

  out.push(wings(pl, wingsOf(c, o.detail), c.metal, o.detail));
  // the laurel round the stone's foot, over the lowest feathers, its stem behind the bezel
  if (c.base > 0 && o.detail < 2) {
    out.push(
      laurel({
        cx: centre[0],
        cy: centre[1],
        r: pl.s * (footOf(rim) + 0.04),
        from: 84,
        to: c.base === 2 ? 34 : 42,
        leaves: o.detail === 0 ? 4 : 3,
        len: pl.s * 0.38,
        width: pl.s * 0.15,
        m: c.metal,
        edged: o.detail === 0,
      }),
    );
  }
  if (c.crown !== 'none') out.push(crownOf(dr, pl, c, o.detail));
  if (c.base === 2 && o.detail < 2) out.push(smallStone(pl, [0, footOf(rim) + 0.4], 0.17, c.gem, c.metal));

  out.push(bezel(dr, pl, c, o.detail));
  out.push(stone(dr, pl, c.cut, c.gem, o.detail, o.table));
  if (c.glyph && o.detail < 2) out.push(glyphOn(dr, pl, c.glyph, c.gem, o.detail));

  // glints, in pairs either side of the middle, from the fourth step on
  if (o.detail === 0 && c.wings >= 3) {
    const at: Pt[] = c.wings >= 5 ? [[1.42, -1.1]] : [[1.3, -0.98]];
    const marks = at.flatMap((p) => [p, mirror(p)]).map((p) => {
      const [x, y] = P(pl, p);
      return sparkle(x, y, pl.s * 0.15);
    });
    out.push(`<path d="${marks.join('')}" fill="#ffffff" fill-opacity="0.9"/>`);
  }
  return { markup: out.join(''), place: pl };
}

/**
 * A crest's outline alone, flat: a tier not reached yet. Its shape is still
 * its own — the cut, the wings, the crown — so the ladder reads, and the
 * keyhole in the middle says it waits. Drawn in two groups, the body in
 * `body` and the marks in `mark`, so a page can recolour each with one rule.
 */
export function crestSilhouette(c: Crest, detail: Detail, box: CrestBox, body: string, mark: string): string {
  const pl = placeCrest(c, detail, box);
  // small, a waiting crest keeps only its longest feathers: its outline, without the bustle
  const feathers = wingsOf(c, detail === 0 ? 0 : 2).flatMap((pair) => pair.map((f) => featherPath(pl, f)));
  const shape: string[] = [];
  // the wings quieter than the bezel, so the stone's own outline leads
  if (feathers.length > 0) shape.push(`<path d="${feathers.join('')}" fill-opacity="0.6"/>`);
  if (c.crown !== 'none') {
    const cr = crownPoints(c);
    const tops = (c.crown === 'star' ? [cr.pearls[0]!, cr.pearls[2]!] : cr.pearls).map((p) => {
      const [x, y] = P(pl, p);
      return dot(x, y, pl.s * 0.1);
    });
    if (c.crown === 'star') {
      const [x, y] = P(pl, [0, topOf(cr.v) - 0.1]);
      tops.push(softStar(x, y, pl.s * 0.3));
    }
    shape.push(`<path d="${roundPath(cr.v.map((p) => P(pl, p)), cr.radii.map((r) => r * pl.s))}${detail < 2 ? tops.join('') : ''}"/>`);
  }
  shape.push(`<path d="${rounded(pl, bezelOf(c.cut), CORNER * BEZEL)}"/>`);
  const marks: string[] = [];
  if (detail < 2) marks.push(`<path d="${rounded(pl, cutPoints(c.cut))}" fill="none" stroke-opacity="0.45" stroke-width="${n2(Math.max(1, pl.s * 0.05))}" stroke-linejoin="round"/>`);
  marks.push(`<path d="${keyhole(P(pl, [0, 0.02]), pl.s)}" stroke="none"/>`);
  return `<g fill="${body}">${shape.join('')}</g><g fill="${mark}" stroke="${mark}">${marks.join('')}</g>`;
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

/** A capsule centred on cx,cy. */
function plate(cx: number, cy: number, w: number, h: number): string {
  const r = h / 2;
  return `M${n(cx - w / 2 + r)},${n(cy - r)}H${n(cx + w / 2 - r)}A${n(r)},${n(r)} 0 0 1 ${n(cx + w / 2 - r)},${n(cy + r)}H${n(cx - w / 2 + r)}A${n(r)},${n(r)} 0 0 1 ${n(cx - w / 2 + r)},${n(cy - r)}Z`;
}

/**
 * The division under a crest, the way a badge carries its tier: a small
 * plaque of the crest's metal with stones set in it, as many lit as the
 * player has climbed — one for III, two for II, three for I — and the rest
 * empty settings, told apart by shape and fill as well as by colour.
 */
export function divisionStones(dr: Drawing, gem: Metal, m: Metal, count: number, lit: number, cx: number, cy: number, w: number, h: number, gap: number): string {
  const id = dr.id('pip');
  dr.def(linearAt(id, [[0, gem.hi], [0.45, gem.light], [1, gem.mid]], 0, cy - h / 2, 0, cy + h / 2));
  const plateW = count * w + (count - 1) * gap + h * 0.9;
  const plateH = h + 6;
  const metal = metalDown(dr, m);
  const x0 = cx - ((count - 1) * (w + gap)) / 2;
  const out = [
    `<path d="${plate(cx, cy + 1.4, plateW, plateH)}" fill="${m.deep}" fill-opacity="0.5"/>`,
    `<path d="${plate(cx, cy, plateW, plateH)}" fill="url(#${metal})" stroke="${m.deep}" stroke-width="1.2"/>`,
  ];
  for (let i = 0; i < count; i++) {
    const x = x0 + i * (w + gap);
    const d = `M${n(x)},${n(cy - h / 2)}L${n(x + w / 2)},${n(cy)}L${n(x)},${n(cy + h / 2)}L${n(x - w / 2)},${n(cy)}Z`;
    if (i < lit) {
      out.push(`<path d="${d}" fill="url(#${id})" stroke="${m.deep}" stroke-width="1.1" stroke-linejoin="round"/>`);
      out.push(`<path d="M${n(x)},${n(cy - h / 2)}L${n(x + w * 0.22)},${n(cy - h * 0.18)}L${n(x - w * 0.22)},${n(cy - h * 0.18)}Z" fill="#ffffff" fill-opacity="0.75"/>`);
    } else {
      out.push(`<path d="${d}" fill="${m.deep}" fill-opacity="0.25" stroke="${m.dark}" stroke-width="1.1" stroke-linejoin="round"/>`);
    }
  }
  return out.join('');
}
