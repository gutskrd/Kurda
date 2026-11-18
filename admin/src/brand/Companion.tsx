import { useEffect, useId, useRef } from 'react';
import type { CompanionStatus } from '@kurda/shared';
import { CompanionPlayer } from '@kurda/shared/src/characters/companion-player';
import '@kurda/shared/src/characters/companion.css';

/** How long Hevalo is pleased before the next step opens, unless motion is turned down. */
export const HAPPY_MS = 650;


/**
 * Hevalo over the sign-in card (@kurda/shared characters/companion): the website's reactions at a smaller size and
 * without words. He watches the boxes in `watch`, covers his eyes for a password and takes the form's `status`; while
 * `low` only his head shows over the card. Decorative, as the form says in words whatever he shows.
 */
export function Companion({
  status,
  watch,
  low = false,
  className,
}: {
  status: CompanionStatus;
  watch: React.RefObject<HTMLElement | null>;
  low?: boolean;
  className?: string;
}): React.JSX.Element {
  const host = useRef<HTMLSpanElement>(null);
  const player = useRef<CompanionPlayer | null>(null);
  const prefix = `cp${useId().replace(/[^\w-]/g, '')}`;
  // As he is when he first comes up; later changes are played as they come.
  const lowAtFirst = useRef(low);

  useEffect(() => {
    if (!host.current) return undefined;
    const p = new CompanionPlayer(host.current, { tone: 'calm', prefix, low: lowAtFirst.current });
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

  useEffect(() => {
    player.current?.keepLow(low);
  }, [low]);

  return <span ref={host} className={className ? `companion ${className}` : 'companion'} aria-hidden="true" />;
}
