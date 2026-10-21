/**
 * Kurdish carpets, knotted rather than drawn.
 *
 * A pile carpet is knotted row by row, a tuft of wool round each pair of
 * warps, so its picture is a grid of knots: every outline steps, every curve
 * is drawn knot by knot. These are laid out on such a grid, 4 pixels to the
 * knot, the way the Kurdish weavers of Bijar and Senneh lay theirs out: the
 * field covered all over with the Herati — a lattice of diamonds, a rosette
 * in each, a small palmette where four of them meet and a curled leaf along
 * each side, so that the leaves of two diamonds lie in pairs across the side
 * they share — and on it a stepped medallion with its crowns and pendants,
 * and a quarter of one in each corner; round the field a main border of
 * palmettes and lozenges on a vine, between narrow guards. The colours are
 * the old dyes — madder, indigo, weld, walnut — and the undyed wool.
 *
 * The compositor gives the knots their pile (marks.mjs `pile`): each tuft a
 * little rounded, the dye drifting from one batch of wool to the next
 * (abrash), the fibre of the wool.
 *
 * The rug lies on a floor, seen from above, its length across the picture.
 */
import { between, n, pt } from './kit.mjs';

/** Pixels to the knot. */
export const KNOT = 4;
/** The rug, in knots, and its top left corner in the picture, in pixels. */
export const RUG = { x0: 42, y0: 30, cols: 299, rows: 165 };
// the frame, from the edge in: the overcast edge, the outer guard, the main border and the inner guard
const EDGE = 2;
const OUTER = 7;
const MAIN = 17;
const INNER = 5;
const FRAME = EDGE + OUTER + MAIN + INNER;
/** The field inside the frame, and its middle. */
const F = { c0: FRAME, c1: RUG.cols - 1 - FRAME, r0: FRAME, r1: RUG.rows - 1 - FRAME };
const MID = { c: (RUG.cols - 1) / 2, r: (RUG.rows - 1) / 2 };
/** The ring of plain ground kept round the medallion and the corners, so their outlines stand clear of the Herati. */
const CLEAR = 1.2;

const mod = (a, m) => ((a % m) + m) % m;

/** One of `list`, picked by a pair of whole numbers: the same pair picks the same one every time. */
function choose(list, i, j) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return list[((h ^ (h >>> 16)) >>> 0) % list.length];
}

// ──────────────────────────────────────────────────────────────── motifs

/** How far (in knots) a point lies inside a lozenge `a` knots out to its side points and `b` up to its top; negative outside. */
const lozenge = (x, y, a, b) => ((1 - Math.abs(x) / a - Math.abs(y) / b) * a * b) / Math.hypot(a, b);

/**
 * The stepped lozenge of a Kurdish medallion: a lozenge `a` knots out to its
 * side points and `b` up to its top, its outline stepping in at each `[to,
 * inset]` of `steps` — beyond `to` knots above or below its middle it is
 * `inset` knots narrower — so that it rises to its top in ledges.
 */
const stepped = (x, y, { a, b, steps }) => Math.max(...steps.map(([to, inset]) => Math.min(lozenge(x, y, a - inset, (b * (a - inset)) / a), to - Math.abs(y))));

/** A palmette lying along x: a rounded lozenge `a` knots long and `b` across, outlined, its heart another colour with a bright eye. */
function palmette(x, y, a, b, { outline, body, heart, eye }) {
  const s = Math.pow(Math.pow(Math.abs(x) / a, 1.6) + Math.pow(Math.abs(y) / b, 1.6), 1 / 1.6);
  if (s > 1) return null;
  const inward = (1 - s) * Math.min(a, b);
  if (inward < 1.05) return outline;
  if (inward < 2.3) return body;
  return Math.abs(x) + Math.abs(y) <= 1 ? eye : heart;
}

/** A rosette `radius` knots across: its petals, tipped with dots of another colour, round a bright heart. */
function rosette(x, y, radius, { petals, tips, heart }) {
  const d = Math.hypot(x, y);
  if (d > radius + 0.25) return null;
  if (d <= 1.05) return heart;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (d > radius - 1.2 && (ax < 0.5 || ay < 0.5 || Math.abs(ax - ay) < 0.5)) return tips;
  return petals;
}

/**
 * Small flowers — a heart and four petals — on a staggered grid `every`
 * [across, down] knots apart, wherever `bare(x, y)` says the ground round a
 * flower is clear.
 */
function scatter(x, y, every, { petals, heart }, bare) {
  const j = Math.round(y / every[1]);
  const shift = mod(j, 2) ? every[0] / 2 : 0;
  const i = Math.round((x - shift) / every[0]);
  const fx = i * every[0] + shift;
  const fy = j * every[1];
  const reach = Math.abs(x - fx) + Math.abs(y - fy);
  if (reach > 1 || !bare(fx, fy)) return null;
  return reach === 0 ? heart : choose(petals, i, j);
}

// ──────────────────────────────────────────────────────────────── field

/**
 * The Herati, all over the field: a lattice of diamonds `across` × `down`
 * knots, centred on the middle of the rug, with a rosette in each — dark
 * ones with a bright eye, and rings round a heart of the ground, in turn — a
 * small palmette at each point where four diamonds meet, and along each side
 * a leaf bowed toward the rosette, so that the leaves of two diamonds lie in
 * pairs across the side they share, and take its colour.
 */
function herati(c, r, H) {
  const hx = H.across / 2;
  const hy = H.down / 2;
  // in half-diagonals, the diamonds' middles are the points whose two coordinates add up to an even number
  const p = (c - MID.c) / hx;
  const q = (r - MID.r) / hy;
  const S = Math.round((p + q) / 2);
  const T = Math.round((p - q) / 2);
  const ds = (p + q) / 2 - S;
  const dt = (p - q) / 2 - T;
  const dx = Math.round(c - (MID.c + (S + T) * hx));
  const dy = Math.round(r - (MID.r + (S - T) * hy));
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  // the rosette, round: five knots across with its corners cut
  if (ax <= 2 && ay <= 2 && ax + ay < 4) {
    const rim = ax === 2 || ay === 2;
    if (mod(S, 2) === 0) return ax + ay === 0 ? choose(H.hearts, S, T) : ax + ay === 1 ? H.eye : choose(H.petals, T, S);
    return ax + ay === 0 ? H.ringHeart : rim ? choose(H.rings, T, S) : null;
  }
  // the palmettes at its points, each shared by the four diamonds that meet there
  for (const [vx, vy] of [[hx, 0], [-hx, 0], [0, hy], [0, -hy]]) {
    const near = Math.abs(dx - vx) + Math.abs(dy - vy);
    if (near <= 1) return choose(near === 0 ? H.budHearts : H.buds, S + T + vx / hx, S - T + vy / hy);
  }
  // the leaves, bowed toward the rosette, thickest in the middle
  const onT = Math.abs(dt) >= Math.abs(ds);
  const k = (onT ? ds : dt) / H.leaf;
  if (Math.abs(k) >= 1) return null;
  const off = 0.5 - Math.max(Math.abs(ds), Math.abs(dt));
  const mid = 0.12 + 0.07 * (1 - k * k);
  if (Math.abs(off - mid) > H.width * Math.pow(1 - k * k, 0.6)) return null;
  return onT ? choose(H.leaves[0], 2 * S, 2 * T + Math.sign(dt)) : choose(H.leaves[1], 2 * S + Math.sign(ds), 2 * T);
}

/** How far up the stepped lozenge `shape` reaches: the top of its narrowest step. */
const topOf = ({ a, b, steps }) => (b * (a - steps[steps.length - 1][1])) / a;

/**
 * The medallion in the middle of the field, (x, y) from its middle: a
 * stepped lozenge outlined in the undyed wool, a crown on its top and bottom
 * points, and from each side point a pendant on a short stem, an anchor at
 * its tip. Round it all a ring of plain ground; beyond that, null.
 */
function medallion(x, y, M, C) {
  const body = stepped(x, y, M.shape);
  if (body >= 0) return body < 1.3 ? C.outline : inside(x, y, M, C);
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  // the crowns, and the spike on each
  const cy = topOf(M.shape) + M.crown[1] - 1.5;
  const crown = lozenge(x, ay - cy, M.crown[0], M.crown[1]);
  if (crown >= 0) return crown < 1.1 ? C.outline : ax + Math.abs(ay - cy) < 0.5 ? C.centre : C.medallion;
  if (ax < 0.5 && ay > cy && ay < cy + M.crown[1] + 2) return C.outline;
  // the pendants: long hexagons, a lozenge in each with a vein down it
  const pc = M.shape.a + M.stem + M.pendant[0];
  const px = ax - pc;
  const pend = Math.min(lozenge(px, y, M.pendant[0], M.pendant[0] * 0.62), M.pendant[1] - ay);
  if (pend >= 0) {
    if (pend < 1.1) return C.outline;
    if (lozenge(px, y, M.pendant[0] - 4.5, 2.6) >= 0) return ay < 0.5 ? (Math.abs(px) < 1 ? C.centre : C.vein) : C.pendant;
    return C.medallion;
  }
  // the stem, and the anchor at the pendant's tip
  if (ay < 0.5 && ax > M.shape.a - 1 && ax < pc) return C.outline;
  const tip = ax - (pc + M.pendant[0]);
  if (ay < 0.5 && tip > -0.5 && tip < 2.5) return C.outline;
  if (Math.abs(tip - 2) < 0.5 && ay < 1.5) return C.outline;
  return Math.max(body, crown, pend) > -CLEAR ? C.field : null;
}

/** Inside the medallion: a four-lobed flower at its heart, a ring-flower in each quarter, a little tree on each arm pointing out, small flowers between. */
function inside(x, y, M, C) {
  const motif = insideMotif(x, y, M, C, 0);
  if (motif) return motif;
  const bare = (fx, fy) => stepped(fx, fy, M.shape) > 3.2 && !insideMotif(fx, fy, M, C, 2.2);
  return scatter(x, y, [6, 5], { petals: C.flowers, heart: C.centre }, bare) ?? C.medallion;
}

function insideMotif(x, y, M, C, margin) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  // the flower at its heart: four round lobes about a lozenge
  const [lx, ly, lr] = M.lobes;
  const flower = Math.max(lozenge(x, y, M.heart[0] + 2, M.heart[1] + 2), lr - Math.hypot(ax - lx, y), lr - Math.hypot(x, ay - ly)) + margin;
  if (flower >= 0) {
    if (flower < 1.1 + margin) return C.outline;
    const heart = lozenge(x, y, M.heart[0], M.heart[1]);
    if (heart >= 0) return ax + ay <= 1 ? C.centre : C.heart;
    return C.inner;
  }
  const d = Math.hypot(ax - M.ring[0], ay - M.ring[1]);
  const R = M.ring[2];
  if (d <= R + margin) return d > R - 1.3 ? C.ring : d > R - 2.4 ? C.medallion : d > 1.1 ? C.ringCore : C.centre;
  const tree = (u, w) => (Math.abs(w) < 0.5 + margin && u > -margin && u < 9 + margin) || (Math.abs(u - 2) < 0.5 + margin && Math.abs(w) < 2.5 + margin) || (Math.abs(u - 5) < 0.5 + margin && Math.abs(w) < 1.5 + margin);
  if (tree(ax - M.trees[0], y) || tree(ay - M.trees[1], x)) return C.outline;
  return null;
}

/**
 * A great leaf curling along a quadratic curve from `from` by `via` to `to`,
 * `width` knots across at its widest — `base` of the way along — outlined,
 * its body and its vein in the corners' colours. `margin` widens it, to keep
 * other motifs off.
 */
function sickle(x, y, { from, via, to, width, base = 0.5 }, margin, C) {
  // the nearest point of the curve, and how far along it that is
  let best = Infinity;
  let at = 0;
  let prev = from;
  const N = 24;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    const cur = [u * u * from[0] + 2 * u * t * via[0] + t * t * to[0], u * u * from[1] + 2 * u * t * via[1] + t * t * to[1]];
    const sx = cur[0] - prev[0];
    const sy = cur[1] - prev[1];
    const k = Math.max(0, Math.min(1, ((x - prev[0]) * sx + (y - prev[1]) * sy) / (sx * sx + sy * sy)));
    const d = Math.hypot(x - prev[0] - k * sx, y - prev[1] - k * sy);
    if (d < best) {
      best = d;
      at = (i - 1 + k) / N;
    }
    prev = cur;
  }
  // widest a little way from its base, tapering to a point
  const half = (width / 2) * Math.pow(Math.sin(Math.PI * Math.pow(at, Math.log(0.5) / Math.log(base))), 0.7) + margin;
  if (best > half) return null;
  if (best > half - 1.1) return C.outline;
  return best < 0.6 && at > 0.15 && at < 0.85 ? C.leafVein : C.leaf;
}

/**
 * The corners of the field: a quarter of a stepped lozenge in each, (x, y)
 * from the corner, outlined like the medallion; a rosette in its corner,
 * great leaves curling out of it along the field's edges, small flowers
 * between.
 */
function corner(x, y, S, C) {
  const d = stepped(x, y, S.shape);
  if (d < 0) return d > -CLEAR ? C.field : null;
  if (d < 1.3) return C.outline;
  const motif = (fx, fy, margin) => {
    for (const leaf of S.leaves) {
      const m = sickle(fx, fy, leaf, margin, C);
      if (m) return m;
    }
    return rosette(fx - S.rosette[0], fy - S.rosette[1], S.rosette[2] + margin, { petals: C.cornerRosette, tips: C.outline, heart: C.centre });
  };
  const bare = (fx, fy) => fx > 1 && fy > 1 && stepped(fx, fy, S.shape) > 3.2 && !motif(fx, fy, 2);
  return motif(x, y, 0) ?? scatter(x, y, [6, 5], { petals: C.cornerFlowers, heart: C.centre }, bare) ?? C.spandrel;
}

function fieldAt(c, r, D) {
  const C = D.colours;
  const k = corner(Math.min(c - F.c0, F.c1 - c), Math.min(r - F.r0, F.r1 - r), D.spandrel, C);
  if (k) return k;
  return medallion(c - MID.c, r - MID.r, D.medallion, C) ?? herati(c, r, D.herati) ?? C.field;
}

// ──────────────────────────────────────────────────────────────── frame

/**
 * The half-period that fits motifs about `target` knots apart along a band,
 * so that its corner — `span` knots from its middle — falls on a motif; with
 * `odd`, on one of the second kind, so that the motifs at the corners are
 * the main border's lozenges.
 */
function fit(span, target, odd) {
  let count = Math.max(1, Math.round(span / target));
  if (odd && count % 2 === 0) count += span / target > count ? 1 : -1;
  return span / count;
}

/**
 * The main border, `v` knots in from its outer edge and `u` along it from
 * its middle, `span` to its corner: turtle palmettes, their colours taking
 * turns, a lozenge between each two and in each corner, and a vine winding
 * through them, a bud beyond each of its bends.
 */
function mainBorder(u, v, span, C) {
  const half = fit(span, 12, true);
  const k = Math.round(u / half);
  const du = u - k * half;
  const w = v - (MAIN - 1) / 2;
  if (mod(k, 2) === 0) {
    const turtle = palmette(du, w, 6.8, 5.2, { outline: C.outline, body: C.turtles[mod(k / 2, C.turtles.length)], heart: C.rosette, eye: C.centre });
    if (turtle) return turtle;
    // its comb: teeth along its back and its belly, and a point at either end
    const s = Math.pow(Math.pow(Math.abs(du) / 6.8, 1.6) + Math.pow(Math.abs(w) / 5.2, 1.6), 1 / 1.6);
    if (s < 1.28 && Math.abs(du) < 4.5 && mod(Math.round(du), 2) === 0) return C.outline;
    if (Math.abs(w) < 0.5 && Math.abs(du) < 8.6) return C.outline;
  } else {
    const l = lozenge(du, w, 5, 5.5);
    if (l >= 0) return l < 1 ? C.outline : Math.abs(du) + Math.abs(w) <= 1 ? C.centre : C.rosette;
  }
  const amp = 5.5;
  const phase = (Math.PI * u) / half;
  const slope = ((amp * Math.PI) / half) * Math.cos(phase);
  if (Math.abs(w - amp * Math.sin(phase)) <= 0.55 * Math.hypot(1, slope)) return C.vine;
  // a bud beyond each bend
  const bend = Math.round(u / half - 0.5);
  const bx = u - (bend + 0.5) * half;
  const by = Math.abs(w) - (amp + 1.6);
  if (Math.sign(w) === (mod(bend, 2) ? -1 : 1) && Math.abs(bx) + Math.abs(by) <= 1) return Math.abs(bx) + Math.abs(by) < 0.5 ? C.centre : C.bud;
  return C.border;
}

/** The outer guard: small flowers on the undyed wool between two lines, their hearts taking turns. */
function outerGuard(u, v, span, C) {
  if (v === 0 || v === OUTER - 1) return C.line;
  const period = fit(span, 6, false);
  const k = Math.round(u / period);
  const du = Math.round(u - k * period);
  const w = v - (OUTER - 1) / 2;
  const reach = Math.abs(du) + Math.abs(w);
  if (reach === 0) return C.marks[mod(k, C.marks.length)];
  if (reach === 1) return C.marks[mod(k + 1, C.marks.length)];
  return C.guard;
}

/** The inner guard: a line of dots and dashes on the undyed wool between two lines. */
function innerGuard(u, v, span, C) {
  if (v === 0 || v === INNER - 1) return C.line;
  const period = fit(span, 4, false);
  const k = Math.round(u / period);
  const du = Math.abs(Math.round(u - k * period));
  if (v === (INNER - 1) / 2 && du <= (mod(k, 2) ? 1 : 0)) return C.marks[mod(k, C.marks.length)];
  return C.guard;
}

function frameAt(c, r, depth, C) {
  // the top and bottom bands run along the rug and the sides across it; they meet on the diagonal at each corner
  const along = Math.min(r, RUG.rows - 1 - r) <= Math.min(c, RUG.cols - 1 - c);
  const u = along ? c - MID.c : r - MID.r;
  const mid = along ? MID.c : MID.r;
  if (depth < EDGE) return C.edge;
  if (depth < EDGE + OUTER) return outerGuard(u, depth - EDGE, mid - EDGE - (OUTER - 1) / 2, C);
  if (depth < EDGE + OUTER + MAIN) return mainBorder(u, depth - EDGE - OUTER, mid - EDGE - OUTER - (MAIN - 1) / 2, C);
  return innerGuard(u, depth - EDGE - OUTER - MAIN, mid - EDGE - OUTER - MAIN - (INNER - 1) / 2, C);
}

// ─────────────────────────────────────────────────────────────── carpets

/**
 * Each part of a carpet and the dye it is knotted in, from the dyes a carpet
 * is knotted with: the field; the medallion's ground, the flower at its
 * heart, its ring-flowers, small flowers and pendants; the corners' ground,
 * leaves, rosette and small flowers; the outlines and the eyes of every
 * flower; the main border's ground, its turtle palmettes in turn, the
 * rosette colour of their hearts and of the lozenges between them, its vine
 * and buds; the guards, their marks and lines, and the overcast edge.
 */
const parts = (d, own = {}) => ({
  field: d.field,
  medallion: d.navy,
  inner: d.rose,
  heart: d.madder,
  ring: d.rose,
  ringCore: d.sky,
  flowers: [d.sky, d.ivory, d.rose],
  pendant: d.rose,
  vein: d.madder,
  spandrel: d.navy,
  leaf: d.rose,
  leafVein: d.madder,
  cornerRosette: d.madder,
  cornerFlowers: [d.sky, d.ivory, d.rose],
  outline: d.ivory,
  centre: d.gold,
  border: d.navy,
  turtles: [d.rose, d.sky],
  rosette: d.madder,
  vine: d.rose,
  bud: d.sky,
  guard: d.ivory,
  marks: [d.madder, d.navy],
  line: d.ink,
  edge: d.madder,
  ...own,
});

/** The Herati's colours, from the dyes: its rosettes, dark and ringed, the palmettes at its points, and the two kinds of leaf. */
const heratiOf = (d, own = {}) => ({
  across: 18,
  down: 16,
  leaf: 0.26,
  width: 0.055,
  petals: [d.navy],
  hearts: [d.gold, d.ivory],
  eye: d.sky,
  rings: [d.ivory, d.ivory, d.rose],
  ringHeart: d.navy,
  buds: [d.rose, d.rose, d.ivory],
  budHearts: [d.gold, d.navy],
  leaves: [[d.rose, d.rose, d.ivory], [d.rose, d.ivory, d.sky, d.green]],
  ...own,
});

/**
 * The medallion, in knots: its stepped shape, the crowns on its points, the
 * stem and the pendant ([half its length, half its height]) at each side;
 * the flower at its middle — its heart, and its lobes ([x, y, radius]: out
 * along the arms and up) — the ring-flowers ([x, y, radius]) in its quarters
 * and where the trees on its arms start.
 */
const MEDALLION = { shape: { a: 41, b: 32, steps: [[13, 0], [Infinity, 9]] }, crown: [4, 3.5], stem: 2, pendant: [13, 4.5], heart: [4.5, 3.5], lobes: [7.5, 6, 4.8], ring: [21, 7, 4.8], trees: [29, 15] };
/** The corners, in knots: the stepped shape of the quarter in each, its leaves and its rosette ([x, y, radius]). */
const SPANDREL = {
  shape: { a: 56, b: 54.6, steps: [[10, 0], [24, 8], [Infinity, 16]] },
  leaves: [
    { from: [8, 6], via: [19, 7], to: [30, 13], width: 6.5, base: 0.35 },
    { from: [8, 8], via: [13, 14], to: [21, 21], width: 6.5, base: 0.35 },
    { from: [6, 8], via: [7, 19], to: [12, 26], width: 6.5, base: 0.35 },
  ],
  rosette: [5, 5, 4],
};

/** The undyed wool, the walnut brown-black, and the dyes most of the carpets share. */
const DYES = { ivory: '#e9d7b8', ink: '#140c10', navy: '#121935', madder: '#a8241f', rose: '#cc766c', sky: '#7393c2', green: '#4b6c46', gold: '#d29a3a' };

/** A carpet from its dyes (`DYES` and its own) and what it knots in which: its parts' colours and its Herati's. */
function carpet(dyes, own = () => ({}), herati = () => ({})) {
  const d = { ...DYES, ...dyes };
  return { colours: parts(d, own(d)), herati: heratiOf(d, herati(d)), medallion: MEDALLION, spandrel: SPANDREL };
}

/** The carpets, by the colour each is named for. */
export const DESIGNS = {
  /** Madder red under a Herati of indigo, ivory and rose; the medallion, the corners and the border indigo. */
  sor: carpet({ field: '#8a1c1b' }),

  /** Aubergine under a Herati of madder and ivory; the medallion and the corners madder, the border indigo. */
  mor: carpet(
    { field: '#43183a' },
    (d) => ({
      medallion: d.madder,
      inner: d.navy,
      heart: d.rose,
      ring: d.navy,
      flowers: [d.ivory, d.sky, d.gold],
      pendant: d.navy,
      vein: d.rose,
      spandrel: d.madder,
      leaf: d.navy,
      leafVein: d.sky,
      cornerRosette: d.navy,
      cornerFlowers: [d.ivory, d.sky, d.gold],
    }),
    (d) => ({ petals: [d.madder], eye: d.gold, hearts: [d.ivory], ringHeart: d.madder, buds: [d.rose, d.sky], budHearts: [d.gold], leaves: [[d.rose, d.rose, d.ivory], [d.rose, d.sky, d.ivory]] }),
  ),

  /** Camel under a Herati of indigo and madder; the medallion and the corners indigo, the border madder. */
  zer: carpet(
    { field: '#9a7236' },
    (d) => ({
      inner: d.madder,
      heart: d.navy,
      ring: d.madder,
      flowers: [d.sky, d.ivory, d.gold],
      pendant: d.madder,
      leaf: d.madder,
      leafVein: d.navy,
      cornerFlowers: [d.sky, d.ivory, d.gold],
      border: d.madder,
      turtles: [d.sky, d.gold],
      rosette: d.navy,
      vine: d.gold,
      bud: d.ivory,
      edge: d.navy,
    }),
    (d) => ({ eye: d.sky, hearts: [d.ivory, d.gold], rings: [d.madder, d.madder, d.navy], ringHeart: d.ivory, buds: [d.madder, d.navy], budHearts: [d.ivory], leaves: [[d.madder, d.madder, d.navy], [d.madder, d.navy, d.green]] }),
  ),

  /** Deep green under a Herati of madder, ivory and gold; the medallion and the corners madder, the border indigo. */
  kesk: carpet(
    { field: '#1d432d' },
    (d) => ({
      medallion: d.madder,
      inner: d.ivory,
      heart: d.navy,
      ring: d.navy,
      flowers: [d.ivory, d.sky, d.gold],
      pendant: d.navy,
      spandrel: d.madder,
      leaf: d.navy,
      leafVein: d.sky,
      cornerRosette: d.navy,
      cornerFlowers: [d.ivory, d.sky, d.gold],
      turtles: [d.rose, d.gold],
    }),
    (d) => ({ petals: [d.madder], eye: d.gold, hearts: [d.ivory], rings: [d.ivory, d.ivory, d.gold], ringHeart: d.madder, buds: [d.rose, d.gold], budHearts: [d.madder], leaves: [[d.rose, d.ivory, d.rose], [d.gold, d.rose, d.ivory]] }),
  ),

  /** Indigo under a Herati of madder, ivory and rose, as Senneh knots it; the medallion madder, the corners ivory, the border madder. */
  sin: carpet(
    { field: '#1b2b57' },
    (d) => ({
      medallion: d.madder,
      inner: d.navy,
      heart: d.ivory,
      ring: d.ivory,
      ringCore: d.navy,
      flowers: [d.ivory, d.sky, d.gold],
      pendant: d.navy,
      vein: d.sky,
      spandrel: d.ivory,
      leaf: d.madder,
      leafVein: d.navy,
      cornerRosette: d.navy,
      cornerFlowers: [d.madder, d.navy, d.sky],
      border: d.madder,
      turtles: [d.navy, d.sky],
      rosette: d.gold,
      vine: d.gold,
      centre: d.ivory,
    }),
    (d) => ({ petals: [d.madder], eye: d.gold, hearts: [d.ivory], rings: [d.ivory, d.ivory, d.rose], ringHeart: d.madder, buds: [d.rose, d.ivory], budHearts: [d.madder, d.gold], leaves: [[d.ivory, d.rose, d.ivory], [d.rose, d.sky, d.ivory]] }),
  ),

  /** The undyed wool under a Herati of madder, rose and indigo; the medallion and the corners rose, the border indigo. */
  gulan: carpet(
    { field: '#e4d3b2', rose: '#b5444f' },
    (d) => ({
      medallion: d.rose,
      inner: d.navy,
      heart: d.ivory,
      ring: d.ivory,
      ringCore: d.navy,
      flowers: [d.ivory, d.navy, d.gold],
      pendant: d.navy,
      vein: d.ivory,
      spandrel: d.rose,
      leaf: d.ivory,
      leafVein: d.madder,
      cornerRosette: d.navy,
      cornerFlowers: [d.ivory, d.navy, d.gold],
      turtles: [d.rose, d.ivory],
    }),
    (d) => ({ eye: d.sky, hearts: [d.ivory, d.gold], rings: [d.madder, d.madder, d.rose], ringHeart: d.navy, buds: [d.rose, d.madder], budHearts: [d.navy], leaves: [[d.rose, d.rose, d.madder], [d.rose, d.green, d.sky]] }),
  ),

  /** Near black under a Herati of moonlit wool, sky and madder; the medallion and the corners the blue of the night sky, the border a deep madder. */
  seve: carpet(
    { field: '#0b0e1f', night: '#1e2e5e', madder: '#6e171c', ivory: '#cdc6b6', navy: '#0a0e1f', sky: '#6f8cc0', rose: '#9a5660' },
    (d) => ({
      medallion: d.night,
      inner: d.madder,
      heart: d.ivory,
      ring: d.ivory,
      ringCore: d.madder,
      flowers: [d.ivory, d.sky, d.gold],
      pendant: d.madder,
      vein: d.ivory,
      spandrel: d.night,
      leaf: d.sky,
      leafVein: d.navy,
      cornerRosette: d.madder,
      cornerFlowers: [d.ivory, d.sky, d.gold],
      border: d.madder,
      turtles: [d.night, d.ivory],
      rosette: d.navy,
      vine: d.sky,
      bud: d.ivory,
      edge: d.navy,
    }),
    (d) => ({ petals: [d.madder, d.night], eye: d.gold, hearts: [d.ivory], rings: [d.ivory, d.ivory, d.sky], ringHeart: d.madder, buds: [d.sky, d.ivory], budHearts: [d.gold], leaves: [[d.sky, d.ivory, d.sky], [d.ivory, d.sky, d.rose]] }),
  ),
};

/**
 * The carpet `design`, knot by knot: where it lies, the size of a knot, its
 * dyes (`palette`, the field's first) and a character for each knot, row by
 * row, naming its dye ('0' the first) — what marks.mjs `pile` knots.
 */
export function rugKnots(design) {
  const D = DESIGNS[design];
  const palette = [D.colours.field];
  const index = new Map([[D.colours.field, 0]]);
  const knots = [];
  for (let r = 0; r < RUG.rows; r++) {
    for (let c = 0; c < RUG.cols; c++) {
      const depth = Math.min(c, r, RUG.cols - 1 - c, RUG.rows - 1 - r);
      const colour = depth < FRAME ? frameAt(c, r, depth, D.colours) : fieldAt(c, r, D);
      if (!colour) throw new Error(`rug ${design}: no colour for the knot at ${c}, ${r}`);
      if (!index.has(colour)) {
        index.set(colour, palette.length);
        palette.push(colour);
      }
      knots.push(String.fromCharCode(48 + index.get(colour)));
    }
  }
  return { x0: RUG.x0, y0: RUG.y0, knot: KNOT, cols: RUG.cols, rows: RUG.rows, palette, knots: knots.join('') };
}

/**
 * The fringes: at either end the warps knotted in bundles, the bundles hanging
 * loose beyond the knots, a little tangled, in the undyed wool.
 */
export function fringes(rnd, { colour = '#e6dac0', shade = '#b2a486' } = {}) {
  const out = [];
  const knots = [];
  const left = RUG.x0;
  const right = RUG.x0 + RUG.cols * KNOT;
  const top = RUG.y0 + 3;
  const bottom = RUG.y0 + RUG.rows * KNOT - 3;
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
