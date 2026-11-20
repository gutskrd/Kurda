import { n } from './svg.js';

/**
 * Bending a drawing through a smooth map of the plane, point by point: what turns a flat drawing on a round surface.
 * Every path is redrawn as cubic curves through its mapped points (lines and arcs included, long curves split first so
 * they follow the bend), ellipses and circles become such paths, and gradients laid in canvas units have their points
 * mapped. Box-relative gradients follow their shape on their own. Only what the shared art kit writes is understood:
 * paths, ellipses, circles, gradients, clip paths and groups without transforms.
 */

/** A map of the plane: where the point at `x`, `y` goes. */
export type PlaneMap = (x: number, y: number) => readonly [number, number];

type P = readonly [number, number];
/** A run of cubic curves from `start`, each [first handle, second handle, end], closed or not. */
interface Run {
  start: P;
  curves: [P, P, P][];
  closed: boolean;
}

const TOKEN = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

/** A curve longer than this, in drawing units, is split before mapping so it bends with the map. */
const SPLIT = 28;

const lineCurve = (a: P, b: P): [P, P, P] => [
  [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3],
  [a[0] + (2 * (b[0] - a[0])) / 3, a[1] + (2 * (b[1] - a[1])) / 3],
  b,
];

/** An elliptical arc as cubic curves, from the arc's endpoint form (SVG's own algorithm), each at most a quarter turn. */
function arcCurves(from: P, rx: number, ry: number, deg: number, large: boolean, sweep: boolean, to: P): [P, P, P][] {
  if (rx === 0 || ry === 0) return [lineCurve(from, to)];
  const phi = (deg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const grow = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (grow > 1) {
    rx *= Math.sqrt(grow);
    ry *= Math.sqrt(grow);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let span = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && span > 0) span -= 2 * Math.PI;
  if (sweep && span < 0) span += 2 * Math.PI;
  const pieces = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 2) - 1e-9));
  const step = span / pieces;
  const handle = (4 / 3) * Math.tan(step / 4);
  const point = (t: number): P => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const tangent = (t: number): P => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out: [P, P, P][] = [];
  for (let i = 0; i < pieces; i++) {
    const a = t1 + i * step;
    const b = a + step;
    const pa = point(a);
    const pb = i === pieces - 1 ? to : point(b);
    const ta = tangent(a);
    const tb = tangent(b);
    out.push([
      [pa[0] + handle * ta[0], pa[1] + handle * ta[1]],
      [pb[0] - handle * tb[0], pb[1] - handle * tb[1]],
      pb,
    ]);
  }
  return out;
}

/** Path data as runs of cubic curves in canvas units. */
export function pathRuns(d: string): Run[] {
  const tokens = d.match(TOKEN) ?? [];
  const runs: Run[] = [];
  let i = 0;
  let cmd = '';
  let cur: P = [0, 0];
  let start: P = [0, 0];
  let run: Run | null = null;
  // The last curve's second handle and the last quadratic's handle, for the smooth commands.
  let lastCubic: P | null = null;
  let lastQuad: P | null = null;
  const num = (): number => Number(tokens[i++]);
  const open = (): Run => {
    if (!run) {
      run = { start: cur, curves: [], closed: false };
      runs.push(run);
    }
    return run;
  };
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        if (run) {
          const r: Run = run;
          const last = r.curves.length ? r.curves[r.curves.length - 1]![2] : r.start;
          if (Math.hypot(last[0] - start[0], last[1] - start[1]) > 1e-6) r.curves.push(lineCurve(last, start));
          r.closed = true;
        }
        cur = start;
        run = null;
        lastCubic = lastQuad = null;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cur[0] : 0;
    const oy = rel ? cur[1] : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        cur = [ox + num(), oy + num()];
        start = cur;
        run = null;
        open();
        // Further pairs after a move are lines.
        cmd = rel ? 'l' : 'L';
        lastCubic = lastQuad = null;
        break;
      }
      case 'L': {
        const to: P = [ox + num(), oy + num()];
        open().curves.push(lineCurve(cur, to));
        cur = to;
        lastCubic = lastQuad = null;
        break;
      }
      case 'H': {
        const to: P = [(rel ? cur[0] : 0) + num(), cur[1]];
        open().curves.push(lineCurve(cur, to));
        cur = to;
        lastCubic = lastQuad = null;
        break;
      }
      case 'V': {
        const to: P = [cur[0], (rel ? cur[1] : 0) + num()];
        open().curves.push(lineCurve(cur, to));
        cur = to;
        lastCubic = lastQuad = null;
        break;
      }
      case 'C': {
        const a: P = [ox + num(), oy + num()];
        const b: P = [ox + num(), oy + num()];
        const to: P = [ox + num(), oy + num()];
        open().curves.push([a, b, to]);
        cur = to;
        lastCubic = b;
        lastQuad = null;
        break;
      }
      case 'S': {
        const a: P = lastCubic ? [2 * cur[0] - lastCubic[0], 2 * cur[1] - lastCubic[1]] : cur;
        const b: P = [ox + num(), oy + num()];
        const to: P = [ox + num(), oy + num()];
        open().curves.push([a, b, to]);
        cur = to;
        lastCubic = b;
        lastQuad = null;
        break;
      }
      case 'Q': {
        const q: P = [ox + num(), oy + num()];
        const to: P = [ox + num(), oy + num()];
        open().curves.push([
          [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])],
          [to[0] + (2 / 3) * (q[0] - to[0]), to[1] + (2 / 3) * (q[1] - to[1])],
          to,
        ]);
        cur = to;
        lastQuad = q;
        lastCubic = null;
        break;
      }
      case 'T': {
        const q: P = lastQuad ? [2 * cur[0] - lastQuad[0], 2 * cur[1] - lastQuad[1]] : cur;
        const to: P = [ox + num(), oy + num()];
        open().curves.push([
          [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])],
          [to[0] + (2 / 3) * (q[0] - to[0]), to[1] + (2 / 3) * (q[1] - to[1])],
          to,
        ]);
        cur = to;
        lastQuad = q;
        lastCubic = null;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const deg = num();
        const large = num() !== 0;
        const sweep = num() !== 0;
        const to: P = [ox + num(), oy + num()];
        open().curves.push(...arcCurves(cur, rx, ry, deg, large, sweep, to));
        cur = to;
        lastCubic = lastQuad = null;
        break;
      }
      default:
        // Nothing the art kit writes; stop rather than misread the rest.
        i = tokens.length;
    }
  }
  return runs;
}

/** A cubic curve halved (de Casteljau), for one too long to bend true. */
function halve(a: P, [h1, h2, b]: [P, P, P]): [[P, P, P], [P, P, P]] {
  const mid = (p: P, q: P): P => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const ab = mid(a, h1);
  const bc = mid(h1, h2);
  const cd = mid(h2, b);
  const abc = mid(ab, bc);
  const bcd = mid(bc, cd);
  const m = mid(abc, bcd);
  return [
    [ab, abc, m],
    [bcd, cd, b],
  ];
}

/** Runs of curves mapped through `map`, as path data. */
export function mapRuns(runs: readonly Run[], map: PlaneMap): string {
  const pt = (p: P): string => {
    const [x, y] = map(p[0], p[1]);
    return `${n(x)},${n(y)}`;
  };
  return runs
    .map((r) => {
      const parts = [`M${pt(r.start)}`];
      let from = r.start;
      const emit = (c: [P, P, P], depth: number): void => {
        if (depth < 3 && Math.hypot(c[2][0] - from[0], c[2][1] - from[1]) + Math.hypot(c[0][0] - from[0], c[0][1] - from[1]) > 2 * SPLIT) {
          const [x, y] = halve(from, c);
          emit(x, depth + 1);
          emit(y, depth + 1);
          return;
        }
        parts.push(`C${pt(c[0])} ${pt(c[1])} ${pt(c[2])}`);
        from = c[2];
      };
      r.curves.forEach((c) => emit(c, 0));
      return parts.join('') + (r.closed ? 'Z' : '');
    })
    .join('');
}

/** Path data mapped through `map`. */
export const mapPath = (d: string, map: PlaneMap): string => mapRuns(pathRuns(d), map);

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1]! : null;
};
const without = (tag: string, names: readonly string[]): string => names.reduce((t, name) => t.replace(new RegExp(`\\s${name}="[^"]*"`), ''), tag);

/** An ellipse turned `deg` about `pivot`, as path data. */
function ellipseD(cx: number, cy: number, rx: number, ry: number, deg = 0, pivot: P = [cx, cy]): string {
  const k = 0.5522847498;
  const phi = (deg * Math.PI) / 180;
  const turn = (x: number, y: number): P => {
    const dx = x - pivot[0];
    const dy = y - pivot[1];
    return [pivot[0] + dx * Math.cos(phi) - dy * Math.sin(phi), pivot[1] + dx * Math.sin(phi) + dy * Math.cos(phi)];
  };
  const q = (p: P): string => `${p[0]},${p[1]}`;
  const e = (x: number, y: number): P => turn(cx + x, cy + y);
  return (
    `M${q(e(rx, 0))}` +
    `C${q(e(rx, k * ry))} ${q(e(k * rx, ry))} ${q(e(0, ry))}` +
    `C${q(e(-k * rx, ry))} ${q(e(-rx, k * ry))} ${q(e(-rx, 0))}` +
    `C${q(e(-rx, -k * ry))} ${q(e(-k * rx, -ry))} ${q(e(0, -ry))}` +
    `C${q(e(k * rx, -ry))} ${q(e(rx, -k * ry))} ${q(e(rx, 0))}Z`
  );
}

/** A `rotate(deg cx cy)` transform's numbers, or null for any other transform. */
function rotation(t: string | null): { deg: number; pivot?: P } | null {
  if (!t) return { deg: 0 };
  const m = /^rotate\(\s*([-\d.e]+)(?:[\s,]+([-\d.e]+)[\s,]+([-\d.e]+))?\s*\)$/.exec(t.trim());
  if (!m) return null;
  return { deg: Number(m[1]), pivot: m[2] != null ? [Number(m[2]), Number(m[3])] : undefined };
}

/** How much `map` stretches lengths about a point, for a gradient's reach. */
function stretchAt(map: PlaneMap, x: number, y: number): number {
  const h = 2;
  const a = map(x - h, y);
  const b = map(x + h, y);
  const c = map(x, y - h);
  const d = map(x, y + h);
  return Math.sqrt((Math.hypot(b[0] - a[0], b[1] - a[1]) / (2 * h)) * (Math.hypot(d[0] - c[0], d[1] - c[1]) / (2 * h)));
}

/**
 * Markup bent through `map`. Throws on what it cannot bend true (a transform other than an ellipse's rotation, a
 * gradient in canvas units carrying its own transform), so a drawing that changes is caught by its tests.
 */
export function mapMarkup(markup: string, map: PlaneMap): string {
  return markup.replace(/<(path|ellipse|circle|radialGradient|linearGradient|g|rect)\b[^>]*>/g, (tag, name: string) => {
    switch (name) {
      case 'path': {
        if (attr(tag, 'transform')) throw new Error('mapMarkup: a path with a transform');
        return tag.replace(/\sd="([^"]*)"/, (_, d: string) => ` d="${mapPath(d, map)}"`);
      }
      case 'ellipse':
      case 'circle': {
        const turn = rotation(attr(tag, 'transform'));
        if (!turn) throw new Error(`mapMarkup: an ${name} with a transform other than a rotation`);
        const cx = Number(attr(tag, 'cx') ?? 0);
        const cy = Number(attr(tag, 'cy') ?? 0);
        const rx = Number(attr(tag, name === 'circle' ? 'r' : 'rx'));
        const ry = Number(attr(tag, name === 'circle' ? 'r' : 'ry'));
        const rest = without(tag, ['cx', 'cy', 'rx', 'ry', 'r', 'transform']).replace(new RegExp(`^<${name}`), '<path');
        const d = mapPath(ellipseD(cx, cy, rx, ry, turn.deg, turn.pivot), map);
        return rest.replace(/^<path/, `<path d="${d}"`);
      }
      case 'radialGradient':
      case 'linearGradient': {
        if (attr(tag, 'gradientUnits') !== 'userSpaceOnUse') return tag;
        if (attr(tag, 'gradientTransform')) throw new Error('mapMarkup: a gradient in canvas units with its own transform');
        const set = (t: string, key: string, v: number): string => t.replace(new RegExp(`\\s${key}="[^"]*"`), ` ${key}="${n(v)}"`);
        if (name === 'linearGradient') {
          const [x1, y1] = map(Number(attr(tag, 'x1')), Number(attr(tag, 'y1')));
          const [x2, y2] = map(Number(attr(tag, 'x2')), Number(attr(tag, 'y2')));
          return set(set(set(set(tag, 'x1', x1), 'y1', y1), 'x2', x2), 'y2', y2);
        }
        const cx = Number(attr(tag, 'cx'));
        const cy = Number(attr(tag, 'cy'));
        const [x, y] = map(cx, cy);
        let out = set(set(set(tag, 'cx', x), 'cy', y), 'r', Number(attr(tag, 'r')) * stretchAt(map, cx, cy));
        if (attr(tag, 'fx') != null) {
          const [fx, fy] = map(Number(attr(tag, 'fx')), Number(attr(tag, 'fy')));
          out = set(set(out, 'fx', fx), 'fy', fy);
        }
        return out;
      }
      case 'g': {
        if (attr(tag, 'transform')) throw new Error('mapMarkup: a group with a transform');
        return tag;
      }
      case 'rect':
        throw new Error('mapMarkup: a rect');
      default:
        return tag;
    }
  });
}
