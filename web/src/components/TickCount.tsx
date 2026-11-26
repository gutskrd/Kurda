import { useEffect, useState } from 'react';
import { LEAVE_MS, playsMotion } from '../lib/motion';

/**
 * A count that ticks when it changes, as on the phone (mobile/src/feed/FeedCard.tsx `TickCount`): the old number slides
 * out and the new one rises in, up for more and down for fewer (styles/motion.css). Under Reduce Motion it just
 * changes. A count that first appears simply appears.
 */
export function TickCount({ value, format, className }: { value: number; format: (n: number) => string; className?: string }): React.JSX.Element {
  const [tick, setTick] = useState<{ now: number; was: number | null; up: boolean; n: number }>({ now: value, was: null, up: true, n: 0 });
  if (value !== tick.now) setTick({ now: value, was: playsMotion() ? tick.now : null, up: value > tick.now, n: tick.n + 1 });
  const leaving = tick.was !== null;
  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => setTick((s) => ({ ...s, was: null })), LEAVE_MS);
    return () => window.clearTimeout(id);
  }, [leaving, tick.n]);
  return (
    <span className={`tick${tick.n > 0 && playsMotion() ? (tick.up ? ' is-up' : ' is-down') : ''}${className ? ` ${className}` : ''}`}>
      {tick.was !== null && (
        <span key={`was${tick.n}`} className="tick-was" aria-hidden="true">
          {format(tick.was)}
        </span>
      )}
      <span key={`now${tick.n}`} className="tick-now">
        {format(tick.now)}
      </span>
    </span>
  );
}
