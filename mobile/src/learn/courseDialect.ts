import { useEffect, useState } from 'react';
import { isSoraniDialect } from '@kurda/shared';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * Which Kurdish the learner is learning: the variety of the course on their path. Learn knows this, since it
 * reads every course and picks the one the path shows, so it records it here as the path settles; anything else
 * that speaks to the learner in their Kurdish (an empty group chat's greetings) reads it. Kept on this device for
 * the next launch; Kurmancî until Learn says otherwise.
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
