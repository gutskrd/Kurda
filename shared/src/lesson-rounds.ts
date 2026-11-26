/**
 * A topic's rounds: how many times over its lessons were played, shown as the bar over its stop. The bar has one piece
 * per lesson; a piece fills as each lesson is first finished, and once the bar is full the stop is stamped with Hevalo's
 * hoofprint. Replaying fills the next round piece by piece, up to three rounds, which its card counts in prints.
 *
 * So rounds are the fewest finishes of any one lesson (at most `TOPIC_STARS`) and pieces are the lessons finished more
 * often than that. The server computes them per topic (api/src/coursemap) and both apps draw from its numbers and from the
 * shapes here (`barPieces`), so a bar is the same everywhere.
 */

/** The most rounds a topic counts: its card shows them as Hevalo's prints, one for each round played. */
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
 * The bar over a stop, in the stop's points (its 72-point button): a slim row of rounded pieces just above the tile,
 * `w` wide from `x`, its top at `y` (above the button) and `h` thick, one piece per lesson with `gap` between, so the
 * bubble over the stop sits above it. Pieces fill from the start of the line, mirrored on right-to-left pages like the
 * path.
 */
export const PATH_BAR = { x: 6, y: -20, w: 60, h: 8, gap: 3 } as const;

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
