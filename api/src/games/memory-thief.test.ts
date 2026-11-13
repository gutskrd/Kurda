/**
 * Dizê Bîrê's rounds without a database: which words a passage can
 * lose and which it does, how the passage is laid out with its gaps, how
 * conversations are cut into passages, the round made at a difficulty, the
 * decoys, and how the words given back are graded, nudged and corrected.
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_LEVELS, MEMORY_HIDDEN, MEMORY_ROUND_PASSAGES, textScript, type GameDialect, type MemoryPart } from '@kurda/shared';
import {
  MemoryThiefGame,
  candidatesIn,
  chooseDecoys,
  chooseHidden,
  conversationLevel,
  conversationWindows,
  passageParts,
  pieces,
  type MemoryItem,
} from './memory-thief.js';
import type { ConversationText, StoryPassage, TrustedSources, VocabularyWord } from './sources.js';

// stand-in passages and words for the rules, never shown to a learner
const lexicon = new Map([
  ['mal', { en: 'house' }],
  ['bajar', { en: 'city' }],
  ['çiya', { en: 'mountain' }],
  ['av', { en: 'water' }],
  ['dar', { en: 'tree' }],
  ['pirtûk', { en: 'book' }],
  ['derî', { en: 'door' }],
  ['pencere', { en: 'window' }],
]);

const glossary = [
  { term: 'gund', meanings: { en: 'village', de: 'Dorf' } },
  { term: 'kanî', meanings: { en: 'spring' } },
  { term: 'nexşe', meanings: {} },
];

describe('the words a passage can lose', () => {
  it('are its glossary terms first, then taught words, each with a meaning, each exactly as written', () => {
    const c = candidatesIn(['Gund li ber çiya ye. Kanî li gund e û dar mezin e.'], glossary, lexicon, 'kmr');
    expect(c.map((x) => [x.term, x.from])).toEqual([
      ['gund', 'glossary'],
      ['çiya', 'vocabulary'],
      ['dar', 'vocabulary'],
    ]);
    // a glossary term without any meaning is never taken, nor one the passage writes only otherwise (Kanî for kanî)
    expect(c.map((x) => x.term)).not.toContain('nexşe');
    expect(c.map((x) => x.term.toLowerCase())).not.toContain('kanî');
  });

  it('never take a meaning for a word spelled alike: marks, capitals and a word of another lesson are not the word', () => {
    // what lessons elsewhere teach for words that look like these
    const lookAlikes = new Map([
      ['te', { en: 'your; you' }],
      ['xwê', { en: 'salt' }],
      ['dê', { en: 'mother' }],
      ['baran', { en: 'rain' }],
      ['ne', { en: 'not' }],
    ]);
    const c = candidatesIn(['Baran tê malê û xwe dişo.', 'Ew ê de bên, ew xemlandî ne.'], [], lookAlikes, 'kmr');
    expect(c).toEqual([]);
    // the word itself, exactly as written, is taken with the meaning given for it
    expect(candidatesIn(['Baran li ser baranê ye, baran dibare.'], [], lookAlikes, 'kmr').map((x) => [x.term, x.meanings.en])).toEqual([['baran', 'rain']]);
  });

  it('are never short words or names', () => {
    const c = candidatesIn(['Ez û Hêvî diçin bajar. Av sar e.'], [{ term: 'Hêvî', meanings: { en: 'a name' } }], lexicon, 'kmr');
    expect(c.map((x) => x.term)).toEqual(['bajar']);
  });

  it('read a Soranî passage in its own script', () => {
    const c = candidatesIn(['گوندەکە لە بەر چیایە.'], [{ term: 'گوندەکە', meanings: { en: 'the village' } }], new Map(), 'ckb');
    expect(c).toEqual([{ term: 'گوندەکە', meanings: { en: 'the village' }, from: 'glossary' }]);
  });
});

describe('the words that vanish', () => {
  const lines = ['Gund li ber çiya ye. Kanî li gund e û dar li ber kanî mezin e. Mal li bajar e.'];
  const candidates = candidatesIn(lines, glossary, lexicon, 'kmr');

  it('are as many as asked, glossary first, in the order they stand', () => {
    const hidden = chooseHidden(lines, candidates, 3, 'seed', 'kmr');
    expect(hidden).toHaveLength(3);
    expect(hidden.filter((h) => h.from === 'glossary')).toHaveLength(2);
    // where a word first stands, whatever its capital there
    const at = (t: string) => lines[0]!.toLowerCase().indexOf(t.toLowerCase());
    expect(hidden.map((h) => at(h.term))).toEqual([...hidden.map((h) => at(h.term))].sort((a, b) => a - b));
  });

  it('are never more than the passage has', () => {
    expect(chooseHidden(lines, candidates.slice(0, 2), 6, 'seed', 'kmr')).toHaveLength(2);
  });

  it('keep apart where they can: no two gaps side by side', () => {
    const tight = ['Mal bajar çiya dar. Av li vir e û li wir jî heye.'];
    const c = candidatesIn(tight, [], lexicon, 'kmr');
    const hidden = chooseHidden(tight, c, 2, 'seed', 'kmr');
    const words = tight[0]!.split(' ').map((w) => w.replace(/\.$/, ''));
    const places = hidden.map((h) => words.indexOf(h.term));
    expect(Math.abs(places[0]! - places[1]!)).toBeGreaterThan(1);
  });
});

describe('a passage with its gaps', () => {
  const text = (parts: MemoryPart[]) => parts.map((p) => ('text' in p ? p.text : 'gap' in p ? `[${p.gap}]` : `|${p.line}|`)).join('');

  it('keeps everything as written but the vanished words', () => {
    expect(text(passageParts(['Gund li ber çiya ye, ne dûr.'], ['Gund', 'çiya'], 'kmr'))).toBe('|0|[0] li ber [1] ye, ne dûr.');
  });

  it('makes a word that vanished from two places the same gap twice', () => {
    expect(text(passageParts(['Kanî li gund e. Gund biçûk e.'], ['gund'], 'kmr'))).toBe('|0|Kanî li [0] e. [0] biçûk e.');
  });

  it('opens every line of a conversation, and keeps the punctuation around a gap', () => {
    expect(text(passageParts(['Tu diçî ku?', '«Bajar», ez dibêjim.'], ['bajar'], 'kmr'))).toBe('|0|Tu diçî ku?|1|«[0]», ez dibêjim.');
  });

  it('reads words as gameWords does, apostrophes and all', () => {
    expect(pieces('Ez’ê biçim!').map((p) => p.word)).toEqual(['Ez’ê', null, 'biçim', null]);
  });
});

describe('a conversation cut into passages', () => {
  it('is three or four lines at a time, never fewer', () => {
    expect(conversationWindows(2)).toEqual([]);
    expect(conversationWindows(3)).toEqual([3]);
    expect(conversationWindows(7)).toEqual([4, 3]);
    expect(conversationWindows(10)).toEqual([4, 3, 3]);
    for (let n = 6; n <= 20; n++) {
      const w = conversationWindows(n);
      expect(w.reduce((a, b) => a + b, 0)).toBe(n);
      for (const size of w) expect(size === 3 || size === 4).toBe(true);
    }
  });

  it('is levelled by how long its lines are', () => {
    expect(conversationLevel(['Silav.', 'Tu çawa yî?', 'Baş im.'])).toBe(1);
    expect(conversationLevel(['Ez îro bi hevalê xwe re diçim bajarê mezin ji bo kirînê.', 'Tu kengê vedigerî malê?', 'Êvarê zû ez vedigerim, eger otobus hebe.'])).toBe(3);
  });
});

describe('the decoys', () => {
  it('are approved words the passage does not hold, none the same as a vanished word', () => {
    const decoys = chooseDecoys(['gund'], ['gund', 'gûnd', 'mal', 'bajar', 'çiya', 'av'], new Set(['gund', 'mal']), 2, 'seed', 'kmr');
    expect(decoys).toHaveLength(2);
    expect(decoys).not.toContain('gund');
    // the same word but for a mark is no decoy: from tiles it would be a trap, not a choice
    expect(decoys).not.toContain('gûnd');
    expect(decoys).not.toContain('mal');
    expect(decoys).not.toContain('av');
  });
});

// a story of six paragraphs and a conversation of eight lines, in each variety
function story(dialect: GameDialect, level: number, n: number): StoryPassage[] {
  // a passage of its own for every level and paragraph: the same text twice is one passage
  const kmr = (i: number) => `Gund ${'xweş '.repeat(i + level * 10)}li ber çiya ye. Kanî li gund e û dar li ber kanî mezin e. Mal li bajar e, lê rê dûr e û av sar e.`;
  const ckb = (i: number) => `گوندەکە ${'جوان '.repeat(i + level * 10)}لە بەر چیایە. کانییەکە لە گوندەکە دایە و دارەکە گەورەیە و ماڵەکە نزیکە.`;
  return Array.from({ length: n }, (_, i) => ({
    key: `p${dialect}${level}${i}`,
    storyId: `story-${dialect}-${level}-${i % 3}`,
    title: dialect === 'kmr' ? 'Gund' : 'گوند',
    level,
    paragraph: i,
    text: dialect === 'kmr' ? kmr(i) : ckb(i),
    glossary:
      dialect === 'kmr'
        ? [
            { term: 'gund', meanings: { en: 'village' } },
            { term: 'kanî', meanings: { en: 'spring' } },
            { term: 'çiya', meanings: { en: 'mountain' } },
            { term: 'bajar', meanings: { en: 'city' } },
            { term: 'dar', meanings: { en: 'tree' } },
          ]
        : [
            { term: 'گوندەکە', meanings: { en: 'the village' } },
            { term: 'کانییەکە', meanings: { en: 'the spring' } },
          ],
  }));
}

const conversation: ConversationText = {
  key: 'conv-1',
  conversation: 'c1',
  title: null,
  lines: [
    { ku: 'Silav, tu diçî bajar?', en: 'Hi, are you going to the city?', speaker: 'hamo' },
    { ku: 'Erê, ez diçim bajar.', en: 'Yes, I am going to the city.', speaker: 'hevalo' },
    { ku: 'Mal li ku ye?', en: 'Where is the house?', speaker: 'hamo' },
    { ku: 'Mal li ber çiya ye.', en: 'The house is by the mountain.', speaker: 'hevalo' },
  ],
  origin: 'conversation:x',
  // what its own lesson teaches, exactly as written
  taught: [
    { word: 'bajar', meanings: { en: 'city' } },
    { word: 'çiya', meanings: { en: 'mountain' } },
  ],
};

const vocabulary: VocabularyWord[] = [...lexicon].map(([ku, meanings]) => ({ key: `w:${ku}`, ku, meanings }));

function fakeSources(dialect: GameDialect): TrustedSources {
  const stories = [...story(dialect, 1, 6), ...story(dialect, 3, 6)];
  return {
    content: async () => [],
    storyPassages: async (d: GameDialect) => (d === dialect ? stories : []),
    conversationTexts: async (d: GameDialect) => (d === 'kmr' && dialect === 'kmr' ? [conversation] : []),
    vocabulary: async (d: GameDialect) => (d === 'kmr' ? vocabulary : []),
    derived: async <T>(_name: string, _dialect: GameDialect, build: () => Promise<T>) => build(),
  } as unknown as TrustedSources;
}

const emptyDb = { query: async () => ({ rows: [] }) } as never;
const ask = (difficulty: 'beginner' | 'intermediate' | 'advanced', dialect: GameDialect = 'kmr', seed = 'seed-1') => ({
  userId: 'u1',
  dialect,
  difficulty,
  seed,
});

describe('a round of Dizê Bîrê', () => {
  const game = new MemoryThiefGame(fakeSources('kmr'));

  it('is five passages at the difficulty’s levels, at most two of one story, the easier first', async () => {
    const round = (await game.build(ask('beginner'), emptyDb))!;
    expect(round.items).toHaveLength(MEMORY_ROUND_PASSAGES);
    for (const item of round.items) expect(DIFFICULTY_LEVELS.beginner).toContain(item.level);
    const levels = round.items.map((i) => i.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(round.items.map((i) => i.key)).size).toBe(MEMORY_ROUND_PASSAGES);
  });

  it('takes as many words as the difficulty allows, and hands them back from tiles with decoys', async () => {
    const round = (await game.build(ask('beginner'), emptyDb))!;
    for (const item of round.items) {
      expect(item.hidden.length).toBeGreaterThanOrEqual(MEMORY_HIDDEN.beginner.min);
      expect(item.hidden.length).toBeLessThanOrEqual(MEMORY_HIDDEN.beginner.max);
      for (const h of item.hidden) expect(item.tiles).toContain(h.tile);
      expect(item.tiles!.length).toBeGreaterThan(item.hidden.length);
      expect(item.parts.filter((p) => 'gap' in p).length).toBeGreaterThanOrEqual(item.hidden.length);
    }
  });

  it('is typed at the advanced difficulty, and refused where there is too little', async () => {
    expect(await game.build(ask('advanced'), emptyDb)).toBeNull();
    const intermediate = (await game.build(ask('intermediate'), emptyDb))!;
    for (const item of intermediate.items) expect(item.level).toBe(3);
  });

  it('sends the passage while it is studied, and its gaps and tiles once begun, never both and never a key', async () => {
    const round = (await game.build(ask('beginner'), emptyDb))!;
    const study = game.view(round.items[0]!, 0, round.meta);
    expect(Object.keys(study).sort()).toEqual(['gaps', 'index', 'kind', 'level', 'parts', 'phase', 'speakers', 'studySeconds', 'text', 'tiles', 'title']);
    expect(study).toMatchObject({ phase: 'study', parts: null, tiles: null });
    expect(study.text).toBe(round.items[0]!.text);
    expect(study.studySeconds).toBeGreaterThanOrEqual(20);

    const begun = game.begin({ items: round.items, meta: round.meta }, 0)!;
    const restore = game.view(round.items[0]!, 0, begun);
    expect(restore).toMatchObject({ phase: 'restore', text: null });
    expect(restore.tiles).toEqual(round.items[0]!.tiles);
    expect(JSON.stringify(restore.parts)).not.toMatch(new RegExp(round.items[0]!.hidden.map((h) => h.term).join('|')));
    // the others are still studied, and beginning again changes nothing
    expect(game.view(round.items[1]!, 1, begun).phase).toBe('study');
    expect(game.begin({ items: round.items, meta: begun }, 0)).toBeNull();
    expect(JSON.stringify(restore)).not.toContain(round.items[0]!.key.split(':').at(-1)!);
  });

  it('never mixes the varieties: a Soranî round is Soranî through and through', async () => {
    const ckb = new MemoryThiefGame(fakeSources('ckb'));
    const round = (await ckb.build(ask('beginner', 'ckb'), emptyDb))!;
    expect(round.items).toHaveLength(MEMORY_ROUND_PASSAGES);
    for (const item of round.items) {
      expect(textScript(item.text)).toBe('arabic');
      for (const t of item.tiles!) expect(textScript(t)).toBe('arabic');
    }
  });

  it('is the same round however often it is made from one seed', async () => {
    const a = (await game.build(ask('beginner'), emptyDb))!;
    const b = (await game.build(ask('beginner'), emptyDb))!;
    expect(a.items.map((i) => [i.key, i.tiles])).toEqual(b.items.map((i) => [i.key, i.tiles]));
  });

  it('counts the passages each level can be played with', async () => {
    const levels = await game.levels('kmr');
    expect(levels[1]).toBeGreaterThanOrEqual(6);
    expect(levels[3]).toBe(6);
    expect(levels[5]).toBe(0);
  });
});

describe('a passage given back', () => {
  const game = new MemoryThiefGame(fakeSources('kmr'));
  const item = (tiles: string[] | null): MemoryItem => ({
    key: 'k',
    level: 1,
    kind: 'story',
    title: null,
    text: 'Gund li ber çiya ye. Kanî li gund e.',
    speakers: [null],
    parts: [],
    hidden: [
      { term: 'Gund', tile: 'gund', meanings: { en: 'village' }, from: 'glossary' },
      { term: 'çiya', tile: 'çiya', meanings: { en: 'mountain' }, from: 'vocabulary' },
    ],
    tiles,
    studySeconds: 20,
    why: 'glossary',
  });

  it('is right from tiles only when every gap has its word', () => {
    expect(game.grade(item(['gund', 'çiya', 'mal']), { gaps: ['gund', 'çiya'] }, 'kmr')).toBe(true);
    expect(game.grade(item(['gund', 'çiya', 'mal']), { gaps: ['çiya', 'gund'] }, 'kmr')).toBe(false);
    expect(game.grade(item(['gund', 'çiya', 'mal']), { gaps: ['gund'] }, 'kmr')).toBe(false);
  });

  it('is right typed with a mark lost, which the correction calls a typo', () => {
    expect(game.grade(item(null), { gaps: ['gund', 'ciya'] }, 'kmr')).toBe(true);
    expect(game.correction(item(null), { gaps: ['gund', 'ciya'] }, 'kmr').words.map((w) => w.verdict)).toEqual(['right', 'typo']);
  });

  it('is nudged with which gaps are wrong, never their words', () => {
    expect(game.hint(item(null), { gaps: ['gund', 'mal'] }, 'kmr')).toEqual({ wrong: [1] });
  });

  it('comes back with every word in place and what it means', () => {
    const c = game.correction(item(null), { gaps: ['gund', 'mal'] }, 'kmr');
    expect(c.words).toEqual([
      { gap: 0, term: 'Gund', meanings: { en: 'village' }, given: 'gund', verdict: 'right' },
      { gap: 1, term: 'çiya', meanings: { en: 'mountain' }, given: 'mal', verdict: 'wrong' },
    ]);
    expect(game.why(item(null))).toBe('glossary');
  });
});
