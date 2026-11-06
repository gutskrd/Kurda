/**
 * Road unit files for the seeder's tests: the format the writers use (a
 * course import document with the course header and one unit, each lesson
 * with its authoring key), small enough to read at a glance.
 */

/** A lesson's exercises: something of each kind a road lesson has, each recordable one with its voice. */
export function roadExercises(n: number): Array<{ position: number; type: string; payload: unknown }> {
  return [
    {
      position: 1,
      type: 'match_pairs',
      payload: { voice: 'hevalo', pairs: [{ left: 'silav', right: 'hello' }, { left: 'spas', right: 'thanks' }] },
    },
    {
      position: 2,
      type: 'multiple_choice',
      payload: { say: 'Silav!', voice: 'hamo', prompt: `What does “Silav” mean? (${n})`, options: ['Hello', 'Thanks'], correctIndex: 0 },
    },
    { position: 3, type: 'translate', payload: { voice: 'xezo', prompt: 'Thank you', accepted: ['Spas.', 'Spas'] } },
    {
      position: 4,
      type: 'conversation',
      payload: {
        id: `roadtest${n}`,
        speakers: [{ character: 'hamo' }, { character: 'xezo' }],
        lines: [
          { speaker: 0, text: 'Silav, Xezo!', en: 'Hello, Xezo!' },
          { speaker: 1, text: 'Silav, apo!', en: 'Hello, uncle!' },
        ],
        prompt: 'Who says hello first?',
        options: ['Hamo', 'Xezal'],
        correctIndex: 0,
      },
    },
  ];
}

export interface FixtureLesson {
  key?: string;
  position: number;
  titleKu?: string;
  titleEn?: string;
  exercises?: Array<{ position: number; type: string; payload: unknown }>;
}

/** One unit file of `course`: unit `unit`, skill 1 with a grammar note, the lessons given. */
export function roadUnitFile(course: string, unit: number, lessons: FixtureLesson[], skill = 1): Record<string, unknown> {
  return {
    course: { slug: course, dialect: 'kurmanji', titleKu: 'Rêya Kurmancî', titleEn: 'The Kurmanji Road' },
    units: [
      {
        position: unit,
        titleKu: `Yekîne ${unit}`,
        titleEn: `Unit ${unit}`,
        skills: [
          {
            position: skill,
            titleKu: 'Silav',
            titleEn: 'Hello',
            grammarMd: '**Ez** means *I*.',
            lessons: lessons.map((l) => ({
              ...(l.key !== undefined ? { key: l.key } : {}),
              position: l.position,
              titleKu: l.titleKu ?? `Ders ${l.position}`,
              titleEn: l.titleEn ?? `Lesson ${l.position}`,
              exercises: l.exercises ?? roadExercises(unit * 100 + l.position),
            })),
          },
        ],
      },
    ],
  };
}
