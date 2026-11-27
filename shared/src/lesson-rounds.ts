/**
 * A topic's rounds: how many times over its lessons were played, shown as the bar over its stop and the apples pressed
 * into its wax seal. The bar has one piece per lesson; a piece fills as each lesson is first finished, and once the bar
 * is full the stop becomes a wax seal with its first apple. Replaying fills the next round piece by piece, and each full
 * round is pressed into the seal as another apple, up to three.
 *
 * So rounds are the fewest finishes of any one lesson (at most `TOPIC_STARS`) and pieces are the lessons finished more
 * often than that. The server computes them per topic (api/src/coursemap) and both apps draw from its numbers and from the
 * shapes here (`barPieces`), so a bar is the same everywhere.
 */

/** The most rounds a topic counts, and the most apples its seal can wear. */
export const TOPIC_STARS = 3;

export interface TopicRounds {
  /** full rounds played: every lesson finished at least this many times, at most `TOPIC_STARS` */
  rounds: number;
  /** The bar's filled pieces: lessons finished more than `rounds` times, or every piece once all rounds are played. */
  pieces: number;
}

/**
 * A topic's rounds and filled pieces from how many times each lesson was finished, in any order; no lessons, no bar.
 * Counts that are not whole non-negative numbers are read as the nearest that is, so a stray older value cannot break a
 * bar.
 */
export function topicRounds(times: readonly number[]): TopicRounds {
  if (times.length === 0) return { rounds: 0, pieces: 0 };
  const counts = times.map((t) => (Number.isFinite(t) ? Math.max(0, Math.floor(t)) : 0));
  const rounds = Math.min(TOPIC_STARS, ...counts);
  if (rounds >= TOPIC_STARS) return { rounds, pieces: counts.length };
  return { rounds, pieces: counts.filter((t) => t > rounds).length };
}

/**
 * The bar over a stop, in the stop's points (its 72-point button): a slim progress bar just above the tile, a touch
 * wider than it, `w` wide from `x`, its top at `y` (above the button) and `h` thick, cut into one piece per lesson with
 * `gap` between, so the bubble over the stop sits above it. Its two ends are round and its cuts nearly square (`cut`
 * round), so it reads as one bar. Pieces fill from the start of the line, mirrored on right-to-left pages like the path.
 */
export const PATH_BAR = { x: -2, y: -20, w: 76, h: 6, gap: 3, cut: 1.5 } as const;

/** The bar's pieces from the start: each one's left edge and width, in the stop's points; no lessons, no bar. */
export function barPieces(of: number): Array<{ x: number; w: number }> {
  if (!(of >= 1)) return [];
  const count = Math.floor(of);
  const { x, w, gap } = PATH_BAR;
  // Many lessons share the bar with narrower gaps, down to a hairline, before their pieces grow thinner than the bar is thick.
  const space = Math.max(1, Math.min(gap, (w - count * PATH_BAR.h) / Math.max(1, count - 1)));
  const each = (w - space * (count - 1)) / count;
  return Array.from({ length: count }, (_, k) => ({ x: Math.round((x + k * (each + space)) * 10) / 10, w: Math.round(each * 10) / 10 }));
}

/**
 * The apples pressed into a finished topic's seal, one for each full round, in the seal's own terms (its middle at 0, 0
 * and its radius 1): one large in the middle, two side by side a little smaller, or three of a size in a triangle, one
 * above and two below, the gaps between them the same as to the fine ring round the field. A topic finished before its
 * rounds were counted shows one. `r` is how far an apple reaches from its middle, its leaf's tip the furthest.
 */
export function sealApples(rounds: number): Array<{ x: number; y: number; r: number }> {
  const apples = Math.max(1, Math.min(TOPIC_STARS, Math.floor(rounds) || 1));
  if (apples === 1) return [{ x: 0, y: 0, r: 0.53 }];
  if (apples === 2) return [{ x: -0.3, y: 0, r: 0.285 }, { x: 0.3, y: 0, r: 0.285 }];
  // Each 0.315 from the middle, so the gaps between them and to the ring at 0.615 are alike.
  return [{ x: -0.2728, y: 0.1575, r: 0.245 }, { x: 0, y: -0.315, r: 0.245 }, { x: 0.2728, y: 0.1575, r: 0.245 }];
}

/**
 * The apple, traced from the owner's: its body as it runs round from the dip at its top down its right side, mirrored
 * for its left, the body 2 across; its stem leaning a little left, slimmer at its foot and round at its top; and its
 * leaf, a lens from beside the stem out to the upper right, fuller on its upper side. In the apple's own units, its body
 * centred across and the whole of it centred top to bottom, so it reaches `APPLE.reach` at its leaf's tip.
 */
const APPLE = {
  right: [[0, -0.794], [0.174, -0.819], [0.4, -0.858], [0.666, -0.794], [0.916, -0.529], [1.001, -0.088], [0.839, 0.391], [0.522, 0.746], [0.23, 0.859], [0, 0.831]],
  stem: { foot: [-0.005, -0.7], top: [-0.04, -1.155], footHalf: 0.03, topHalf: 0.048 },
  leaf: { base: [0.0765, -0.918], tip: [0.689, -1.3245], upper: 0.21, lower: 0.17 },
  middle: -0.249,
  reach: 1.277,
} as const;

/**
 * An apple as SVG path data, its body, stem and leaf, reaching `r` from (`x`, `y`) at its leaf's tip. The body is one
 * smooth outline through the traced points; drawn filled, the stem joins it where they overlap.
 */
export function applePath(x: number, y: number, r: number): string {
  const s = r / APPLE.reach;
  const f = (v: number): string => String(Math.round(v * 100) / 100);
  const at = ([px, py]: readonly [number, number]): string => `${f(x + px * s)} ${f(y + (py - APPLE.middle) * s)}`;
  const right = APPLE.right as readonly (readonly [number, number])[];
  const ring = [...right, ...right.slice(1, -1).reverse().map(([px, py]) => [-px, py] as const)];
  const m = ring.length;
  // Through every point, each bend set by the points either side of it.
  let body = `M${at(ring[0]!)}`;
  for (let i = 0; i < m; i++) {
    const [p0, p1, p2, p3] = [ring[(i + m - 1) % m]!, ring[i]!, ring[(i + 1) % m]!, ring[(i + 2) % m]!];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6] as const;
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6] as const;
    body += `C${at(c1)} ${at(c2)} ${at(p2)}`;
  }
  const along = (from: readonly number[], to: readonly number[]): { u: [number, number]; n: [number, number]; len: number } => {
    const len = Math.hypot(to[0]! - from[0]!, to[1]! - from[1]!);
    const u: [number, number] = [(to[0]! - from[0]!) / len, (to[1]! - from[1]!) / len];
    return { u, n: [-u[1], u[0]], len };
  };
  const { foot, top, footHalf, topHalf } = APPLE.stem;
  const st = along(foot, top);
  const side = (p: readonly number[], half: number, k: number): [number, number] => [p[0]! + st.n[0] * half * k, p[1]! + st.n[1] * half * k];
  const cap: [number, number] = [top[0] + st.u[0] * topHalf * 1.3, top[1] + st.u[1] * topHalf * 1.3];
  const stem = `M${at(side(foot, footHalf, -1))}L${at(side(top, topHalf, -1))}Q${at(cap)} ${at(side(top, topHalf, 1))}L${at(side(foot, footHalf, 1))}Z`;
  const { base, tip, upper, lower } = APPLE.leaf;
  const lf = along(base, tip);
  // A cubic's control points a third further out than the lens is wide, so its two sides bulge as far as they should.
  const on = (t: number, h: number): [number, number] => [base[0] + lf.u[0] * lf.len * t - lf.n[0] * h * (4 / 3), base[1] + lf.u[1] * lf.len * t - lf.n[1] * h * (4 / 3)];
  const leaf = `M${at(base)}C${at(on(0.22, upper))} ${at(on(0.78, upper))} ${at(tip)}C${at(on(0.78, -lower))} ${at(on(0.22, -lower))} ${at(base)}Z`;
  return `${body}Z${stem}${leaf}`;
}

/**
 * Which lesson to play next: the first unfinished one, then once all are finished the first of those finished fewest
 * times, so the next round fills lesson by lesson. -1 for a topic without lessons.
 */
export function nextInRound(times: readonly number[]): number {
  let at = -1;
  times.forEach((t, i) => {
    if (at < 0 || t < times[at]!) at = i;
  });
  return at;
}
