/**
 * Ez kî me? without a database: what a table is dealt from, how a whole
 * table is dealt, and the picked words a card is made of (word-cards.ts).
 */
import { describe, expect, it } from 'vitest';
import { WHO_AM_I_MIN_TEMPLATES, type GameContentKind } from '@kurda/shared';
import type { TrustedSources } from './sources.js';
import { dealTable, identitiesAt, tableDifficulties, whoAmIPool } from './who-am-i.js';
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
    facts: { ...Object.fromEntries(FACTS.map((f, j) => [f, ((i >> (j % 4)) & 1) === 1 || j < 2])), 'not-a-fact': true },
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
    expect(made.settings).toEqual({ dialect: 'kmr', minutes: 10, difficulty: 'beginner' });
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
