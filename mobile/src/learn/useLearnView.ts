import { useCallback, useEffect, useRef, useState } from 'react';
import { deviceStore } from '../keyboard/deviceStore';
import { isLearnView, type LearnView } from '../navigation/tabs';

/** Where the last choice is kept, on this device. */
export const LEARN_VIEW_KEY = 'hevalo_learn_view_v1';

/**
 * Which half of Learn is showing: Lessons or Games.
 *
 * Lessons the first time. After that, whichever the reader last chose, on this
 * device — somebody who opens Learn to play should not have to switch every
 * time. A link that asks for a view (`hevalo://play`) opens that view without
 * becoming the remembered choice: being sent somewhere is not choosing it.
 *
 * `requested` is the view a link asked for; `onRequestShown` lets the caller
 * clear it once it has been shown, so the same link followed a second time
 * still works.
 */
export function useLearnView(requested: LearnView | undefined, onRequestShown?: () => void): [LearnView, (next: LearnView) => void] {
  const [view, setView] = useState<LearnView>(requested ?? 'lessons');
  // set once the reader has tapped or a link has decided, so a slow read of
  // the saved choice cannot undo either
  const chosen = useRef(false);
  // read once, on arrival: what a link asked for wins over what was remembered
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

  // a link followed while the tab is already open
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
