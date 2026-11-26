/**
 * A topic's rounds: how many times over its lessons were played, shown as the bar over its stop and the stars on its
 * tile. The bar has one piece per lesson; a piece fills as each lesson is first finished, and once the bar is full the
 * stop is stamped with Hevalo's seal and earns its first star. Replaying fills the next round piece by piece, up to three
 * stars.
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
 * Where a finished topic's stars stand on its tile, in the stop's points: in a row along the tile's near edge, under its
 * seal, following the edge's curve, the middle one a little larger. `r` is a star's outer radius.
 */
export function roundStars(rounds: number): Array<{ x: number; y: number; r: number }> {
  const stars = Math.max(0, Math.min(TOPIC_STARS, Math.floor(rounds)));
  if (stars === 1) return [{ x: 36, y: 51, r: 7.2 }];
  if (stars === 2) return [{ x: 28.5, y: 50.5, r: 6.6 }, { x: 43.5, y: 50.5, r: 6.6 }];
  if (stars === 3) return [{ x: 21.5, y: 49.5, r: 6 }, { x: 36, y: 51.5, r: 6.6 }, { x: 50.5, y: 49.5, r: 6 }];
  return [];
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
