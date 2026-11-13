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

/**
 * How long a glide down to the newest message is given to get there. While it
 * is on its way the thread still counts as "at the bottom": the positions it
 * passes through are its own, not the reader scrolling away.
 */
const GLIDE_MS = 700;

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
  // until when a glide to the bottom is still on its way
  const gliding = useRef(0);

  /*
   * Following is a jump, not a glide. The thread's own style asks for smooth
   * scrolling, and 'auto' obeys it: the first paint then glided down the
   * placeholder rows, was caught half-way by the messages arriving, counted
   * as "scrolled away" — and a conversation opened a screen short of its
   * newest message wherever the placeholder was taller than the thread (any
   * desk). Only a move the reader asked for ('smooth': the way back down, a
   * message just sent) glides, and is not mistaken for leaving while it does.
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

  /*
   * What is in the thread can grow after it is drawn — a game card that fills
   * in once its lobby answers, a gift that unwraps — and none of that is a
   * new message. A thread that was at its foot stays there through it:
   * otherwise the newest thing in a conversation is the one cut off.
   */
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
 * How many messages from other people have arrived below while the reader was
 * up the thread: the number on the way back down.
 *
 * Counted from the last message that was on screen at the foot of the thread.
 * The reader's own messages never count — sending one takes them down anyway.
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
