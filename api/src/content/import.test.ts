import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateContent } from './import.js';

const seedPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content', 'kurmanji-seed.json');

const minimalCourse = {
  course: { slug: 'test-course', titleKu: 'K', titleEn: 'Test' },
  units: [
    {
      position: 1,
      titleKu: 'Y',
      titleEn: 'Unit',
      skills: [
        {
          position: 1,
          titleKu: 'B',
          titleEn: 'Basics',
          lessons: [
            {
              position: 1,
              titleKu: 'L',
              titleEn: 'Lesson',
              exercises: [{ position: 1, type: 'translate', payload: { prompt: 'x', accepted: ['y'] } }],
            },
          ],
        },
      ],
    },
  ],
};

describe('validateContent', () => {
  it('accepts a well-formed course', () => {
    const res = validateContent(minimalCourse);
    expect(res.ok).toBe(true);
  });

  it('reports structural errors located by path', () => {
    const res = validateContent({ course: { slug: 'BAD SLUG', titleKu: 'K', titleEn: 'T' }, units: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const paths = res.issues.map((i) => i.path);
      expect(paths).toContain('course.slug'); // bad slug pattern
      expect(paths).toContain('units'); // empty units
    }
  });

  it('reports a bad exercise payload with its path', () => {
    const bad = structuredClone(minimalCourse);
    // multiple_choice with correctIndex out of range
    bad.units[0]!.skills[0]!.lessons[0]!.exercises[0] = {
      position: 1,
      type: 'multiple_choice',
      payload: { prompt: 'x', options: ['a', 'b'], correctIndex: 9 },
    } as never;
    const res = validateContent(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]!.path).toContain('units[0].skills[0].lessons[0].exercises[0].payload');
    }
  });

  it('rejects an unknown exercise type with a clear message', () => {
    const bad = structuredClone(minimalCourse);
    bad.units[0]!.skills[0]!.lessons[0]!.exercises[0] = {
      position: 1,
      type: 'flashcard',
      payload: {},
    } as never;
    const res = validateContent(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.some((i) => /unknown exercise type/i.test(i.message))).toBe(true);
  });
});

describe('kurmanji seed', () => {
  it('is valid and has at least 15 lessons across 3 units', () => {
    const raw = JSON.parse(readFileSync(seedPath, 'utf8'));
    const res = validateContent(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.content.units).toHaveLength(3);
      const lessons = res.content.units.flatMap((u) => u.skills.flatMap((s) => s.lessons));
      expect(lessons.length).toBeGreaterThanOrEqual(15);
    }
  });
});
