import { PATH_BAR, TOPIC_STARS, barPieces, starPath } from '@kurda/shared';

/**
 * A topic's progress over its stop and its rounds in its card, by the same rule and shapes as the phone (@kurda/shared
 * lesson-rounds.ts): a slim bar just above the tile with one piece per lesson, in its unit's colour once finished in the
 * current round, and gold once full; and in its card a gold star for each full round, up to three, which are pressed
 * into its wax on the road (PathScene.tsx `TileWax`). During a return (learn/CoursePath.tsx, `PATH_RETURN`) the new
 * pieces fill one after another from `from`; path.css runs the fill and holds it still under reduced motion. Decorative;
 * the stop's words say it all.
 */

/** How long a bar takes to fill from where it was, piece by piece. */
const FILL_MS = 400;

export function TopicBar({
  of,
  filled,
  whole,
  from,
}: {
  of: number;
  /** Pieces drawn filled. */
  filled: number;
  /** The whole bar gold: a round just completed. */
  whole: boolean;
  /** On a return from a lesson, the pieces filled before it; the rest fill one after another. */
  from?: number;
}): React.JSX.Element | null {
  const pieces = barPieces(of);
  if (pieces.length === 0) return null;
  const start = from ?? filled;
  const step = FILL_MS / Math.max(1, filled - start);
  return (
    <span className={`lp-bar-over${whole ? ' is-whole' : ''}`} aria-hidden="true" data-testid="lp-bar" data-filled={filled}>
      {pieces.map((p, k) => (
        <span key={k} className="lp-bar-piece" style={{ insetInlineStart: p.x - PATH_BAR.x, width: p.w }}>
          <span
            className={`lp-bar-ink${k < filled ? ' is-filled' : ''}`}
            style={k >= start && k < filled ? ({ '--d': `${Math.round((k - start) * step)}ms`, '--t': `${Math.round(step)}ms` } as React.CSSProperties) : undefined}
          />
        </span>
      ))}
    </span>
  );
}

/** A topic's three stars in its card: gold for each round played, the bar's quiet track for the rest. */
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
