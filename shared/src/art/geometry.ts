/**
 * Outlines as lists of points or as rounded corners, and what is done to
 * them: moving an outline in or out by a fixed distance, walking along it at
 * even steps, and writing a rounded outline as a short exact path.
 *
 * A rim is an outline and the same outline moved in by the rim's width; the
 * beads and kilim set into a rim are placed at even steps along the middle of
 * that band. A badge's body is kept as its corners and how round each is, so
 * it is written as a dozen curves however often it is drawn, and its inset
 * stays exact; the points are only for finding where along it things go.
 */
import type { Pt } from './svg.js';
import { pt } from './svg.js';

const TAU = Math.PI * 2;

/** A circle, starting at the top and running clockwise on screen. */
export function circle(cx: number, cy: number, r: number, count = 96): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU - Math.PI / 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/**
 * A polygon with its corners rounded: each corner becomes a short curve that
 * starts `radius` before the vertex and ends `radius` after it.
 */
export function roundedPolygon(vertices: readonly Pt[], radius: number | readonly number[], segs = 6): Pt[] {
  const out: Pt[] = [];
  const count = vertices.length;
  for (let i = 0; i < count; i++) {
    const prev = vertices[(i - 1 + count) % count] as Pt;
    const v = vertices[i] as Pt;
    const next = vertices[(i + 1) % count] as Pt;
    const r = typeof radius === 'number' ? radius : (radius[i] ?? 0);
    if (r <= 0) {
      out.push(v);
      continue;
    }
    const la = Math.hypot(prev[0] - v[0], prev[1] - v[1]);
    const lb = Math.hypot(next[0] - v[0], next[1] - v[1]);
    const ta = Math.min(0.5, r / la);
    const tb = Math.min(0.5, r / lb);
    const a: Pt = [v[0] + (prev[0] - v[0]) * ta, v[1] + (prev[1] - v[1]) * ta];
    const b: Pt = [v[0] + (next[0] - v[0]) * tb, v[1] + (next[1] - v[1]) * tb];
    out.push(a);
    // a quadratic through the vertex, sampled
    for (let s = 1; s < segs; s++) {
      const t = s / segs;
      const u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * v[0] + t * t * b[0], u * u * a[1] + 2 * u * t * v[1] + t * t * b[1]]);
    }
    out.push(b);
  }
  return dedupe(out);
}

/** A regular polygon's vertices; `start` is the angle of the first one (−90° is straight up). */
export function regular(cx: number, cy: number, r: number, sides: number, startDeg = -90): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((startDeg + (360 / sides) * i) * Math.PI) / 180;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** A star's vertices, alternating outer and inner radius. */
export function star(cx: number, cy: number, outer: number, inner: number, points: number, startDeg = -90): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = ((startDeg + (180 / points) * i) * Math.PI) / 180;
    const r = i % 2 === 0 ? outer : inner;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Drops points that sit on top of the previous one; a zero-length edge has no direction. */
function dedupe(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && out.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6) out.pop();
  return out;
}

/** Shoelace area; positive means clockwise on screen (y grows downward). */
export function signedArea(points: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Pt;
    const b = points[(i + 1) % points.length] as Pt;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** The outward unit normal of each edge i → i+1. */
function edgeNormals(points: readonly Pt[]): Pt[] {
  const sign = signedArea(points) >= 0 ? 1 : -1;
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Pt;
    const b = points[(i + 1) % points.length] as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tx = (b[0] - a[0]) / len;
    const ty = (b[1] - a[1]) / len;
    out.push([ty * sign, -tx * sign]);
  }
  return out;
}

/**
 * The outline moved out by `d` (in by a negative `d`), corner by corner: each
 * point goes to where its two neighbouring edges, each moved by `d`, meet.
 * That keeps a hexagon a hexagon with straight sides, and a sharp corner is
 * capped at three times `d` so a star's points do not shoot off to infinity.
 */
export function offset(points: readonly Pt[], d: number): Pt[] {
  const normals = edgeNormals(points);
  const count = points.length;
  return points.map((p, i) => {
    const n1 = normals[(i - 1 + count) % count] as Pt;
    const n2 = normals[i] as Pt;
    const dot = n1[0] * n2[0] + n1[1] * n2[1];
    let mx = (n1[0] + n2[0]) / (1 + dot);
    let my = (n1[1] + n2[1]) / (1 + dot);
    const len = Math.hypot(mx, my);
    if (!Number.isFinite(len) || len > 3) {
      const k = Number.isFinite(len) && len > 0 ? 3 / len : 0;
      mx *= k;
      my *= k;
    }
    return [p[0] + mx * d, p[1] + my * d] as Pt;
  });
}

export function perimeter(points: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Pt;
    const b = points[(i + 1) % points.length] as Pt;
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
}

export interface Station {
  /** where on the outline */
  p: Pt;
  /** the unit normal pointing into the shape */
  inward: Pt;
  /** the direction of travel, in degrees */
  angle: number;
}

/**
 * `count` points at even steps along a closed outline, each with the direction
 * it is travelling and which way is inside. `phase` (0–1) slides them along by
 * part of a step.
 */
export function stations(points: readonly Pt[], count: number, phase = 0): Station[] {
  const sign = signedArea(points) >= 0 ? 1 : -1;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Pt;
    const b = points[(i + 1) % points.length] as Pt;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(l);
    total += l;
  }
  const out: Station[] = [];
  let seg = 0;
  let start = 0;
  for (let k = 0; k < count; k++) {
    const s = (((k + phase) / count) % 1) * total;
    while (seg < points.length - 1 && start + (lengths[seg] ?? 0) < s) {
      start += lengths[seg] ?? 0;
      seg += 1;
    }
    const a = points[seg] as Pt;
    const b = points[(seg + 1) % points.length] as Pt;
    const l = lengths[seg] || 1;
    const t = (s - start) / l;
    const tx = (b[0] - a[0]) / l;
    const ty = (b[1] - a[1]) / l;
    out.push({
      p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      inward: [-ty * sign, tx * sign],
      angle: (Math.atan2(ty, tx) * 180) / Math.PI,
    });
  }
  return out;
}

/** Points moved by a 2-D affine map: rotate by `deg` about the origin, scale, then translate. */
export function place(points: readonly Pt[], { x = 0, y = 0, deg = 0, s = 1 }: { x?: number; y?: number; deg?: number; s?: number }): Pt[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return points.map(([px, py]) => [x + (px * c - py * sn) * s, y + (px * sn + py * c) * s] as Pt);
}

/**
 * A closed path through `vertices` with each corner rounded by a quadratic
 * that starts `radius` before the vertex and ends `radius` after it — the
 * same corners `roundedPolygon` samples, written exactly. A badge's body is
 * drawn four or five times over (its shadow, rim, lip, field and clip), so a
 * path of a dozen curves instead of a hundred points is most of what keeps a
 * page of them light.
 */
export function roundPath(vertices: readonly Pt[], radius: number | readonly number[]): string {
  const count = vertices.length;
  let d = '';
  for (let i = 0; i < count; i++) {
    const prev = vertices[(i - 1 + count) % count] as Pt;
    const v = vertices[i] as Pt;
    const next = vertices[(i + 1) % count] as Pt;
    const r = typeof radius === 'number' ? radius : (radius[i] ?? 0);
    const cmd = i === 0 ? 'M' : 'L';
    if (r <= 0) {
      d += `${cmd}${pt(v)}`;
      continue;
    }
    const ta = Math.min(0.5, r / (Math.hypot(prev[0] - v[0], prev[1] - v[1]) || 1));
    const tb = Math.min(0.5, r / (Math.hypot(next[0] - v[0], next[1] - v[1]) || 1));
    const a: Pt = [v[0] + (prev[0] - v[0]) * ta, v[1] + (prev[1] - v[1]) * ta];
    const b: Pt = [v[0] + (next[0] - v[0]) * tb, v[1] + (next[1] - v[1]) * tb];
    d += `${cmd}${pt(a)}Q${pt(v)} ${pt(b)}`;
  }
  return `${d}Z`;
}

/** A rounded outline: its corners, and how round each is. */
export interface RoundShape {
  vertices: Pt[];
  radii: number[];
}

/**
 * A rounded outline moved in by `d` (out by a negative `d`): the corners move
 * as `offset` moves them, a convex corner's rounding shrinks by `d` and a
 * hollow one's grows by it, which is what keeps a rim the same width all the
 * way round.
 */
export function insetRound(shape: RoundShape, d: number): RoundShape {
  const { vertices, radii } = shape;
  const sign = signedArea(vertices) >= 0 ? 1 : -1;
  const count = vertices.length;
  return {
    vertices: offset(vertices, -d),
    radii: radii.map((r, i) => {
      const a = vertices[(i - 1 + count) % count] as Pt;
      const v = vertices[i] as Pt;
      const b = vertices[(i + 1) % count] as Pt;
      const cross = (v[0] - a[0]) * (b[1] - v[1]) - (v[1] - a[1]) * (b[0] - v[0]);
      const convex = cross * sign >= 0;
      return Math.max(0, convex ? r - d : r + d);
    }),
  };
}

/** A rounded outline placed: scaled about the origin, then moved. */
export function placeRound(shape: RoundShape, at: { x?: number; y?: number; s?: number }): RoundShape {
  const s = at.s ?? 1;
  return { vertices: place(shape.vertices, at), radii: shape.radii.map((r) => r * s) };
}
