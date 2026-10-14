import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { APP_FEEDBACK_DELAY_MS, shouldOfferFeedbackBox } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { dismissFeedback, feedbackState } from './api';
import { onGameFinished, onGameStarted } from './gameFinished';
import { RatingBox } from './RatingBox';

/**
 * The accounts the box has come up for in this tab. Once a visit is the most
 * it may: the server's "prompted" mark is what stops it for good, and this is
 * what stops a second game in the same visit asking again while that mark is
 * on its way. Per account, so somebody else signing in on the same tab is
 * still asked after their own first game.
 */
const offeredTo = new Set<string>();

/** For tests: a fresh visit. */
export function resetFeedbackSessionForTests(): void {
  offeredTo.clear();
}

/** The custom property the page's bottom padding grows by while the box is up (layout.css). */
export const RB_SPACE_VAR = '--rb-space';
/** The gap the box keeps from the bottom of the window, in px (feedback.css `.rb-host`). */
const RB_BOTTOM_GAP = 12;

type Slot = { timer: ReturnType<typeof setTimeout> | null; path: string };

/**
 * The one-time rating box, mounted once in the app shell (contract §F).
 *
 * It listens for "a game just finished" (`reportGameFinished`, said by every
 * game's results) and, the first time in a visit that a game finishes — not
 * given up, and not on results that already ask something else — asks the API
 * whether this account is due. If it is, the box slides up over the bottom of
 * the page about 1.2 s after the results.
 *
 * It must never block them, so:
 *  - while it is up, the page grows at the bottom by the box's height, and
 *    everything on it can be scrolled clear of the box;
 *  - a box still on its way is dropped when the player leaves the page or
 *    starts the next round on it ("Race again", "Play again");
 *  - an open box closes when the player does either — keeping stars already
 *    chosen (RatingBox `leave`).
 *
 * Showing it is what counts: the server hears "shown" the moment it comes up,
 * so somebody who ignores it and closes the tab is not asked on every visit.
 * An answer given after that still saves.
 *
 * It does not take the focus — the results are what somebody just earned —
 * but a screen reader hears the question once, and Escape in it is the way out.
 */
export function FeedbackHost(): React.JSX.Element | null {
  const { client, user } = useAuth();
  const t = useT();
  const location = useLocation();
  // the page the box is up on, or null
  const [openOn, setOpenOn] = useState<string | null>(null);
  const pending = useRef<Slot | null>(null);
  const leaveRef = useRef<(() => void) | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const userId = user?.id ?? null;
  // the page a game finished on, read when it finishes
  const path = useRef(location.pathname);
  path.current = location.pathname;

  const cancelPending = useCallback(() => {
    if (pending.current?.timer) clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);

  useEffect(() => {
    if (!userId) return;
    const stopFinished = onGameFinished(({ gaveUp, deferred }) => {
      if (offeredTo.has(userId) || pending.current || gaveUp || deferred) return;
      const startedAt = Date.now();
      const slot: Slot = { timer: null, path: path.current };
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
          // still on the results it was meant for (the path check below is
          // an effect, a render behind a navigation)
          if (path.current !== slot.path || offeredTo.has(userId)) return;
          offeredTo.add(userId);
          // shown is shown, answered or not
          void dismissFeedback(client);
          setOpenOn(slot.path);
        }, wait);
      });
    });
    // a new round on the same page: whatever was coming, or is up, is for the last one
    const stopStarted = onGameStarted(() => {
      cancelPending();
      leaveRef.current?.();
    });
    return () => {
      stopFinished();
      stopStarted();
      cancelPending();
    };
  }, [client, userId, cancelPending]);

  // signed out: nothing on its way, nothing up
  useEffect(() => {
    if (!userId) {
      cancelPending();
      setOpenOn(null);
    }
  }, [userId, cancelPending]);

  // a box, on its way or up, is for the page it was meant for
  useEffect(() => {
    if (pending.current && pending.current.path !== location.pathname) cancelPending();
    if (openOn !== null && openOn !== location.pathname) leaveRef.current?.();
  }, [location.pathname, openOn, cancelPending]);

  // room under the page for the box, so nothing on it is out of reach
  useEffect(() => {
    const el = hostRef.current;
    if (openOn === null || !el) return;
    const root = document.documentElement;
    const measure = (): void => {
      root.style.setProperty(RB_SPACE_VAR, `${Math.ceil(el.getBoundingClientRect().height) + RB_BOTTOM_GAP}px`);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(RB_SPACE_VAR);
    };
  }, [openOn]);

  const close = useCallback(() => {
    leaveRef.current = null;
    setOpenOn(null);
  }, []);

  if (openOn === null) return null;
  return (
    <div
      ref={hostRef}
      className="rb-host"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        // the way out, which keeps any stars already chosen
        if (leaveRef.current) leaveRef.current();
        else close();
      }}
    >
      <p className="sr-only" role="status">
        {t('appFeedback.question')}
      </p>
      <RatingBox source="first_game" titleId={titleId} onClose={close} leaveRef={leaveRef} />
    </div>
  );
}
