/**
 * Build a Kurdish Sentence's rounds without a database: the round is made of
 * the learner's variety and difficulty only, never hands over the answer in
 * order, keeps decoys off the sentence's own words, grades every accepted
 * order, nudges before it corrects, and moves the ladder.
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_RUNGS, SOLO_ROUND_ITEMS, gameWords, type GameDialect } from '@kurda/shared';
import { BuildSentenceGame, type SentenceItem } from './build-sentence.js';
import type { TrustedSources, LessonSentence, VocabularyWord } from './sources.js';
import { sentenceKey } from './sources.js';

function lesson(ku: string, en: string, orders: string[] = [ku]): LessonSentence {
  return { key: sentenceKey('kmr', ku), ku, meaning: { en }, orders, accepted: orders, origin: `lesson:${ku}` };
}

// approved-looking sentences for the shapes; a test only, never shown to anyone
const SHORT = ['Ev dîwar e.', 'Ban kevn e.', 'Pencere mezin e.', 'Ev pirtûk e.', 'Ew mamoste ye.', 'Av sar e.', 'Nan germ e.', 'Ev derî ye.', 'Ew xanî ye.', 'Çay xweş e.'];
const QUESTIONS = ['Tu çawa yî?', 'Ev çi ye?', 'Tu kî yî?', 'Ew li ku ye?', 'Tu birçî yî?'];

function fakeSources(sentences: LessonSentence[], words: VocabularyWord[] = []): TrustedSources {
  return {
    lessonSentences: async () => sentences,
    content: async () => [],
    vocabulary: async () => words,
  } as unknown as TrustedSources;
}

/** A database with nothing in it: no progress, nothing seen. */
const emptyDb = { query: async () => ({ rows: [] }) } as never;

function stepDb(step: number) {
  return { query: async (sql: string) => ({ rows: sql.includes('game_progress') ? [{ step }] : [] }) } as never;
}

const ask = (over: Partial<{ dialect: GameDialect; seed: string }> = {}) => ({
  userId: 'u1',
  dialect: 'kmr' as const,
  difficulty: 'beginner' as const,
  seed: 'seed-1',
  ...over,
});

describe('a round', () => {
  const game = new BuildSentenceGame(
    fakeSources(
      [...SHORT.map((s) => lesson(s, 'something short')), ...QUESTIONS.map((q) => lesson(q, 'a question?'))],
      [{ key: 'w', ku: 'dîwar', meanings: { en: 'wall' } }],
    ),
  );

  it('is eight sentences at the chosen difficulty, each once', async () => {
    const round = await game.build(ask(), emptyDb);
    expect(round!.items).toHaveLength(SOLO_ROUND_ITEMS);
    expect(new Set(round!.items.map((i) => i.key)).size).toBe(SOLO_ROUND_ITEMS);
    for (const item of round!.items) expect(DIFFICULTY_RUNGS.beginner).toContain(item.rung);
    expect(round!.meta.rung).toBe('short');
  });

  it('is played on the highest rung the learner has opened', async () => {
    const round = await game.build(ask(), stepDb(2));
    expect(round!.meta.rung).toBe('question');
    const questions = round!.items.filter((i) => i.rung === 'question');
    expect(questions.length).toBeGreaterThanOrEqual(5);
    // a round climbs: warm-ups first
    expect(round!.items[0]!.rung).toBe('short');
  });

  it('is null at a difficulty with too little approved content', async () => {
    expect(await game.build({ ...ask(), difficulty: 'advanced' }, emptyDb)).toBeNull();
  });

  it('is the same round however often it is made from one seed, and another from another', async () => {
    const a = await game.build(ask(), emptyDb);
    const b = await game.build(ask(), emptyDb);
    const c = await game.build(ask({ seed: 'seed-2' }), emptyDb);
    expect(a!.items.map((i) => i.tiles)).toEqual(b!.items.map((i) => i.tiles));
    expect(a!.items.map((i) => i.tiles.join())).not.toEqual(c!.items.map((i) => i.tiles.join()));
  });

  it('lays each sentence’s words with decoys that are none of them, and never in order', async () => {
    const round = await game.build(ask(), emptyDb);
    for (const item of round!.items) {
      const words = gameWords(item.ku).map((w) => w.toLowerCase());
      const tiles = item.tiles.map((t) => t.toLowerCase());
      for (const w of words) expect(tiles).toContain(w);
      expect(tiles.length).toBe(words.length + 2);
      expect(tiles.filter((t) => words.includes(t)).join(' ')).not.toBe(words.join(' '));
    }
  });

  it('sends the player the meaning and the tiles, never the sentence', async () => {
    const round = await game.build(ask(), emptyDb);
    const view = game.view(round!.items[0]!, 0);
    expect(Object.keys(view).sort()).toEqual(['index', 'key', 'level', 'meaning', 'rung', 'tiles']);
    expect(JSON.stringify(view)).not.toContain(round!.items[0]!.ku);
  });
});

describe('grading a line', () => {
  const item: SentenceItem = {
    key: 'k',
    level: 1,
    ku: 'Ez diçim malê.',
    meaning: { en: 'I am going home.' },
    orders: ['Ez diçim malê.', 'Malê ez diçim.'],
    accepted: ['Ez diçim malê.', 'Malê ez diçim.'],
    tiles: ['malê', 'nan', 'ez', 'diçim', 'av'],
    rung: 'short',
    glosses: [null, { en: 'I go' }, { en: 'home' }],
  };
  const game = new BuildSentenceGame(fakeSources([]));

  it('accepts every allowed order, and nothing else', () => {
    expect(game.grade(item, { order: [2, 3, 0] })).toBe(true);
    expect(game.grade(item, { order: [0, 2, 3] })).toBe(true);
    expect(game.grade(item, { order: [2, 0, 3] })).toBe(false);
    expect(game.grade(item, { order: [2, 3, 0, 1] })).toBe(false);
    // a tile laid twice, or one that is not there
    expect(game.grade(item, { order: [2, 2, 3, 0] })).toBe(false);
    expect(game.grade(item, { order: [2, 3, 9] })).toBe(false);
  });

  it('nudges with the first word out of place, and corrects with every word’s meaning', () => {
    expect(game.hint(item, { order: [2, 0, 3] }, 'kmr')).toEqual({ firstWrong: 1 });
    const c = game.correction(item, { order: [2, 0, 3] }, 'kmr');
    expect(c.answer).toBe('Ez diçim malê.');
    expect(c.words).toEqual([
      { word: 'Ez', meanings: null },
      { word: 'diçim', meanings: { en: 'I go' } },
      { word: 'malê', meanings: { en: 'home' } },
    ]);
    expect(c.firstWrong).toBe(1);
    expect(game.correction(item, { order: [2, 3, 0] }, 'kmr').firstWrong).toBeNull();
    expect(game.why(item)).toBe('short');
  });
});

describe('the ladder after a round', () => {
  it('opens the next rung after a good round on the learner’s own rung', async () => {
    const writes: unknown[][] = [];
    const client = {
      query: async (sql: string, params: unknown[]) => {
        if (sql.startsWith('INSERT INTO game_progress')) writes.push(params);
        return { rows: sql.includes('SELECT step') ? [{ step: 1 }] : [] };
      },
    } as never;
    const game = new BuildSentenceGame(fakeSources([]));
    await game.finished(client, { userId: 'u1', dialect: 'kmr', meta: { rung: 'short' }, results: { firstTry: 7 } });
    expect(writes).toEqual([['u1', 'build-sentence', 'kmr', 2]]);
    writes.length = 0;
    await game.finished(client, { userId: 'u1', dialect: 'kmr', meta: { rung: 'short' }, results: { firstTry: 3 } });
    expect(writes).toEqual([]);
  });
});
