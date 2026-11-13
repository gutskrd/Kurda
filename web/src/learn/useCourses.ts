import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { ask, justAnswered, lastAnswer, remember } from '../lib/apiMemory';
import { useMemoryOwner } from '../lib/useApi';
import { useT } from '../i18n/I18nProvider';
import type { CourseMap, CourseSummary } from './types';

export interface CourseEntry {
  course: CourseSummary;
  /** null when this course's map could not be loaded: the course is still listed */
  map: CourseMap | null;
}

/** What the courses and their maps are remembered under, together, as Learn draws them. */
const ENTRIES = 'learn:courses+maps';

/**
 * Every published course with the learner's map of it, in the order the server
 * lists them — all of them, not only the first. The maps are fetched side by
 * side; one that fails leaves its course listed without progress rather than
 * hiding the rest.
 *
 * Learn is the screen opened most, so what it drew last time is drawn at once
 * (lib/apiMemory.ts) and asked for again behind that; only a first visit, or
 * the visit after a lesson — which empties the memory, so the path is drawn
 * from what the lesson made of it — waits for the server. `reload` asks again
 * whatever is held.
 */
export function useCourses(): { entries: CourseEntry[] | null; error: string | null; reload: () => void } {
  const { client } = useAuth();
  const t = useT();
  const who = useMemoryOwner();
  const [entries, setEntries] = useState<CourseEntry[] | null>(() => (who ? (lastAnswer<CourseEntry[]>(who, ENTRIES)?.data ?? null) : null));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const asked = useRef(0);
  // whose memory, as it is when the courses are asked for: finding out who is here is not a reason to ask again
  const whoNow = useRef(who);
  whoNow.current = who;
  useEffect(() => {
    let live = true;
    const who = whoNow.current;
    const reloading = nonce !== asked.current;
    asked.current = nonce;
    setError(null);
    const kept = who ? lastAnswer<CourseEntry[]>(who, ENTRIES) : null;
    setEntries(kept?.data ?? null);
    // another part of this page was only just given it: that is the answer
    if (kept && !reloading && who && justAnswered(who, ENTRIES)) return;
    const get = <T,>(path: string) => (who ? ask<T>(client, who, path) : client.get<T>(path));
    void (async () => {
      const list = await get<{ courses: CourseSummary[] }>('/courses');
      if (!live) return;
      if (!list.ok) {
        // what was drawn stays drawn when the server could not be reached
        if (!kept) setError(describeError(list.error, t));
        return;
      }
      const maps = await Promise.all(list.data.courses.map((c) => get<CourseMap>(`/courses/${encodeURIComponent(c.id)}/map`)));
      if (!live) return;
      const next = list.data.courses.map((course, i) => {
        const res = maps[i];
        return { course, map: res?.ok ? res.data : null };
      });
      setEntries(who ? remember(who, ENTRIES, next) : next);
    })();
    return () => {
      live = false;
    };
  }, [client, t, nonce]);
  return { entries, error, reload };
}
