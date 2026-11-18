/**
 * A topic's rounds: how many times over its lessons were played, shown as the ring round its stop and the stars on its
 * gold coin. The ring has one piece per lesson; a piece fills as each lesson is first finished, and a whole ring turns the
 * stop gold with its first star. Replaying fills the next round piece by piece, up to three stars, after which the ring
 * stays whole.
 *
 * So rounds are the fewest finishes of any one lesson (at most `TOPIC_STARS`) and pieces are the lessons finished more
 * often than that. The server computes them per topic (api/src/coursemap) and both apps draw from its numbers and from the
 * shapes here (`ringPieces`, `roundStars`), so a ring is the same everywhere.
 */

/** The most rounds a topic counts, and the most stars it can wear. */
export const TOPIC_STARS = 3;

export interface TopicRounds {
  /** full rounds played: every lesson finished at least this many times, at most `TOPIC_STARS` */
  rounds: number;
  /** The ring's filled pieces: lessons finished more than `rounds` times, or every piece once all rounds are played. */
  pieces: number;
}

/**
 * A topic's rounds and filled pieces from how many times each lesson was finished, in any order; no lessons, no ring.
 * Counts that are not whole non-negative numbers are read as the nearest that is, so a stray older value cannot break a
 * ring.
 */
export function topicRounds(times: readonly number[]): TopicRounds {
  if (times.length === 0) return { rounds: 0, pieces: 0 };
  const counts = times.map((t) => (Number.isFinite(t) ? Math.max(0, Math.floor(t)) : 0));
  const rounds = Math.min(TOPIC_STARS, ...counts);
  if (rounds >= TOPIC_STARS) return { rounds, pieces: counts.length };
  return { rounds, pieces: counts.filter((t) => t > rounds).length };
}

/**
 * The ring round a stop, in the stop's points (its 72-point button): an ellipse a little outside the token (`cx`, `cy`,
 * `rx`, `ry`), `width` thick, cut into one arc per lesson with `gap` degrees between. Pieces start at the top and go
 * clockwise, mirrored on right-to-left pages like the path. `box` is the square holding it, from `-pad`, for an app to lay
 * a drawing of that size over the button.
 */
export const PATH_RING = { cx: 36, cy: 35, rx: 45, ry: 44, width: 6, gap: 14, pad: 12, box: 96 } as const;

/** A number for a path, to a tenth of a point. */
function n(v: number): string {
  return String(Math.round(v * 10) / 10);
}

/** The ring's pieces as SVG path data, one arc per lesson from the top; a gap is never more than a third of a piece, so many lessons still read as a ring. */
export function ringPieces(of: number): string[] {
  if (!(of >= 1)) return [];
  const count = Math.floor(of);
  const { cx, cy, rx, ry } = PATH_RING;
  const span = 360 / count;
  const gap = Math.min(PATH_RING.gap, span / 3);
  const at = (deg: number): string => {
    const r = (deg * Math.PI) / 180;
    return `${n(cx + rx * Math.sin(r))} ${n(cy - ry * Math.cos(r))}`;
  };
  return Array.from({ length: count }, (_, k) => {
    const from = k * span + gap / 2;
    const to = (k + 1) * span - gap / 2;
    return `M${at(from)}A${rx} ${ry} 0 ${to - from > 180 ? 1 : 0} 1 ${at(to)}`;
  });
}

/**
 * Where a topic's stars stand on its gold coin, in the stop's points: one large in the middle, two side by side, or three
 * in a shallow arc with the middle one larger and higher. `r` is a star's outer radius.
 */
export function roundStars(rounds: number): Array<{ x: number; y: number; r: number }> {
  const stars = Math.max(0, Math.min(TOPIC_STARS, Math.floor(rounds)));
  if (stars === 1) return [{ x: 36, y: 30, r: 14 }];
  if (stars === 2) return [{ x: 25, y: 31, r: 11 }, { x: 47, y: 31, r: 11 }];
  if (stars === 3) return [{ x: 19.5, y: 33, r: 9.5 }, { x: 36, y: 28, r: 11 }, { x: 52.5, y: 33, r: 9.5 }];
  return [];
}

/** A five-pointed star as SVG path data, point up, inner corners at two fifths of `r`, for drawing with round joins. */
export function starPath(x: number, y: number, r: number): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.42;
    const a = (i * Math.PI) / 5;
    return `${n(x + radius * Math.sin(a))} ${n(y - radius * Math.cos(a))}`;
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
