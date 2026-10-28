import { useEffect, useId, useRef } from 'react';
import type { CompanionStatus } from '@kurda/shared';
import { CompanionPlayer } from '@kurda/shared/src/characters/companion-player';
import '@kurda/shared/src/characters/companion.css';

/** How long Hevalo is pleased before the next step opens, unless motion is turned down. */
export const HAPPY_MS = 650;

export const stillWanted = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Hevalo leaning in over the console's sign-in card (@kurda/shared
 * characters/companion), in the console's calm tone: the same reactions as
 * on the website at a smaller size, and no words. He watches the boxes in
 * `watch` as they are filled in, covers his eyes for a password, and takes
 * the form's `status`. While `low`, he shows only his head and neck over the
 * card, and once it is not, he climbs out and lays his forelegs over it.
 * Decorative: the form says in words whatever he shows.
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
  // as he is when he first comes up; later changes are played as they come
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
