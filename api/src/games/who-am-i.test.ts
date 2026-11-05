/**
 * Who Am I? played alone, without a database: a round dealt from approved
 * rows, what the player is sent of it, how a guess is judged, and the picked
 * words a card is made of (word-cards.ts).
 */
import { describe, expect, it } from 'vitest';
import { WHO_AM_I_ROUND_ITEMS, type GameContentKind } from '@kurda/shared';
import type { TrustedSources } from './sources.js';
import { WhoAmIGame, identitiesAt, whoAmIPool } from './who-am-i.js';
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
const noneSeen = { query: async () => ({ rows: [], rowCount: 0 }) } as never;

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

describe('a round', () => {
  const game = new WhoAmIGame(sources);

  it('deals a few hidden identities, each among tiles, never sending which one it is', async () => {
    const round = (await game.build({ userId: 'u1', dialect: 'kmr', difficulty: 'beginner', seed: 'seed' }, noneSeen))!;
    expect(round.items).toHaveLength(WHO_AM_I_ROUND_ITEMS);
    const item = round.items[0]!;
    const view = game.view(item, 0);
    // tiles are known by their place in the round, never by the identity behind them
    expect(view.tiles.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
    for (const t of item.tiles) expect(JSON.stringify(view)).not.toContain(t.id);
    expect(view.tiles).toHaveLength(4);
    // a beginner sees what the tiles mean
    expect(view.tiles[0]!.meanings).not.toBeNull();
    const sent = JSON.stringify(view);
    expect(sent).not.toContain('"facts"');
    expect(sent).not.toContain('"fact"');
    expect(sent).not.toContain(`"identity"`);
    // the template whose fact no tile's table answers is never offered
    expect(view.questions.map((q) => q.ku)).not.toContain('Pirsa 7?');
  });

  it('judges a guess by the tile, says which tile it was not, and names the identity once done', async () => {
    const round = (await game.build({ userId: 'u1', dialect: 'kmr', difficulty: 'beginner', seed: 'seed' }, noneSeen))!;
    const item = round.items[0]!;
    const view = game.view(item, 0);
    const right = view.tiles[item.tiles.findIndex((t) => t.id === item.identity.id)]!.id;
    const other = view.tiles.find((t) => t.id !== right)!.id;
    expect(game.grade(item, { guess: right })).toBe(true);
    expect(game.grade(item, { guess: other })).toBe(false);
    // the identity's own id is no guess at all
    expect(game.grade(item, { guess: item.identity.id })).toBe(false);
    expect(game.hint(item, { guess: other })).toEqual({ notThis: other });
    expect(game.correction(item)).toEqual({ id: right, word: item.identity.word, meanings: item.identity.meanings, category: 'animal' });
  });

  it('names the kind of thing only when every tile is that kind', async () => {
    const round = (await game.build({ userId: 'u1', dialect: 'kmr', difficulty: 'beginner', seed: 'seed' }, noneSeen))!;
    const item = round.items[0]!;
    expect(game.view(item, 0).category).toBe(item.identity.category);
    const mixed = { ...item, tiles: item.tiles.map((t, i) => (i === 0 && t.id !== item.identity.id ? { ...t, category: 'object' } : i === 1 && t.id !== item.identity.id ? { ...t, category: 'object' } : t)) };
    expect(game.view(mixed, 0).category).toBeNull();
  });

  it('makes no round at a difficulty without enough identities', async () => {
    expect(await game.build({ userId: 'u1', dialect: 'kmr', difficulty: 'intermediate', seed: 'seed' }, noneSeen)).toBeNull();
  });

  it('hides the tiles’ meanings above beginner', async () => {
    const many = { content: async (kind: GameContentKind) => (kind === 'identity' ? IDENTITIES.map((i) => ({ ...i, level: 4 })) : TEMPLATES) } as unknown as TrustedSources;
    const round = (await new WhoAmIGame(many).build({ userId: 'u1', dialect: 'kmr', difficulty: 'advanced', seed: 'seed' }, noneSeen))!;
    expect(new WhoAmIGame(many).view(round.items[0]!, 0).tiles.every((t) => t.meanings === null)).toBe(true);
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

  it('makes a Bluff card with the word’s meanings and example, and an identity only with an English meaning and known facts', () => {
    const cards = new GameWordCards({} as never, sources);
    const word = { ref: 'dict:x', source: 'dictionary' as const, dialect: 'kmr' as const, word: 'gurz', meanings: { en: 'a club', ku: 'çomax' }, example: { ku: 'Wî gurz hilda.', meanings: {} } };
    expect(cards.payloadFor('bluff_card', word, {})).toEqual({ word: 'gurz', definitions: { en: 'a club', ku: 'çomax' }, example: { ku: 'Wî gurz hilda.' } });
    expect(cards.payloadFor('identity', word, { category: 'object', facts: { alive: false, 'made-up': true } })).toEqual({
      word: 'gurz',
      meanings: { en: 'a club', ku: 'çomax' },
      category: 'object',
      facts: { alive: false },
    });
    expect(() => cards.payloadFor('identity', { ...word, meanings: { ku: 'çomax' } }, { category: 'object' })).toThrow(/English/);
  });
});
