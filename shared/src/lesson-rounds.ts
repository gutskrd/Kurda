/**
 * A topic's rounds: how many times over its lessons were played, shown as the bar over its stop and the suns pressed
 * into its wax seal. The bar has one piece per lesson; a piece fills as each lesson is first finished, and once the bar
 * is full the stop becomes a wax seal with its first sun. Replaying fills the next round piece by piece, and each full
 * round is pressed into the seal as another sun, up to three.
 *
 * So rounds are the fewest finishes of any one lesson (at most `TOPIC_STARS`) and pieces are the lessons finished more
 * often than that. The server computes them per topic (api/src/coursemap) and both apps draw from its numbers and from the
 * shapes here (`barPieces`), so a bar is the same everywhere.
 */

/** The most rounds a topic counts, and the most suns its seal can wear. */
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
 * The suns pressed into a finished topic's seal, one for each full round, in the seal's own terms (its middle at 0, 0 and
 * its radius 1): one large in the middle, two side by side a little smaller, or three of a size in a triangle, one above
 * and two below, the gaps between them the same as to the fine ring round the field. A topic finished before its rounds
 * were counted shows one. `r` is how far a sun's rays reach.
 */
export function sealSuns(rounds: number): Array<{ x: number; y: number; r: number }> {
  const suns = Math.max(1, Math.min(TOPIC_STARS, Math.floor(rounds) || 1));
  if (suns === 1) return [{ x: 0, y: 0, r: 0.53 }];
  if (suns === 2) return [{ x: -0.3, y: 0, r: 0.285 }, { x: 0.3, y: 0, r: 0.285 }];
  // Each 0.315 from the middle, so the gaps between them and to the ring at 0.615 are alike.
  return [{ x: -0.2728, y: 0.1575, r: 0.245 }, { x: 0, y: -0.315, r: 0.245 }, { x: 0.2728, y: 0.1575, r: 0.245 }];
}

/** The Kurdish sun's rays: twenty-one, as on the flag. */
export const SUN_RAYS = 21;

/**
 * A sun as SVG path data: a round middle half as wide as its reach, and `rays` pointed rays round it, evenly spaced, the
 * first pointing straight up, reaching `r` from its middle. Fewer, broader rays keep a small sun crisp.
 */
export function sunPath(x: number, y: number, r: number, rays = SUN_RAYS): string {
  const round = (v: number): string => String(Math.round(v * 100) / 100);
  const at = (radius: number, a: number): string => `${round(x + radius * Math.sin(a))} ${round(y - radius * Math.cos(a))}`;
  const disc = r * 0.5;
  // Slender rays with clear gaps between, as pressed suns have; fewer rays are a little broader at the foot.
  const half = (Math.PI / rays) * (rays >= SUN_RAYS ? 0.45 : rays >= 15 ? 0.52 : 0.6);
  const arc = `A${round(disc)} ${round(disc)} 0 1 0`;
  const middle = `M${round(x - disc)} ${round(y)}${arc} ${round(x + disc)} ${round(y)}${arc} ${round(x - disc)} ${round(y)}Z`;
  const spikes = Array.from({ length: rays }, (_, i) => {
    const a = (i * 2 * Math.PI) / rays;
    return `M${at(r * 0.57, a - half)}L${at(r, a)}L${at(r * 0.57, a + half)}Z`;
  });
  return middle + spikes.join('');
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
