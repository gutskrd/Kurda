import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lessonContentHash, validateContent } from './import.js';

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

describe('validateContent — answer-position lint', () => {
  const withChoices = (correctIndexes: number[]) => {
    const course = structuredClone(minimalCourse);
    course.units[0]!.skills[0]!.lessons[0]!.exercises = correctIndexes.map((correctIndex, i) => ({
      position: i + 1,
      type: 'multiple_choice',
      payload: { prompt: `q${i}`, options: ['a', 'b', 'c'], correctIndex },
    })) as never;
    return course;
  };

  it('warns, without failing, when every multiple-choice answer is in one position', () => {
    const res = validateContent(withChoices([0, 0, 0, 0]));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.warnings).toHaveLength(1);
      expect(res.warnings[0]!.message).toMatch(/all 4 multiple-choice answers are option 0/);
    }
  });

  it('says nothing when the positions vary, or there are too few to tell', () => {
    for (const indexes of [[0, 1, 0, 2], [0, 0], []]) {
      const res = validateContent(indexes.length ? withChoices(indexes) : minimalCourse);
      expect(res.ok && res.warnings, String(indexes)).toEqual([]);
    }
  });
});

describe('lessonContentHash', () => {
  const lesson = {
    titleKu: 'Silav',
    titleEn: 'Greetings',
    exercises: [
      { position: 1, type: 'translate', payload: { prompt: 'hello', accepted: ['silav'] } },
      { position: 2, type: 'multiple_choice', payload: { prompt: 'Silav?', options: ['Hello', 'Bye'], correctIndex: 0 } },
    ],
  };

  it('is the same for the same content, whatever the key or exercise order', () => {
    const reordered = {
      exercises: [
        { payload: { correctIndex: 0, options: ['Hello', 'Bye'], prompt: 'Silav?' }, type: 'multiple_choice', position: 2 },
        { payload: { accepted: ['silav'], prompt: 'hello' }, type: 'translate', position: 1 },
      ],
      titleEn: 'Greetings',
      titleKu: 'Silav',
    };
    expect(lessonContentHash(reordered)).toBe(lessonContentHash(lesson));
  });

  it('changes when one word changes', () => {
    const changed = structuredClone(lesson);
    (changed.exercises[0]!.payload as { accepted: string[] }).accepted = ['rojbaş'];
    expect(lessonContentHash(changed)).not.toBe(lessonContentHash(lesson));
    expect(lessonContentHash({ ...lesson, titleEn: 'Hello' })).not.toBe(lessonContentHash(lesson));
  });

  it('ignores keys the schema would not store', () => {
    const extra = structuredClone(lesson);
    (extra.exercises[0]!.payload as Record<string, unknown>).note = 'editor scribble';
    expect(lessonContentHash(extra)).toBe(lessonContentHash(lesson));
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
