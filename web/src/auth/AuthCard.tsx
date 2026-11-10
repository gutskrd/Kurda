import { useRef } from 'react';
import type { CompanionStatus, CompanionWord } from '@kurda/shared';
import { Companion } from '../characters/Companion';

/**
 * The sign-in pages' card, with Hevalo leaning in over it as over a
 * windowsill, taking part in what is typed in it (characters/Companion).
 *
 * `compact` is for a page with more to show under its form than a sign-in
 * has (confirming an address): he is smaller there, so what the page asks
 * for is not pushed below the fold by who asks it.
 */
export function AuthCard({
  status = 'idle',
  word,
  compact = false,
  children,
}: {
  status?: CompanionStatus;
  word?: CompanionWord;
  compact?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const card = useRef<HTMLDivElement>(null);
  return (
    <div className={`auth-stage${compact ? ' is-compact' : ''}`}>
      <Companion status={status} word={word} watch={card} className="auth-companion" />
      <div ref={card} className="auth-card">
        {children}
      </div>
    </div>
  );
}
