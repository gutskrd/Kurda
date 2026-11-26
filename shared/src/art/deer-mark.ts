/**
 * Hevalo's mark: the owner's deer, his back to us and looking back over his shoulder, traced as one shape in a
 * 100-unit square (his head, antlers and ears and the curl of his body, with his eyes and the crescent between chin and
 * body cut out), so it is drawn in a single colour. It is also the apps' loader: he curls into a ball, the ball rolls
 * one turn, and he unfurls to exactly where he started.
 *
 * The curl is a morph between shapes of matched points: the trace cut into 96 segments by length, and a ball whose rim
 * and seam (his crescent, wound into a spiral) are cut at the same shares. In between, detail leaves first: the
 * difference between deer and ball is blurred along the outline more and more as he curls, so the antlers and ears
 * melt in before the body rounds and nothing in between is lumpy. Turning and squashing are transforms about the
 * ball's centre, the middle of the square, so each app can run them on its compositor.
 */
import { n } from './svg.js';

/** The square every frame of the mark is drawn in; the ball turns about its middle. */
export const DEER_MARK_VIEW = 100;

/** Below this many pixels the eyes are left out, as holes that small blur into the head. */
export const DEER_MARK_EYES_FROM = 32;

/**
 * The trace, as cubic runs (a start point, then three points per curve), cut where his crescent opens and at its tip:
 * the chin's edge of the crescent, the body's edge, then the rest of the outline round to the chin again. The outline
 * runs clockwise and his eyes the other way, so a nonzero fill cuts them out.
 */
const TRACE = {
  upper: [
    65.89, 65.22, 61.59, 65.99, 56.88, 65.52, 53.12, 64.39, 48.85, 63.1, 46.57, 60.53, 45, 59.97, 44.48, 59.79, 43.88,
    59.79, 43.54, 60.29, 43.38, 60.54, 43.28, 60.79, 43.25, 61.06
  ],
  lower: [
    43.25, 61.06, 42.91, 63.75, 48.75, 67.39, 50.56, 68.06, 53.2, 69.03, 56.23, 69.46, 58.72, 70.83
  ],
  rim: [
    58.72, 70.83, 59.32, 71.16, 59.88, 71.54, 60.4, 71.99, 66.37, 77.18, 61.31, 84.98, 56.44, 88.66, 54.27, 90.3,
    51.65, 91.68, 49.03, 92.46, 45.18, 93.6, 41.15, 94.33, 37.13, 93.9, 23.17, 92.4, 13, 78.59, 16.95, 64.84, 19.94,
    54.42, 28.88, 50.2, 30.3, 42.38, 30.97, 38.73, 27.98, 41.33, 23.56, 39.55, 19.73, 38.01, 16.47, 33.81, 16.68,
    29.55, 16.95, 24.28, 27.88, 26.92, 30.47, 29.65, 33.35, 32.7, 34.76, 30.91, 34.37, 29.5, 34.16, 28.69, 33.46,
    27.97, 32.91, 27.37, 28.84, 22.82, 24.51, 25.73, 22.25, 22.08, 21.35, 20.62, 21.03, 18.24, 22.55, 17.05, 23.26,
    16.49, 25.17, 16.68, 25.06, 15.51, 24.78, 12.59, 22.52, 9.04, 25.4, 6.63, 25.97, 6.15, 26.69, 5.97, 27.44, 6,
    31.12, 6.15, 30.16, 10.74, 31.84, 12.73, 32.77, 13.84, 35.5, 8.39, 37.82, 12.11, 39.58, 14.92, 37.71, 16.92, 37.38,
    19.71, 37.16, 21.59, 38.55, 24.51, 40.69, 24.48, 43.66, 24.45, 46.31, 21.22, 55.43, 22.5, 57.53, 22.8, 60.53,
    24.86, 62.52, 23.59, 63.23, 23.13, 63.62, 22.38, 63.89, 21.6, 65.13, 18.02, 61.48, 14.8, 63.55, 11.59, 65.88, 7.96,
    69.05, 12.75, 69.72, 11.95, 70.38, 11.15, 71.47, 3.57, 75.63, 6.65, 78.46, 8.74, 76.68, 11.99, 76.19, 14.64, 75.9,
    16.2, 81.55, 17.18, 78.63, 21.06, 76.28, 24.18, 72.01, 22.56, 68.71, 26.55, 68.2, 27.16, 67.66, 27.9, 67.83, 28.75,
    67.96, 29.42, 68.96, 31, 69.8, 30.66, 70.77, 30.25, 71.32, 28.72, 72.12, 28.01, 74.35, 26.06, 81.18, 23.02, 83.41,
    26.36, 85.83, 30, 80.84, 36.06, 77.52, 37.31, 76.26, 37.78, 73.05, 37.69, 72.7, 39.19, 72.45, 40.23, 72.85, 41.41,
    72.89, 42.46, 72.95, 44.16, 72.59, 46.31, 73.2, 47.92, 73.9, 49.79, 75.72, 50.94, 76.63, 52.68, 78.3, 55.9, 75.88,
    59.95, 73.4, 61.99, 71.33, 63.7, 68.7, 64.72, 65.89, 65.22
  ],
  eyeLeft: [
    53.35, 43.11, 52.91, 40.46, 50.66, 38.03, 48.99, 41.08, 48.02, 42.84, 48.28, 45.53, 48.64, 47.43, 48.96, 49.1,
    51.31, 51.31, 52.76, 49.28, 53.9, 47.66, 53.65, 44.94, 53.35, 43.11
  ],
  eyeRight: [
    68.33, 41.98, 67.99, 40.57, 65.97, 37.78, 64.67, 40.12, 63.55, 42.14, 63.69, 44.79, 64.27, 46.94, 64.68, 48.49,
    66.96, 50.39, 68.09, 48.28, 69.1, 46.41, 68.81, 43.94, 68.33, 41.98
  ],
} as const;

type Pt = readonly [number, number];
type Seg = readonly [Pt, Pt, Pt, Pt];

function runSegments(run: readonly number[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i + 7 < run.length; i += 6) {
    const at = (j: number): Pt => [run[i + j] as number, run[i + j + 1] as number];
    out.push([at(0), at(2), at(4), at(6)]);
  }
  return out;
}

function bezier(s: Seg, t: number): Pt {
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  return [a * s[0][0] + b * s[1][0] + c * s[2][0] + d * s[3][0], a * s[0][1] + b * s[1][1] + c * s[2][1] + d * s[3][1]];
}

const mix = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

function split(s: Seg, t: number): [Seg, Seg] {
  const ab = mix(s[0], s[1], t);
  const bc = mix(s[1], s[2], t);
  const cd = mix(s[2], s[3], t);
  const abc = mix(ab, bc, t);
  const bcd = mix(bc, cd, t);
  const m = mix(abc, bcd, t);
  return [
    [s[0], ab, abc, m],
    [m, bcd, cd, s[3]],
  ];
}

function segLength(s: Seg): number {
  let sum = 0;
  let prev = s[0];
  for (let i = 1; i <= 32; i++) {
    const p = bezier(s, i / 32);
    sum += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return sum;
}

/** A run cut into `count` segments in all: each curve into equal steps of its parameter, as many as its share of length. */
function subdivide(run: readonly Seg[], count: number): Seg[] {
  const lengths = run.map(segLength);
  const total = lengths.reduce((a, b) => a + b, 0);
  const share = lengths.map((l) => (l / total) * count);
  const counts = share.map((s) => Math.max(1, Math.floor(s)));
  const sum = (): number => counts.reduce((a, b) => a + b, 0);
  while (sum() < count) {
    let best = 0;
    for (let i = 1; i < counts.length; i++) if ((share[i] as number) - (counts[i] as number) > (share[best] as number) - (counts[best] as number)) best = i;
    counts[best] = (counts[best] as number) + 1;
  }
  while (sum() > count) {
    let best = -1;
    for (let i = 0; i < counts.length; i++) {
      if ((counts[i] as number) < 2) continue;
      if (best < 0 || (counts[i] as number) - (share[i] as number) > (counts[best] as number) - (share[best] as number)) best = i;
    }
    counts[best] = (counts[best] as number) - 1;
  }
  const out: Seg[] = [];
  run.forEach((seg, i) => {
    let rest = seg;
    for (let m = counts[i] as number; m > 1; m--) {
      const [a, b] = split(rest, 1 / m);
      out.push(a);
      rest = b;
    }
    out.push(rest);
  });
  return out;
}

/** Where each segment starts, as a share of its run's length. */
function startShares(run: readonly Seg[]): number[] {
  const lengths = run.map(segLength);
  const total = lengths.reduce((a, b) => a + b, 0);
  let at = 0;
  return lengths.map((l) => {
    const s = at / total;
    at += l;
    return s;
  });
}

/** A closed loop of segments as flat control points: each segment's start and two handles, its end being the next start. */
function flatten(loop: readonly Seg[]): Float64Array {
  const out = new Float64Array(loop.length * 6);
  loop.forEach((s, i) => out.set([s[0][0], s[0][1], s[1][0], s[1][1], s[2][0], s[2][1]], i * 6));
  return out;
}

function loopPath(c: ArrayLike<number>): string {
  let d = `M${n(c[0] as number)} ${n(c[1] as number)}`;
  for (let i = 0; i < c.length; i += 6) {
    const j = (i + 6) % c.length;
    d += `C${n(c[i + 2] as number)} ${n(c[i + 3] as number)} ${n(c[i + 4] as number)} ${n(c[i + 5] as number)} ${n(c[j] as number)} ${n(c[j + 1] as number)}`;
  }
  return `${d}Z`;
}

/* ---- the ball ------------------------------------------------------------------------------------------------- */

/** The ball he curls into: as wide as his body is, centred in the square. */
const BALL = { x: 50, y: 50, r: 32 } as const;

/**
 * The seam: his crescent wound into the ball as a spiral slit, from the rim at `from` degrees (clockwise from three
 * o'clock) round to `to`, sinking to `inner` of the radius, its half-width narrowing from `wide` to `narrow` units.
 */
const SEAM = { from: 25, to: 205, inner: 0.16, wide: 1.9, narrow: 1.2 } as const;

/** How far along a polyline each of its points is. */
function lengthsAlong(poly: readonly Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < poly.length; i++) {
    const p = poly[i - 1] as Pt;
    const q = poly[i] as Pt;
    out.push((out[i - 1] as number) + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  return out;
}

const polar = (deg: number, r: number): Pt => [BALL.x + Math.cos((deg * Math.PI) / 180) * r, BALL.y + Math.sin((deg * Math.PI) / 180) * r];
const angleOf = (p: Pt): number => Math.atan2(p[1] - BALL.y, p[0] - BALL.x);
const toRim = (p: Pt): Pt => {
  const a = angleOf(p);
  return [BALL.x + Math.cos(a) * BALL.r, BALL.y + Math.sin(a) * BALL.r];
};

/** The seam's two edges from where each crosses the rim to its round tip: the chin's (earlier on the rim) first. */
function seamEdges(): [Pt[], Pt[]] {
  const count = 200;
  const centre: Pt[] = [];
  const u: number[] = [];
  for (let i = 0; i < count; i++) {
    // It starts a little outside the ball so each edge can be cut exactly where it crosses the rim.
    const v = -0.12 + (1.12 * i) / (count - 1);
    const wind = v < 0 ? v * 0.6 : Math.pow(v, 1.2);
    u.push(v);
    centre.push(polar(SEAM.from + (SEAM.to - SEAM.from) * wind, BALL.r * (SEAM.inner + (1 - SEAM.inner) * (1 - v))));
  }
  const along = lengthsAlong(centre);
  const end = along[count - 1] as number;
  const a: Pt[] = [];
  const b: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const p = centre[Math.max(0, i - 1)] as Pt;
    const q = centre[Math.min(count - 1, i + 1)] as Pt;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const nx = -(q[1] - p[1]) / len;
    const ny = (q[0] - p[0]) / len;
    // The half-width narrows inward, then closes in a round cap.
    const v = Math.min(1, Math.max(0, u[i] as number));
    let w = SEAM.wide + (SEAM.narrow - SEAM.wide) * v;
    const intoCap = (along[i] as number) - (end - SEAM.narrow);
    if (intoCap > 0) w = SEAM.narrow * Math.sqrt(Math.max(0, 1 - (intoCap / SEAM.narrow) ** 2));
    const c = centre[i] as Pt;
    a.push([c[0] + nx * w, c[1] + ny * w]);
    b.push([c[0] - nx * w, c[1] - ny * w]);
  }
  const inside = (edge: Pt[]): Pt[] => {
    const r = edge.map((p) => Math.hypot(p[0] - BALL.x, p[1] - BALL.y));
    const i = r.findIndex((v) => v < BALL.r);
    const f = ((r[i - 1] as number) - BALL.r) / ((r[i - 1] as number) - (r[i] as number));
    return [toRim(mix(edge[i - 1] as Pt, edge[i] as Pt, f)), ...edge.slice(i)];
  };
  const [ea, eb] = [inside(a), inside(b)];
  return angleOf(ea[0] as Pt) < angleOf(eb[0] as Pt) ? [ea, eb] : [eb, ea];
}

/** The ball as three polylines matching the trace's runs: the seam's chin edge in, its body edge out, then the rim. */
function ballRuns(): [Pt[], Pt[], Pt[]] {
  const [chin, body] = seamEdges();
  const from = angleOf(body[0] as Pt);
  let to = angleOf(chin[0] as Pt);
  while (to <= from) to += 2 * Math.PI;
  const rim: Pt[] = [];
  for (let i = 0; i < 600; i++) {
    const a = from + ((to - from) * i) / 599;
    rim.push([BALL.x + Math.cos(a) * BALL.r, BALL.y + Math.sin(a) * BALL.r]);
  }
  const runs = [chin, [...body].reverse(), rim];
  // Round the seam's lips a little by blurring the whole closed outline, each run keeping its own points.
  const all = runs.flatMap((run) => run.slice(0, -1));
  let spacing = 0;
  for (let i = 0; i < all.length; i++) {
    const p = all[i] as Pt;
    const q = all[(i + 1) % all.length] as Pt;
    spacing += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  spacing /= all.length;
  const sigma = 0.9 / spacing;
  const reach = Math.ceil(3 * sigma);
  const weights: number[] = [];
  for (let o = -reach; o <= reach; o++) weights.push(Math.exp(-(o * o) / (2 * sigma * sigma)));
  const wsum = weights.reduce((x, y) => x + y, 0);
  const blurred = all.map((_, i) => {
    let x = 0;
    let y = 0;
    for (let o = -reach; o <= reach; o++) {
      const p = all[(i + o + all.length) % all.length] as Pt;
      const w = (weights[o + reach] as number) / wsum;
      x += p[0] * w;
      y += p[1] * w;
    }
    return [x, y] as Pt;
  });
  const out: Pt[][] = [];
  let at = 0;
  for (const run of runs) {
    const size = run.length - 1;
    out.push([...blurred.slice(at, at + size), blurred[(at + size) % blurred.length] as Pt]);
    at += size;
  }
  return out as [Pt[], Pt[], Pt[]];
}

/** Cubic segments along a polyline, starting at the given shares of its length, their handles along it. */
function alongPolyline(poly: readonly Pt[], shares: readonly number[]): Seg[] {
  const along = lengthsAlong(poly);
  const total = along[along.length - 1] as number;
  const at = (share: number): Pt => {
    const s = Math.min(1, Math.max(0, share)) * total;
    // The first point at or past s, found by halving.
    let lo = 1;
    let hi = along.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((along[mid] as number) < s) lo = mid + 1;
      else hi = mid;
    }
    const i = lo;
    const span = (along[i] as number) - (along[i - 1] as number);
    return mix(poly[i - 1] as Pt, poly[i] as Pt, span > 0 ? (s - (along[i - 1] as number)) / span : 0);
  };
  const stops = [...shares, 1];
  const tangent = (share: number): Pt => {
    const p = at(share - 1e-3);
    const q = at(share + 1e-3);
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
  };
  const out: Seg[] = [];
  for (let i = 0; i < shares.length; i++) {
    const s0 = stops[i] as number;
    const s1 = stops[i + 1] as number;
    const p = at(s0);
    const q = at(s1);
    const t0 = tangent(s0);
    const t1 = tangent(s1);
    const h = ((s1 - s0) * total) / 3;
    out.push([p, [p[0] + t0[0] * h, p[1] + t0[1] * h], [q[0] - t1[0] * h, q[1] - t1[1] * h], q]);
  }
  return out;
}

/* ---- the curl ------------------------------------------------------------------------------------------------- */

/** How the outline is shared out: the crescent's chin edge, its body edge, and the rest. */
const SEGMENTS = { chin: 10, body: 8, rim: 78 } as const;

/** The eyes' segments each, so they close as a matched pair of shapes. */
const EYE_SEGMENTS = 8;

/** Keyframes along the curl, evenly spaced from the deer (0) to the ball (1). */
const CURL_KEYS = 8;

/** How far the deer-to-ball difference is blurred at the end of the curl (in segments), and how that grows and fades. */
const CURL_BLUR = { segments: 14, grow: 0.4, fade: 0.9 } as const;

/** By this much of the curl his eyes have closed. */
const EYES_SHUT_AT = 0.15;

interface Shapes {
  /** The outline at each keyframe, matched point for point. */
  keys: Float64Array[];
  /** How far the outline has moved by each keyframe, as a share of the whole curl. */
  reach: number[];
  /** His eyes, open. */
  eyes: Float64Array[];
}

let shapes: Shapes | null = null;

/** Built on first use: the deer and the ball cut to matching points, and the keyframes between them. */
function curlShapes(): Shapes {
  if (shapes) return shapes;
  const chin = subdivide(runSegments(TRACE.upper), SEGMENTS.chin);
  const body = subdivide(runSegments(TRACE.lower), SEGMENTS.body);
  const rim = subdivide(runSegments(TRACE.rim), SEGMENTS.rim);
  const [ballChin, ballBody, ballRim] = ballRuns();
  const deer = flatten([...chin, ...body, ...rim]);
  const ball = flatten([
    ...alongPolyline(ballChin, startShares(chin)),
    ...alongPolyline(ballBody, startShares(body)),
    ...alongPolyline(ballRim, startShares(rim)),
  ]);
  const count = deer.length / 2;
  const dx = new Float64Array(count);
  const dy = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    dx[i] = (deer[i * 2] as number) - (ball[i * 2] as number);
    dy[i] = (deer[i * 2 + 1] as number) - (ball[i * 2 + 1] as number);
  }
  const keys = [deer];
  for (let k = 1; k < CURL_KEYS; k++) {
    const p = k / CURL_KEYS;
    // In control points, three to a segment; the blur wraps round the closed outline.
    const sigma = CURL_BLUR.segments * Math.pow(p, CURL_BLUR.grow) * 3;
    const keep = 1 - Math.pow(p, CURL_BLUR.fade);
    const reach = Math.min(Math.ceil(4 * sigma), Math.floor((count - 1) / 2));
    const weights = new Float64Array(reach * 2 + 1);
    let wsum = 0;
    for (let o = -reach; o <= reach; o++) wsum += weights[o + reach] = Math.exp(-(o * o) / (2 * sigma * sigma));
    for (let o = 0; o < weights.length; o++) weights[o] = (weights[o] as number) / wsum;
    const out = new Float64Array(deer.length);
    for (let i = 0; i < count; i++) {
      let sx = 0;
      let sy = 0;
      for (let o = -reach; o <= reach; o++) {
        let j = i + o;
        if (j < 0) j += count;
        else if (j >= count) j -= count;
        const w = weights[o + reach] as number;
        sx += (dx[j] as number) * w;
        sy += (dy[j] as number) * w;
      }
      out[i * 2] = (ball[i * 2] as number) + keep * sx;
      out[i * 2 + 1] = (ball[i * 2 + 1] as number) + keep * sy;
    }
    keys.push(out);
  }
  keys.push(ball);
  const eyes = [TRACE.eyeLeft, TRACE.eyeRight].map((run) => flatten(subdivide(runSegments(run), EYE_SEGMENTS)));
  const reach = [0];
  for (let k = 1; k < keys.length; k++) {
    const a = keys[k - 1] as Float64Array;
    const b = keys[k] as Float64Array;
    let moved = 0;
    for (let i = 0; i < count; i++) moved += Math.hypot((b[i * 2] as number) - (a[i * 2] as number), (b[i * 2 + 1] as number) - (a[i * 2 + 1] as number));
    reach.push((reach[k - 1] as number) + moved / count);
  }
  const total = reach[reach.length - 1] as number;
  shapes = { keys, reach: reach.map((r) => r / total), eyes };
  return shapes;
}

/** The outline's control points at `curl` (0 the deer, 1 the ball), between the two keyframes either side. */
function outlineAt(curl: number): Float64Array {
  const { keys } = curlShapes();
  const at = Math.min(1, Math.max(0, curl)) * CURL_KEYS;
  const k = Math.min(CURL_KEYS - 1, Math.floor(at));
  const f = at - k;
  const a = keys[k] as Float64Array;
  const b = keys[k + 1] as Float64Array;
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] as number) + ((b[i] as number) - (a[i] as number)) * f;
  return out;
}

/** An eye closing about its middle line, `shut` 0 open to 1 closed. */
function eyeAt(eye: Float64Array, shut: number): Float64Array {
  let mid = 0;
  for (let i = 1; i < eye.length; i += 2) mid += eye[i] as number;
  mid /= eye.length / 2;
  const out = Float64Array.from(eye);
  for (let i = 1; i < out.length; i += 2) out[i] = mid + ((out[i] as number) - mid) * (1 - shut);
  return out;
}

/** The mark as drawn, his eyes cut out unless `eyes` is false (for the smallest sizes, `DEER_MARK_EYES_FROM`). */
export function deerMarkPath({ eyes = true }: { eyes?: boolean } = {}): string {
  const outline = [...runSegments(TRACE.upper), ...runSegments(TRACE.lower), ...runSegments(TRACE.rim)];
  const parts = [loopPath(flatten(outline))];
  if (eyes) for (const run of [TRACE.eyeLeft, TRACE.eyeRight]) parts.push(loopPath(flatten(runSegments(run))));
  return parts.join('');
}

/**
 * The mark curled `curl` of the way into the ball (0 is exactly `deerMarkPath`, 1 the ball with his crescent wound into
 * a seam). His eyes close over the first sixth or so and are gone after it.
 */
export function deerCurlPath(curl: number, { eyes = true }: { eyes?: boolean } = {}): string {
  if (curl <= 0) return deerMarkPath({ eyes });
  const parts = [loopPath(outlineAt(curl))];
  const shut = smooth(Math.min(1, curl / EYES_SHUT_AT));
  if (eyes && shut < 1) for (const eye of curlShapes().eyes) parts.push(loopPath(eyeAt(eye, shut)));
  return parts.join('');
}

/** How finely the curl is stepped where redrawing costs something (the phone redraws only when the step changes). */
export const DEER_CURL_STEPS = 48;

/** The keyframes and eyes, for checks: each a flat list of control points, three points to a segment. */
export function deerCurlKeyframes(): { outline: readonly Float64Array[]; eyes: readonly Float64Array[] } {
  const { keys, eyes } = curlShapes();
  return { outline: keys, eyes };
}

/* ---- the loop ------------------------------------------------------------------------------------------------- */

/** One loop: curl in, one turn, unfurl, and a beat as the deer before the next. */
export const DEER_LOOP_MS = 1500;

/** The Reduce Motion version's breath, in and out, slower than the loop. */
export const DEER_BREATH_MS = 2000;

/** How faint the breath goes at its lowest. */
export const DEER_BREATH_LOW = 0.45;

/** Where in the loop (shares of it) each movement starts and ends. */
const BEATS = {
  curl: [0.03, 0.38],
  turn: [0.16, 0.82],
  squash: [0.37, 0.57],
  unfurl: [0.58, 0.93],
} as const;

/** How far the ball gives as it lands in the turn: wider, and lower by as much as it is shorter. */
const SQUASH = { x: 0.045, y: 0.05 } as const;

/** The mark's pose at a moment of the loop; transforms are about the middle of the square, applied turn first. */
export interface DeerLoopPose {
  /** How far into the ball he is curled, 0 to 1 (`deerCurlPath`). */
  curl: number;
  /** Degrees turned clockwise, 0 to 360 over the loop. */
  turn: number;
  /** Width and height scale, upright whatever the turn. */
  scaleX: number;
  scaleY: number;
  /** How far down it moves, in units of the square, so the squashed ball keeps its bottom where it was. */
  drop: number;
}

/** Smootherstep: no speed at either end, so every movement starts and lands softly. */
function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * The curl at `x` of its time: smoothstep in how far the outline has moved rather than in the curl itself, since the
 * antlers and ears change the shape most early on, so it winds in at an even pace.
 */
function curlPace(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  const moved = t * t * (3 - 2 * t);
  const { reach } = curlShapes();
  let k = 0;
  while (k < CURL_KEYS - 1 && (reach[k + 1] as number) < moved) k++;
  const span = (reach[k + 1] as number) - (reach[k] as number);
  return (k + (span > 0 ? (moved - (reach[k] as number)) / span : 0)) / CURL_KEYS;
}

const within = (t: number, [a, b]: readonly [number, number]): number => (t - a) / (b - a);

/** The pose `t` of the way through a loop (any number: it wraps), the same at 0 and 1. */
export function deerLoopAt(t: number): DeerLoopPose {
  const x = ((t % 1) + 1) % 1;
  const curl = x < 0.5 ? curlPace(within(x, BEATS.curl)) : curlPace(1 - within(x, BEATS.unfurl));
  const s = within(x, BEATS.squash);
  const give = s > 0 && s < 1 ? Math.sin(Math.PI * s) ** 2 : 0;
  const scaleY = 1 - SQUASH.y * give;
  return {
    curl,
    turn: 360 * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, within(x, BEATS.turn))))),
    scaleX: 1 + SQUASH.x * give,
    scaleY,
    drop: BALL.r * (1 - scaleY),
  };
}

/**
 * The loop sampled at `steps` + 1 evenly spaced moments, for keyframe and interpolation tables. The last is the first a
 * whole turn on, so a table that repeats meets itself without turning back.
 */
export function deerLoopTrack(steps = 60): { at: number[]; poses: DeerLoopPose[] } {
  const at = Array.from({ length: steps + 1 }, (_, i) => i / steps);
  return { at, poses: at.map((t) => (t === 1 ? { ...deerLoopAt(0), turn: 360 } : deerLoopAt(t))) };
}

/** The breath's opacity `t` of the way through it: full at the start and end, `DEER_BREATH_LOW` halfway. */
export function deerBreathAt(t: number): number {
  const x = ((t % 1) + 1) % 1;
  return 1 - (1 - DEER_BREATH_LOW) * (0.5 - 0.5 * Math.cos(2 * Math.PI * x));
}
