/**
 * The party games' server modules without a database: what a host may choose,
 * what a move may be, what each deal draws from the approved pool, and that a
 * deal never travels in anything a client sent.
 */
import { describe, expect, it } from 'vitest';
import { dontSayRules, impostorRules, type ImpostorSettings, type WordCardContent } from '@kurda/shared';
import { dealFrom, impostorModule } from './impostor.js';
import { dontSayModule } from './dont-say.js';
import { meaningKeys, starterCategoryOf } from '../../games/word-categories.js';

// stand-in Kurdish for the fixtures, never shown to a learner
const card = (word: string, category: string, en = word): { payload: WordCardContent } => ({
  payload: { word, meanings: { en }, category, hint: { ku: category, meanings: { en: category } }, forms: [] },
});

/** A `game_content` table standing in: the published rows of one kind, by level. */
function contentDb(rows: Array<{ kind: string; level: number; payload: unknown }>) {
  return {
    query: async (sql: string, params: unknown[]) => {
      const kind = params[0] as string;
      const mine = rows.filter((r) => r.kind === kind);
      if (sql.includes('GROUP BY level')) {
        const counts = new Map<number, number>();
        for (const r of mine) counts.set(r.level, (counts.get(r.level) ?? 0) + 1);
        const out = [...counts.entries()].map(([level, n]) => ({ level, n }));
        return { rows: out, rowCount: out.length };
      }
      const out = mine.map((r, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, level: r.level, payload: r.payload }));
      return { rows: out, rowCount: out.length };
    },
  } as never;
}

describe('Kurdish Impostor on the server', () => {
  it('takes the presets a host may choose, and drops anything else sent', () => {
    const parsed = impostorModule.lobbySchema.parse({ dialect: 'ckb', difficulty: 'intermediate', clueSeconds: 45, deal: { card: { word: 'x' } } });
    expect(parsed.settings).toEqual({ dialect: 'ckb', difficulty: 'intermediate', clueSeconds: 45 });
    expect(impostorModule.lobbySchema.safeParse({ clueSeconds: 31 }).success).toBe(false);
    expect(impostorModule.lobbySchema.safeParse({ maxPlayers: 2 }).success).toBe(false);
    expect(impostorModule.publicSettings(parsed.settings)).toEqual({ dialect: 'ckb', difficulty: 'intermediate', clueSeconds: 45 });
  });

  it('reads a move as a clue, a vote or a guess, and only a clue as text to gate', () => {
    const schema = impostorModule.moveSchema;
    expect(schema.safeParse({ clue: 'heywan' }).success).toBe(true);
    expect(schema.safeParse({ vote: 2 }).success).toBe(true);
    expect(schema.safeParse({ guess: 3 }).success).toBe(true);
    expect(schema.safeParse({ guess: 4 }).success).toBe(false);
    expect(schema.safeParse({ clue: 'heywan', vote: 2 }).success).toBe(false);
    expect(impostorModule.freeText!.textOf({ clue: 'heywan' })).toBe('heywan');
    expect(impostorModule.freeText!.textOf({ vote: 2 })).toBeNull();
  });

  it('deals one card and three others for the guess, the same category first, never the word twice', () => {
    const pool = [card('pisîk', 'animals'), card('kûçik', 'animals'), card('hesp', 'animals'), card('Pisik', 'animals'), card('sêv', 'fruit'), card('nan', 'food')];
    const deal = dealFrom(pool, 'kmr', 'seed-1')!;
    expect(deal.decoys).toHaveLength(3);
    const words = [deal.card.word, ...deal.decoys].map((w) => w.toLowerCase().replace('î', 'i'));
    expect(new Set(words).size).toBe(4);
    const animals = ['pisîk', 'kûçik', 'hesp', 'Pisik'];
    if (animals.includes(deal.card.word)) expect(deal.decoys.filter((d) => animals.includes(d))).toHaveLength(2);
    expect(dealFrom(pool.slice(0, 3), 'kmr', 'seed-1')).toBeNull();
  });

  it('offers a difficulty only with enough approved cards, and deals only from them', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ kind: 'word_card', level: 1, payload: card(`peyv${'abcdefghijkl'[i]}`, 'things').payload }));
    const db = contentDb(rows);
    const choices = impostorModule.lobbySchema.parse({ dialect: 'kmr', difficulty: 'beginner' });
    expect(await impostorModule.offers!(db, choices)).toBe(true);
    expect(await impostorModule.offers!(db, { ...choices, settings: { ...choices.settings, difficulty: 'advanced' } })).toBe(false);
    expect(await impostorModule.availability!(db, 'kmr')).toEqual({ group: true, solo: false });
    const dealt = (await impostorModule.deal!(db, choices.settings, { dialect: 'kmr', seed: 's' })) as ImpostorSettings;
    expect(rows.map((r) => (r.payload as WordCardContent).word)).toContain(dealt.deal!.card.word);
    // the rules start from the deal; the lobby's own settings never held it
    expect(choices.settings).not.toHaveProperty('deal');
    const state = impostorRules.init(dealt, [1, 2, 3].map((seat) => ({ seat, team: null, bot: null })), { now: 0, seed: 's' });
    expect(state.card.word).toBe(dealt.deal!.card.word);
    await expect(impostorModule.deal!(contentDb(rows.slice(0, 5)), choices.settings, { dialect: 'kmr', seed: 's' })).rejects.toMatchObject({ code: 'GAME_UNAVAILABLE' });
  });
});

describe('Don’t Say the Word! on the server', () => {
  it('is a team game of three to eight, with a clue, a guess or a skip as its moves', () => {
    expect(dontSayModule.teams).toBe(2);
    expect(dontSayModule.lobbySchema.safeParse({ maxPlayers: 9 }).success).toBe(false);
    expect(dontSayModule.moveSchema.safeParse({ skip: true }).success).toBe(true);
    expect(dontSayModule.moveSchema.safeParse({ skip: false }).success).toBe(false);
    expect(dontSayModule.freeText!.textOf({ guess: 'pisîk' })).toBe('pisîk');
    expect(dontSayModule.freeText!.textOf({ skip: true })).toBeNull();
  });

  it('deals the approved cards of the difficulty as a shuffled deck, and refuses too few', async () => {
    const taboo = (target: string) => ({ target, meanings: { en: target }, forbidden: ['yek', 'du', 'sê'], forms: [] });
    const rows = Array.from({ length: 20 }, (_, i) => ({ kind: 'taboo_card', level: 3, payload: taboo(`peyv${'abcdefghijklmnopqrst'[i]}`) }));
    const choices = dontSayModule.lobbySchema.parse({ dialect: 'kmr', difficulty: 'intermediate' });
    const dealt = await dontSayModule.deal!(contentDb(rows), choices.settings, { dialect: 'kmr', seed: 's' });
    expect(dealt.deck).toHaveLength(20);
    expect(new Set(dealt.deck!.map((c) => c.target)).size).toBe(20);
    const state = dontSayRules.init(dealt, [1, 2, 3].map((seat) => ({ seat, team: 1, bot: null })), { now: 0, seed: 's' });
    expect(state.deck).toHaveLength(20);
    await expect(dontSayModule.deal!(contentDb(rows.slice(0, 19)), choices.settings, { dialect: 'kmr', seed: 's' })).rejects.toMatchObject({ code: 'GAME_UNAVAILABLE' });
  });
});

describe('the starter categories', () => {
  it('read a published word’s English meaning without its article, brackets or alternatives', () => {
    expect(meaningKeys('The cat (animal)')).toEqual(['cat']);
    expect(meaningKeys('a dog / puppy')).toEqual(['dog', 'puppy']);
    expect(meaningKeys('to eat')).toEqual(['eat']);
  });

  it('sort a word by its meaning, and leave one that fits no category alone', () => {
    expect(starterCategoryOf('cat')?.slug).toBe('animals');
    expect(starterCategoryOf('The apple')?.slug).toBe('fruit');
    expect(starterCategoryOf('police officer')?.slug).toBe('jobs');
    expect(starterCategoryOf('to run')).toBeNull();
    expect(starterCategoryOf(undefined)).toBeNull();
  });
});
