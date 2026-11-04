/**
 * The audio studio's listing without a database: who each text is planned
 * for (`plannedSpeaker`) and which course each use is in, read off rows as
 * Postgres returns them, in course order.
 */
import { describe, expect, it } from 'vitest';
import { conversationLineKey, lessonAudioKey } from '@kurda/shared';
import type { ExerciseType } from '../content/repository.js';
import { LessonAudioService } from './service.js';

interface Place {
  course: string;
  lesson: number;
  status?: 'draft' | 'published';
  version?: number;
}

/** One exercise row of the listing's query, at a lesson of a course. */
function row(at: Place, type: ExerciseType, payload: unknown) {
  return {
    course_id: `id-${at.course}`,
    course_slug: at.course,
    course_title: at.course === 'kurmanji-road' ? 'The Kurmanji Road' : 'Kurmanji basics',
    unit_id: `${at.course}-u1`,
    unit_title: 'Unit one',
    skill_id: `${at.course}-s1`,
    skill_title: 'Greetings',
    lesson_id: `${at.course}-l${at.lesson}-v${at.version ?? 1}`,
    lesson_position: at.lesson,
    lesson_title: `Lesson ${at.lesson}`,
    status: at.status ?? 'draft',
    version: at.version ?? 1,
    type,
    payload,
  };
}

/** A pool that answers the listing's three queries: the exercises, the stories and the recordings. */
function pool(exercises: unknown[], recordings: unknown[] = [], stories: unknown[] = []) {
  return {
    query: async (sql: string) => {
      if (sql.includes('FROM stories')) return { rows: stories };
      if (sql.includes('WITH current')) return { rows: exercises };
      return { rows: recordings };
    },
  };
}

const list = async (exercises: unknown[], recordings: unknown[] = [], stories: unknown[] = []) =>
  (await new LessonAudioService(pool(exercises, recordings, stories) as never).list()).items;

const find = (items: Awaited<ReturnType<typeof list>>, text: string) => items.find((i) => i.key === lessonAudioKey(text));

const basics = (lesson: number): Place => ({ course: 'kurmanji-basics', lesson });
const road = (lesson: number, extra: Partial<Place> = {}): Place => ({ course: 'kurmanji-road', lesson, ...extra });

describe('who each text is planned for', () => {
  it('is the voice of the exercise that uses it', async () => {
    const items = await list([
      row(road(1), 'speaking', { prompt: 'Say: hello', reference: 'Silav', voice: 'hamo' }),
      row(road(1), 'listening', { accepted: ['Ez Xezal im'], voice: 'xezo' }),
      row(road(1), 'match_pairs', { pairs: [{ left: 'sêv', right: 'apple' }, { left: 'nan', right: 'bread' }], voice: 'hevalo' }),
      row(road(1), 'translate', { prompt: 'Thank you', accepted: ['Spas'] }),
    ]);
    expect(find(items, 'Silav')!.plannedSpeaker).toBe('hamo');
    expect(find(items, 'Ez Xezal im')!.plannedSpeaker).toBe('xezo');
    expect(find(items, 'sêv')!.plannedSpeaker).toBe('hevalo');
    expect(find(items, 'nan')!.plannedSpeaker).toBe('hevalo');
    // an exercise that names no voice plans nothing
    expect(find(items, 'Spas')!.plannedSpeaker).toBeNull();
  });

  it('is the first voice in course order, even when an earlier use names none', async () => {
    const items = await list([
      // the older course says nothing about who records it
      row(basics(1), 'translate', { prompt: 'Hello', accepted: ['Silav'] }),
      row(road(1), 'speaking', { prompt: 'Say: hello', reference: 'Silav', voice: 'hamo' }),
      row(road(2), 'listening', { accepted: ['Silav!'], voice: 'xezo' }),
    ]);
    const silav = find(items, 'Silav')!;
    expect(silav.plannedSpeaker).toBe('hamo');
    // filed under its first use, with every course it is used in
    expect(silav.usedIn.map((u) => [u.courseSlug, u.lessonPosition])).toEqual([
      ['kurmanji-basics', 1],
      ['kurmanji-road', 1],
      ['kurmanji-road', 2],
    ]);
  });

  it('follows a draft that gave a sentence to someone else', async () => {
    const items = await list([
      // newest version first within a slot, as the query orders them
      row(road(1, { version: 2, status: 'draft' }), 'speaking', { prompt: 'Say it', reference: 'Roj baş', voice: 'xezo' }),
      row(road(1, { version: 1, status: 'published' }), 'speaking', { prompt: 'Say it', reference: 'Roj baş', voice: 'hamo' }),
    ]);
    expect(find(items, 'Roj baş')).toMatchObject({ plannedSpeaker: 'xezo', usedIn: [{ live: true, lessonVersion: 2 }] });
  });

  it('is each conversation line’s own character, whatever the exercise around it', async () => {
    const conversation = {
      id: 'roadu01s1',
      speakers: [
        { name: 'Hamo', character: 'hamo' },
        { name: 'Xezo', character: 'xezo' },
      ],
      lines: [
        { speaker: 0, text: 'Bi xêr hatî!' },
        { speaker: 1, text: 'Spas, apo.' },
      ],
      prompt: 'Who welcomes the guest?',
      options: ['Hamo', 'Xezal'],
      correctIndex: 0,
    };
    const items = await list([row(road(3), 'conversation', { ...conversation, voice: 'hevalo' })]);
    expect(items.find((i) => i.key === conversationLineKey('roadu01s1', 0, 'Bi xêr hatî!'))!.plannedSpeaker).toBe('hamo');
    expect(items.find((i) => i.key === conversationLineKey('roadu01s1', 1, 'Spas, apo.'))!.plannedSpeaker).toBe('xezo');
  });

  it('keeps the plan beside the recording that was made, which may be someone else’s', async () => {
    const items = await list(
      [row(road(1), 'speaking', { prompt: 'Say: hello', reference: 'Silav', voice: 'hamo' })],
      [{ key: 'silav', text: 'Silav', url: 'https://cdn.test/silav.wav', duration_ms: 800, updated_at: new Date('2026-11-01T10:00:00Z'), speaker: 'xezo', has_lipsync: false, lipsync: null }],
    );
    expect(find(items, 'Silav')).toMatchObject({ recorded: true, speaker: 'xezo', plannedSpeaker: 'hamo' });
  });

  it('plans nothing for a story’s sentence or a recording no lesson uses', async () => {
    const items = await list(
      [],
      [{ key: 'newroz pîroz be', text: 'Newroz pîroz be', url: 'https://cdn.test/n.wav', duration_ms: 900, updated_at: new Date(), speaker: 'hamo', has_lipsync: false, lipsync: null }],
      [{ id: 'st-1', dialect: 'kurmanci', title: 'Şorbe', status: 'draft', body: 'Dayika min şorbe çêdike.' }],
    );
    expect(find(items, 'Newroz pîroz be')).toMatchObject({ unused: true, plannedSpeaker: null });
    const sentence = find(items, 'Dayika min şorbe çêdike')!;
    expect(sentence.plannedSpeaker).toBeNull();
    expect(sentence.usedIn[0]).toMatchObject({ courseId: 'stories:kurmanci', courseSlug: 'stories:kurmanci' });
  });

  it('never lists the English answer of a translation from Kurdish', async () => {
    const items = await list([row(road(1), 'translate', { say: 'Ez ji Amedê me.', prompt: 'Translate into English', accepted: ['I am from Amed.'], voice: 'hamo' })]);
    expect(items.map((i) => i.text)).toEqual(['Ez ji Amedê me.']);
    expect(items[0]!.plannedSpeaker).toBe('hamo');
  });
});
