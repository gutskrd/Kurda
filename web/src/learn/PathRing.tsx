import { PATH_RING, TOPIC_STARS, ringPieces, roundStars, starPath } from '@kurda/shared';

/**
 * A topic's ring and its stars on the website's lesson path, drawn from the
 * same rule and the same shapes as the phone's (@kurda/shared
 * lesson-rounds.ts): a ring round the stop cut into one piece for each of its
 * lessons — in the app's violet once its lesson is finished in the round being
 * played, the rest the quiet track, and all of it in the app's gold once all
 * three rounds are played — and on a finished topic's gold coin a star for
 * each round, one to three.
 *
 * What is drawn is what the path says to draw at this moment of a return from
 * a lesson (learn/CoursePath.tsx steps it through `PATH_RETURN`): the pieces
 * fill one after another (`from`, the pieces filled before, sets each new
 * one's delay), the ring goes gold when a round is made whole, and a star
 * earned drops in (`earned`). The stylesheet moves them, and holds them still
 * under Reduce Motion (path.css). Decorative: the stop's own words say it all.
 */

const { pad, box, width } = PATH_RING;

/** How long a ring takes to fill from where it was, piece after piece. */
const FILL_MS = 400;

export function TopicRing({
  of,
  filled,
  whole,
  from,
  locked = false,
}: {
  of: number;
  /** pieces drawn filled */
  filled: number;
  /** the whole ring gold: all three rounds played, or a round just made whole */
  whole: boolean;
  /** coming back from a lesson, the pieces that were filled before it: the rest fill one after another */
  from?: number;
  /** a topic not open yet: its ring a faint track */
  locked?: boolean;
}): React.JSX.Element | null {
  const pieces = ringPieces(of);
  if (pieces.length === 0) return null;
  const start = from ?? filled;
  const span = Math.max(1, filled - start);
  return (
    <svg
      className={`lp-ring${whole ? ' is-whole' : ''}${locked ? ' is-faint' : ''}`}
      width={box}
      height={box}
      viewBox={`${-pad} ${-pad} ${box} ${box}`}
      aria-hidden="true"
      focusable="false"
      data-testid="lp-ring"
    >
      {pieces.map((d, k) => (
        <path key={`e${k}`} className="lp-ring-edge" d={d} strokeWidth={width + 3} />
      ))}
      {pieces.map((d, k) => (
        <path
          key={k}
          className={`lp-ring-piece${k < filled ? ' is-filled' : ''}`}
          d={d}
          strokeWidth={width}
          style={k >= start && k < filled ? ({ '--d': `${Math.round(((k - start) / span) * FILL_MS)}ms` } as React.CSSProperties) : undefined}
        />
      ))}
    </svg>
  );
}

/**
 * A finished topic's stars on its coin, in the valley's cream edged in a deep
 * gold so they read on the gold they stand on. `earned`: the last one was won
 * by the lesson just played, and drops in.
 */
export function RoundStars({ rounds, earned = false }: { rounds: number; earned?: boolean }): React.JSX.Element | null {
  const stars = roundStars(rounds);
  if (stars.length === 0) return null;
  return (
    <svg className="lp-stars" width={72} height={72} viewBox="0 0 72 72" aria-hidden="true" focusable="false" data-testid={`lp-stars-${stars.length}`}>
      {stars.map((s, i) => (
        <path
          key={i}
          className={`lp-star${earned && i === stars.length - 1 ? ' is-earned' : ''}`}
          d={starPath(s.x, s.y, s.r)}
          style={{ transformOrigin: `${s.x}px ${s.y}px` }}
        />
      ))}
    </svg>
  );
}

/** A topic's stars in its card, three in a row: one in the app's gold for each round played, the rest the ring's track. */
export function StarRow({ rounds }: { rounds: number }): React.JSX.Element {
  return (
    <span className="lp-star-row" aria-hidden="true" data-testid={`lp-card-stars-${rounds}`}>
      {Array.from({ length: TOPIC_STARS }, (_, i) => (
        <svg key={i} width={24} height={24} viewBox="0 0 24 24" focusable="false">
          <path className={i < rounds ? 'is-won' : undefined} d={starPath(12, 12.6, 10.6)} />
        </svg>
      ))}
    </span>
  );
}
