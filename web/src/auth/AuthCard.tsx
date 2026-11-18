import { useRef } from 'react';
import type { CompanionStatus, CompanionWord } from '@kurda/shared';
import { Companion } from '../characters/Companion';

/**
 * The sign-in pages' card, with Hevalo leaning over its top edge and reacting to what is typed (characters/Companion).
 * `compact` draws him smaller for pages with more under the form, such as confirming an address.
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
