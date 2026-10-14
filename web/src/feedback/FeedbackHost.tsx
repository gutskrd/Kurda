import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { APP_FEEDBACK_DELAY_MS, shouldOfferFeedbackBox } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { feedbackState } from './api';
import { onGameFinished } from './gameFinished';
import { RatingBox } from './RatingBox';

/**
 * Whether the box has come up in this tab already. Once a session is the most
 * it may: the server's "prompted" mark is what stops it for good, and this is
 * what stops a second game in the same visit asking again while that mark is
 * on its way.
 */
let offeredThisSession = false;

/** For tests: a fresh visit. */
export function resetFeedbackSessionForTests(): void {
  offeredThisSession = false;
}

/**
 * The one-time rating box, mounted once in the app shell (contract §F).
 *
 * It listens for "a game just finished" (`reportGameFinished`, said by every
 * game's results) and, the first time in a visit that a game finishes — not
 * given up — asks the API whether this account is due. If it is, the box
 * slides up over the bottom of the page about 1.2 s after the results, beside
 * them rather than over them: a card, not a dialog that takes the screen.
 * Leaving the page before then cancels it.
 *
 * It does not take the focus — the results are what somebody just earned —
 * but a screen reader hears the question once, and Escape in it is "Not now".
 */
export function FeedbackHost(): React.JSX.Element | null {
  const { client, user } = useAuth();
  const t = useT();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout> | null; path: string } | null>(null);
  const titleId = useId();
  const signedIn = Boolean(user);
  // the page a game finished on, read when it finishes
  const path = useRef(location.pathname);
  path.current = location.pathname;

  useEffect(() => {
    if (!signedIn) return;
    return onGameFinished(({ gaveUp }) => {
      if (offeredThisSession || pending.current || gaveUp) return;
      const startedAt = Date.now();
      const slot: { timer: ReturnType<typeof setTimeout> | null; path: string } = { timer: null, path: path.current };
      pending.current = slot;
      void feedbackState(client).then((res) => {
        if (pending.current !== slot) return;
        const due = shouldOfferFeedbackBox({
          state: res.ok ? res.data : null,
          justFinished: true,
          gaveUp: false,
          storePromptThisSession: false,
        });
        if (!due) {
          pending.current = null;
          return;
        }
        // the results first; the box a moment after them, however long the
        // question took to answer
        const wait = Math.max(0, APP_FEEDBACK_DELAY_MS - (Date.now() - startedAt));
        slot.timer = setTimeout(() => {
          if (pending.current !== slot) return;
          pending.current = null;
          offeredThisSession = true;
          setOpen(true);
        }, wait);
      });
    });
  }, [client, signedIn]);

  // a box on its way is for the page it was meant for
  useEffect(() => {
    const slot = pending.current;
    if (slot && slot.path !== location.pathname) {
      if (slot.timer) clearTimeout(slot.timer);
      pending.current = null;
    }
  }, [location.pathname]);

  useEffect(
    () => () => {
      if (pending.current?.timer) clearTimeout(pending.current.timer);
      pending.current = null;
    },
    [],
  );

  const close = useCallback(() => setOpen(false), []);

  if (!open) return null;
  return (
    <div
      className="rb-host"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        // the same as "Not now", which the box itself sends; after the
        // thank-you, simply closed
        const notNow = e.currentTarget.querySelector<HTMLButtonElement>('.rb-not-now');
        if (notNow) notNow.click();
        else close();
      }}
    >
      <p className="sr-only" role="status">
        {t('appFeedback.question')}
      </p>
      <RatingBox source="first_game" titleId={titleId} onClose={close} />
    </div>
  );
}
