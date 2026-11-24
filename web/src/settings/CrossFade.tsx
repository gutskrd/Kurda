import { useEffect, useState } from 'react';

/** How long the old value takes to fade, a little past the animation's own length (styles/settings.css). */
const FADE_MS = 240;

/**
 * A short value that fades into its next one in place, the old one fading out over it, so a tile's "On" turning "Off"
 * reads as a change rather than a jump. The box keeps the width of the longer of the two while they overlap.
 */
export function CrossFade({ value, className }: { value: string; className?: string }): React.JSX.Element {
  const [shown, setShown] = useState({ now: value, was: null as string | null, n: 0 });
  if (value !== shown.now) setShown({ now: value, was: shown.now, n: shown.n + 1 });

  useEffect(() => {
    if (shown.was === null) return;
    const timer = setTimeout(() => setShown((s) => ({ ...s, was: null })), FADE_MS);
    return () => clearTimeout(timer);
  }, [shown.was, shown.n]);

  return (
    <span className={`crossfade${className ? ` ${className}` : ''}`}>
      {shown.was !== null && (
        <span key={`was-${shown.n}`} className="crossfade-out" aria-hidden="true">
          {shown.was}
        </span>
      )}
      <span key={`now-${shown.n}`} className={shown.n > 0 ? 'crossfade-in' : undefined}>
        {shown.now}
      </span>
    </span>
  );
}
