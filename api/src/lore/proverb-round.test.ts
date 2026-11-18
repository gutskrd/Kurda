/**
 * The proverb round without a database: a scene with its proverb removed however its Arabic is written, where a
 * proverb is to be finished, and a round of finishes whose options resemble the answer but are never one of its
 * variants. The proverbs are stand-ins.
 */
import { describe, expect, it } from 'vitest';
import { PROVERB_ROUND_ITEMS, PROVERB_ROUND_OPTIONS, type ProverbRoundItemView } from '@kurda/shared';
import { ProverbRound, proverbGap, sceneWithout } from './proverb-round.js';

describe('a scene with its proverb taken out', () => {
  it('finds the proverb quoted in the scene, whatever its case or its full stop', () => {
    expect(sceneWithout('Grandma said: “Drop by drop, a lake is made.” Then she smiled.', 'Drop by drop, a lake is made.')).toBe(
      'Grandma said: “….” Then she smiled.',
    );
  });

  it('finds it with Arabic’s short vowels written on one side and not the other, and without its comma', () => {
    const rendering = 'الجبلُ، مهما علا، يمرُّ به طريق.';
    const scene = 'قال الجد: «الجبل مهما علا يمر به طريق»، ثم واصل المشي.';
    expect(sceneWithout(scene, rendering)).toBe('قال الجد: «…»، ثم واصل المشي.');
    // and the other way round, the scene written with them
    expect(sceneWithout('قالت: «الجبلُ مهما علا يمرُّ به طريقٌ».', 'الجبل مهما علا يمر به طريق')).toBe('قالت: «…».');
  });

  it('leaves a scene that does not quote it as it is', () => {
    expect(sceneWithout('Nobody said anything.', 'A lake is made drop by drop.')).toBe('Nobody said anything.');
  });
});

describe('where a proverb is finished', () => {
  it('is its last word of three letters or more, with what stands around it', () => {
    expect(proverbGap('Av dilop dilop dibe gol.')).toEqual({ before: 'Av dilop dilop dibe', word: 'gol', after: '.' });
    expect(proverbGap('Mêvan mêvanê Xwedê ye.')).toEqual({ before: 'Mêvan mêvanê', word: 'Xwedê', after: ' ye.' });
    expect(proverbGap('دەست دەست دەشوات.')).toEqual({ before: 'دەست دەست', word: 'دەشوات', after: '.' });
    expect(proverbGap('Ew e.')).toBeNull();
  });
});

describe('a round of proverbs to finish', () => {
  // stand-in proverbs, each with a last word, and one with a variant that ends otherwise
  const texts = [
    ['p1', 'Av dilop dilop dibe gol.', []],
    ['p2', 'Çiya çiqas bilind be, rê pê dikeve.', [{ text: 'Çiya çiqas bilind be, rê pê keve.', dialect: 'kmr' }]],
    ['p3', 'Dar bi berê xwe tê nasîn.', []],
    ['p4', 'Dil dilê xwe dibîne.', []],
    ['p5', 'Gur ji mijê hez dike.', []],
    ['p6', 'Kevir li cihê xwe giran e.', []],
    ['p7', 'Mirov bi mirovan mirov e.', []],
    ['p8', 'Keda xwe bixwe, ne ya xelkê.', []],
  ] as const;
  const rows = texts.map(([id, text, variants]) => ({
    id,
    dialect: 'kmr',
    level: 3,
    payload: { slug: `kmr-${id}`, text, themes: ['patience'], tradition: 'new', variants, exampleKu: text, sources: [] },
  }));
  const db = {
    query: async (sql: string) => {
      if (sql.includes('FROM game_content_translations')) {
        return { rows: rows.map((r) => ({ content_id: r.id, locale: 'en', payload: { translation: `T ${r.id}`, meaning: `M ${r.id}`, example: `E ${r.id}` } })) };
      }
      if (sql.includes('FROM game_content')) return { rows };
      if (sql.includes('FROM users')) return { rows: [{ locale: 'ku' }] };
      return { rows: [] };
    },
  } as never;

  it('is five proverbs, each with its own word among three, and nothing of the answer in what is sent', async () => {
    const game = new ProverbRound('complete');
    const round = await game.build({ userId: 'u1', dialect: 'kmr', difficulty: 'intermediate', seed: 's1' }, db);
    if (!round) throw new Error('no round');
    expect(round.items).toHaveLength(PROVERB_ROUND_ITEMS);
    for (const [i, item] of round.items.entries()) {
      const view = game.view(item, i) as Extract<ProverbRoundItemView, { mode: 'complete' }>;
      expect(view.mode).toBe('complete');
      expect(view.options).toHaveLength(PROVERB_ROUND_OPTIONS);
      expect(new Set(view.options).size).toBe(PROVERB_ROUND_OPTIONS);
      expect(view.proverb).toContain('…');
      const gap = proverbGap(item.text)!;
      expect(view.options[game.correction(item).choice]).toBe(gap.word);
      expect(game.grade(item, { choice: game.correction(item).choice })).toBe(true);
      // a Kurdish interface has no translation of a Kurmancî proverb: the correction is in English
      expect(game.correction(item).locale).toBe('en');
    }
  });

  it('never offers a word that makes one of the proverb’s own variants', async () => {
    const game = new ProverbRound('complete');
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const round = await game.build({ userId: 'u1', dialect: 'kmr', difficulty: 'intermediate', seed }, db);
      const p2 = round?.items.find((it) => it.key === 'p2');
      if (p2) expect(p2.options).not.toContain('keve');
    }
  });
});
