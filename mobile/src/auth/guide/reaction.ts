/**
 * Hevalo's reactions on a guided flow, one after another.
 *
 * A speaking character reacts when its `reaction` changes, so the same
 * reaction given twice in a row — two refused answers — would play once.
 * This clears it for a frame before giving it again, so every refusal gets
 * its tilt of the head and every pass its cheer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CharacterReaction } from '../../characters/SpeakingCharacter';

export function useGuideReaction(): { reaction: CharacterReaction | null; react: (kind: CharacterReaction) => void } {
  const [reaction, setReaction] = useState<CharacterReaction | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const react = useCallback((kind: CharacterReaction) => {
    if (pending.current) clearTimeout(pending.current);
    setReaction(null);
    pending.current = setTimeout(() => {
      pending.current = null;
      setReaction(kind);
    }, 16);
  }, []);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  return { reaction, react };
}
