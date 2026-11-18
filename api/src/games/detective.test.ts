/**
 * Detektîf without a database: a round is one published case at the difficulty's levels, its deduction steps then the
 * accusation; the board holds no answer or card meaning until found or bought with a hint; hints are counted and cost
 * XP at the finish; the accusation's correction walks back through every deduction, with suspects in a per-round order.
 * Case evidence is filled from the course's lines and stories (detective-cases.ts).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DETECTIVE_HINTS, checkGameContent, type CaseFileContent, type SoloItemState } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { DetectiveGame, carriedHints, type CaseItem } from './detective.js';
import { resolveCase, type CaseConversation, type DetectiveCase } from './detective-cases.js';
import type { PublishedContent, TrustedSources } from './sources.js';

const en = (text: string) => ({ en: text });

// a small case of the course's own lines; a test only
const CASE = {
  title: en('The empty jar'),
  intro: en('A jar of honey is empty in the morning.'),
  suspects: [
    { id: 'hamo', name: 'Hamo', about: en('The uncle.'), portrait: 'hamo' },
    { id: 'hevalo', name: 'Hevalo', about: en('The deer.') },
    { id: 'baran', name: 'Baran', about: en('A son.') },
  ],
  evidence: [
    { id: 'advice', kind: 'note', ku: 'Û şîreta sêyem ev e, bi şev hingiv qedexe ye!', meanings: en('Honey at night is forbidden!'), speaker: 'xezo', recording: 'roadu08s2l3a|0|x' },
    { id: 'apples', kind: 'statement', ku: 'Ez bêguneh im! Ez tenê ji sêvan hez dikim.', meanings: en('I only like apples.'), from: 'hevalo', speaker: 'hevalo' },
    { id: 'away', kind: 'statement', ku: 'Na, Baran îro ne li malê ye.', meanings: en('Baran is not at home today.'), from: 'hamo' },
  ],
  steps: [
    { prompt: en('What is forbidden?'), options: [en('Honey at night'), en('Apples'), en('Tea')], correctIndex: 0, evidence: ['advice'] },
    { prompt: en('Who was away?'), options: [en('Hevalo'), en('Baran')], correctIndex: 1, evidence: ['away'] },
  ],
  culprit: 'hamo',
  solution: en('Hamo ate the honey.'),
  hints: [en('Who has a moustache?')],
};

function published(level: number, id = 'case1'): PublishedContent<'case_file'> {
  const checked = checkGameContent('case_file', 'kmr', CASE);
  if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
  return { id, key: `gc:${id}`, level, payload: checked.payload as CaseFileContent };
}

const sources = (rows: Array<PublishedContent<'case_file'>>) => ({ content: async () => rows }) as unknown as TrustedSources;
const db = {
  query: async (sql: string) =>
    sql.includes('lesson_audio')
      ? { rows: [{ key: 'roadu08s2l3a|0|x', url: 'https://media.example.com/advice.mp3', text: CASE.evidence[0]!.ku, duration_ms: 1200, speaker: null, lipsync: null }] }
      : { rows: [] },
} as never;
const ask = (difficulty: 'beginner' | 'advanced' = 'beginner') => ({ userId: 'u1', dialect: 'kmr' as const, difficulty, seed: 's1' });
const states = (n: number, done: number[] = []): SoloItemState[] =>
  Array.from({ length: n }, (_, index) => ({ index, attempts: done.includes(index) ? 1 : 0, correct: done.includes(index), firstTry: done.includes(index), done: done.includes(index) }));

describe('a round', () => {
  const game = new DetectiveGame(sources([published(2)]));

  it('is one case of the difficulty’s levels: its steps, then the accusation', async () => {
    const round = await game.build(ask(), db);
    expect(round!.items.map((i) => i.kind)).toEqual(['step', 'step', 'accuse']);
    expect(round!.items.map((i) => i.key)).toEqual(['gc:case1:step:0', 'gc:case1:step:1', 'gc:case1:accuse']);
    expect(await game.build(ask('advanced'), db)).toBeNull();
  });

  it('sends a board with no answer and no card’s meaning, and its overheard line’s recording', async () => {
    const round = await game.build(ask(), db);
    const board = game.board(round!.items, round!.meta, states(3))!;
    expect(board.evidence.map((e) => e.meanings)).toEqual([null, null, null]);
    expect(board.evidence[0]!.audio).toEqual({ src: 'https://media.example.com/advice.mp3', voice: expect.objectContaining({ speaker: 'xezo' }) });
    expect(board.suspects.map((s) => s.portrait)).toEqual(['hamo', 'hevalo', null]);
    expect(board.hintsLeft).toBe(DETECTIVE_HINTS);
    const sent = JSON.stringify([board, ...round!.items.map((item, i) => game.view(item, i))]);
    expect(sent).not.toContain('Hamo ate the honey.');
    expect(sent).not.toContain('culprit');
    expect(sent).not.toContain('Who has a moustache?');
    expect(sent).not.toContain('Honey at night is forbidden!');
  });

  it('finds a card’s meaning once a deduction it proves is made, and keeps the deduction in the notebook', async () => {
    const round = await game.build(ask(), db);
    const board = game.board(round!.items, round!.meta, states(3, [0]))!;
    expect(board.evidence.find((e) => e.id === 'advice')!.meanings).toEqual(en('Honey at night is forbidden!'));
    expect(board.evidence.find((e) => e.id === 'away')!.meanings).toBeNull();
    expect(board.notebook).toEqual([{ step: 0, prompt: en('What is forbidden?'), answer: en('Honey at night'), evidence: ['advice'] }]);
  });
});

describe('hints', () => {
  const game = new DetectiveGame(sources([published(2)]));

  it('translate a card or read the next written hint, each one counted, until they are spent', async () => {
    const round = await game.build(ask(), db);
    const at = (meta: Record<string, unknown>, done: number[] = []) => ({ items: round!.items, meta, states: states(3, done) });
    let meta = game.spendHint(at(round!.meta), { evidence: 'away' });
    let board = game.board(round!.items, meta, states(3))!;
    expect(board.evidence.find((e) => e.id === 'away')!.meanings).toEqual(en('Baran is not at home today.'));
    expect(board.hintsUsed).toBe(1);
    meta = game.spendHint(at(meta), {});
    board = game.board(round!.items, meta, states(3))!;
    expect(board.hints).toEqual([en('Who has a moustache?')]);
    expect(board.moreHints).toBe(false);
    expect(board.hintsLeft).toBe(DETECTIVE_HINTS - 2);

    expect(() => game.spendHint(at(meta), {})).toThrow(AppError);
    expect(() => game.spendHint(at(meta), { evidence: 'away' })).toThrow(/already found/);
    expect(() => game.spendHint(at(meta, [0]), { evidence: 'advice' })).toThrow(/already found/);
    expect(() => game.spendHint(at(meta), { evidence: 'nowhere' })).toThrow(/no such card/);
    meta = game.spendHint(at(meta), { evidence: 'apples' });
    expect(() => game.spendHint(at(meta), { evidence: 'advice' })).toThrow(/every hint/);
    // the last hint is spent: that they run out is all a hint costs, since a case pays no XP to take one from
    expect(game.board(round!.items, meta, states(3))!.hintsLeft).toBe(0);
  });
});

describe('answers', () => {
  const game = new DetectiveGame(sources([published(1)]));

  it('grade a step by the option shown and the accusation by the suspect, and walk back through the case', async () => {
    const round = await game.build(ask(), db);
    const [step, , accuse] = round!.items as [CaseItem & { kind: 'step' }, CaseItem, CaseItem & { kind: 'accuse' }];
    const right = step.shown.indexOf(step.correctIndex);
    expect(game.grade(step, { choice: right })).toBe(true);
    expect(game.grade(step, { choice: (right + 1) % 3 })).toBe(false);
    expect(game.hint(step)).toEqual({ look: ['advice'] });
    expect(game.correction(step)).toMatchObject({ kind: 'step', correctIndex: right, evidence: [{ id: 'advice', meanings: en('Honey at night is forbidden!') }] });

    // the accusation is graded by the suspect in the place the player saw
    const shown = (game.view(accuse, 2) as { suspects: string[] }).suspects;
    expect([...shown].sort()).toEqual(['baran', 'hamo', 'hevalo']);
    const culprit = shown.indexOf('hamo');
    expect(game.grade(accuse, { choice: culprit })).toBe(true);
    expect(game.grade(accuse, { choice: (culprit + 1) % 3 })).toBe(false);
    const solved = game.correction(accuse);
    expect(solved).toMatchObject({ kind: 'accuse', correctIndex: culprit, culprit: 'hamo', solution: en('Hamo ate the honey.') });
    expect(solved.walk!.map((w) => w.answer)).toEqual([en('Honey at night'), en('Baran')]);
    expect(solved.evidence.map((e) => e.id)).toEqual(['advice', 'away']);
  });

  it('show the accusation’s suspects in an order drawn for the round, so the culprit is not always first', async () => {
    const firsts = new Set<string>();
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) {
      const round = await game.build({ ...ask(), seed }, db);
      const accuse = round!.items[2]!;
      const shown = (game.view(accuse, 2) as { suspects: string[] }).suspects;
      firsts.add(shown[0]!);
      expect(game.grade(accuse, { choice: shown.indexOf('hamo') })).toBe(true);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('read a round made before the order was drawn as the case wrote it', async () => {
    const round = await game.build(ask(), db);
    const old = { ...round!.items[2]!, shown: undefined } as CaseItem;
    expect(game.view(old, 2)).toEqual({ index: 2, kind: 'accuse', suspects: ['hamo', 'hevalo', 'baran'] });
    expect(game.grade(old, { choice: 0 })).toBe(true);
    expect(game.correction(old)).toMatchObject({ correctIndex: 0 });
  });
});

describe('a case file’s evidence', () => {
  // a conversation as the seeder finds it in the database, and a story as published; stand-ins, never shown to a learner
  const conversations = new Map<string, CaseConversation>([
    [
      'talktest1',
      {
        exerciseId: 'ex-talktest1',
        payload: {
          id: 'talktest1',
          speakers: [{ character: 'hamo' }, { character: 'hevalo' }],
          lines: [
            { speaker: 0, text: 'Hingiv li ser simbêla te ye!', en: 'There’s honey on your moustache!' },
            { speaker: 1, text: 'Ez tenê sêvan dixwim.', en: 'I only eat apples.' },
          ],
          prompt: 'Çi li ser simbêlê ye?',
          options: ['Hingiv', 'Çay'],
          correctIndex: 0,
        },
      },
    ],
  ]);
  const stories = new Map([['ckb-key', { id: 'story-1', body: 'ژینۆ کلیلەکەی برد. ئینجا یاری کرد.\n\nدایکی پێکەنی.' }]]);
  const kase: DetectiveCase = {
    slug: 'kmr-test',
    dialect: 'kmr',
    level: 2,
    title: en('A test'),
    intro: en('A case of stand-in lines.'),
    suspects: [
      { id: 'hamo', name: 'Hamo', about: en('The uncle.') },
      { id: 'hevalo', name: 'Hevalo', about: en('The deer.') },
      { id: 'baran', name: 'Baran', about: en('A son.') },
    ],
    evidence: [
      { id: 'moustache', kind: 'statement', line: { conversation: 'talktest1', en: "There's honey on your moustache!" } },
      { id: 'took', kind: 'note', line: { story: 'ckb-key', paragraph: 0, sentence: 1, en: 'Then he played.', opens: 'ئینجا', meanings: { de: 'Dann spielte er.' } } },
    ],
    steps: [{ prompt: en('What is on the moustache?'), options: [en('Honey'), en('Tea'), en('Snow')], correctIndex: 0, evidence: ['moustache'] }],
    culprit: 'hamo',
    background: [],
    solution: en('Hamo ate the honey.'),
    hints: [],
  };

  it('copies a conversation line’s Kurdish, speaker and recording, found by its English', () => {
    const resolved = resolveCase(kase, conversations, stories);
    if (!resolved.ok) throw new Error(resolved.missing.join('\n'));
    const [line, sentence] = (resolved.payload as { evidence: Array<Record<string, unknown>> }).evidence;
    expect(line).toMatchObject({ id: 'moustache', ku: 'Hingiv li ser simbêla te ye!', speaker: 'hamo', origin: { type: 'conversation', ref: 'ex-talktest1:0' } });
    expect(line!.meanings).toEqual({ en: 'There’s honey on your moustache!' });
    expect(line!.recording).toBeTruthy();
    // a story’s sentence by its place, with the case’s English and translations over it
    expect(sentence).toMatchObject({ id: 'took', ku: 'ئینجا یاری کرد.', origin: { type: 'story', ref: 'story-1:0' }, meanings: { en: 'Then he played.', de: 'Dann spielte er.' } });
  });

  it('waits when a line it names is not there, or a story sentence no longer opens as the case says', () => {
    const lost = resolveCase({ ...kase, evidence: [{ ...kase.evidence[0]!, line: { conversation: 'nowhere', en: 'Nothing.' } }] }, conversations, stories);
    expect(lost).toEqual({ ok: false, missing: ['nowhere: Nothing.'] });
    const moved = resolveCase(
      { ...kase, evidence: [{ id: 'took', kind: 'note', line: { story: 'ckb-key', paragraph: 0, sentence: 0, en: 'Then he played.', opens: 'ئینجا' } }] },
      conversations,
      stories,
    );
    expect(moved.ok).toBe(false);
  });

  it('leave the old starter file empty: the cases are kept in api/content/games/detective', () => {
    const file = JSON.parse(readFileSync(new URL('../../content/games/detective.json', import.meta.url), 'utf8')) as { cases: unknown[] };
    expect(file.cases).toEqual([]);
  });
});

describe('hints spent on a round given up', () => {
  const game = new DetectiveGame(sources([published(2)]));
  /** A database whose last round of the case spent these hints, and did or did not pay for them at its finish. */
  const lastRound = (spent: unknown, paid: boolean) =>
    ({
      query: async (sql: string) => (sql.includes("meta->'spent'") ? { rows: [{ spent, paid }] } : { rows: [] }),
    }) as never;

  it('carry into the next round of the case: its cards translated, its hints read, and no more to spend than were left', async () => {
    const round = (await game.build(ask(), lastRound({ used: 2, read: 1, translated: ['away', 'gone-from-the-case'] }, false)))!;
    const board = game.board(round.items, round.meta, states(3))!;
    expect(board).toMatchObject({ hintsUsed: 2, hintsLeft: DETECTIVE_HINTS - 2, hints: [en('Who has a moustache?')] });
    expect(board.evidence.find((e) => e.id === 'away')!.meanings).toEqual(en('Baran is not at home today.'));
  });

  it('do not carry from a round that was finished and counted: the case was solved', async () => {
    const round = (await game.build(ask(), lastRound({ used: 2, read: 1, translated: ['away'] }, true)))!;
    expect(game.board(round.items, round.meta, states(3))!.hintsUsed).toBe(0);
  });

  it('are asked of the database as paid only for a round that was finished and counted', async () => {
    // a round finished empty earned nothing to take its hints from: it must not read as paid
    let asked = '';
    const db = { query: async (sql: string) => ((asked = sql), { rows: [] }) } as never;
    expect(await carriedHints(db, 'u1', 'kmr', 'case1')).toBeNull();
    expect(asked).toContain('finished_at IS NOT NULL AND learning_counted IS TRUE');
  });

  it('are read with care: never more than the case has', async () => {
    expect(await carriedHints(lastRound({ used: 99, read: -3, translated: 'away' }, false), 'u1', 'kmr', 'case1')).toEqual({ used: DETECTIVE_HINTS, read: 0, translated: [] });
    expect(await carriedHints(lastRound(null, false), 'u1', 'kmr', 'case1')).toBeNull();
  });
});
