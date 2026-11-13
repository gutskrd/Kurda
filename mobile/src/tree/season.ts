import { useEffect, useState } from 'react';
import { treeSeasonAt, type TreeSeason } from '@kurda/shared';

/**
 * The season by the learner's own calendar, which every tree in the app is
 * drawn in. It is looked at again every hour, so a screen left open
 * overnight sees the season turn.
 */
export function useTreeSeason(): TreeSeason {
  const [season, setSeason] = useState<TreeSeason>(() => treeSeasonAt());
  useEffect(() => {
    const id = setInterval(() => setSeason(treeSeasonAt()), 60 * 60_000);
    return () => clearInterval(id);
  }, []);
  return season;
}
