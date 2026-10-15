/**
 * Kurdish kilims, woven rather than drawn.
 *
 * A kilim is a grid: each pass of weft lays one colour across a run of warps,
 * so every outline steps and every diagonal is a staircase. These rugs are
 * laid out on such a grid — cells of 5 pixels — and only then turned into
 * rectangles, so the hooked medallions, the latch hooks, the stars and the
 * borders come out with the stepped edges a weave gives them.
 *
 * Each is woven the way one of the Kurdish weaving traditions builds a
 * kilim: the Herki's great hooked guls one after another down the middle;
 * Sine's stepped central lozenge in a ground of small flowers, and its
 * flowered ivory field; Harsin's lattice of hooked diamonds; the Jaff's
 * diamonds caught in a net of white hooks; a field of the eight-point star;
 * a dark kilim of medallions under stars. The dyes are the old ones — madder,
 * indigo, weld, walnut and the undyed wool — and drift batch by batch
 * (abrash), and each is framed as a rug is: a main border between guard
 * stripes, the warp ends knotted into fringes.
 *
 * The rug lies on a floor, seen from above, its length across the picture.
 */
import { between, n, pt } from './kit.mjs';

export const CELL = 5;

/** The rug on the picture's grid of cells: where it lies. */
export const RUG = { c0: 8, c1: 247, r0: 6, r1: 137 };
// its frame, from the edge in: the selvedge (long sides) or the plain end band (ends), a guard stripe, the main
// border and a guard stripe again
const SELVEDGE = 1;
const END = 3;
const GUARD = 5;
const MAIN = 15;
const LONG = SELVEDGE + GUARD + MAIN + GUARD;
const ENDS = END + GUARD + MAIN + GUARD;
/** The field inside the frame, and its middle. */
const F = { c0: RUG.c0 + ENDS, c1: RUG.c1 - ENDS, r0: RUG.r0 + LONG, r1: RUG.r1 - LONG };
const MID = { c: Math.round((F.c0 + F.c1) / 2), r: Math.round((F.r0 + F.r1) / 2) };

class Loom {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
  }
  set(c, r, colour) {
    if (!colour) return;
    const cc = Math.round(c);
    const rr = Math.round(r);
    if (rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols) this.grid[rr][cc] = colour;
  }
  get(c, r) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols ? this.grid[r][c] : null;
  }
  /** Only inside the field: a motif in the field never spills into the borders. */
  field(c, r, colour) {
    const cc = Math.round(c);
    const rr = Math.round(r);
    if (cc >= F.c0 && cc <= F.c1 && rr >= F.r0 && rr <= F.r1) this.set(cc, rr, colour);
  }
}

// ──────────────────────────────────────────────────────────────── motifs

/**
 * A stepped lozenge round (cx, cy), `a` cells out to its side points and `b`
 * up to its top — 2:1 when `a` is twice `b`, as Sine weaves its medallions —
 * painted ring by ring by `colourAt(depth, dx, dy)`, depth 0 the outline.
 * With `flat`, cut level that many rows above and below the middle: the
 * six-sided gul.
 */
function lozenge(loom, cx, cy, a, b, colourAt, { flat = Infinity } = {}) {
  const k = a / b;
  for (let dy = -b; dy <= b; dy++) {
    if (Math.abs(dy) > flat) continue;
    for (let dx = -a; dx <= a; dx++) {
      const room = a - Math.abs(dx) - k * Math.abs(dy);
      if (room < -1e-9) continue;
      const depth = Math.min(Math.floor(room / k + 1e-9), flat - Math.abs(dy));
      const colour = colourAt(depth, dx, dy);
      if (colour) loom.field(cx + dx, cy + dy, colour);
    }
  }
}

/** Rings from a list of [width, colour] from the outline in, then what the middle holds (a colour or a function). */
const rings = (list, inner) => (depth, dx, dy) => {
  let d = depth;
  for (const [w, colour] of list) {
    if (d < w) return colour;
    d -= w;
  }
  return typeof inner === 'function' ? inner(d, dx, dy) : inner;
};

/**
 * Latch hooks off a lozenge's slanted edges, every `every` rows: each an arm
 * stepping out from the edge and turning back toward the middle row, the way
 * the hooks of a Kurdish gul curl.
 */
function hooks(loom, cx, cy, a, b, colour, every = 4, { flat = Infinity, reach = 2 } = {}) {
  const k = a / b;
  for (let dy = every; dy < Math.min(b, flat); dy += every) {
    const half = Math.floor(a - dy * k + 1e-9);
    for (const sy of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const ex = cx + sx * (half + 1);
        const ey = cy + sy * dy;
        for (let i = 0; i < reach; i++) loom.field(ex + sx * i, ey, colour);
        loom.field(ex + sx * (reach - 1), ey - sy, colour);
        loom.field(ex + sx * (reach - 1), ey - sy * 2, colour);
      }
    }
  }
}

/**
 * What links two guls point to point: a stem from the one to the other, and
 * on it a small lozenge of its own, hooked above and below.
 */
function link(loom, x0, x1, cy, colour, outline) {
  for (let x = x0 + 1; x < x1; x++) loom.field(x, cy, outline);
  const mx = Math.round((x0 + x1) / 2);
  const r = Math.max(2, Math.min(4, Math.floor((x1 - x0) / 2) - 1));
  for (const sy of [-1, 1]) {
    loom.field(mx, cy + sy * (r + 1), outline);
    loom.field(mx - 1, cy + sy * (r + 1), outline);
    loom.field(mx + 1, cy + sy * (r + 1), outline);
  }
  lozenge(loom, mx, cy, r, r, rings([[1, outline]], colour));
}

/** Comb teeth standing up off a gul's flat top and down off its bottom. */
function comb(loom, cx, cy, half, flat, colour, every = 3) {
  for (let dx = -half + 1; dx <= half - 1; dx += every) {
    for (const sy of [-1, 1]) {
      loom.field(cx + dx, cy + sy * (flat + 1), colour);
      loom.field(cx + dx, cy + sy * (flat + 2), colour);
    }
  }
}

/** The eight-point star: a square and a lozenge laid over each other, outlined, its heart another colour. */
function star(loom, cx, cy, s, outline, body, heart) {
  const q = Math.round(s * 0.62);
  for (let dy = -s; dy <= s; dy++) {
    for (let dx = -s; dx <= s; dx++) {
      const inSquare = Math.abs(dx) <= q && Math.abs(dy) <= q;
      const inLozenge = Math.abs(dx) + Math.abs(dy) <= s;
      if (!inSquare && !inLozenge) continue;
      const deep = (Math.abs(dx) <= q - 1 && Math.abs(dy) <= q - 1) || Math.abs(dx) + Math.abs(dy) <= s - 2;
      let colour = deep ? body : outline;
      if (heart && Math.abs(dx) + Math.abs(dy) <= Math.max(1, Math.round(s * 0.32))) colour = heart;
      loom.field(cx + dx, cy + dy, colour);
    }
  }
}

/** A small flower: its heart, four petals, and at size 2 the four between them. */
function flower(loom, cx, cy, petal, heart, size = 1) {
  loom.field(cx, cy, heart);
  for (let i = 1; i <= size; i++) {
    loom.field(cx + i, cy, petal);
    loom.field(cx - i, cy, petal);
    loom.field(cx, cy + i, petal);
    loom.field(cx, cy - i, petal);
  }
  if (size >= 2) for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) loom.field(cx + dx, cy + dy, petal);
  if (size >= 3) for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) loom.field(cx + dx, cy + dy, heart);
}

/**
 * A cross whose every arm ends in a short bar across it — the same all the
 * way round and either way over, so it never turns into a wheel.
 */
function cross(loom, cx, cy, colour, arm = 2) {
  loom.field(cx, cy, colour);
  for (const [ax, ay] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    for (let i = 1; i <= arm; i++) loom.field(cx + ax * i, cy + ay * i, colour);
    if (arm >= 2) {
      loom.field(cx + ax * arm + ay, cy + ay * arm + ax, colour);
      loom.field(cx + ax * arm - ay, cy + ay * arm - ax, colour);
    }
  }
}

/** Small motifs set over a lozenge's middle on a staggered grid, kept `margin` rows clear of its edge. */
function within(cx, cy, a, b, margin, every, draw) {
  const k = a / b;
  for (let dy = -b, row = 0; dy <= b; dy += every[1], row++) {
    for (let dx = -a + (row % 2 ? Math.floor(every[0] / 2) : 0); dx <= a; dx += every[0]) {
      if (a - Math.abs(dx) - k * Math.abs(dy) >= margin * k) draw(cx + dx, cy + dy);
    }
  }
}

/** Whether a motif of radius `rad` round (c, r) would lie on bare ground only. */
function bare(loom, c, r, rad, ground) {
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      const cc = c + dx;
      const rr = r + dy;
      if (cc < F.c0 || cc > F.c1 || rr < F.r0 || rr > F.r1) return false;
      if (loom.get(cc, rr) !== ground) return false;
    }
  }
  return true;
}

/** Fills the field with its ground. */
function ground(loom, colour) {
  for (let r = F.r0; r <= F.r1; r++) for (let c = F.c0; c <= F.c1; c++) loom.set(c, r, colour);
}

/** Small motifs over whatever ground is still bare, on a staggered grid. */
function sprinkle(loom, { ground: g, every = [9, 7], rad = 1, draw }) {
  let i = 0;
  for (let r = F.r0 + 2, row = 0; r <= F.r1 - 2; r += every[1], row++) {
    for (let c = F.c0 + 2 + (row % 2 ? Math.floor(every[0] / 2) : 0); c <= F.c1 - 2; c += every[0]) {
      if (bare(loom, c, r, rad, g)) draw(c, r, i++);
    }
  }
}

// ──────────────────────────────────────────────────────────────── frame

/**
 * One band of the frame, all the way round: `inLong` cells in from the long
 * sides and `inEnd` from the ends, `width` deep. `paint(u, v, width)` gives
 * each cell's colour — u along the band from its middle, v across it from the
 * outside in.
 */
function band(loom, inLong, inEnd, width, paint) {
  const L = RUG.c0 + inEnd;
  const R = RUG.c1 - inEnd;
  const T = RUG.r0 + inLong;
  const B = RUG.r1 - inLong;
  const midC = (L + R) / 2;
  const midR = (T + B) / 2;
  for (let r = T; r <= B; r++) {
    for (let c = L; c <= R; c++) {
      let u;
      let v;
      if (r < T + width) [u, v] = [c - midC, r - T];
      else if (r > B - width) [u, v] = [c - midC, B - r];
      else if (c < L + width) [u, v] = [r - midR, c - L];
      else if (c > R - width) [u, v] = [r - midR, R - c];
      else continue;
      loom.set(c, r, paint(Math.round(u), v, width));
    }
  }
}

const mod = (a, m) => ((a % m) + m) % m;
const turn = (list, k) => list[mod(k, list.length)];

/** Barber-pole stripes across a guard: diagonal bars of the colours in turn, between two lines. */
const barber = (line, colours, w = 2) => (u, v, width) => (v === 0 || v === width - 1 ? line : colours[Math.floor(mod(u + v, w * colours.length) / w)]);

/** Reciprocal teeth across a guard: one colour's teeth pointing in between the other's, between two lines. */
const teeth = (line, a, b, p = 6) => (u, v, width) => {
  if (v === 0 || v === width - 1) return line;
  const inner = width - 2;
  const x = Math.abs(mod(u, p) - (p - 1) / 2);
  return x <= ((inner - v) * (p / 2)) / inner ? a : b;
};

/** A chain of hooked lozenges along the main border, their colours taking turns, a bar between each two. */
const chain = ({ ground: g, line, outline, fills, heart, dot, period = 14 }) => (u, v, width) => {
  if (v === 0 || v === width - 1) return line;
  const mid = (width - 1) / 2;
  const k = Math.round(u / period);
  const du = u - k * period;
  const dv = v - mid;
  const r = mid - 1.5;
  const d = Math.abs(du) + Math.abs(dv);
  if (d <= r) {
    if (d > r - 1) return outline;
    if (d <= 1) return heart;
    if (d > r - 3) return turn(fills, k);
    return outline;
  }
  // a little anchor off each lozenge's top and bottom points, and a bar between each two
  if (du === 0 && Math.abs(dv) <= r + 1) return outline;
  if (Math.abs(du) === 1 && Math.abs(dv) > r + 0.4 && Math.abs(dv) <= r + 1) return outline;
  if (Math.abs(du) === period / 2 && Math.abs(dv) <= 1) return dot;
  return g;
};

/** Boxes along the main border, their colours taking turns, an eight-point star in each. */
const starBoxes = ({ line, boxes, starOutline, starBody, heart, period = 14 }) => (u, v, width) => {
  if (v === 0 || v === width - 1) return line;
  const k = Math.round(u / period);
  const du = u - k * period;
  if (Math.abs(du) >= period / 2) return line;
  const s = Math.floor((width - 4) / 2);
  const dv = v - (width - 1) / 2;
  const q = Math.round(s * 0.62);
  const inSquare = Math.abs(du) <= q && Math.abs(dv) <= q;
  const inLozenge = Math.abs(du) + Math.abs(dv) <= s;
  if (!inSquare && !inLozenge) return turn(boxes, k);
  if (Math.abs(du) + Math.abs(dv) <= 1) return heart;
  const deep = (Math.abs(du) <= q - 1 && Math.abs(dv) <= q - 1) || Math.abs(du) + Math.abs(dv) <= s - 2;
  return deep ? starBody : starOutline;
};

/**
 * Reciprocal latch hooks: one colour's stepped teeth reaching down between
 * the other's reaching up, the tip of each tooth turned into a hook.
 */
const reciprocal = ({ line, a, b, period = 12 }) => (u, v, width) => {
  if (v === 0 || v === width - 1) return line;
  const inner = width - 2;
  const half = period / 2;
  const p = mod(u, period);
  const x = Math.min(p, period - p);
  const reach = Math.round(2 + (inner - 4) * (1 - x / half));
  // the tips: one more cell, and a hook turned off it to one side
  if (p === 0 && v === reach + 1) return a;
  if (p === 1 && v === Math.round(2 + (inner - 4)) + 1) return a;
  if (p === half && v === reach) return b;
  if (p === half + 1 && v === 2) return b;
  return v <= reach ? a : b;
};

/** A flowering vine meandering along the main border: a stepped stem, a flower in every bay it leaves. */
const vine = ({ ground: g, line, stem, flowers, heart, period = 16 }) => (u, v, width) => {
  if (v === 0 || v === width - 1) return line;
  const inner = width - 2;
  const k = Math.floor(u / period);
  const p = mod(u, period);
  const half = period / 2;
  const t = p < half ? p / half : (period - p) / half;
  const y = 1 + Math.round(t * (inner - 3));
  if (v === y || v === y + 1) return stem;
  const up = p < half;
  const dx = p - (up ? half * 0.5 : half * 1.5);
  const dy = v - (up ? inner - 2.5 : 3.5);
  if (Math.abs(dx) + Math.abs(dy) <= 0.6) return heart;
  if (Math.abs(dx) + Math.abs(dy) <= 2.1 && (Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6 || (Math.abs(dx) < 1.6 && Math.abs(dy) < 1.6))) return turn(flowers, k * 2 + (up ? 0 : 1));
  return g;
};

/** The whole frame: the selvedges, the plain end bands, the guards and the main border between them. */
function frame(loom, { selvedge, endBand, outerGuard, main, innerGuard }) {
  for (const side of [0, 1]) {
    for (let k = 0; k < END; k++) {
      const c = side ? RUG.c1 - k : RUG.c0 + k;
      for (let r = RUG.r0; r <= RUG.r1; r++) loom.set(c, r, endBand[k]);
    }
  }
  for (let c = RUG.c0; c <= RUG.c1; c++) {
    loom.set(c, RUG.r0, selvedge);
    loom.set(c, RUG.r1, selvedge);
  }
  band(loom, SELVEDGE, END, GUARD, outerGuard);
  band(loom, SELVEDGE + GUARD, END + GUARD, MAIN, main);
  band(loom, SELVEDGE + GUARD + MAIN, END + GUARD + MAIN, GUARD, innerGuard);
}

// ─────────────────────────────────────────────────────────────── kilims

/**
 * The kilims, each with its dyes, its field and its frame. `wool` is the
 * undyed ivory, `ink` the walnut brown-black that outlines; the rest are dyes.
 */
export const DESIGNS = {
  /** Herki: three great hooked guls one after another, linked point to point, on madder red. */
  herki: {
    dyes: { field: '#971d22', ink: '#2a1511', wool: '#eddfc1', indigo: '#1e2e5c', sky: '#5f87b6', apricot: '#de8e49', gold: '#d3a03a', green: '#3c6849' },
    weave(loom, rnd, P) {
      ground(loom, P.field);
      const a = 30;
      const flat = 19;
      const guls = [MID.c - 66, MID.c, MID.c + 66];
      for (const [i, cx] of guls.entries()) {
        const odd = i % 2 === 1;
        const [band1, band2, core] = odd ? [P.apricot, P.sky, P.indigo] : [P.indigo, P.apricot, P.field];
        hooks(loom, cx, MID.r, a, a, band1, 4, { flat, reach: 3 });
        comb(loom, cx, MID.r, a - flat, flat, band1, 3);
        lozenge(loom, cx, MID.r, a, a, rings([[1, P.ink], [2, P.wool], [4, band1], [1, P.ink], [3, band2], [1, P.ink]], core), { flat });
        // its heart: a hooked lozenge, an eight-point star in it, small lozenges and flowers round it
        lozenge(loom, cx, MID.r, 11, 7, rings([[1, P.ink], [1, P.wool], [2, odd ? P.field : P.indigo], [1, P.ink]], P.wool));
        star(loom, cx, MID.r, 3, P.ink, P.gold, odd ? P.field : P.indigo);
        for (const sx of [-1, 1]) {
          lozenge(loom, cx + sx * 15, MID.r, 2, 2, rings([[1, P.ink]], P.gold));
          for (const sy of [-1, 1]) flower(loom, cx + sx * 8, MID.r + sy * 5, odd ? P.gold : P.wool, P.ink, 1);
        }
      }
      // where two guls meet, point to point, a small lozenge links them; above and below, stars and hooked lozenges
      for (let i = 0; i < guls.length - 1; i++) link(loom, guls[i] + a, guls[i + 1] - a, MID.r, P.gold, P.ink);
      for (let i = 0; i < guls.length - 1; i++) {
        const cx = (guls[i] + guls[i + 1]) / 2;
        for (const sy of [-1, 1]) {
          star(loom, cx, MID.r + sy * 31, 5, P.ink, P.wool, P.indigo);
          for (const sx of [-1, 1]) {
            hooks(loom, cx + sx * 12, MID.r + sy * 31, 3, 3, P.gold, 2, { reach: 1 });
            lozenge(loom, cx + sx * 12, MID.r + sy * 31, 3, 3, rings([[1, P.gold]], P.ink));
          }
        }
      }
      sprinkle(loom, { ground: P.field, every: [11, 8], rad: 2, draw: (c, r, i) => flower(loom, c, r, i % 3 === 0 ? P.gold : P.wool, P.indigo, 1) });
    },
    frame: (P) => ({
      selvedge: P.ink,
      endBand: [P.ink, P.field, P.ink],
      outerGuard: barber(P.ink, [P.field, P.wool, P.indigo]),
      main: chain({ ground: P.wool, line: P.ink, outline: P.ink, fills: [P.indigo, P.field], heart: P.gold, dot: P.field }),
      innerGuard: teeth(P.ink, P.indigo, P.wool),
    }),
  },

  /** Sine: a stepped central lozenge with its finials, quartered lozenges in the corners, a ground of small flowers. */
  sine: {
    dyes: { field: '#3d1e3b', ink: '#1d0f17', wool: '#eee2c6', madder: '#a1272a', indigo: '#24365f', sky: '#7fa2c4', green: '#4b6e44', gold: '#d2a13a', rose: '#c06a62' },
    weave(loom, rnd, P) {
      ground(loom, P.field);
      // the ground: small flowers in diagonal rows, ivory, gold, blue and rose
      sprinkle(loom, { ground: P.field, every: [8, 6], rad: 1, draw: (c, r, i) => flower(loom, c, r, [P.wool, P.gold, P.sky, P.rose][i % 4], P.madder, 1) });
      // the corners: a quarter of the lozenge in each, ivory, small madder and green flowers in it
      for (const [cx, cy] of [[F.c0, F.r0], [F.c1, F.r0], [F.c0, F.r1], [F.c1, F.r1]]) {
        lozenge(loom, cx, cy, 44, 22, rings([[1, P.ink], [1, P.madder], [1, P.ink]], P.wool));
        within(cx, cy, 44, 22, 5, [8, 5], (c, r) => flower(loom, c, r, mod(c + r, 3) ? P.madder : P.green, P.gold, 1));
      }
      // the medallion: stepped 2:1, its edge serrated, ivory flowered inside, its heart a madder lozenge with a star
      lozenge(loom, MID.c, MID.r, 78, 39, rings([[1, P.ink], [2, null], [1, P.ink]], P.wool));
      lozenge(loom, MID.c, MID.r, 76, 38, (d, dx) => (d <= 1 ? (mod(dx, 4) < 2 ? P.madder : P.gold) : null));
      lozenge(loom, MID.c, MID.r, 40, 20, rings([[1, P.ink], [2, P.indigo], [1, P.ink], [2, P.gold], [1, P.ink]], P.madder));
      star(loom, MID.c, MID.r, 7, P.ink, P.wool, P.indigo);
      for (const sx of [-1, 1]) {
        // finials out along the axis, past the points
        lozenge(loom, MID.c + sx * 86, MID.r, 6, 3, rings([[1, P.ink]], P.madder));
        // flowers in the medallion's ivory, between its heart and its edge
        for (const [dx, dy, col] of [[48, 0, P.madder], [62, 0, P.indigo], [44, -7, P.green], [44, 7, P.green], [30, -12, P.indigo], [30, 12, P.indigo], [16, -18, P.madder], [16, 18, P.madder], [54, -5, P.gold], [54, 5, P.gold]]) {
          flower(loom, MID.c + sx * dx, MID.r + dy, col, P.ink, 2);
        }
      }
      for (const sy of [-1, 1]) flower(loom, MID.c, MID.r + sy * 25, P.gold, P.ink, 2);
    },
    frame: (P) => ({
      selvedge: P.ink,
      endBand: [P.ink, P.madder, P.ink],
      outerGuard: teeth(P.ink, P.wool, P.madder),
      main: vine({ ground: P.madder, line: P.ink, stem: P.green, flowers: [P.wool, P.gold, P.sky], heart: P.ink }),
      innerGuard: teeth(P.ink, P.wool, P.indigo),
    }),
  },

  /** Harsin: a lattice of hooked diamonds over the whole field, on gold. */
  harsin: {
    dyes: { field: '#c48c2c', ink: '#2b190f', wool: '#efe3c4', madder: '#9a2622', indigo: '#21386a', green: '#3c6345', brown: '#5a3218', apricot: '#df9450' },
    weave(loom, rnd, P) {
      ground(loom, P.field);
      const bodies = [P.madder, P.indigo, P.green, P.madder, P.brown, P.indigo];
      const R = 9;
      const sx = 22;
      const sy = 11;
      let i = 0;
      for (let row = 0, cy = MID.r - sy * 4; cy <= F.r1 + sy; cy += sy, row++) {
        for (let cx = MID.c - sx * 5 + (row % 2 ? sx / 2 : 0); cx <= F.c1 + sx; cx += sx) {
          const body = bodies[i++ % bodies.length];
          hooks(loom, cx, cy, R, R, P.ink, 3, { reach: 2 });
          lozenge(loom, cx, cy, R, R, rings([[1, P.ink], [1, P.wool], [4, body], [1, P.ink]], P.apricot));
          cross(loom, cx, cy, P.wool, 2);
        }
      }
      sprinkle(loom, { ground: P.field, every: [11, 11], rad: 0, draw: (c, r) => loom.field(c, r, P.ink) });
    },
    frame: (P) => ({
      selvedge: P.ink,
      endBand: [P.ink, P.field, P.ink],
      outerGuard: barber(P.ink, [P.field, P.madder, P.wool]),
      main: reciprocal({ line: P.ink, a: P.brown, b: P.field }),
      innerGuard: barber(P.ink, [P.wool, P.indigo]),
    }),
  },

  /** Jaff: a net of white latch hooks over the whole field, the diamonds it holds in four dyes, a barred cross in each, on green. */
  jaff: {
    dyes: { field: '#2c573a', ink: '#15231a', wool: '#eee3c6', madder: '#9b2a26', navy: '#1e2b52', apricot: '#dd8c48', gold: '#d2a33a', deep: '#1e3d29' },
    weave(loom, rnd, P) {
      ground(loom, P.field);
      const R = 11;
      const bodies = [P.madder, P.navy, P.field, P.apricot, P.navy, P.madder, P.deep, P.navy];
      let i = 0;
      for (let row = 0, cy = MID.r - R * 4; cy <= F.r1 + R; cy += R, row++) {
        for (let cx = MID.c - R * 10 + (row % 2 ? R : 0); cx <= F.c1 + R; cx += R * 2) {
          const body = bodies[(i++ * 3 + row) % bodies.length];
          // the white outline each diamond shares with its neighbours, and its hooks turned inward
          lozenge(loom, cx, cy, R, R, rings([[1, P.wool]], body));
          for (let k = 2; k < R - 1; k += 3) {
            for (const [ex, ey] of [[1, -1], [1, 1], [-1, 1], [-1, -1]]) {
              const x = cx + ex * k;
              const y = cy + ey * (R - k);
              loom.field(x - ex, y - ey, P.wool);
              loom.field(x - ex, y - ey * 2, P.wool);
              loom.field(x - ex * 2, y - ey * 2, P.wool);
            }
          }
          cross(loom, cx, cy, body === P.apricot ? P.navy : P.gold, 2);
          loom.field(cx, cy, P.wool);
        }
      }
    },
    frame: (P) => ({
      selvedge: P.ink,
      endBand: [P.ink, P.madder, P.ink],
      outerGuard: barber(P.ink, [P.wool, P.navy, P.madder]),
      main: starBoxes({ line: P.ink, boxes: [P.madder, P.navy], starOutline: P.ink, starBody: P.wool, heart: P.gold }),
      innerGuard: barber(P.ink, [P.wool, P.madder]),
    }),
  },

  /** A field of eight-point stars on indigo, hooked lozenges between them. */
  stars: {
    dyes: { field: '#1c3162', ink: '#0e172e', wool: '#ece1c8', madder: '#a22c2a', gold: '#d4a23a', sky: '#86acd0', green: '#3d694a', apricot: '#dd8b4b' },
    weave(loom, rnd, P) {
      ground(loom, P.field);
      const step = 46;
      for (let k = -3; k <= 3; k++) {
        const cx = MID.c + k * step;
        const odd = mod(k, 2) === 1;
        star(loom, cx, MID.r, 13, P.wool, odd ? P.gold : P.madder, null);
        star(loom, cx, MID.r, 8, P.ink, P.wool, null);
        star(loom, cx, MID.r, 4, P.ink, odd ? P.madder : P.field, P.gold);
        // between two stars, above and below their line: hooked lozenges; above and below each star, a small one
        const mx = cx + step / 2;
        for (const sy of [-1, 1]) {
          const cy = MID.r + sy * 26;
          hooks(loom, mx, cy, 8, 8, P.sky, 3);
          lozenge(loom, mx, cy, 8, 8, rings([[1, P.ink], [2, P.sky], [1, P.ink], [2, odd ? P.madder : P.gold], [1, P.ink]], P.wool));
          star(loom, cx, MID.r + sy * 30, 4, P.ink, P.apricot, P.wool);
        }
      }
      sprinkle(loom, { ground: P.field, every: [7, 6], rad: 1, draw: (c, r, i) => (i % 2 ? loom.field(c, r, P.wool) : flower(loom, c, r, P.sky, P.wool, 1)) });
    },
    frame: (P) => ({
      selvedge: P.ink,
      endBand: [P.ink, P.field, P.ink],
      outerGuard: teeth(P.ink, P.wool, P.field),
      main: starBoxes({ line: P.ink, boxes: [P.madder, P.field], starOutline: P.ink, starBody: P.wool, heart: P.gold }),
      innerGuard: barber(P.ink, [P.wool, P.madder, P.gold]),
    }),
  },

  /** Sine's flowered field: small flowers in diagonal rows all over the undyed ivory, a madder lozenge in the middle. */
  gulan: {
    dyes: { field: '#ebdfc3', ink: '#3a2418', rose: '#bf4f4e', madder: '#952a2a', indigo: '#24365f', sky: '#7c9fc2', green: '#4a6d43', gold: '#cd9b36' },
    weave(loom, rnd, P) {
      ground(loom, P.field);
      // the corners, indigo, small ivory flowers in them
      for (const [cx, cy] of [[F.c0, F.r0], [F.c1, F.r0], [F.c0, F.r1], [F.c1, F.r1]]) {
        lozenge(loom, cx, cy, 36, 18, rings([[1, P.ink], [1, P.gold], [1, P.ink]], P.indigo));
        within(cx, cy, 36, 18, 5, [8, 5], (c, r) => flower(loom, c, r, P.field, P.rose, 1));
      }
      lozenge(loom, MID.c, MID.r, 46, 23, rings([[1, P.ink], [2, P.field], [1, P.ink], [2, P.rose], [1, P.ink]], P.madder));
      flower(loom, MID.c, MID.r, P.field, P.gold, 3);
      for (const sx of [-1, 1]) for (const dx of [12, 24]) flower(loom, MID.c + sx * dx, MID.r, dx === 12 ? P.gold : P.field, P.ink, 2);
      // the flowers, in diagonal rows, each colour along its own diagonal, a leaf beside each
      const colours = [P.rose, P.indigo, P.green, P.gold, P.madder, P.sky];
      sprinkle(loom, {
        ground: P.field,
        every: [10, 7],
        rad: 2,
        draw: (c, r) => {
          flower(loom, c, r, turn(colours, Math.floor((c + r * 1.43) / 10)), P.ink, 2);
          loom.field(c + 2, r - 2, P.green);
          loom.field(c + 3, r - 3, P.green);
        },
      });
    },
    frame: (P) => ({
      selvedge: P.ink,
      endBand: [P.ink, P.rose, P.ink],
      outerGuard: barber(P.ink, [P.rose, P.field]),
      main: vine({ ground: P.indigo, line: P.ink, stem: P.green, flowers: [P.rose, P.gold, P.field], heart: P.ink }),
      innerGuard: teeth(P.ink, P.rose, P.field),
    }),
  },

  /** A night kilim: hooked medallions in ivory and rust on a ground near black, small stars of the sky round them. */
  night: {
    dyes: { field: '#1c1520', ink: '#0b070c', wool: '#e4d9c1', madder: '#8c2626', rust: '#ae512b', indigo: '#2a3e6c', gold: '#c7983a', sky: '#6c8eb6' },
    weave(loom, rnd, P) {
      ground(loom, P.field);
      const R = 26;
      const guls = [MID.c - 68, MID.c, MID.c + 68];
      for (let i = 0; i < guls.length - 1; i++) link(loom, guls[i] + R, guls[i + 1] - R, MID.r, P.gold, P.ink);
      for (const [i, cx] of guls.entries()) {
        const odd = i % 2 === 1;
        hooks(loom, cx, MID.r, R, R, P.wool, 4, { reach: 2 });
        lozenge(loom, cx, MID.r, R, R, rings([[1, P.ink], [2, P.wool], [4, odd ? P.indigo : P.rust], [1, P.ink], [2, P.gold], [1, P.ink]], odd ? P.rust : P.indigo));
        lozenge(loom, cx, MID.r, 9, 9, rings([[1, P.ink], [2, P.wool]], odd ? P.indigo : P.madder));
        star(loom, cx, MID.r, 4, P.ink, P.gold, P.wool);
      }
      // the stars of the night sky round them, small and big
      for (let k = 0; k < 140; k++) {
        const c = Math.round(between(rnd, F.c0 + 2, F.c1 - 2));
        const r = Math.round(between(rnd, F.r0 + 2, F.r1 - 2));
        const big = rnd() < 0.22;
        if (!bare(loom, c, r, big ? 3 : 1, P.field)) continue;
        if (big) star(loom, c, r, 2, P.wool, P.wool, P.gold);
        else loom.field(c, r, rnd() < 0.7 ? P.wool : P.gold);
      }
    },
    frame: (P) => ({
      selvedge: P.ink,
      endBand: [P.ink, P.rust, P.ink],
      outerGuard: barber(P.ink, [P.wool, P.field]),
      main: chain({ ground: P.rust, line: P.ink, outline: P.ink, fills: [P.wool, P.gold], heart: P.indigo, dot: P.wool }),
      innerGuard: teeth(P.ink, P.wool, P.field),
    }),
  },
};

// ──────────────────────────────────────────────────────────────── weave

/**
 * Weaves the kilim `design` onto the canvas: the rug as the loom lays it out,
 * cell by cell, a hand-woven row never quite straight, the dye drifting from
 * one batch of wool to the next, and the ribs of the weave over it all.
 * Returns where the rug lies, in pixels.
 */
export function kilim(cv, rnd, design) {
  const D = DESIGNS[design];
  const P = D.dyes;
  const loom = new Loom(Math.ceil(cv.w / CELL), Math.ceil(cv.h / CELL));
  D.weave(loom, rnd, P);
  frame(loom, D.frame(P));
  // a hand-woven row never lies quite straight: each is nudged a little from the one before
  const wobble = [];
  let w = 0;
  for (let r = 0; r < loom.rows; r++) {
    w = Math.max(-1.5, Math.min(1.5, w + between(rnd, -0.6, 0.6)));
    wobble.push(Math.round(w * 2) / 2);
  }
  const rects = [];
  for (let r = 0; r < loom.rows; r++) {
    const row = loom.grid[r];
    let c = 0;
    while (c < loom.cols) {
      const colour = row[c];
      let end = c + 1;
      while (end < loom.cols && row[end] === colour) end++;
      if (colour) rects.push(`<rect x="${n(c * CELL + wobble[r])}" y="${r * CELL}" width="${(end - c) * CELL}" height="${CELL}" fill="${colour}"/>`);
      c = end;
    }
  }
  cv.add(`<g shape-rendering="crispEdges">${rects.join('')}</g>`);
  // abrash: a new batch of wool every so often along the rug, a shade lighter or darker than the last
  const x0 = RUG.c0 * CELL;
  const x1 = (RUG.c1 + 1) * CELL;
  const y0 = RUG.r0 * CELL;
  const y1 = (RUG.r1 + 1) * CELL;
  const drift = [];
  for (let x = x0; x < x1; ) {
    const wide = between(rnd, 14, 70);
    const t = between(rnd, -0.08, 0.06);
    drift.push(`<rect x="${n(x)}" y="${y0}" width="${n(Math.min(wide, x1 - x))}" height="${y1 - y0}" fill="${t > 0 ? '#ffffff' : '#000000'}" fill-opacity="${n(Math.abs(t))}"/>`);
    x += wide;
  }
  cv.add(`<g>${drift.join('')}</g>`);
  // the weave itself: a rib over every warp, lit on top and shadowed under, and the weft's beat across it
  const weft = cv.id('weft');
  cv.def(
    `<pattern id="${weft}" width="2" height="2.5" patternUnits="userSpaceOnUse">` +
      `<rect width="2" height="0.8" fill="#ffffff" fill-opacity="0.07"/><rect y="1.7" width="2" height="0.8" fill="#000000" fill-opacity="0.18"/>` +
      `<rect x="1.4" width="0.6" height="2.5" fill="#000000" fill-opacity="0.06"/></pattern>`,
  );
  cv.add(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="url(#${weft})"/>`);
  return { x0, x1, y0, y1 };
}

/**
 * The fringes: at either end the warps knotted in bundles, the bundles hanging
 * loose beyond the knots, a little tangled, in the undyed wool.
 */
export function fringes(rnd, { colour = '#e6dac0', shade = '#b2a486' } = {}) {
  const out = [];
  const knots = [];
  const left = RUG.c0 * CELL;
  const right = (RUG.c1 + 1) * CELL;
  const top = RUG.r0 * CELL + 3;
  const bottom = (RUG.r1 + 1) * CELL - 3;
  for (const side of [-1, 1]) {
    const edge = side < 0 ? left : right;
    for (let y = top; y <= bottom; y += between(rnd, 8.5, 11)) {
      const kx = edge + side * between(rnd, 4, 6);
      knots.push(`<ellipse cx="${n(kx)}" cy="${n(y)}" rx="2.4" ry="2.1"/>`);
      // the warps gathered into the knot, and the bundle out of it
      out.push(`M${pt([edge, y - 2.6])} L${pt([kx, y])} M${pt([edge, y + 2.6])} L${pt([kx, y])}`);
      const len = between(rnd, 22, 34);
      const sway = between(rnd, -5, 5);
      for (let k = 0; k < 5; k++) {
        const spread = (k - 2) * between(rnd, 0.6, 1.2);
        const end = [kx + side * len * between(rnd, 0.85, 1), y + sway + spread * 2.2];
        out.push(`M${pt([kx, y])} Q${pt([kx + side * len * 0.5, y + spread + sway * 0.3])} ${pt(end)}`);
      }
    }
  }
  return `<path d="${out.join(' ')}" fill="none" stroke="${colour}" stroke-width="1.1" stroke-linecap="round"/><g fill="${shade}">${knots.join('')}</g>`;
}
