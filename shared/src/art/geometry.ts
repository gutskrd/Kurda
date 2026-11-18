/**
 * Outlines as point lists or rounded corners: regular polygons and stars, moving an outline in or out by a fixed
 * distance, and writing a rounded outline as a short exact path. A badge body is kept as corners plus radii so its
 * inset stays exact and it is written as a dozen curves however often it is drawn.
 */
import type { Pt } from './svg.js';
import { pt } from './svg.js';

/** Degrees to radians. */
export const rad = (deg: number): number => (deg * Math.PI) / 180;

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
 * The outline moved out by `d` (in for a negative `d`): each point goes to where its two neighbouring edges, each
 * moved by `d`, meet, which keeps straight sides straight. Sharp corners are capped at three times `d` so a star's
 * points do not shoot off.
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

/** Points moved by a 2-D affine map: rotate by `deg` about the origin, scale, then translate. */
export function place(points: readonly Pt[], { x = 0, y = 0, deg = 0, s = 1 }: { x?: number; y?: number; deg?: number; s?: number }): Pt[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return points.map(([px, py]) => [x + (px * c - py * sn) * s, y + (px * sn + py * c) * s] as Pt);
}

/**
 * A closed path through `vertices` with each corner rounded by a quadratic from `radius` before the vertex to `radius`
 * after it. A badge body is drawn four or five times (shadow, rim, lip, field, clip), so a dozen exact curves instead of
 * sampled points keeps a page of badges light.
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

/** A rounded outline: its corners, and each corner's radius. */
export interface RoundShape {
  vertices: Pt[];
  radii: number[];
}

/**
 * A rounded outline moved in by `d` (out for a negative `d`): corners move as in `offset`, a convex corner's radius
 * shrinks by `d` and a concave one's grows by it, which keeps a rim the same width all the way round.
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
