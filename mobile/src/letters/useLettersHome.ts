import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { LETTERS_CHANGED, type LettersHome } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { useRealtimeReconnect, useRealtimeState } from '../realtime/RealtimeProvider';
import { useUserEvents, type UserEvent } from '../realtime/useUserEvents';
import { onLetterNotice } from './letterPushes';
import { LETTERS_HOME_PATH } from './homePath';

export { LETTERS_HOME_PATH } from './homePath';

/** Coming back to the app reads the letters again, but not more often than this, however often the app is switched to. */
const FRONT_GAP_MS = 5000;
/** With no connection open to say that something changed, the letters are read this often while the screen is in view. */
const UNHEARD_EVERY_MS = 60_000;

/** One answer to GET /letters: what it said, which request it answered, and when it came (for timing by the server's clock). */
export interface LettersRead {
  data: LettersHome;
  seq: number;
  at: number;
}

/**
 * The letters read from the server for the window (LettersScreen), and read
 * again whenever they may have changed: each time the screen comes into view,
 * and while it is in view, when the server says something changed in this
 * person's letters (`letters_changed`, sent for every bird that comes, goes
 * or lands), when a letter's notification arrives, when the connection that
 * says so comes back after a gap in which a change could have been missed,
 * and when the app comes back to the front. A screen out of view reads
 * nothing; it reads again as it comes back. While the connection is open
 * there is no timer: a read of the letters settles the birds on the server,
 * so it is not asked for without a reason. While it is not (a network that
 * blocks it, a connection that keeps failing), the letters are read once a
 * minute while the screen is in view and the app in front.
 *
 * Only the answer to the latest request is taken, and `drop` makes any
 * answer still on its way out of date: the window calls it before doing
 * anything, so a read the server made before that is never shown after it.
 * `asked` is the number of the latest request, so the screen can wait for a
 * read asked after something it must act on (a notification's bird).
 */
export function useLettersHome(): {
  read: LettersRead | null;
  error: ApiError | null;
  reload: () => void;
  drop: () => void;
  asked: () => number;
} {
  const { client } = useAuth();
  const focused = useIsFocused();
  const inView = useRef(focused);
  inView.current = focused;
  const [read, setRead] = useState<LettersRead | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const seq = useRef(0);
  const lastAsked = useRef(0);

  const reload = useCallback(() => {
    const n = ++seq.current;
    lastAsked.current = Date.now();
    void client.get<LettersHome>(LETTERS_HOME_PATH).then((res) => {
      // a later request, or something done at the window since this one was asked, has the say
      if (n !== seq.current) return;
      if (res.ok) {
        setRead({ data: res.data, seq: n, at: Date.now() });
        setError(null);
      } else setError(res.error);
    });
  }, [client]);
  const drop = useCallback(() => {
    seq.current += 1;
  }, []);
  const asked = useCallback(() => seq.current, []);

  // coming into view: the first time, and back from a correspondence, where a letter may have been read meanwhile
  useFocusEffect(useCallback(() => reload(), [reload]));

  const whileInView = useCallback(() => {
    if (inView.current) reload();
  }, [reload]);

  useEffect(() => {
    const front = AppState.addEventListener('change', (state) => {
      if (state === 'active' && inView.current && Date.now() - lastAsked.current >= FRONT_GAP_MS) reload();
    });
    return () => front.remove();
  }, [reload]);

  useEffect(() => onLetterNotice(whileInView), [whileInView]);

  useUserEvents(
    useCallback(
      (event: UserEvent) => {
        if (event.type === LETTERS_CHANGED) whileInView();
      },
      [whileInView],
    ),
  );

  // the connection back after a gap: whatever changed in it was never said, so the letters are read again
  useRealtimeReconnect(whileInView);

  const connection = useRealtimeState();
  useEffect(() => {
    if (connection === 'open') return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') whileInView();
    }, UNHEARD_EVERY_MS);
    return () => clearInterval(timer);
  }, [connection, whileInView]);

  return { read, error, reload, drop, asked };
}
