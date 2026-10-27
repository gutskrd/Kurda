import { useRef } from 'react';
import type { CompanionStatus, CompanionWord } from '@kurda/shared';
import { Companion } from '../characters/Companion';

/**
 * The sign-in pages' card, with Hevalo standing behind it, his hooves on its
 * top edge, taking part in what is typed in it (characters/Companion).
 */
export function AuthCard({ status = 'idle', word, children }: { status?: CompanionStatus; word?: CompanionWord; children: React.ReactNode }): React.JSX.Element {
  const card = useRef<HTMLDivElement>(null);
  return (
    <div className="auth-stage">
      <Companion status={status} word={word} watch={card} className="auth-companion" />
      <div ref={card} className="auth-card">
        {children}
      </div>
    </div>
  );
}
