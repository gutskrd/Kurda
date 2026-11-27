import { useEffect, useRef, useState } from 'react';
import { giftLoopStage, type GiftLoopTurn } from '@kurda/shared';

/**
 * Which gift loops on a page play: of those on screen, only the few most in view (shared GIFT_LOOP_LIMIT), so a chat
 * with many opened gifts in sight moves no more than a few at once.
 */
const stage = giftLoopStage();

/** Whether a gift that `wants` to play gets a turn, standing by how much of it is in view (`score`, 0 to 1). */
export function useGiftLoopTurn(wants: boolean, score: number): boolean {
  const [turn, setTurn] = useState(false);
  const held = useRef<GiftLoopTurn | null>(null);
  const latest = useRef(score);
  latest.current = score;
  useEffect(() => {
    if (!wants) return;
    const t = stage.join(latest.current, setTurn);
    held.current = t;
    return () => {
      t.leave();
      held.current = null;
      setTurn(false);
    };
  }, [wants]);
  useEffect(() => held.current?.update(score), [score]);
  return wants && turn;
}
