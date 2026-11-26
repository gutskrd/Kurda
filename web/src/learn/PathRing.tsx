import { TOPIC_STARS, barPieces, hoofprintPath } from '@kurda/shared';

/**
 * A topic's progress over its stop and its rounds in its card, by the same rule and shapes as the phone (@kurda/shared
 * lesson-rounds.ts): a slim bar just above the tile with one rounded piece per lesson, in its unit's colour once finished
 * in the current round, and gold once full. During a return (learn/CoursePath.tsx, `PATH_RETURN`) the new pieces fill
 * one after another from `from`; path.css runs the fill and holds it still under reduced motion. Decorative; the stop's
 * words say it all.
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
        <span key={k} className="lp-bar-piece" style={{ insetInlineStart: p.x, width: p.w }}>
          <span
            className={`lp-bar-ink${k < filled ? ' is-filled' : ''}`}
            style={k >= start && k < filled ? ({ '--d': `${Math.round((k - start) * step)}ms`, '--t': `${Math.round(step)}ms` } as React.CSSProperties) : undefined}
          />
        </span>
      ))}
    </span>
  );
}

/** A topic's rounds in its card: Hevalo's print in gold for each round played, the rest the bar's quiet track. */
export function RoundPrints({ rounds }: { rounds: number }): React.JSX.Element {
  return (
    <span className="lp-print-row" aria-hidden="true" data-testid={`lp-card-rounds-${rounds}`}>
      {Array.from({ length: TOPIC_STARS }, (_, i) => (
        <svg key={i} width={22} height={24} viewBox="0 0 22 24" focusable="false">
          <path className={i < rounds ? 'is-won' : undefined} d={hoofprintPath(11, 12, 0.62)} />
        </svg>
      ))}
    </span>
  );
}
