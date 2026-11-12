/**
 * Kurdish Detective without a database: a round is one published case of the
 * difficulty's levels, its deduction steps then the accusation; the board
 * holds no answer and no card's meaning until it is found or a hint buys it;
 * hints are counted on the round and cost XP at the finish; the accusation's
 * correction walks back through every deduction. The starter case in
 * api/content/games is made entirely of the course's own lines.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DETECTIVE_HINTS, DETECTIVE_HINT_XP, checkGameContent, type CaseFileContent, type SoloItemState } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { DetectiveGame, carriedHints, type CaseItem } from './detective.js';
import { resolveStarterCase, type StarterCase, type StoredConversation } from './starters.js';
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
    { id: 'advice', kind: 'note', ku: 'Û şîreta sêyem: bi şev hingiv qedexe ye!', meanings: en('Honey at night is forbidden!'), speaker: 'xezo', recording: 'roadu08s2l3a|0|x' },
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
    expect(game.deduction(meta)).toBe(2 * DETECTIVE_HINT_XP);

    expect(() => game.spendHint(at(meta), {})).toThrow(AppError);
    expect(() => game.spendHint(at(meta), { evidence: 'away' })).toThrow(/already found/);
    expect(() => game.spendHint(at(meta, [0]), { evidence: 'advice' })).toThrow(/already found/);
    expect(() => game.spendHint(at(meta), { evidence: 'nowhere' })).toThrow(/no such card/);
    meta = game.spendHint(at(meta), { evidence: 'apples' });
    expect(() => game.spendHint(at(meta), { evidence: 'advice' })).toThrow(/every hint/);
    expect(game.deduction(meta)).toBe(DETECTIVE_HINTS * DETECTIVE_HINT_XP);
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

    expect(game.grade(accuse, { choice: 0 })).toBe(true);
    expect(game.grade(accuse, { choice: 2 })).toBe(false);
    const solved = game.correction(accuse);
    expect(solved).toMatchObject({ kind: 'accuse', correctIndex: 0, culprit: 'hamo', solution: en('Hamo ate the honey.') });
    expect(solved.walk!.map((w) => w.answer)).toEqual([en('Honey at night'), en('Baran')]);
    expect(solved.evidence.map((e) => e.id)).toEqual(['advice', 'away']);
    expect(game.view(accuse, 2)).toEqual({ index: 2, kind: 'accuse', suspects: ['hamo', 'hevalo', 'baran'] });
  });
});

describe('the starter case', () => {
  // the course's conversations as the seeder finds them in the database: each exercise with its payload
  const conversations = new Map<string, StoredConversation>();
  const road = new URL('../../content/lessons/road/', import.meta.url);
  for (const name of readdirSync(road).filter((n) => /^unit-\d+\.json$/.test(n))) {
    const unit = JSON.parse(readFileSync(new URL(name, road), 'utf8')) as {
      units: Array<{ skills: Array<{ lessons: Array<{ exercises: Array<{ type: string; payload: { id?: string } }> }> }> }>;
    };
    for (const u of unit.units)
      for (const s of u.skills)
        for (const l of s.lessons)
          for (const e of l.exercises) if (e.type === 'conversation' && e.payload.id) conversations.set(e.payload.id, { exerciseId: `ex-${e.payload.id}`, payload: e.payload });
  }
  const file = JSON.parse(readFileSync(new URL('../../content/games/detective.json', import.meta.url), 'utf8')) as { cases: StarterCase[] };

  it('finds every line it names in the course, and makes a case file that passes its checks', () => {
    for (const starter of file.cases) {
      const resolved = resolveStarterCase(starter, conversations);
      if (!resolved.ok) throw new Error(resolved.missing.join('\n'));
      const checked = checkGameContent('case_file', starter.dialect, resolved.payload);
      if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
      const kase = checked.payload;
      // every card's Kurdish is a line the course already has, copied with its own English
      for (const e of kase.evidence) {
        expect(e.origin?.type).toBe('conversation');
        expect(e.recording).toBeTruthy();
      }
      expect(kase.suspects.find((s) => s.id === kase.culprit)).toBeTruthy();
    }
  });

  it('waits when a line it names is not there', () => {
    const starter = file.cases[0]!;
    const resolved = resolveStarterCase({ ...starter, evidence: [{ ...starter.evidence[0]!, line: { conversation: 'nowhere', en: 'Nothing.' } }] }, conversations);
    expect(resolved).toEqual({ ok: false, missing: ['nowhere: Nothing.'] });
  });
});

describe('hints spent on a round given up', () => {
  const game = new DetectiveGame(sources([published(2)]));
  /** A database whose last round of the case spent these hints, and did or did not pay for them at its finish. */
  const lastRound = (spent: unknown, paid: boolean) =>
    ({
      query: async (sql: string) => (sql.includes("meta->'spent'") ? { rows: [{ spent, paid }] } : { rows: [] }),
    }) as never;

  it('carry into the next round of the case: its cards translated, its hints read, their cost taken', async () => {
    const round = (await game.build(ask(), lastRound({ used: 2, read: 1, translated: ['away', 'gone-from-the-case'] }, false)))!;
    const board = game.board(round.items, round.meta, states(3))!;
    expect(board).toMatchObject({ hintsUsed: 2, hintsLeft: DETECTIVE_HINTS - 2, hints: [en('Who has a moustache?')] });
    expect(board.evidence.find((e) => e.id === 'away')!.meanings).toEqual(en('Baran is not at home today.'));
    expect(game.deduction(round.meta)).toBe(2 * DETECTIVE_HINT_XP);
  });

  it('do not carry from a round that was finished and counted, which paid for them', async () => {
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
