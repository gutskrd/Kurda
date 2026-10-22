/**
 * Guards the starter lessons (api/content/lessons) in CI rather than at a
 * deploy: every exercise passes the schema it is stored under, and the
 * conversation is ready for the people recording it — every part has a
 * character to be shown as, and every line has its meaning for learners.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conversationClips, type ConversationPayload } from '@kurda/shared';
import { validateExercisePayload } from './exercises.js';
import type { ExerciseType } from './repository.js';
import { STARTER_LESSON_FILE } from './starter-lessons.js';

interface Starter {
  slug: string;
  course: string;
  skill: string;
  titleKu: string;
  titleEn: string;
  exercises: Array<{ type: ExerciseType; payload: unknown }>;
}

const starters = (JSON.parse(readFileSync(STARTER_LESSON_FILE, 'utf8')) as { lessons: Starter[] }).lessons;

describe('the starter lessons', () => {
  it.each(starters.map((s) => [s.slug, s] as const))('%s is a complete lesson that passes every check', (_, starter) => {
    expect(starter.exercises.length).toBeGreaterThanOrEqual(8);
    for (const ex of starter.exercises) expect(() => validateExercisePayload(ex.type, ex.payload)).not.toThrow();
    // a mix, not one kind of question again and again
    expect(new Set(starter.exercises.map((e) => e.type)).size).toBeGreaterThanOrEqual(5);
  });

  it.each(starters.map((s) => [s.slug, s] as const))('%s has a conversation ready to record', (_, starter) => {
    const conversations = starter.exercises.filter((e) => e.type === 'conversation').map((e) => e.payload as ConversationPayload);
    expect(conversations.length).toBeGreaterThan(0);
    for (const c of conversations) {
      expect(c.speakers.every((s) => s.character)).toBe(true);
      expect(c.lines.every((l) => l.en)).toBe(true);
      expect(conversationClips(c)).toHaveLength(c.lines.length);
    }
  });
});
