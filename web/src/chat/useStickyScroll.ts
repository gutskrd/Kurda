import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps a thread pinned to the newest message — but only while the reader is
 * already there.
 *
 * Scrolling to the bottom on every update yanks you away the moment someone
 * writes while you are reading back through history, which in a busy group makes
 * old messages impossible to read. This sticks to the bottom when you are at the
 * bottom, and otherwise leaves your position alone and reports that there is
 * something new below.
 */

/**
 * How close to the end still counts as "at the bottom". Generous enough to
 * survive a part-scrolled last message and sub-pixel rounding on zoomed displays.
 */
const BOTTOM_SLACK_PX = 80;

export function useStickyScroll(dep: unknown): {
  ref: React.RefObject<HTMLDivElement | null>;
  /** the reader is at (or near) the newest message */
  atBottom: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  // Mirrored in a ref so the follow effect can read it without listing it as a
  // dependency — it must re-run when the MESSAGES change, not every time the
  // reader crosses the threshold. A suppressed lint rule would hide that.
  const atBottomRef = useRef(true);
  // the first paint should land at the newest message however far up it starts
  const settled = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo?.({ top: el.scrollHeight, behavior });
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  // track where the reader is
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = (): void => {
      const next = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX;
      atBottomRef.current = next;
      setAtBottom(next);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // follow new messages, unless the reader has scrolled away
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!settled.current) {
      settled.current = true;
      scrollToBottom();
      return;
    }
    if (atBottomRef.current) scrollToBottom();
  }, [dep, scrollToBottom]);

  return { ref, atBottom, scrollToBottom };
}
