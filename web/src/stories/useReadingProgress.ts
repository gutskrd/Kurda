import { useCallback, useEffect, useRef } from 'react';
import type { StoryMe } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { putProgress } from './api';

/** The least time between progress writes; the server refuses more than sixty a minute. */
export const PROGRESS_EVERY_MS = 10_000;

/**
 * Saves a signed-in reader's place (`PUT /stories/:id/progress`): the furthest paragraph seen, its share of the text,
 * and `finished` once the last paragraph shows, after which the server sets `finishedAt` for good and the check opens.
 * Paragraphs register through `observe` for an IntersectionObserver. Writes are at least ten seconds apart, and pending
 * ones go at once on finishing, hiding or leaving the page, or navigating away. Nothing runs for a visitor or without an
 * observer (tests). `onMe` gets the server's record so the page can open the check at once.
 */
export function useReadingProgress({
  storyId,
  count,
  enabled,
  initial,
  onMe,
}: {
  storyId: string;
  /** How many paragraphs the story has. */
  count: number;
  enabled: boolean;
  /** The record the story arrived with, so the furthest paragraph never goes backwards. */
  initial: StoryMe | null;
  onMe: (me: StoryMe) => void;
}): { observe: (index: number) => (el: HTMLElement | null) => void } {
  const { client } = useAuth();
  const io = useRef<IntersectionObserver | null>(null);
  const indexOf = useRef(new WeakMap<Element, number>());
  // Paragraphs register as they are drawn, before the observer exists.
  const elements = useRef(new Set<HTMLElement>());
  const state = useRef({
    // An unread record says paragraph 0 and no share, so the first paragraph still counts as new.
    furthest: initial && initial.share > 0 ? initial.paragraph : -1,
    finished: initial?.finishedAt !== null && initial?.finishedAt !== undefined,
    dirty: false,
    lastSent: 0,
    timer: null as ReturnType<typeof setTimeout> | null,
    sending: false,
  });
  const settings = useRef({ storyId, count, enabled, onMe });
  settings.current = { storyId, count, enabled, onMe };

  const flush = useCallback(() => {
    const s = state.current;
    const { storyId: id, count: n, enabled: on, onMe: tell } = settings.current;
    if (!on || !s.dirty || s.sending) return;
    if (s.timer) {
      clearTimeout(s.timer);
      s.timer = null;
    }
    s.dirty = false;
    s.sending = true;
    s.lastSent = Date.now();
    const share = n > 0 ? Math.min(1, (s.furthest + 1) / n) : 0;
    void putProgress(client, id, { paragraph: s.furthest, share, ...(s.finished ? { finished: true } : {}) }).then((res) => {
      s.sending = false;
      if (res.ok && res.data && res.data.me) tell(res.data.me);
      // A failed write is retried with the next change.
      else if (!res.ok) s.dirty = true;
    });
  }, [client]);

  /** Sends now if the last write is old enough, else once at the next slot. */
  const schedule = useCallback(
    (now = false) => {
      const s = state.current;
      const wait = now ? 0 : Math.max(0, PROGRESS_EVERY_MS - (Date.now() - s.lastSent));
      if (wait === 0) {
        flush();
        return;
      }
      if (s.timer) return;
      s.timer = setTimeout(() => {
        s.timer = null;
        flush();
      }, wait);
    },
    [flush],
  );

  const seen = useCallback(
    (index: number) => {
      const s = state.current;
      const n = settings.current.count;
      const last = n > 0 && index >= n - 1;
      if (index <= s.furthest && (!last || s.finished)) return;
      s.furthest = Math.max(s.furthest, index);
      s.dirty = true;
      // Reaching the end is sent at once, since the check waits on it.
      if (last && !s.finished) {
        s.finished = true;
        schedule(true);
        return;
      }
      schedule();
    },
    [schedule],
  );

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = indexOf.current.get(entry.target);
          if (index !== undefined) seen(index);
        }
      },
      // Half a paragraph in view counts as reading it; a line peeking in at the foot does not.
      { threshold: 0.5 },
    );
    io.current = observer;
    for (const el of elements.current) observer.observe(el);
    return () => {
      observer.disconnect();
      io.current = null;
    };
  }, [enabled, seen]);

  // The page hidden or left: send what is pending now.
  useEffect(() => {
    if (!enabled) return;
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      const s = state.current;
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      // Navigating elsewhere in the app: the request outlives the page.
      if (s.dirty) {
        s.dirty = false;
        const share = count > 0 ? Math.min(1, (s.furthest + 1) / count) : 0;
        void putProgress(client, storyId, { paragraph: s.furthest, share, ...(s.finished ? { finished: true } : {}) });
      }
    };
  }, [enabled, flush, client, storyId, count]);

  const observe = useCallback(
    (index: number) =>
      (el: HTMLElement | null): void => {
        if (!el) return;
        indexOf.current.set(el, index);
        elements.current.add(el);
        io.current?.observe(el);
      },
    [],
  );

  return { observe };
}
