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

/** The minimum gap between re-reads when the app returns to the front. */
const FRONT_GAP_MS = 5000;
/** How often letters are polled while in view when no realtime connection is open. */
const UNHEARD_EVERY_MS = 60_000;

/** One GET /letters answer: its body, the request it answered, and when it arrived (for timing by the server's clock). */
interface LettersRead {
  data: LettersHome;
  seq: number;
  at: number;
}

/**
 * The letters for the window (LettersScreen), re-read whenever they may have changed while the screen is in view:
 * on focus, on `letters_changed`, on a letter notification, on reconnect, and on return to the front. A read
 * settles birds on the server, so there is no timer while the realtime connection is open; without it, the letters
 * are polled once a minute.
 *
 * Only the latest request's answer is used, and `drop` makes any in-flight answer stale, so the window calls it
 * before acting. `asked` is the latest request's number, so the screen can wait for a read made after an event.
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
      // A later request, or an action at the window since this one, takes precedence.
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

  // On focus: the first time, and back from a correspondence where a letter may have been read.
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

  // Changes during the gap were never announced, so read again.
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
