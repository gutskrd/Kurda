/**
 * A topic's rounds: how many times over its lessons were played, shown as the bar over its stop and the stars pressed
 * into its wax. The bar has one piece per lesson; a piece fills as each lesson is first finished, and once the bar is
 * full the stop is sealed in wax with its first star. Replaying fills the next round piece by piece, and each full round
 * is pressed into the wax as another star, up to three.
 *
 * So rounds are the fewest finishes of any one lesson (at most `TOPIC_STARS`) and pieces are the lessons finished more
 * often than that. The server computes them per topic (api/src/coursemap) and both apps draw from its numbers and from the
 * shapes here (`barPieces`), so a bar is the same everywhere.
 */

/** The most rounds a topic counts, and the most stars it can wear. */
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
export const PATH_BAR = { x: -2, y: -16, w: 76, h: 6, gap: 3, cut: 1.5 } as const;

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
 * The stars pressed into a finished topic's wax, in the stop's points, one for each full round: one large in the middle
 * of the tile's face, two side by side a little smaller, or three with the middle one higher, a small crown. A topic
 * finished before its rounds were counted shows one. `r` is a star's outer radius.
 */
export function waxStars(rounds: number): Array<{ x: number; y: number; r: number }> {
  const stars = Math.max(1, Math.min(TOPIC_STARS, Math.floor(rounds) || 1));
  if (stars === 1) return [{ x: 36, y: 31, r: 18 }];
  if (stars === 2) return [{ x: 22.5, y: 31, r: 13 }, { x: 49.5, y: 31, r: 13 }];
  return [{ x: 15, y: 34.5, r: 10.5 }, { x: 36, y: 26, r: 11 }, { x: 57, y: 34.5, r: 10.5 }];
}

/** A five-pointed star as SVG path data, point up, inner corners at two fifths of `r`, for drawing with round joins. */
export function starPath(x: number, y: number, r: number): string {
  const round = (v: number): string => String(Math.round(v * 100) / 100);
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.42;
    const a = (i * Math.PI) / 5;
    return `${round(x + radius * Math.sin(a))} ${round(y - radius * Math.cos(a))}`;
  });
  return `M${points.join('L')}Z`;
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
