import { useEffect, useId, useRef } from 'react';
import type { CompanionStatus } from '@kurda/shared';
import { CompanionPlayer } from '@kurda/shared/src/characters/companion-player';
import '@kurda/shared/src/characters/companion.css';

/** How long Hevalo is pleased before the next step opens, unless motion is turned down. */
export const HAPPY_MS = 650;

export const stillWanted = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Hevalo's head peeking over the console's sign-in card (@kurda/shared
 * characters/companion), in the console's calm tone: smaller reactions than
 * the website's, and no words. He watches the boxes in `watch` as they are
 * filled in, his head popping up with each key, ducks behind the card for a
 * password and peeks over it when it is shown, and takes the form's
 * `status`. Decorative: the form says in words whatever he shows.
 */
export function Companion({ status, watch, className }: { status: CompanionStatus; watch: React.RefObject<HTMLElement | null>; className?: string }): React.JSX.Element {
  const host = useRef<HTMLSpanElement>(null);
  const player = useRef<CompanionPlayer | null>(null);
  const prefix = `cp${useId().replace(/[^\w-]/g, '')}`;

  useEffect(() => {
    if (!host.current) return undefined;
    const p = new CompanionPlayer(host.current, { tone: 'calm', prefix });
    p.watch(watch.current);
    player.current = p;
    return () => {
      p.destroy();
      player.current = null;
    };
  }, [prefix, watch]);

  useEffect(() => {
    player.current?.status(status);
  }, [status]);

  return <span ref={host} className={className ? `companion ${className}` : 'companion'} aria-hidden="true" />;
}
