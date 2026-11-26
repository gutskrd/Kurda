import { PATH_RING, TOPIC_STARS, ringPieces, roundStars, starPath } from '@kurda/shared';

/**
 * A topic's ring and stars on the lesson path, by the same rule and shapes as the phone (@kurda/shared lesson-rounds.ts):
 * one ring piece per lesson, in its unit's colour once finished in the current round, gold all round once all three rounds are played,
 * and a star per round along a finished topic's tile. During a return (learn/CoursePath.tsx, `PATH_RETURN`) the pieces fill
 * one after another from `from`, the ring turns gold when a round completes, and an `earned` star drops in; path.css
 * moves them and holds them under reduced motion. Decorative; the stop's words say it all.
 */

const { pad, box, width } = PATH_RING;

/** How long a ring takes to fill from where it was, piece by piece. */
const FILL_MS = 400;

export function TopicRing({
  of,
  filled,
  whole,
  from,
}: {
  of: number;
  /** Pieces drawn filled. */
  filled: number;
  /** The whole ring gold: all three rounds played, or a round just completed. */
  whole: boolean;
  /** On a return from a lesson, the pieces filled before it; the rest fill one after another. */
  from?: number;
}): React.JSX.Element | null {
  const pieces = ringPieces(of);
  if (pieces.length === 0) return null;
  const start = from ?? filled;
  const span = Math.max(1, filled - start);
  return (
    <svg
      className={`lp-ring${whole ? ' is-whole' : ''}`}
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

/** A finished topic's stars along its tile's near edge, under the hoofprint, cream edged in deep gold; `earned` drops the last one in. */
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

/** A topic's stars in its card: gold for each round played, the rest the ring's track. */
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
