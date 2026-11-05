import { describe, expect, it } from 'vitest';
import { bluffRules } from '@kurda/shared';
import { bluffCards, bluffModule, dealtCard } from './bluff.js';

/** `game_content` standing in, answering the module's queries for one dialect's published bluff cards. */
function cards(rows: Array<{ id: string; payload: unknown }>) {
  return {
    query: async (sql: string, params: unknown[]) => {
      if (sql.includes('json_object_agg')) {
        const byLanguage: Record<string, number> = {};
        for (const r of rows) for (const k of Object.keys((r.payload as { definitions: object }).definitions)) byLanguage[k] = (byLanguage[k] ?? 0) + 1;
        return { rows: [{ total: rows.length, langs: byLanguage }], rowCount: 1 };
      }
      const language = params[1] as string;
      const out = rows.filter((r) => language in ((r.payload as { definitions?: object }).definitions ?? {}));
      return { rows: out, rowCount: out.length };
    },
  } as never;
}

const card = (n: number, definitions: Record<string, string>, word = `peyv${'abcdefghijklmnopqrstuvwxyz'[n % 26]}`) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  payload: { word, definitions },
});

describe('a card as a game plays it', () => {
  it('is played in a language its real meaning is written in, with the example’s meaning in it or in English', () => {
    const c = { word: 'qelew', definitions: { en: 'fat', de: 'dick' }, example: { ku: 'Pisîk qelew e.', meanings: { en: 'The cat is fat.' } } };
    expect(dealtCard('c1', c, 'de')).toEqual({ id: 'c1', word: 'qelew', real: 'dick', example: { ku: 'Pisîk qelew e.', meaning: 'The cat is fat.' } });
    expect(dealtCard('c1', c, 'fr')).toBeNull();
    expect(dealtCard('c1', { word: 'gurz', definitions: { en: 'a club' } }, 'en')).toMatchObject({ example: null });
  });

  it('leaves out a stored card in the other variety’s script, or without the language', async () => {
    const db = cards([card(1, { en: 'fat' }), { id: '00000000-0000-4000-8000-000000000002', payload: { word: 'قەڵەو', definitions: { en: 'fat' } } }, card(3, { de: 'dick' })]);
    expect((await bluffCards(db, 'kmr', 'en')).map((c) => c.word)).toEqual(['peyvb']);
  });
});

describe('the deal', () => {
  const db = cards(Array.from({ length: 12 }, (_, i) => card(i, { en: `meaning ${i}` })));
  const lobby = (seed: string) => ({ dialect: 'kmr' as const, settings: { dialect: 'kmr' as const, language: 'en' as const, rounds: 5 as const, writeSeconds: 60 as const }, seed });

  it('deals as many words as the rounds, drawn from the seed, the same every time', async () => {
    const a = await bluffModule.deal!(db, lobby('s1'), []);
    expect(a.deck).toHaveLength(5);
    expect((await bluffModule.deal!(db, lobby('s1'), [])).deck).toEqual(a.deck);
    expect((await bluffModule.deal!(db, lobby('s2'), [])).deck).not.toEqual(a.deck);
  });

  it('refuses to start with no card to deal', async () => {
    await expect(bluffModule.deal!(cards([]), lobby('s1'), [])).rejects.toMatchObject({ code: 'NOT_ENOUGH_CONTENT', statusCode: 409 });
  });

  it('keeps the deck out of what the lobby shows', async () => {
    const dealt = await bluffModule.deal!(db, lobby('s1'), []);
    expect(bluffModule.publicSettings(dealt)).toEqual({ dialect: 'kmr', language: 'en', rounds: 5, writeSeconds: 60 });
    const state = bluffRules.init(dealt, [1, 2, 3].map((seat) => ({ seat, team: null, bot: null })), { now: 0, seed: 's1' });
    expect(JSON.stringify(bluffRules.viewFor(state, 1))).not.toContain('meaning ');
  });
});

describe('what a host may choose', () => {
  const parse = (raw: unknown) => bluffModule.lobbySchema.safeParse(raw);

  it('takes the presets and an interface language, and fills in the rest', () => {
    const ok = parse({ dialect: 'ckb', language: 'de', rounds: 7 });
    expect(ok.success && ok.data).toMatchObject({ dialect: 'ckb', maxPlayers: 8, settings: { language: 'de', rounds: 7, writeSeconds: 90 } });
  });

  it('refuses anything not offered', () => {
    expect(parse({ language: 'xx' }).success).toBe(false);
    expect(parse({ rounds: 4 }).success).toBe(false);
    expect(parse({ writeSeconds: 10 }).success).toBe(false);
    expect(parse({ maxPlayers: 2 }).success).toBe(false);
  });
});

describe('moves', () => {
  it('sends a fake through the free-text gate, and a vote through none', () => {
    expect(bluffModule.freeText!.textOf({ kind: 'write', text: 'a small bird' })).toBe('a small bird');
    expect(bluffModule.freeText!.textOf({ kind: 'vote', option: 'B' })).toBeNull();
  });

  it('plays the gated text, and keeps it with the move', async () => {
    const state = bluffRules.init({ dialect: 'kmr', language: 'en', rounds: 3, writeSeconds: 60 }, [], { now: 0, seed: 'x' });
    expect(await bluffModule.prepare({} as never, state, 1, { raw: { kind: 'write', text: '  a  small bird ' }, text: 'a small bird' })).toEqual({
      move: { kind: 'write', text: 'a small bird' },
      text: 'a small bird',
    });
    expect(await bluffModule.prepare({} as never, state, 1, { raw: { kind: 'vote', option: 'C' }, text: null })).toEqual({ move: { kind: 'vote', option: 'C' }, text: null });
  });
});

describe('where it is offered', () => {
  it('in a dialect with enough cards, in the languages enough of them have', async () => {
    const many = cards(Array.from({ length: 24 }, (_, i) => card(i, i < 12 ? { en: 'x', de: 'y' } : { en: 'x' })));
    expect(await bluffModule.availability!(many, 'kmr')).toEqual({
      group: true,
      solo: false,
      languages: [
        { language: 'en', cards: 24 },
        { language: 'de', cards: 12 },
      ],
    });
    expect((await bluffModule.availability!(cards([card(1, { en: 'x' })]), 'kmr')).group).toBe(false);
  });
});
