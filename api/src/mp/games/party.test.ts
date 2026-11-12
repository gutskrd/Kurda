/**
 * The party games' server modules without a database: what a host may choose,
 * what a move may be, what each deal draws from the approved pool, and that a
 * deal never travels in anything a client sent.
 */
import { describe, expect, it } from 'vitest';
import { IMPOSTOR_CATEGORY_PICTURES, impostorRules, type ImpostorSettings, type WordCardContent } from '@kurda/shared';
import { dealFrom, impostorModule } from './impostor.js';
import { STARTER_CATEGORIES, meaningKeys, starterCategoryOf } from '../../games/word-categories.js';

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
    expect(parsed.settings).toEqual({ dialect: 'ckb', difficulty: 'intermediate', clueSeconds: 45, category: null });
    expect(impostorModule.lobbySchema.safeParse({ clueSeconds: 31 }).success).toBe(false);
    expect(impostorModule.lobbySchema.safeParse({ maxPlayers: 2 }).success).toBe(false);
    expect(impostorModule.publicSettings(parsed.settings)).toEqual({ dialect: 'ckb', difficulty: 'intermediate', clueSeconds: 45, category: null });
  });

  it('takes a category by its slug and a full minute for a clue, and nothing that is neither', () => {
    const parsed = impostorModule.lobbySchema.parse({ category: 'animals', clueSeconds: 60 });
    expect(parsed.settings).toMatchObject({ category: 'animals', clueSeconds: 60 });
    expect(impostorModule.publicSettings(parsed.settings)).toMatchObject({ category: 'animals' });
    expect(impostorModule.lobbySchema.parse({ category: null }).settings.category).toBeNull();
    expect(impostorModule.lobbySchema.safeParse({ category: 'Not A Slug' }).success).toBe(false);
    expect(impostorModule.lobbySchema.safeParse({ category: 7 }).success).toBe(false);
    expect(impostorModule.lobbySchema.safeParse({ clueSeconds: 90 }).success).toBe(false);
    // a lobby stored before categories has none: it reads as any
    expect(impostorModule.publicSettings({ dialect: 'kmr', difficulty: 'beginner', clueSeconds: 30 })).toMatchObject({ category: null });
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

  it('draws the word from the category asked for, and deals nothing from one with too few cards', () => {
    const pool = [card('pisîk', 'animals'), card('kûçik', 'animals'), card('hesp', 'animals'), card('ker', 'animals'), card('sêv', 'fruit'), card('nan', 'food')];
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const deal = dealFrom(pool, 'kmr', seed, 'animals')!;
      expect(['pisîk', 'kûçik', 'hesp', 'ker']).toContain(deal.card.word);
      // with three more animals to choose among, the guess stays inside the category
      expect(deal.decoys.every((d) => ['pisîk', 'kûçik', 'hesp', 'ker'].includes(d))).toBe(true);
    }
    expect(dealFrom(pool, 'kmr', 'a', 'fruit')).toBeNull();
    expect(dealFrom(pool, 'kmr', 'a', 'nowhere')).toBeNull();
    expect(dealFrom(pool, 'kmr', 'a', null)).not.toBeNull();
  });

  it('offers a difficulty only with enough approved cards, and deals only from them', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ kind: 'word_card', level: 1, payload: card(`peyv${'abcdefghijkl'[i]}`, 'things').payload }));
    const db = contentDb(rows);
    const choices = impostorModule.lobbySchema.parse({ dialect: 'kmr', difficulty: 'beginner' });
    expect(await impostorModule.offers!(db, choices)).toBe(true);
    expect(await impostorModule.offers!(db, { ...choices, settings: { ...choices.settings, difficulty: 'advanced' } })).toBe(false);
    expect(await impostorModule.availability!(db, 'kmr')).toEqual({ group: true, solo: false });
    const dealt = (await impostorModule.deal!(db, choices.settings, { dialect: 'kmr', seed: 's', seats: [] })) as ImpostorSettings;
    expect(rows.map((r) => (r.payload as WordCardContent).word)).toContain(dealt.deal!.card.word);
    // the rules start from the deal; the lobby's own settings never held it
    expect(choices.settings).not.toHaveProperty('deal');
    const state = impostorRules.init(dealt, [1, 2, 3].map((seat) => ({ seat, team: null, bot: null })), { now: 0, seed: 's' });
    expect(state.card.word).toBe(dealt.deal!.card.word);
    await expect(impostorModule.deal!(contentDb(rows.slice(0, 5)), choices.settings, { dialect: 'kmr', seed: 's', seats: [] })).rejects.toMatchObject({ code: 'GAME_UNAVAILABLE' });
  });

  it('offers a category only with enough approved cards at the lobby’s difficulty, and deals from it', async () => {
    const things = Array.from({ length: 12 }, (_, i) => ({ kind: 'word_card', level: 1, payload: card(`peyv${'abcdefghijkl'[i]}`, 'things').payload }));
    const animals = ['pisîk', 'kûçik', 'hesp', 'ker'].map((w) => ({ kind: 'word_card', level: 1, payload: card(w, 'animals').payload }));
    // four fruits too, but for an advanced game: not a beginner’s category
    const fruit = ['sêv', 'hirmî', 'tirî', 'xox'].map((w) => ({ kind: 'word_card', level: 5, payload: card(w, 'fruit').payload }));
    const db = contentDb([...things, ...animals, ...fruit]);
    const of = (category: string) => impostorModule.lobbySchema.parse({ dialect: 'kmr', difficulty: 'beginner', category });
    expect(await impostorModule.offers!(db, of('animals'))).toBe(true);
    expect(await impostorModule.offers!(db, of('fruit'))).toBe(false);
    expect(await impostorModule.offers!(db, of('nowhere'))).toBe(false);
    for (const seed of ['s', 't', 'u', 'v']) {
      const dealt = (await impostorModule.deal!(db, of('animals').settings, { dialect: 'kmr', seed, seats: [] })) as ImpostorSettings;
      expect(['pisîk', 'kûçik', 'hesp', 'ker']).toContain(dealt.deal!.card.word);
    }
    // the approved cards of a category can be withdrawn between making the lobby and starting it
    await expect(impostorModule.deal!(contentDb(things), of('animals').settings, { dialect: 'kmr', seed: 's', seats: [] })).rejects.toMatchObject({ code: 'GAME_UNAVAILABLE' });
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
    expect(starterCategoryOf('a pencil')?.slug).toBe('school');
    expect(starterCategoryOf('winter')?.slug).toBe('time');
    expect(starterCategoryOf('the wedding')?.slug).toBe('celebrations');
    expect(starterCategoryOf('seven')?.slug).toBe('numbers');
    expect(starterCategoryOf('the storm')?.slug).toBe('weather');
    expect(starterCategoryOf('to whistle up the wind')).toBeNull();
    expect(starterCategoryOf(undefined)).toBeNull();
  });

  it('sort a word by its first meaning, and a verb as a verb', () => {
    // the lesson taught "box"; "chest" is its second meaning, and no part of the body
    expect(starterCategoryOf('box, chest')?.slug).toBe('things');
    expect(starterCategoryOf('good, well')?.slug).toBe('qualities');
    expect(starterCategoryOf('injection; needle')?.slug).toBe('health');
    // the same English word, once a verb and once not
    expect(starterCategoryOf('to light (a fire)')?.slug).toBe('actions');
    expect(starterCategoryOf('light (not heavy)')?.slug).toBe('qualities');
    expect(starterCategoryOf('to run')?.slug).toBe('actions');
    // a verb no category lists as a verb still finds the category that lists the word
    expect(starterCategoryOf('to milk')?.slug).toBe('actions');
    expect(starterCategoryOf('to race')?.slug).toBe('sports');
    // a meaning in a later place decides only when the first has no category
    expect(starterCategoryOf('I wonder, fox')?.slug).toBe('animals');
  });

  it('name each category once and file each meaning under one category only', () => {
    const slugs = STARTER_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const words = STARTER_CATEGORIES.flatMap((c) => c.words);
    expect(words.filter((w, i) => words.indexOf(w) !== i)).toEqual([]);
    const verbs = STARTER_CATEGORIES.flatMap((c) => c.verbs ?? []);
    expect(verbs.filter((w, i) => verbs.indexOf(w) !== i)).toEqual([]);
    for (const c of STARTER_CATEGORIES) {
      expect(c.name.kmr.trim()).not.toBe('');
      expect(c.name.ckb.trim()).not.toBe('');
      expect(Object.keys(c.meanings).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'nl', 'tr']);
      // every meaning is written the way a lesson's meaning is read: lower case, no article, no "to"
      for (const w of [...c.words, ...(c.verbs ?? [])]) expect(meaningKeys(w), w).toEqual([w]);
    }
    // no two categories are called the same in a variety or in a reader's language: a host chooses among their names
    for (const of of [(c: (typeof STARTER_CATEGORIES)[number]) => c.name.kmr, (c: (typeof STARTER_CATEGORIES)[number]) => c.name.ckb, (c: (typeof STARTER_CATEGORIES)[number]) => c.meanings.en]) {
      const names = STARTER_CATEGORIES.map(of);
      expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
    }
  });

  it('are forty, wide enough that most of what a course teaches can become a card', () => {
    expect(STARTER_CATEGORIES).toHaveLength(40);
    // each has a picture of its own for its tile (shared/src/art/impostor.ts)
    expect(STARTER_CATEGORIES.map((c) => c.slug).filter((slug) => !IMPOSTOR_CATEGORY_PICTURES.includes(slug))).toEqual([]);
    expect(STARTER_CATEGORIES.reduce((n, c) => n + c.words.length + (c.verbs?.length ?? 0), 0)).toBeGreaterThan(1500);
    for (const c of STARTER_CATEGORIES) expect(c.words.length + (c.verbs?.length ?? 0), c.slug).toBeGreaterThanOrEqual(12);
  });
});
