import { useEffect, useId, useRef } from 'react';
import type { CompanionStatus, CompanionTone, CompanionWord } from '@kurda/shared';
import { CompanionPlayer } from '@kurda/shared/src/characters/companion-player';
import '@kurda/shared/src/characters/companion.css';

/**
 * Hevalo beside a form (@kurda/shared characters/companion): he watches the
 * boxes in `watch` as they are filled in, covers his eyes for a password,
 * and takes the form's `status` (thinking while it is sent, a question for a
 * mistake, a hop and `word` for getting in). Decorative: the form says in
 * words whatever he shows.
 */
export function Companion({
  status,
  word,
  watch,
  tone = 'playful',
  className,
}: {
  status: CompanionStatus;
  word?: CompanionWord;
  watch: React.RefObject<HTMLElement | null>;
  tone?: CompanionTone;
  className?: string;
}): React.JSX.Element {
  const host = useRef<HTMLSpanElement>(null);
  const player = useRef<CompanionPlayer | null>(null);
  const prefix = `cp${useId().replace(/[^\w-]/g, '')}`;

  useEffect(() => {
    if (!host.current) return undefined;
    const p = new CompanionPlayer(host.current, { tone, prefix });
    p.watch(watch.current);
    player.current = p;
    return () => {
      p.destroy();
      player.current = null;
    };
  }, [tone, prefix, watch]);

  useEffect(() => {
    player.current?.status(status, word);
  }, [status, word]);

  return <span ref={host} className={className ? `companion ${className}` : 'companion'} aria-hidden="true" />;
}
