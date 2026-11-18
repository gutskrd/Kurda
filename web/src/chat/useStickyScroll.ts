import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps a thread at the newest message only while the reader is already there; otherwise it leaves the position
 * alone and reports that something new is below.
 */

/** How close to the end counts as at the bottom, allowing for a part-scrolled last message and zoom rounding. */
const BOTTOM_SLACK_PX = 80;

/** How long a smooth scroll to the newest message may take, during which the thread still counts as at the bottom. */
const GLIDE_MS = 700;

export function useStickyScroll(dep: unknown): {
  ref: React.RefObject<HTMLDivElement | null>;
  /** the reader is at (or near) the newest message */
  atBottom: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  // Mirrored in a ref so the follow effect re-runs when messages change, not whenever the reader crosses the threshold.
  const atBottomRef = useRef(true);
  // the first paint should land at the newest message however far up it starts
  const settled = useRef(false);
  // until when a glide to the bottom is still on its way
  const gliding = useRef(0);

  /*
   * Following jumps ('instant'), since 'auto' obeys the thread's smooth-scroll style and a glide interrupted by
   * arriving messages counted as scrolling away. Only moves the reader asked for ('smooth') glide.
   */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'instant') => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo?.({ top: el.scrollHeight, behavior });
    gliding.current = behavior === 'smooth' ? Date.now() + GLIDE_MS : 0;
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  // track where the reader is
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = (): void => {
      const there = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX;
      if (there) gliding.current = 0;
      // on its way down at the reader's own asking: still theirs to follow
      const next = there || Date.now() < gliding.current;
      atBottomRef.current = next;
      setAtBottom(next);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  /* Content can grow after drawing (a game card filling in, a gift unwrapping), so a thread at its foot stays there. */
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return;
    const sizes = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTo?.({ top: el.scrollHeight, behavior: 'instant' });
    });
    const watch = (): void => {
      sizes.disconnect();
      for (const child of Array.from(el.children)) sizes.observe(child);
    };
    watch();
    const children = new MutationObserver(watch);
    children.observe(el, { childList: true });
    return () => {
      sizes.disconnect();
      children.disconnect();
    };
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

/**
 * How many messages from others arrived below since the reader scrolled up, counted from the last message seen at
 * the foot; the reader's own never count.
 */
export function useUnseenBelow(messages: readonly { id: string; senderId: string }[], atBottom: boolean, myId: string | undefined): number {
  const seen = useRef<string | null>(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (atBottom || seen.current === null) {
      seen.current = last?.id ?? null;
      setCount(0);
      return;
    }
    const from = messages.findIndex((m) => m.id === seen.current);
    // the message they were last at is gone (cleared, or a first page replaced): nothing to count from
    if (from === -1) {
      setCount(0);
      return;
    }
    setCount(messages.slice(from + 1).filter((m) => m.senderId !== myId).length);
  }, [messages, atBottom, myId]);
  return count;
}
