import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { APP_FEEDBACK_DELAY_MS, shouldOfferFeedbackBox } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { isFocusedPath } from '../layouts/focus';
import { dismissFeedback, feedbackState } from './api';
import { onGameFinished, onGameStarted } from './gameFinished';
import { RatingBox } from './RatingBox';

/**
 * The accounts the box has come up for in this tab, so a second game in the same visit does not ask again while the
 * server's "prompted" mark is on its way. Per account, so another person signing in on the tab is still asked.
 */
const offeredTo = new Set<string>();

/** For tests: a fresh visit. */
export function resetFeedbackSessionForTests(): void {
  offeredTo.clear();
}

/** The custom property the page's bottom padding grows by while the box is up (layout.css). */
const RB_SPACE_VAR = '--rb-space';
/** The gap the box keeps from the bottom of the window, in px (feedback.css `.rb-host`). */
const RB_BOTTOM_GAP = 12;

type Slot = { timer: ReturnType<typeof setTimeout> | null; path: string };

/**
 * The one-time rating box, mounted once in the app shell. The first time in a visit that a game finishes (not given
 * up, and not on results that already ask something), it asks the API whether this account is due, and if so slides
 * up shortly after the results.
 *
 * It never blocks the results: the page grows at the bottom by the box's height, and a pending or open box goes away
 * when the player leaves or starts the next round, keeping any stars chosen (RatingBox `leave`). The server hears
 * "shown" as soon as it appears, so ignoring it does not mean being asked every visit. It does not take focus, but
 * screen readers hear the question once and Escape closes it.
 */
export function FeedbackHost(): React.JSX.Element | null {
  const { client, user } = useAuth();
  const t = useT();
  const location = useLocation();
  // The page the box is up on, or null.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const pending = useRef<Slot | null>(null);
  const leaveRef = useRef<(() => void) | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const userId = user?.id ?? null;
  // The current page, read when a game finishes.
  const path = useRef(location.pathname);
  path.current = location.pathname;

  const cancelPending = useCallback(() => {
    if (pending.current?.timer) clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);

  useEffect(() => {
    if (!userId) return;
    const stopFinished = onGameFinished(({ gaveUp, deferred }) => {
      // Never over a lesson or a review, which has the screen to itself.
      if (offeredTo.has(userId) || pending.current || gaveUp || deferred || isFocusedPath(path.current)) return;
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
        // The box comes a set delay after the results, however long the API took to answer.
        const wait = Math.max(0, APP_FEEDBACK_DELAY_MS - (Date.now() - startedAt));
        slot.timer = setTimeout(() => {
          if (pending.current !== slot) return;
          pending.current = null;
          // Still on the results it was meant for; the path effect below runs a render behind a navigation.
          if (path.current !== slot.path || offeredTo.has(userId)) return;
          offeredTo.add(userId);
          // Shown counts, answered or not.
          void dismissFeedback(client);
          setOpenOn(slot.path);
        }, wait);
      });
    });
    // A new round on the same page drops any box meant for the last one.
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

  // Signed out: nothing pending, nothing up.
  useEffect(() => {
    if (!userId) {
      cancelPending();
      setOpenOn(null);
    }
  }, [userId, cancelPending]);

  // A pending or open box belongs to the page it was meant for.
  useEffect(() => {
    if (pending.current && pending.current.path !== location.pathname) cancelPending();
    if (openOn !== null && openOn !== location.pathname) leaveRef.current?.();
  }, [location.pathname, openOn, cancelPending]);

  // Room under the page for the box, so nothing is out of reach.
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

  if (openOn === null || isFocusedPath(location.pathname)) return null;
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
        // Leave, keeping any stars already chosen.
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
