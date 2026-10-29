import { useEffect, useState } from 'react';
import { isSoraniDialect } from '@kurda/shared';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * Which Kurdish the learner is learning: the variety of the course on their
 * lesson path, the one they chose or the one they are furthest into.
 *
 * Learn is where that is known — it reads every course and decides which one
 * the path shows — so it says so here as the path settles on a course, and
 * whatever else wants to speak to the learner in their own Kurdish (an empty
 * group chat's greetings) reads it. Kept on this device so it is known the
 * next time the app opens; Kurmancî until Learn has said otherwise.
 */
export type CourseScript = 'kmr' | 'ckb';

const KEY = 'hevalo.course-dialect.v1';
let known: CourseScript | null = null;

/** Learn's word on the course it shows, by that course's `dialect`. */
export function rememberCourseDialect(dialect: string | null | undefined, store: DeviceStore = deviceStore): void {
  if (!dialect) return;
  const next: CourseScript = isSoraniDialect(dialect) ? 'ckb' : 'kmr';
  if (next === known) return;
  known = next;
  void store.set(KEY, next);
}

/** The learner's Kurdish: what Learn last said, else what this device kept, else Kurmancî. */
export function useCourseDialect(store: DeviceStore = deviceStore): CourseScript {
  const [script, setScript] = useState<CourseScript>(known ?? 'kmr');
  useEffect(() => {
    if (known) return;
    let live = true;
    void store.get(KEY).then((saved) => {
      if (!live || (saved !== 'kmr' && saved !== 'ckb')) return;
      known = saved;
      setScript(saved);
    });
    return () => {
      live = false;
    };
  }, [store]);
  return known ?? script;
}

/** Forget what was learnt, between tests. */
export function resetCourseDialect(): void {
  known = null;
}
