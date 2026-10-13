import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { StoryGameView } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiError, ApiResult } from '../api/types';
import { useUserEvents } from '../realtime/useUserEvents';
import { getGame, joinGame } from './api';
import { StoryGameLoop } from './gameLoop';
import { useStoryPrefs } from './prefs';

/** Why a game cannot be shown: never existed or not yours (the same to the player), already under way, full. */
export type GameGone = 'not-found' | 'started' | 'full';

export interface StoryGameHandle {
  view: StoryGameView | null;
  gone: GameGone | null;
  /** a run of failed requests: the screen says it is reconnecting */
  trouble: ApiError | null;
  /** server time now, corrected for this phone's clock */
  serverNow: () => number;
  /** take an action's answer (or ask again when it failed in a way that means the game moved) */
  apply: (res: ApiResult<StoryGameView>) => ApiError | null;
  refresh: () => void;
}

/**
 * One story game on screen: the long-poll loop (gameLoop.ts), paused while
 * the app is in the background, and nudged by `play_changed` on your own
 * channel — which is how a finished game hears that the host opened another
 * round, without asking every few seconds.
 *
 * Opening a game you are not in yet (an invite link, a card in a chat) joins
 * it when the join rule allows; the API answers both "no such game" and "not
 * for you" with the same 404, and so does this screen.
 */
export function useStoryGame(id: string): StoryGameHandle {
  const { client } = useAuth();
  const { prefs } = useStoryPrefs();
  const [view, setView] = useState<StoryGameView | null>(null);
  const [gone, setGone] = useState<GameGone | null>(null);
  const [trouble, setTrouble] = useState<ApiError | null>(null);
  const triedJoin = useRef(false);
  const extraTime = useRef(prefs.extraTime);
  extraTime.current = prefs.extraTime;

  const loop = useMemo(
    () =>
      new StoryGameLoop({
        fetch: (since) => getGame(client, id, since),
        onView: (v) => {
          setView(v);
          setTrouble(null);
        },
        onFailure: (failure) => {
          if (failure.kind === 'error') {
            setTrouble(failure.error);
            return;
          }
          if (triedJoin.current) {
            setGone('not-found');
            return;
          }
          // not a member (yet): join, if the rule lets this person in
          triedJoin.current = true;
          void joinGame(client, { id }, extraTime.current).then((res) => {
            if (res.ok) {
              loop.start(res.data);
              return;
            }
            setGone(res.error.code === 'GAME_STARTED' ? 'started' : res.error.code === 'GAME_FULL' ? 'full' : 'not-found');
          });
        },
      }),
    [client, id],
  );

  useEffect(() => {
    loop.start();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') loop.resume();
      else if (next === 'background') loop.pause();
    });
    return () => {
      sub.remove();
      loop.stop();
    };
  }, [loop]);

  useUserEvents(
    useCallback(
      (ev) => {
        if ((ev.type === 'play_changed' || ev.type === 'rematch_update') && ev.game === 'stories' && ev.lobbyId === id) loop.refresh();
      },
      [loop, id],
    ),
  );

  const apply = useCallback(
    (res: ApiResult<StoryGameView>): ApiError | null => {
      if (res.ok) {
        loop.accept(res.data);
        return null;
      }
      // the game moved under the tap (a deadline, another player): show where it is now
      if (res.error.status === 409) loop.refresh();
      if (res.error.status === 404) setGone('not-found');
      return res.error;
    },
    [loop],
  );

  return { view, gone, trouble, serverNow: () => loop.serverNow(), apply, refresh: () => loop.refresh() };
}
