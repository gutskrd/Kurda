import { useCallback, useEffect, useRef } from 'react';
import type { StoryMe } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { putProgress } from './api';

/** The least time between two writes of where a reader is; the server refuses more than sixty a minute. */
export const PROGRESS_EVERY_MS = 10_000;

/**
 * Where a signed-in reader has got to in a story, kept on the server as they
 * read (`PUT /stories/:id/progress`): the furthest paragraph that has come
 * into view, the share of the text that is, and `finished` once the last
 * paragraph has been seen — the server sets `finishedAt` once and never
 * takes it back, and that is what opens the check.
 *
 * Paragraphs are watched with an IntersectionObserver through the ref each
 * one gets from `observe`. Writes are spaced at least ten seconds apart, so
 * a reader scrolling through a story costs a handful of requests, not one a
 * paragraph; what is still unsent goes when the story is finished, when the
 * page is hidden or left, and when the reader goes elsewhere in the app.
 * Nothing is watched or written for a visitor, or where the browser has no
 * observer (a test).
 *
 * `onMe` is handed the server's answer, the reader's whole record on the
 * story, so the page can show the check open the moment it is.
 */
export function useReadingProgress({
  storyId,
  count,
  enabled,
  initial,
  onMe,
}: {
  storyId: string;
  /** how many paragraphs the story has */
  count: number;
  enabled: boolean;
  /** the record the story arrived with, so the furthest paragraph never goes backwards */
  initial: StoryMe | null;
  onMe: (me: StoryMe) => void;
}): { observe: (index: number) => (el: HTMLElement | null) => void } {
  const { client } = useAuth();
  const io = useRef<IntersectionObserver | null>(null);
  const indexOf = useRef(new WeakMap<Element, number>());
  // the paragraphs hand themselves in as they are drawn, which is before the observer exists
  const elements = useRef(new Set<HTMLElement>());
  const state = useRef({
    // before anything was read the record says paragraph 0 and no share: the first paragraph still counts as new
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
      // a write that did not land is tried again with the next change
      else if (!res.ok) s.dirty = true;
    });
  }, [client]);

  /** Send now if the last write is old enough, else at the next slot — once, however many paragraphs scroll by meanwhile. */
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
      // reaching the end is told at once: the check waits on it
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
      // half of a paragraph in view is reading it; a line peeking in at the foot is not
      { threshold: 0.5 },
    );
    io.current = observer;
    for (const el of elements.current) observer.observe(el);
    return () => {
      observer.disconnect();
      io.current = null;
    };
  }, [enabled, seen]);

  // the page hidden or left: what is unsent goes now
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
      // leaving for elsewhere in the app: the request outlives the page
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
