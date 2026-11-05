import { describe, expect, it } from 'vitest';
import { lastLetterRules, type LastLetterState } from '@kurda/shared';
import { checkWord, hevaloWord, lastLetterModule, soloWordRefs } from './last-letter.js';

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
  it('keys each word by the person, the word and the day, and looks back fourteen days', () => {
    const refs = soloWordRefs('u1', 'kmr', 'sêv', new Date('2026-11-05T10:00:00Z'));
    expect(refs).toHaveLength(14);
    expect(refs[0]).toBe('last-letter:u1:kmr:sêv:2026-11-05');
    expect(refs[13]).toBe('last-letter:u1:kmr:sêv:2026-10-23');
  });

  it('pays two for each new word, and nothing for one paid for in the last fortnight', async () => {
    const paidBefore = new Set(['last-letter:u1:kmr:lêv:2026-11-01']);
    const awarded: string[] = [];
    const db = {
      query: async (_sql: string, params: unknown[]) => {
        const hit = (params[0] as string[]).some((r) => paidBefore.has(r));
        return { rows: hit ? [{}] : [], rowCount: hit ? 1 : 0 };
      },
    } as never;
    const state = { chain: [{ seat: 1, word: 'mal' }, { seat: 2, word: 'lal' }, { seat: 1, word: 'lêv' }, { seat: 1, word: 'vexwarin' }] } as LastLetterState;
    const paid = await lastLetterModule.payAgainstHevalo!(db, {
      lobbyId: 'l',
      userId: 'u1',
      seat: 1,
      dialect: 'kmr',
      now: new Date('2026-11-05T10:00:00Z'),
      award: async (a) => {
        awarded.push(a.refId);
        return a.amount;
      },
    }, state);
    expect(paid).toBe(4);
    expect(awarded).toEqual(['last-letter:u1:kmr:mal:2026-11-05', 'last-letter:u1:kmr:vexwarin:2026-11-05']);
  });
});
