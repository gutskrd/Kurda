import { useCallback, useEffect, useRef, useState } from 'react';
import { LETTERS_CHANGED, type LettersHome } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import { useRealtime, useRealtimeEvent } from '../realtime/RealtimeProvider';
import { pollWhileVisible } from '../lib/pollWhileVisible';

/** The letters page as this window asks for it: with every letter still to land (`landings`), which it says when it has shown. */
export const LETTERS_HOME_PATH = '/letters?landings=1';

/** Coming back to the tab reads the page again, but not more often than this, however often the tab is switched. */
const VISIBLE_GAP_MS = 5000;
/** With no connection open to say that something changed, the page is read this often while it is in view. */
const UNHEARD_EVERY_MS = 60_000;

/** One answer to GET /letters: what it said, which request it answered, and when it came (for timing by the server's clock). */
interface LettersRead {
  data: LettersHome;
  seq: number;
  at: number;
}

/**
 * The letters page state, refetched on `letters_changed`, when the realtime connection returns after a gap, and when
 * the tab is shown. While connected there is no timer, since each read settles birds on the server; otherwise it polls
 * once a minute while visible. Only the latest answer is taken, and `drop` invalidates answers in flight before the
 * window acts. `asked` numbers the latest request, so the page can wait for a read made after an event.
 */
export function useLettersHome(): {
  read: LettersRead | null;
  error: string | null;
  reload: () => void;
  drop: () => void;
  asked: () => number;
} {
  const { client } = useAuth();
  const t = useT();
  const words = useRef(t);
  words.current = t;
  const [read, setRead] = useState<LettersRead | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      } else setError(describeError(res.error, words.current));
    });
  }, [client]);
  const drop = useCallback(() => {
    seq.current += 1;
  }, []);
  const asked = useCallback(() => seq.current, []);

  useEffect(() => reload(), [reload]);

  useRealtimeEvent(LETTERS_CHANGED, reload);

  // the connection back after a gap: whatever changed in it was never said, so the page is read again
  const { state } = useRealtime();
  const was = useRef(state);
  useEffect(() => {
    const before = was.current;
    was.current = state;
    if (state === 'open' && before !== 'open' && before !== 'idle') reload();
  }, [state, reload]);

  useEffect(() => {
    if (state === 'open') return;
    return pollWhileVisible(reload, UNHEARD_EVERY_MS);
  }, [state, reload]);

  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible' || Date.now() - lastAsked.current < VISIBLE_GAP_MS) return;
      reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  return { read, error, reload, drop, asked };
}
