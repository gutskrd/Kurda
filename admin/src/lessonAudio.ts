/**
 * The lessons side of the audio studio, as data: what the API says the
 * lessons need, how the page filters and groups it, and which item comes next
 * when an editor is working through what is missing. Kept apart from the page
 * so it can be tested without a browser.
 */
import { LESSON_AUDIO_TEXT_MAX, lessonAudioKey } from '@kurda/shared';

export type ExerciseType = 'multiple_choice' | 'translate' | 'match_pairs' | 'listening' | 'speaking' | 'writing';

/** One lesson that uses a text (GET /admin/lesson-audio). */
export interface Usage {
  courseId: string;
  courseTitle: string;
  unitId: string;
  unitTitle: string;
  skillId: string;
  skillTitle: string;
  lessonPosition: number;
  lessonId: string;
  lessonTitle: string;
  lessonStatus: 'draft' | 'in_review' | 'published' | 'archived';
  lessonVersion: number;
  /** learners hear it today: the published version uses it */
  live: boolean;
  exerciseTypes: ExerciseType[];
}

export interface Item {
  key: string;
  text: string;
  recorded: boolean;
  url: string | null;
  durationMs: number | null;
  updatedAt: string | null;
  usedIn: Usage[];
  /** recorded, but no lesson uses it (or added here by hand) */
  unused: boolean;
}

export interface Listing {
  items: Item[];
  summary: { needed: number; recorded: number; missing: number; unused: number };
}

export type Filter = 'all' | 'missing' | 'recorded' | 'unused';

/** Whether no lesson uses it: a recording left behind, or a phrase added here. */
export function isLoose(item: Item): boolean {
  return item.usedIn.length === 0;
}

export function matches(item: Item, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'missing':
      return !item.recorded;
    case 'recorded':
      return item.recorded && !isLoose(item);
    case 'unused':
      return isLoose(item);
  }
}

/** "X of Y recorded", counting only what lessons use. */
export function progress(items: readonly Item[]): { recorded: number; needed: number } {
  const needed = items.filter((i) => !isLoose(i));
  return { recorded: needed.filter((i) => i.recorded).length, needed: needed.length };
}

export function counts(items: readonly Item[]): Record<Filter, number> {
  return {
    all: items.length,
    missing: items.filter((i) => matches(i, 'missing')).length,
    recorded: items.filter((i) => matches(i, 'recorded')).length,
    unused: items.filter((i) => matches(i, 'unused')).length,
  };
}

/**
 * Soranî is written in Arabic script, right to left; Kurmancî in Latin. Set
 * on the element so the browser shapes and orders the text, and a screen
 * reader says it in the right voice.
 */
export function scriptOf(text: string): { lang: 'ckb' | 'ku'; dir: 'rtl' | 'ltr' } {
  return /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(text) ? { lang: 'ckb', dir: 'rtl' } : { lang: 'ku', dir: 'ltr' };
}

export interface LessonGroup {
  /** the lesson across its versions: skill and position */
  id: string;
  title: string;
  skillTitle: string;
  status: Usage['lessonStatus'];
  live: boolean;
  items: Item[];
}
export interface UnitGroup {
  id: string;
  title: string;
  lessons: LessonGroup[];
}
export interface CourseGroup {
  id: string;
  title: string;
  units: UnitGroup[];
}

/**
 * Course → unit → lesson, in the order the API lists them (course order).
 * A text several lessons use is filed once, under the first; what no lesson
 * uses is returned apart.
 */
export function group(items: readonly Item[]): { courses: CourseGroup[]; loose: Item[] } {
  const courses: CourseGroup[] = [];
  const loose: Item[] = [];
  for (const item of items) {
    const first = item.usedIn[0];
    if (!first) {
      loose.push(item);
      continue;
    }
    let course = courses.find((c) => c.id === first.courseId);
    if (!course) courses.push((course = { id: first.courseId, title: first.courseTitle, units: [] }));
    let unit = course.units.find((u) => u.id === first.unitId);
    if (!unit) course.units.push((unit = { id: first.unitId, title: first.unitTitle, lessons: [] }));
    const lessonId = `${first.skillId}:${first.lessonPosition}`;
    let lesson = unit.lessons.find((l) => l.id === lessonId);
    if (!lesson) {
      unit.lessons.push(
        (lesson = { id: lessonId, title: first.lessonTitle, skillTitle: first.skillTitle, status: first.lessonStatus, live: first.live, items: [] }),
      );
    }
    lesson.live ||= first.live;
    lesson.items.push(item);
  }
  return { courses, loose };
}

/** The items in the order the page shows them: lesson by lesson, then the loose ones. */
export function displayOrder(items: readonly Item[]): Item[] {
  const { courses, loose } = group(items);
  return [...courses.flatMap((c) => c.units.flatMap((u) => u.lessons.flatMap((l) => l.items))), ...loose];
}

/**
 * The next item still to record after `afterKey`, in page order, wrapping
 * round — what "Record next missing" moves to after each save. Null when
 * everything is recorded. With no `afterKey`, the first missing item.
 */
export function nextMissing(ordered: readonly Item[], afterKey: string | null): Item | null {
  const at = afterKey ? ordered.findIndex((i) => i.key === afterKey) : -1;
  for (let step = 1; step <= ordered.length; step++) {
    const item = ordered[(at + step + ordered.length) % ordered.length]!;
    if (!item.recorded) return item;
  }
  return null;
}

/** The item next to `key` in `ordered`, `step` away, staying in bounds. */
export function neighbour(ordered: readonly Item[], key: string | null, step: number): Item | null {
  if (ordered.length === 0) return null;
  const at = key ? ordered.findIndex((i) => i.key === key) : -1;
  if (at === -1) return ordered[0]!;
  return ordered[Math.max(0, Math.min(ordered.length - 1, at + step))]!;
}

export type AddResult = { ok: true; items: Item[]; key: string; existed: boolean } | { ok: false; problem: string };

/**
 * Add a phrase of the editor's own to record. If the lessons already use it
 * (spelled however), that item is the one to record, and nothing is added.
 */
export function addPhrase(items: readonly Item[], raw: string): AddResult {
  const text = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  const key = lessonAudioKey(text);
  if (!key) return { ok: false, problem: 'Type the Kurdish to record.' };
  if (text.length > LESSON_AUDIO_TEXT_MAX) return { ok: false, problem: `Keep it under ${LESSON_AUDIO_TEXT_MAX} characters.` };
  if (items.some((i) => i.key === key)) return { ok: true, items: [...items], key, existed: true };
  const added: Item = { key, text, recorded: false, url: null, durationMs: null, updatedAt: null, usedIn: [], unused: true };
  return { ok: true, items: [...items, added], key, existed: false };
}

/** After a save: the item recorded, with what the server stored. */
export function withRecording(items: readonly Item[], saved: { key: string; url: string; durationMs: number; updatedAt: string }): Item[] {
  return items.map((i) =>
    i.key === saved.key ? { ...i, recorded: true, url: saved.url, durationMs: saved.durationMs, updatedAt: saved.updatedAt, unused: isLoose(i) } : i,
  );
}

/** After a removal: a lesson's text goes back to missing; a loose one goes away. */
export function withoutRecording(items: readonly Item[], key: string): Item[] {
  return items.flatMap((i) => {
    if (i.key !== key) return [i];
    if (isLoose(i)) return [];
    return [{ ...i, recorded: false, url: null, durationMs: null, updatedAt: null }];
  });
}

const TYPE_LABELS: Record<ExerciseType, string> = {
  multiple_choice: 'multiple choice',
  translate: 'translate',
  match_pairs: 'match pairs',
  listening: 'listening',
  speaking: 'speaking',
  writing: 'writing',
};

/** "Greetings 1 (multiple choice, translate)" — where a text is used, for the row. */
export function describeUsage(u: Usage): string {
  return `${u.lessonTitle} (${u.exerciseTypes.map((t) => TYPE_LABELS[t] ?? t).join(', ')})`;
}

/** A listening item cannot be answered without its recording, so those come first in the editor's mind. */
export function neededForListening(item: Item): boolean {
  return item.usedIn.some((u) => u.exerciseTypes.includes('listening'));
}
