import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateContent } from './import.js';

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content');
const seedPath = join(contentDir, 'kurmanji-seed.json');
const newrozPath = join(contentDir, 'events', 'newroz-lesson.json');

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

/**
 * A multiple-choice item's Kurdish may be quoted in its prompt or be its
 * options, so the audio studio cannot find it unless the item says which:
 * the quoted word, or else the right option (its Kurdish, where the option
 * carries a gloss: "Agir (fire)").
 */
describe('multiple-choice items in the shipped content', () => {
  const seeds: Array<[string, string]> = [
    ['the Kurmanji seed', seedPath],
    ['the Newroz lesson', newrozPath],
  ];
  /** items with no Kurdish in the question or the options: nothing to hear */
  const NOTHING_TO_HEAR = new Set(['On which date is Newroz celebrated?']);

  it.each(seeds)('name the Kurdish to hear: %s', (_, path) => {
    const res = validateContent(JSON.parse(readFileSync(path, 'utf8')));
    if (!res.ok) throw new Error(`${path} is invalid`);
    const items = res.content.units
      .flatMap((u) => u.skills.flatMap((s) => s.lessons.flatMap((l) => l.exercises)))
      .filter((e) => e.type === 'multiple_choice')
      .map((e) => e.payload as { prompt: string; options: string[]; correctIndex: number; say?: string });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      if (NOTHING_TO_HEAR.has(item.prompt)) {
        expect(item.say, item.prompt).toBeUndefined();
        continue;
      }
      expect(item.say, item.prompt).toBeTruthy();
      const quoted = /"([^"]+)"/.exec(item.prompt)?.[1];
      const correct = item.options[item.correctIndex]!;
      const correctKurdish = correct.replace(/\s*\([^)]*\)$/, '');
      expect([quoted, correct, correctKurdish], item.prompt).toContain(item.say);
    }
  });
});
