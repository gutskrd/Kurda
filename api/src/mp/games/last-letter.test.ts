import { beforeEach, describe, expect, it } from 'vitest';
import { lastLetterRules, learnGame, type LastLetterState } from '@kurda/shared';
import { checkWord, courseWords, forgetCourseWords, hevaloWord, lastLetterCounts, lastLetterModule } from './last-letter.js';

interface Entry {
  headword: string;
  dialect: string;
  in_games: boolean;
  senses: Array<{ pos: string; en: string | null }> | null;
}

/**
 * A dictionary standing in for `dict_entries`, answering the two queries the
 * module makes: by folded key (`= ANY`) and by folded prefix (`LIKE ANY`).
 */
function dictionary(entries: Entry[]) {
  const folded = (w: string) =>
    w
      .toLowerCase()
      .normalize('NFC')
      .replace(/[êîûçş]/g, (c) => ({ ê: 'e', î: 'i', û: 'u', ç: 'c', ş: 's' })[c]!)
      .replace(/[^\p{L}]/gu, '');
  return {
    query: async (sql: string, params: unknown[]) => {
      const dialect = params[1] as string;
      if (sql.includes('LIKE ANY')) {
        const prefixes = (params[1] as string[]).map((p) => p.replace(/%$/, ''));
        const rows = entries.filter(
          (e) => e.in_games && e.dialect === params[0] && prefixes.some((p) => folded(e.headword).startsWith(p)),
        );
        return { rows, rowCount: rows.length };
      }
      const keys = params[0] as string[];
      const rows = entries.filter((e) => e.dialect === dialect && keys.includes(folded(e.headword)));
      return { rows, rowCount: rows.length };
    },
  } as never;
}

const noun = (en: string | null = null) => [{ pos: 'noun', en }];

describe('checking a player’s word', () => {
  const db = dictionary([
    { headword: 'sêv', dialect: 'kurmanji', in_games: true, senses: noun('apple') },
    { headword: 'sev', dialect: 'kurmanji', in_games: false, senses: noun() },
    { headword: 'Amed', dialect: 'kurmanji', in_games: false, senses: noun() },
    { headword: 'û', dialect: 'kurmanji', in_games: false, senses: [{ pos: 'conjunction', en: 'and' }] },
    { headword: 'xanî', dialect: 'kurmanji', in_games: true, senses: null },
    { headword: 'kanî', dialect: 'kurmanji', in_games: false, senses: null },
    { headword: 'mal', dialect: 'kurmanji', in_games: false, senses: noun('house — a building people live in, with rooms') },
    { headword: 'ھاتن', dialect: 'sorani', in_games: true, senses: [{ pos: 'verb', en: 'to come' }] },
  ]);

  it('finds a word letter for letter, ê not being e', async () => {
    expect(await checkWord(db, 'kmr', 'sêv')).toEqual({ found: true, meaning: 'apple' });
    expect(await checkWord(db, 'kmr', 'sev')).toEqual({ found: true, meaning: null });
  });

  it('refuses a proper noun, a part of speech a chain does not take, and a word that is not there', async () => {
    expect((await checkWord(db, 'kmr', 'amed')).found).toBe(false);
    expect((await checkWord(db, 'kmr', 'û')).found).toBe(false);
    expect((await checkWord(db, 'kmr', 'qqqq')).found).toBe(false);
  });

  it('takes an admin’s curated word with no senses yet, and nothing else without senses', async () => {
    expect((await checkWord(db, 'kmr', 'xanî')).found).toBe(true);
    expect((await checkWord(db, 'kmr', 'kanî')).found).toBe(false);
  });

  it('shows only a short gloss, and only from a curated entry', async () => {
    expect((await checkWord(db, 'kmr', 'mal')).meaning).toBeNull();
  });

  it('finds a Soranî word the dictionary keeps in Kurdish letters', async () => {
    expect(await checkWord(db, 'ckb', 'ھاتن')).toEqual({ found: true, meaning: 'to come' });
  });

  it('never looks in the other dialect', async () => {
    expect((await checkWord(db, 'ckb', 'sêv')).found).toBe(false);
  });
});

describe('preparing a move', () => {
  const db = dictionary([{ headword: 'mal', dialect: 'kurmanji', in_games: true, senses: noun('house') }]);
  const state = (): LastLetterState => {
    const s = lastLetterRules.init({ dialect: 'kmr', turnSeconds: 30 }, [{ seat: 1, team: null, bot: null }, { seat: 2, team: null, bot: null }], {
      now: 0,
      seed: 's',
    });
    return { ...s, turn: { seat: 1, n: 1, startedAt: 0, endsAt: 30_000 } };
  };

  it('keeps what was typed with the move, and decides with the dictionary', async () => {
    const p = await lastLetterModule.prepare(db, state(), 1, { raw: { word: ' Mal ' }, text: null });
    expect(p).toEqual({ move: { key: 'mal', verdict: 'ok', meaning: 'house' }, text: 'Mal' });
  });

  it('marks what is not one word, and a word on the profanity list as an offense', async () => {
    expect((await lastLetterModule.prepare(db, state(), 1, { raw: { word: 'mal mezin' }, text: null })).move.key).toBeNull();
    const bad = await lastLetterModule.prepare(db, state(), 1, { raw: { word: 'shit' }, text: null });
    expect(bad).toMatchObject({ move: { verdict: 'not-allowed' }, offense: true });
  });
});

describe('Hevalo', () => {
  const db = dictionary([
    { headword: 'lêv', dialect: 'kurmanji', in_games: true, senses: noun('lip') },
    { headword: 'Laleş', dialect: 'kurmanji', in_games: true, senses: noun() },
    { headword: 'lal', dialect: 'kurmanji', in_games: true, senses: noun() },
    { headword: 'leşker', dialect: 'kurmanji', in_games: false, senses: noun() },
  ]);

  function after(word: string, chain: string[] = []): LastLetterState {
    const s = lastLetterRules.init({ dialect: 'kmr', turnSeconds: 30 }, [{ seat: 1, team: null, bot: null }, { seat: 2, team: null, bot: 'hevalo' }], {
      now: 0,
      seed: 'never-miss',
    });
    return {
      ...s,
      chain: [...chain, word].map((w) => ({ seat: 1, word: w, meaning: null, at: 0 })),
      turn: { seat: 2, n: 1, startedAt: 0, endsAt: 2_000 },
    };
  }

  it('plays only a curated word that fits and was not played, never a name', async () => {
    for (let i = 0; i < 10; i++) {
      const move = await hevaloWord(db, { ...after('mal', ['lal']), seed: `s${i}`, turn: { seat: 2, n: 1, startedAt: 0, endsAt: 2_000 } });
      if (move) expect(move).toEqual({ key: 'lêv', verdict: 'ok', meaning: 'lip' });
    }
  });

  it('cannot think of a word when none fits', async () => {
    expect(await hevaloWord(db, after('mal', ['lal', 'lêv']))).toBeNull();
  });
});

describe('what a game against Hevalo pays', () => {
  it('is nothing: the module has no way to pay one, and names no source for it', () => {
    expect('payAgainstHevalo' in lastLetterModule).toBe(false);
    expect(lastLetterModule.xpSource).toBe('game_last_letter');
    expect(learnGame('last-letter').xpSources).toEqual(['game_last_letter']);
  });
});

describe('the words the course teaches', () => {
  /** A dictionary with the course's published word cards beside it, and a count of how often the cards were read. */
  function withCards(entries: Entry[], cards: Array<{ word: string; en: string | null }>) {
    const dict = dictionary(entries) as unknown as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> };
    const reads = { cards: 0 };
    const db = {
      query: async (sql: string, params: unknown[]) => {
        if (sql.includes('FROM game_content') && !sql.includes('dict_entries')) {
          reads.cards++;
          return { rows: cards, rowCount: cards.length };
        }
        if (sql.includes('AS taught')) return { rows: [{ words: entries.length, hevalo: entries.filter((e) => e.in_games).length, taught: cards.length }], rowCount: 1 };
        return dict.query(sql, params);
      },
    } as never;
    return { db, reads };
  }
  const state = (word: string): LastLetterState => {
    const s = lastLetterRules.init({ dialect: 'kmr', turnSeconds: 30 }, [{ seat: 1, team: null, bot: null }, { seat: 2, team: null, bot: 'hevalo' }], { now: 0, seed: 'never-miss' });
    return { ...s, chain: [{ seat: 1, word, meaning: null, at: 0 }], turn: { seat: 2, n: 1, startedAt: 0, endsAt: 2_000 } };
  };

  beforeEach(() => forgetCourseWords());

  it('takes a word a lesson teaches though the dictionary does not have it, with the lesson’s meaning', async () => {
    const { db } = withCards([], [{ word: 'sêv', en: 'apple' }, { word: 'Azad', en: 'a name' }, { word: 'du peyv', en: 'two words' }]);
    expect(await checkWord(db, 'kmr', 'sêv')).toEqual({ found: true, meaning: 'apple' });
    // a name is no word of the chain, and neither is anything that is not one word
    expect(await checkWord(db, 'kmr', 'azad')).toEqual({ found: false, meaning: null });
    expect(await checkWord(db, 'kmr', 'xewn')).toEqual({ found: false, meaning: null });
  });

  it('shows the lesson’s meaning beside a word the dictionary has and nobody glossed for the games', async () => {
    const { db } = withCards([{ headword: 'nan', dialect: 'kurmanji', in_games: false, senses: noun('bread, a kind of food made of flour, water and yeast, baked') }], [{ word: 'nan', en: 'bread' }]);
    expect(await checkWord(db, 'kmr', 'nan')).toEqual({ found: true, meaning: 'bread' });
  });

  it('lets Hevalo play a word the course teaches when it has no curated word that fits', async () => {
    const { db } = withCards([], [{ word: 'lêv', en: 'lip' }, { word: 'mal', en: 'house' }, { word: 'li', en: 'at' }]);
    // after "mal" the word begins with l: "lêv" fits, "mal" is played and does not, "li" is too short for a turn to read as a word
    for (let i = 0; i < 6; i++) expect(await hevaloWord(db, state('mal'))).toEqual({ key: 'lêv', verdict: 'ok', meaning: 'lip' });
  });

  it('counts the course’s words with the dictionary’s, for checking words and for Hevalo', async () => {
    const { db } = withCards([{ headword: 'av', dialect: 'kurmanji', in_games: true, senses: noun('water') }], [{ word: 'sêv', en: 'apple' }, { word: 'nan', en: 'bread' }]);
    expect(await lastLetterCounts(db, 'kmr')).toEqual({ words: 3, hevalo: 3 });
  });

  it('reads the cards once a minute, not on every word somebody types', async () => {
    const { db, reads } = withCards([], [{ word: 'sêv', en: 'apple' }]);
    const now = Date.now();
    await courseWords(db, 'kmr', now);
    await courseWords(db, 'kmr', now + 30_000);
    await checkWord(db, 'kmr', 'sêv');
    expect(reads.cards).toBe(1);
    // the other variety has cards of its own
    await courseWords(db, 'ckb', now);
    expect(reads.cards).toBe(2);
    await courseWords(db, 'kmr', now + 62_000);
    expect(reads.cards).toBe(3);
  });
});
