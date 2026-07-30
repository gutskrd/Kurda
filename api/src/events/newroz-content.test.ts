/**
 * Guards the Newroz seed data (KUR-090) so a malformed template or lesson is
 * caught in CI, not at seed time. Validates the event template against the
 * seeder's schema and the mini-lesson against the real content-authoring
 * pipeline (KUR-041) — same schema + per-exercise checks `content:import` runs.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { courseContentSchema } from '../content/import.js';
import { validateExercisePayload } from '../content/exercises.js';
import { upcomingOccurrences } from './recurrence.js';

const read = (rel: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../content/events/${rel}`, import.meta.url)), 'utf8'));

// Mirrors the seeder's template schema (KUR-090).
const templateSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: z.string().min(1),
  type: z.string().min(1),
  theme: z.string().min(1),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  durationDays: z.number().int().min(1).max(60),
  priority: z.number().int().min(0).optional(),
  quests: z.array(z.unknown()).optional(),
  rewards: z.record(z.string(), z.unknown()).optional(),
});

describe('newroz event template', () => {
  const template = templateSchema.parse(read('newroz.json'));

  it('is a valid annual template anchored on 21 March', () => {
    expect(template.month).toBe(3);
    expect(template.day).toBe(21);
  });

  it('expands into concrete future windows', () => {
    const occ = upcomingOccurrences(template, new Date('2026-01-01T00:00:00.000Z'), 2);
    expect(occ.map((o) => o.key)).toEqual(['newroz-2026', 'newroz-2027']);
    expect(occ[0]!.theme).toBe('newroz');
  });
});

describe('newroz mini-lesson content', () => {
  it('passes the standard content schema and every exercise payload validates', () => {
    const parsed = courseContentSchema.safeParse(read('newroz-lesson.json'));
    expect(parsed.success).toBe(true);
    const content = parsed.data!;
    expect(content.course.slug).toBe('newroz-culture');

    for (const unit of content.units) {
      for (const skill of unit.skills) {
        for (const lesson of skill.lessons) {
          for (const ex of lesson.exercises) {
            expect(() => validateExercisePayload(ex.type as never, ex.payload)).not.toThrow();
          }
        }
      }
    }
  });
});
