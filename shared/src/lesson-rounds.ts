/**
 * A topic's rounds: how many times over its lessons have been played, as the
 * ring round its stop on the lesson path shows it and the stars on its gold
 * coin count it.
 *
 * A topic's ring is cut into one piece for each of its lessons. The first
 * time through, a piece fills as each lesson is finished; once every lesson
 * has been finished the ring is whole, the stop turns gold and earns its first
 * star. Playing a gold topic again plays its lessons again, and the ring shows
 * the next round: a piece fills for each lesson finished a second time, and
 * when all are, the second star; a third full round, the third and last. After
 * that the ring stays whole and gold.
 *
 * So a topic's rounds are the fewest times any one of its lessons was
 * finished (no more than `TOPIC_STARS`), and the pieces filled are the lessons
 * finished more times than that. The server works this out for every topic of
 * a course map from the lessons each learner finished (api/src/coursemap), and
 * both apps draw from the numbers it sends — and from the ring's shape and the
 * stars' places here (`ringPieces`, `roundStars`) — so a ring is the same ring
 * on the phone and on the website. Pure, so the rule is tested once.
 */

/** The most rounds a topic counts, and the most stars it can wear. */
export const TOPIC_STARS = 3;

export interface TopicRounds {
  /** full rounds played: every lesson finished at least this many times, at most `TOPIC_STARS` (its stars) */
  rounds: number;
  /**
   * The ring's pieces filled: the lessons finished more than `rounds` times,
   * toward the next round, and every piece once all the rounds are played.
   */
  pieces: number;
}

/**
 * A topic's rounds and filled pieces from how many times each of its lessons
 * was finished, in any order. A topic with no lessons has no ring to fill.
 * Counts that are not whole non-negative numbers are read as the nearest that
 * is, so a stray value from an older client cannot crack a ring.
 */
export function topicRounds(times: readonly number[]): TopicRounds {
  if (times.length === 0) return { rounds: 0, pieces: 0 };
  const counts = times.map((t) => (Number.isFinite(t) ? Math.max(0, Math.floor(t)) : 0));
  const rounds = Math.min(TOPIC_STARS, ...counts);
  if (rounds >= TOPIC_STARS) return { rounds, pieces: counts.length };
  return { rounds, pieces: counts.filter((t) => t > rounds).length };
}

/**
 * The ring round a topic's stop, in the stop's own points (its 72-point
 * button, the token's face across its middle and its side under it): an
 * ellipse a little out from the token's edge all round (`cx`, `cy`, `rx`,
 * `ry`), drawn `width` thick, cut into one arc for each lesson with `gap`
 * degrees between each two. The pieces start at the top and go round the way
 * a clock's hand does, so the ring fills as a clock's does; a page read right
 * to left mirrors it, as it mirrors the path. `box` is the square that holds
 * it, from `-pad`, so an app can lay a drawing of that size over the button.
 */
export const PATH_RING = { cx: 36, cy: 35, rx: 45, ry: 44, width: 6, gap: 14, pad: 12, box: 96 } as const;

/** A number for a path, to a tenth of a point. */
function n(v: number): string {
  return String(Math.round(v * 10) / 10);
}

/**
 * The ring's pieces as SVG path data, one arc for each of `of` lessons, in
 * order round from the top. A gap is never more than a third of a piece, so
 * a topic of many lessons still reads as a ring.
 */
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
 * Where a topic's stars stand on its gold coin, in the stop's points: one
 * large in the middle, two side by side, or three in a shallow arc with the
 * middle one a little larger and higher — counted at a glance. `r` is a
 * star's outer radius.
 */
export function roundStars(rounds: number): Array<{ x: number; y: number; r: number }> {
  const stars = Math.max(0, Math.min(TOPIC_STARS, Math.floor(rounds)));
  if (stars === 1) return [{ x: 36, y: 30, r: 14 }];
  if (stars === 2) return [{ x: 25, y: 31, r: 11 }, { x: 47, y: 31, r: 11 }];
  if (stars === 3) return [{ x: 19.5, y: 33, r: 9.5 }, { x: 36, y: 28, r: 11 }, { x: 52.5, y: 33, r: 9.5 }];
  return [];
}

/** A five-pointed star as SVG path data, point up, its inner corners at two fifths of `r`, for drawing with round joins. */
export function starPath(x: number, y: number, r: number): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.42;
    const a = (i * Math.PI) / 5;
    return `${n(x + radius * Math.sin(a))} ${n(y - radius * Math.cos(a))}`;
  });
  return `M${points.join('L')}Z`;
}

/**
 * Which of a topic's lessons to play next: the first not finished yet, and
 * once every one has been, the one finished the fewest times (the first of
 * them, in the topic's order), so the next round is filled lesson by lesson
 * rather than by playing the same one over. -1 for a topic with no lessons.
 */
export function nextInRound(times: readonly number[]): number {
  let at = -1;
  times.forEach((t, i) => {
    if (at < 0 || t < times[at]!) at = i;
  });
  return at;
}
