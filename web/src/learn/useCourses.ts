import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import type { CourseMap, CourseSummary } from './types';

export interface CourseEntry {
  course: CourseSummary;
  /** null when this course's map could not be loaded: the course is still listed */
  map: CourseMap | null;
}

/**
 * Every published course with the learner's map of it, in the order the server
 * lists them — all of them, not only the first. The maps are fetched side by
 * side; one that fails leaves its course listed without progress rather than
 * hiding the rest.
 */
export function useCourses(): { entries: CourseEntry[] | null; error: string | null; reload: () => void } {
  const { client } = useAuth();
  const t = useT();
  const [entries, setEntries] = useState<CourseEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setError(null);
    setEntries(null);
    void (async () => {
      const list = await client.get<{ courses: CourseSummary[] }>('/courses');
      if (!live) return;
      if (!list.ok) {
        setError(describeError(list.error, t));
        return;
      }
      const maps = await Promise.all(
        list.data.courses.map((c) => client.get<CourseMap>(`/courses/${encodeURIComponent(c.id)}/map`)),
      );
      if (!live) return;
      setEntries(
        list.data.courses.map((course, i) => {
          const res = maps[i];
          return { course, map: res?.ok ? res.data : null };
        }),
      );
    })();
    return () => {
      live = false;
    };
  }, [client, t, nonce]);

  return { entries, error, reload };
}
