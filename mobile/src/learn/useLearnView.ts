import { useCallback, useEffect, useRef, useState } from 'react';
import { deviceStore } from '../keyboard/deviceStore';
import { isLearnView, type LearnView } from '../navigation/tabs';

/** Where the last choice is kept, on this device. */
export const LEARN_VIEW_KEY = 'hevalo_learn_view_v1';

/**
 * Which half of Learn is showing: Lessons the first time, then whichever the reader last chose, on this device. A
 * link asking for a view (`hevalo://play`) opens it without becoming the remembered choice. `requested` is the
 * view a link asked for; `onRequestShown` lets the caller clear it once shown, so the same link works again.
 */
export function useLearnView(requested: LearnView | undefined, onRequestShown?: () => void): [LearnView, (next: LearnView) => void] {
  const [view, setView] = useState<LearnView>(requested ?? 'lessons');
  // Set once the reader has tapped or a link has decided, so a slow read of the saved choice cannot undo either.
  const chosen = useRef(false);
  // Read once on arrival: what a link asked for wins over what was remembered.
  const askedOnArrival = useRef(requested !== undefined);

  useEffect(() => {
    if (askedOnArrival.current) return;
    let live = true;
    void deviceStore.get(LEARN_VIEW_KEY).then((saved) => {
      if (live && !chosen.current && isLearnView(saved)) setView(saved);
    });
    return () => {
      live = false;
    };
  }, []);

  // A link followed while the tab is already open.
  useEffect(() => {
    if (!requested) return;
    chosen.current = true;
    setView(requested);
    onRequestShown?.();
  }, [requested, onRequestShown]);

  const choose = useCallback((next: LearnView) => {
    chosen.current = true;
    setView(next);
    void deviceStore.set(LEARN_VIEW_KEY, next);
  }, []);

  return [view, choose];
}
