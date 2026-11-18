import { useEffect, useState } from 'react';
import type { StoryDetail } from '@kurda/shared';
import { useAuth } from '../../auth/AuthContext';
import { getGameStory } from '../api';

/**
 * The game's own copy of its text, which stays fixed even if the story is edited mid-game. Fetched once the game
 * has left its lobby, where the host can still pick another story.
 */
export function useGameStory(gameId: string, enabled: boolean): StoryDetail | null {
  const { client } = useAuth();
  const [story, setStory] = useState<StoryDetail | null>(null);
  useEffect(() => {
    if (!enabled || story) return;
    let live = true;
    const fetchIt = (attempt: number): void => {
      void getGameStory(client, gameId).then((res) => {
        if (!live) return;
        if (res.ok) setStory(res.data);
        else if (attempt < 3 && res.error.status !== 404) setTimeout(() => live && fetchIt(attempt + 1), 1_000 * (attempt + 1));
      });
    };
    fetchIt(0);
    return () => {
      live = false;
    };
  }, [client, gameId, enabled, story]);
  return story;
}
