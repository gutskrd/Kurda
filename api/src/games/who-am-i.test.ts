/**
 * Ez kî me? without a database: what a table is dealt from, how a whole
 * table is dealt, what a phone from before the four answers is dealt, the
 * table's settings and moves as the server takes them, a reported card's
 * note, and the picked words a card is made of (word-cards.ts).
 */
import { describe, expect, it } from 'vitest';
import { GAME_CONTENT_REVIEW_NOTE_MAX, WHO_AM_I_MIN_TEMPLATES, type GameContentKind, type WhoAmIDeal, type WhoAmIIdentity } from '@kurda/shared';
import type { TrustedSources } from './sources.js';
import { asTwoAnswerDeal, countReport, dealSeat, dealTable, identitiesAt, tableDifficulties, tellsTilesApart, whoAmIPool } from './who-am-i.js';
import { whoAmITableModule } from '../mp/games/who-am-i.js';
import { GameWordCards, entryCandidate } from './word-cards.js';

const FACTS = ['alive', 'animal', 'four-legs', 'can-fly', 'lives-in-water', 'bigger-than-person', 'at-home'] as const;

/** Ten animals, each with a table that answers every fact above, in a pattern so no two are alike. */
const IDENTITIES = Array.from({ length: 10 }, (_, i) => ({
  id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
  key: `gc:${i}`,
  level: i < 7 ? 1 : 4,
  payload: {
    word: `ajal${'abcdefghij'[i]}`,
    meanings: { en: `animal ${i}` },
    category: 'animal',
    facts: { ...Object.fromEntries(FACTS.map((f, j) => [f, ((i >> (j % 4)) & 1) === 1 || j < 2])), 'not-a-fact': true, ...(i === 0 ? { 'at-home': 'sometimes' } : {}) },
  },
}));

const TEMPLATES = [...FACTS, 'sweet'].map((fact, i) => ({
  id: `10000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
  key: `gc:t${i}`,
  level: 1,
  payload: { ku: `Pirsa ${i}?`, meanings: { en: `Question ${i}?` }, fact },
}));

const sources = {
  content: async (kind: GameContentKind) => (kind === 'identity' ? IDENTITIES : kind === 'question_template' ? TEMPLATES : []),
} as unknown as TrustedSources;

describe('the pool', () => {
  it('reads published identities and templates, keeping only facts a question can ask', async () => {
    const { identities, templates } = await whoAmIPool(sources, 'kmr');
    expect(identities).toHaveLength(10);
    expect(identities[0]!.facts).not.toHaveProperty('not-a-fact');
    // a card's "sometimes" is kept: the server's rules score it, and the tiles are chosen from the cards as they are
    expect(identities[0]!.facts['at-home']).toBe('sometimes');
    expect(templates.map((t) => t.fact)).toContain('sweet');
    expect(identitiesAt(identities, 'beginner')).toHaveLength(7);
    expect(identitiesAt(identities, 'intermediate')).toHaveLength(0);
  });
});

describe('a table', () => {
  it('deals every seat a different card, with tiles and questions of its own', async () => {
    const pool = await whoAmIPool(sources, 'kmr');
    const dealt = dealTable(pool, 'beginner', [1, 2, 3, 4], 'seed')!;
    expect(dealt.map((d) => d.seat)).toEqual([1, 2, 3, 4]);
    expect(new Set(dealt.map((d) => d.deal.identity.id)).size).toBe(4);
    // only the difficulty's own identities are worn
    for (const d of dealt) expect(d.deal.identity.level).toBe(1);
    for (const d of dealt) {
      expect(d.deal.candidates.some((c) => c.id === d.deal.identity.id)).toBe(true);
      expect(d.deal.questions.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('deals no seat a tile that is a card another seat wears: a card a player can read is never one they could strike out', async () => {
    const pool = await whoAmIPool(sources, 'kmr');
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const dealt = dealTable(pool, 'beginner', [1, 2, 3, 4, 5, 6], seed)!;
      for (const d of dealt) {
        const theirs = dealt.filter((x) => x.seat !== d.seat).map((x) => x.deal.identity.id);
        expect(d.deal.candidates.some((c) => theirs.includes(c.id))).toBe(false);
      }
    }
  });

  it('deals the same table from the same seed, and another from another', async () => {
    const pool = await whoAmIPool(sources, 'kmr');
    const shape = (seed: string) => JSON.stringify(dealTable(pool, 'beginner', [1, 2], seed));
    expect(shape('one')).toBe(shape('one'));
    expect(shape('one')).not.toBe(shape('two'));
  });

  it('deals nobody rather than a table without somebody', async () => {
    const pool = await whoAmIPool(sources, 'kmr');
    // seven identities at the first two levels: an eighth seat has no card to wear
    expect(dealTable(pool, 'beginner', [1, 2, 3, 4, 5, 6, 7, 8], 'seed')).toBeNull();
    expect(dealTable(pool, 'intermediate', [1, 2], 'seed')).toBeNull();
  });

  it('is offered only with enough question templates, at the difficulties whose levels hold enough identities', async () => {
    const pool = await whoAmIPool(sources, 'kmr');
    // eight templates here: fewer than the game asks for before it is offered
    expect(pool.templates.length).toBeLessThan(WHO_AM_I_MIN_TEMPLATES);
    expect(tableDifficulties(pool)).toEqual([]);
    const enough = { ...pool, templates: Array.from({ length: WHO_AM_I_MIN_TEMPLATES }, (_, i) => ({ ...pool.templates[i % pool.templates.length]!, id: `t${i}` })) };
    expect(tableDifficulties(enough)).toEqual([]);
    const full = { ...enough, identities: [...pool.identities, ...pool.identities.map((x, i) => ({ ...x, id: `more-${i}`, word: `${x.word}x`, level: 1 }))] };
    expect(tableDifficulties(full)).toContain('beginner');
    expect(tableDifficulties(full)).not.toContain('intermediate');
  });
});

describe('a table the server runs', () => {
  it('takes no question asked out loud and no guess judged by the room: those moves are the one-phone game’s, where nothing is paid', () => {
    expect(whoAmITableModule.moveSchema.safeParse({ kind: 'aloud' }).success).toBe(false);
    // nor a guess the room judges: a guess there is a tile, checked here
    expect(whoAmITableModule.moveSchema.safeParse({ kind: 'said', right: true }).success).toBe(false);
    expect(whoAmITableModule.moveSchema.safeParse({ kind: 'pass' }).success).toBe(true);
  });

  it('is never opened by what a lobby is made with', () => {
    const made = whoAmITableModule.lobbySchema.parse({ dialect: 'kmr', difficulty: 'beginner', open: true, deals: [] });
    expect(made.settings).toEqual({ dialect: 'kmr', minutes: 10, difficulty: 'beginner', answers: 2 });
  });

  it('offers the four answers only to a table made by an app that asks for them', () => {
    expect(whoAmITableModule.lobbySchema.parse({ dialect: 'kmr', answers: 4 }).settings.answers).toBe(4);
    // an app from before the four sends nothing: yes and no
    expect(whoAmITableModule.lobbySchema.parse({ dialect: 'kmr' }).settings.answers).toBe(2);
    expect(whoAmITableModule.lobbySchema.safeParse({ dialect: 'kmr', answers: 3 }).success).toBe(false);
    expect(whoAmITableModule.publicSettings({ dialect: 'kmr', minutes: 10, difficulty: 'beginner', answers: 4 })).toMatchObject({ answers: 4 });
    expect(whoAmITableModule.publicSettings({ dialect: 'kmr', minutes: 10, difficulty: 'beginner' })).toMatchObject({ answers: 2 });
  });

  it('takes an answer in either form, and nothing that says no answer at all', async () => {
    const parse = (m: unknown) => whoAmITableModule.moveSchema.safeParse(m);
    for (const says of ['yes', 'sometimes', 'no', 'unsure']) expect(parse({ kind: 'answer', says }).success).toBe(true);
    expect(parse({ kind: 'answer', yes: false }).success).toBe(true);
    expect(parse({ kind: 'answer' }).success).toBe(false);
    expect(parse({ kind: 'answer', says: 'maybe' }).success).toBe(false);
    // the rules are handed today's form, whichever the app sent
    const prepare = async (raw: unknown) => (await whoAmITableModule.prepare({} as never, {} as never, 1, { raw: parse(raw).data!, text: null })).move;
    expect(await prepare({ kind: 'answer', yes: true })).toEqual({ kind: 'answer', says: 'yes' });
    expect(await prepare({ kind: 'answer', yes: false })).toEqual({ kind: 'answer', says: 'no' });
    expect(await prepare({ kind: 'answer', says: 'unsure' })).toEqual({ kind: 'answer', says: 'unsure' });
    expect(await prepare({ kind: 'pass' })).toEqual({ kind: 'pass' });
  });
});

describe('a phone from before the four answers', () => {
  const identity = (over: Partial<WhoAmIIdentity> = {}): WhoAmIIdentity => ({ id: 'i', key: 'k', level: 1, word: 'kûçik', meanings: { en: 'dog' }, category: 'animal', facts: {}, ...over });
  const deal = (facts: WhoAmIIdentity['facts']): WhoAmIDeal => ({
    identity: identity({ facts }),
    candidates: [{ id: 'i', word: 'kûçik', meanings: { en: 'dog' } }],
    questions: Object.keys(facts).map((fact) => ({ id: `q-${fact}`, ku: `${fact}?`, meanings: { en: fact }, fact })),
  });

  it('is dealt a card without its "sometimes" rows, and without the questions they answered', () => {
    const trimmed = asTwoAnswerDeal(deal({ alive: true, animal: true, 'at-home': 'sometimes', 'works-outdoors': 'sometimes', 'can-fly': false }));
    expect(trimmed.identity.facts).toEqual({ alive: true, animal: true, 'can-fly': false });
    expect(trimmed.questions.map((q) => q.fact)).toEqual(['alive', 'animal', 'can-fly']);
    // every question it can still ask has a plain yes or no on the card
    for (const q of trimmed.questions) expect(typeof trimmed.identity.facts[q.fact]).toBe('boolean');
  });

  it('is dealt a card with nothing to trim exactly as it was', () => {
    const plain = deal({ alive: true, animal: true, 'can-fly': false, 'four-legs': true });
    expect(asTwoAnswerDeal(plain)).toEqual(plain);
  });
});

describe('a deal worth playing', () => {
  it('can tell every tile apart by its questions, or is drawn again', () => {
    const tile = (id: string, facts: WhoAmIIdentity['facts']): WhoAmIIdentity => ({ id, key: id, level: 1, word: id, meanings: { en: id }, category: 'animal', facts });
    const a = tile('a', { alive: true, 'can-fly': true });
    const b = tile('b', { alive: true, 'can-fly': false });
    const twin = tile('c', { alive: true, 'can-fly': true, 'four-legs': true });
    const asked = (facts: string[]): WhoAmIDeal => ({
      identity: a,
      candidates: [a, b, twin].map((t) => ({ id: t.id, word: t.word, meanings: t.meanings })),
      questions: facts.map((fact) => ({ id: fact, ku: fact, meanings: { en: fact }, fact })),
    });
    // a and the twin answer the only questions dealt alike: asking could never find which is which
    expect(tellsTilesApart(asked(['alive', 'can-fly']), [a, b, twin])).toBe(false);
    expect(tellsTilesApart(asked(['alive', 'can-fly', 'four-legs']), [a, b, twin])).toBe(true);
  });

  it('deals every seat of the test pool a board its questions can solve', async () => {
    const pool = await whoAmIPool(sources, 'kmr');
    for (const target of identitiesAt(pool.identities, 'beginner')) {
      const dealt = dealSeat(target, pool.identities, pool.templates, { seed: 'x', seat: 1, want: 4 })!;
      expect(dealt.candidates.some((c) => c.id === target.id)).toBe(true);
      expect(tellsTilesApart(dealt, pool.identities)).toBe(true);
    }
  });
});

describe('a card a player reports', () => {
  it('counts each report by the fact it was about, most reported first, on the note’s first line', () => {
    const once = countReport(null, 'at-home');
    expect(once).toBe('Players flagged an answer as wrong: at-home ×1.');
    const twice = countReport(countReport(once, 'sweet'), 'sweet');
    expect(twice).toBe('Players flagged an answer as wrong: sweet ×2, at-home ×1.');
  });

  it('keeps whatever an editor wrote below the count, and never outgrows a review note', () => {
    const note = countReport('Check the facts table with a native speaker.', 'at-home');
    expect(note).toBe('Players flagged an answer as wrong: at-home ×1.\nCheck the facts table with a native speaker.');
    expect(countReport(note, 'at-home')).toBe('Players flagged an answer as wrong: at-home ×2.\nCheck the facts table with a native speaker.');
    const long = countReport('x'.repeat(GAME_CONTENT_REVIEW_NOTE_MAX), 'at-home');
    expect(long.length).toBeLessThanOrEqual(GAME_CONTENT_REVIEW_NOTE_MAX);
    expect(long.startsWith('Players flagged an answer as wrong: at-home ×1.')).toBe(true);
  });
});

describe('a word picked for a card', () => {
  it('takes a curated dictionary entry’s first sense that says anything, its Kurdish definition under the variety’s own code', () => {
    const c = entryCandidate(
      {
        id: '20000000-0000-4000-8000-000000000001',
        headword: 'gurz',
        senses: [
          { en: null, ku: null, example: null },
          { en: 'a club, a mace', ku: 'çomaxekî giran', example: { ku: 'Wî gurz hilda.', en: 'He picked up the club.' } },
        ],
      },
      'kmr',
    );
    expect(c).toEqual({
      ref: 'dict:20000000-0000-4000-8000-000000000001',
      source: 'dictionary',
      dialect: 'kmr',
      word: 'gurz',
      meanings: { en: 'a club, a mace', ku: 'çomaxekî giran' },
      example: { ku: 'Wî gurz hilda.', meanings: { en: 'He picked up the club.' } },
    });
  });

  it('passes over a name, a word in the other script, and an entry that says nothing', () => {
    const row = (headword: string, en: string | null = 'x') => ({ id: '20000000-0000-4000-8000-000000000002', headword, senses: [{ en, ku: null, example: null }] });
    expect(entryCandidate(row('Amed'), 'kmr')).toBeNull();
    expect(entryCandidate(row('گورز'), 'kmr')).toBeNull();
    expect(entryCandidate(row('gurz', null), 'kmr')).toBeNull();
  });

  it('makes an identity only with an English meaning and known facts', () => {
    const cards = new GameWordCards({} as never, sources);
    const word = { ref: 'dict:x', source: 'dictionary' as const, dialect: 'kmr' as const, word: 'gurz', meanings: { en: 'a club', ku: 'çomax' }, example: { ku: 'Wî gurz hilda.', meanings: {} } };
    expect(cards.payloadFor('identity', word, { category: 'object', facts: { alive: false, 'made-up': true } })).toEqual({
      word: 'gurz',
      meanings: { en: 'a club', ku: 'çomax' },
      category: 'object',
      facts: { alive: false },
    });
    expect(() => cards.payloadFor('identity', { ...word, meanings: { ku: 'çomax' } }, { category: 'object' })).toThrow(/English/);
  });
});
