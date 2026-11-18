import { useEffect } from 'react';

/** A group changed somewhere on the page, so group lists on screen reload and match the thread just changed. */
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
