import { useEffect } from 'react';

/**
 * A group was renamed, given a picture, joined, left or deleted somewhere on
 * the page: the lists of groups that are on screen reload, so the name and
 * picture in them never disagree with the thread that was just changed.
 */
const EVENT = 'hevalo:groups-changed';

export function announceGroupsChanged(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function useGroupsChanged(reload: () => void): void {
  useEffect(() => {
    window.addEventListener(EVENT, reload);
    return () => window.removeEventListener(EVENT, reload);
  }, [reload]);
}
