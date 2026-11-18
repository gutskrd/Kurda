import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { ask, justAnswered, lastAnswer, remember } from '../lib/apiMemory';
import { useMemoryOwner } from '../lib/useApi';
import { useT } from '../i18n/I18nProvider';
import type { CourseMap, CourseSummary } from './types';

export interface CourseEntry {
  course: CourseSummary;
  /** Null when this course's map failed to load; the course is still listed. */
  map: CourseMap | null;
}

/** The memory key for the courses and their maps together. */
const ENTRIES = 'learn:courses+maps';

/**
 * Every published course with the learner's map, in the server's order. Maps load in parallel, and a failed one lists
 * its course without progress. Learn draws what it showed last from memory (lib/apiMemory.ts) and refreshes behind it;
 * only a first visit or the one after a lesson (which empties the memory) waits. `reload` always asks again.
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
  // The memory owner when the courses are asked for; learning who is here is no reason to ask again.
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
    // Another part of this page was only just given it, so that is the answer.
    if (kept && !reloading && who && justAnswered(who, ENTRIES)) return;
    const get = <T,>(path: string) => (who ? ask<T>(client, who, path) : client.get<T>(path));
    void (async () => {
      const list = await get<{ courses: CourseSummary[] }>('/courses');
      if (!live) return;
      if (!list.ok) {
        // What was drawn stays when the server could not be reached.
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
