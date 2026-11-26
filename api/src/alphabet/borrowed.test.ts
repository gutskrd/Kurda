import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { takesWithBorrowed } from './routes.js';

const row = (key: string, url: string) => ({ key, url, duration_ms: 700, updated_at: new Date(0), speaker: null, lipsync: null });

/** A database holding these alphabet and lesson takes, answering the two reads the pages make. */
function db(alphabet: ReturnType<typeof row>[], lesson: ReturnType<typeof row>[]): FastifyInstance['db'] {
  return {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM alphabet_audio')) return { rows: alphabet };
      const wanted = new Set((params?.[0] as string[]) ?? []);
      return { rows: lesson.filter((r) => wanted.has(r.key)) };
    },
  } as unknown as FastifyInstance['db'];
}

describe('takesWithBorrowed', () => {
  it('lists every own take, and a take for each word that has none from the same word elsewhere', async () => {
    const takes = await takesWithBorrowed(db([row('kmr:sound:a', 'https://cdn.test/a.wav')], [row('sêv', 'https://cdn.test/sev.wav'), row('ba', 'https://cdn.test/ba.wav')]), 'url');
    const byKey = new Map(takes.map((t) => [t.key, t]));
    expect(byKey.get('kmr:sound:a')).toMatchObject({ from: null });
    // the alphabet's example word plays the lessons' recording of it
    expect(byKey.get('kmr:word:s')).toMatchObject({ row: { url: 'https://cdn.test/sev.wav' }, from: { store: 'lesson', key: 'sêv' } });
    // the letter b's sound is no word, so the lessons' "ba" (wind) never stands in for it
    expect(byKey.has('kmr:sound:b')).toBe(false);
  });
});
