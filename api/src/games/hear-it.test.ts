/**
 * Hear It, Find It's rounds without a database: recordings grouped by what
 * they say with every voice kept, the next voice each time a text comes back,
 * the look-alike words and sentences and the other meanings, the ladder a
 * round climbs, a round that never sends what a clip says, and the grading of
 * a pick and of what is typed.
 */
import { describe, expect, it } from 'vitest';
import { HEAR_OPTIONS, HEAR_REPLAYS, SOLO_ROUND_ITEMS, textScript, type GameDialect, type HearStage } from '@kurda/shared';
import {
  HearItGame,
  LOOK_ALIKE_CANDIDATES,
  editDistance,
  groupRecordings,
  lengthBuckets,
  lookAlikeSentences,
  lookAlikeWords,
  meaningChoices,
  pickVariant,
  planRound,
  recordingRef,
  shownOption,
  stagesFor,
  type HearItem,
  type HearText,
} from './hear-it.js';
import type { ConversationPair, HumanRecording, LessonSentence, TrustedSources, VocabularyWord } from './sources.js';
import type { SeenItem } from './seen.js';

// stand-in recordings and words for the rules, never shown to a learner
const rec = (key: string, text: string, speaker: HumanRecording['speaker'] = null, recordedBy: string | null = null, source: HumanRecording['source'] = 'lesson'): HumanRecording => ({
  key: `${source === 'lesson' ? 'rec:lesson:' : source === 'alphabet' ? 'rec:alphabet:' : 'rec:dict:'}${key}`,
  source,
  text,
  url: `https://media.test/${key}.wav`,
  speaker,
  recordedBy,
});

describe('what a recording’s text means', () => {
  it('is what its own items say, and nothing when they disagree or none says', () => {
    const said = (key: string, text: string, en: string | null): HumanRecording => ({ ...rec(key, text), meanings: en ? { en } : null });
    const [agreed, torn, silent] = groupRecordings(
      [said('a', 'sêv', 'apple'), said('b', 'Sêv', 'apple'), said('c', 'ne', 'not'), said('d', 'ne', 'are'), said('e', 'xwe', null)],
      'kmr',
    );
    expect(agreed!.meanings).toEqual({ en: 'apple' });
    expect(torn!.meanings).toBeNull();
    expect(silent!.meanings).toBeNull();
  });

  it('is never borrowed from a word spelled alike in the vocabulary', async () => {
    const sources = {
      recordings: async () => [
        { ...rec('x1', 'xwe'), meanings: null },
        { ...rec('x2', 'tê'), meanings: null },
        ...['bar', 'dar', 'bêr', 'ber', 'mal', 'kal'].map((w, i) => ({ ...rec(`y${i}`, w), meanings: { en: `meaning of ${w}` } })),
      ],
      lessonSentences: async () => [],
      conversations: async () => [],
      vocabulary: async () => [
        { key: 'w:xwê', ku: 'xwê', meanings: { en: 'salt' } },
        { key: 'w:te', ku: 'te', meanings: { en: 'your; you' } },
        { key: 'w:xwe', ku: 'xwe', meanings: { en: 'self' } },
      ],
      storyPassages: async () => [],
      derived: async <T>(_name: string, _dialect: GameDialect, build: () => Promise<T>) => build(),
    } as unknown as TrustedSources;
    const { texts } = await new HearItGame(sources).pool('kmr');
    expect(texts.find((t) => t.text === 'xwe')!.meanings).toBeNull();
    expect(texts.find((t) => t.text === 'tê')!.meanings).toBeNull();
    expect(texts.find((t) => t.text === 'dar')!.meanings).toEqual({ en: 'meaning of dar' });
  });
});

describe('recordings by what they say', () => {
  it('are one text with every voice it is recorded in, a voice once', () => {
    const texts = groupRecordings(
      [rec('a', 'Silav.', 'hamo', 'p1'), rec('b', 'silav', 'hevalo', 'p2'), rec('c', 'Silav', 'hamo', 'p1'), rec('d', 'Av', null, null, 'dictionary')],
      'kmr',
    );
    expect(texts).toHaveLength(2);
    expect(texts[0]!.variants.map((v) => v.speaker)).toEqual(['hamo', 'hevalo']);
    expect(texts[1]!.variants[0]!.ref).toEqual({ source: 'dictionary', id: 'd' });
  });

  it('point at their file by the table they are in and their key there', () => {
    expect(recordingRef({ key: 'rec:lesson:abc', source: 'lesson' })).toEqual({ source: 'lesson', id: 'abc' });
    expect(recordingRef({ key: 'rec:alphabet:kmr:word:c', source: 'alphabet' })).toEqual({ source: 'alphabet', id: 'kmr:word:c' });
  });

  it('are played in the next voice each time the text comes back', () => {
    const [text] = groupRecordings([rec('a', 'Silav', 'hamo', 'p1'), rec('b', 'Silav', 'hevalo', 'p2'), rec('c', 'Silav', 'xezo', 'p3')], 'kmr');
    const met = (attempts?: number): Pick<SeenItem, 'attempts'> | undefined => (attempts === undefined ? undefined : { attempts });
    expect(pickVariant(text!.variants, met()).variant.speaker).toBe('hamo');
    expect(pickVariant(text!.variants, met()).newVoice).toBe(false);
    expect(pickVariant(text!.variants, met(1))).toMatchObject({ variant: { speaker: 'hevalo' }, newVoice: true });
    expect(pickVariant(text!.variants, met(2)).variant.speaker).toBe('xezo');
    expect(pickVariant(text!.variants, met(3)).variant.speaker).toBe('hamo');
    const [alone] = groupRecordings([rec('a', 'Av', 'hamo', 'p1')], 'kmr');
    expect(pickVariant(alone!.variants, met(4)).newVoice).toBe(false);
  });
});

describe('the look-alikes', () => {
  const letters = (k: string) => [...k].length;
  const words = lengthBuckets(new Map(['bar', 'bêr', 'dar', 'ber', 'kevir', 'mal', 'baran', 'bajar'].map((w) => [w, w])), letters);

  it('measure how far two spellings are', () => {
    expect(editDistance([...'bar'], [...'dar'])).toBe(1);
    expect(editDistance([...'bar'], [...'baran'])).toBe(2);
    expect(editDistance(['ez', 'diçim'], ['ez', 'diçî'])).toBe(1);
  });

  it('are the approved words closest in spelling, never the word itself', () => {
    const alike = lookAlikeWords('bar', words, 3, 'seed', 'kmr');
    expect(alike).toHaveLength(3);
    expect(alike).not.toContain('bar');
    for (const w of alike) expect(['bêr', 'dar', 'ber']).toContain(w);
    expect(lookAlikeWords('bar', words, 3, 'seed', 'kmr')).toEqual(alike);
  });

  it('look among a bounded few of the nearest lengths, however large the pool', () => {
    // a pool of tens of thousands of words: the closest are still found, from the target's own length outwards
    const big = new Map<string, string>();
    for (let i = 0; i < 30_000; i++) big.set(`w${i.toString(36).padStart(6, 'a')}xx`, `w${i}`);
    for (const w of ['bêr', 'dar', 'ber']) big.set(w, w);
    const buckets = lengthBuckets(big, letters);
    const started = performance.now();
    const alike = lookAlikeWords('bar', buckets, 3, 'seed', 'kmr');
    expect(performance.now() - started).toBeLessThan(200);
    expect(alike.sort()).toEqual(['ber', 'bêr', 'dar']);
    expect(LOOK_ALIKE_CANDIDATES).toBeLessThan(big.size);
  });

  it('are the approved sentences closest word by word', () => {
    const sentences = lengthBuckets(
      new Map(['Ez diçim malê.', 'Ez diçim bajêr.', 'Tu diçî malê.', 'Ew pirtûkê dixwîne û çayê vedixwe.', 'Ez naçim malê.'].map((s) => [s.toLowerCase().replace('.', ''), s])),
      (k) => k.split(' ').length,
    );
    const alike = lookAlikeSentences('Ez diçim malê', sentences, 3, 'seed', 'kmr');
    expect(alike).toEqual(expect.arrayContaining(['Ez diçim bajêr.', 'Tu diçî malê.', 'Ez naçim malê.']));
    expect(alike).not.toContain('Ez diçim malê.');
  });

  it('are other phrases’ meanings, each once, none the same as the right one', () => {
    const meanings = [{ en: 'Good morning.' }, { en: 'good morning' }, { en: 'Good night.' }, { en: 'See you soon.' }, { en: 'See you soon' }, { en: 'Thank you very much.' }].map(
      (m, i) => ({ key: `k${i}`, meanings: m }),
    );
    const choices = meaningChoices({ en: 'Good morning.' }, meanings, 3, 'seed');
    expect(choices.map((m) => m.en!.toLowerCase().replace('.', ''))).toEqual(expect.arrayContaining(['good night', 'see you soon', 'thank you very much']));
    expect(choices).toHaveLength(3);
  });

  it('are shown alike: no closing punctuation, words in lower case, sentences with a capital', () => {
    expect(shownOption('Sêv.', 'word', 'kmr')).toBe('sêv');
    expect(shownOption('ez diçim malê?', 'sentence', 'kmr')).toBe('Ez diçim malê');
    expect(shownOption('ئەمە ماڵە؟', 'sentence', 'ckb')).toBe('ئەمە ماڵە');
  });
});

describe('the rungs a text stands on', () => {
  const pool = { words: new Map(Array.from({ length: 6 }, (_, i) => [`w${i}`, `w${i}`])), sentences: new Map(), meanings: new Map(Array.from({ length: 6 }, (_, i) => [`m${i}`, { en: `${i}` }])) };

  it('follow its length and what it means', () => {
    expect(stagesFor({ words: 1, meanings: null }, pool)).toEqual(['word', 'type']);
    expect(stagesFor({ words: 3, meanings: { en: 'Good morning' } }, pool)).toEqual(['phrase', 'type']);
    expect(stagesFor({ words: 3, meanings: null }, pool)).toEqual(['type']);
    expect(stagesFor({ words: 10, meanings: null }, pool)).toEqual([]);
  });
});

/** A pool of `n` texts, each standing on the rungs given. */
function texts(n: number, stages: HearStage[]): Array<HearText & { stages: HearStage[] }> {
  return Array.from({ length: n }, (_, i) => ({ key: `t${i}`, text: `t${i}`, words: 1, meanings: null, variants: [], stages }));
}

describe('a round’s plan', () => {
  it('is eight, each rung its share, climbing', () => {
    const plan = planRound('beginner', texts(30, ['word', 'phrase', 'sentence', 'type']), new Map(), 'seed')!;
    expect(plan).toHaveLength(SOLO_ROUND_ITEMS);
    expect(plan.map((p) => p.stage)).toEqual(['word', 'word', 'word', 'word', 'phrase', 'phrase', 'sentence', 'sentence']);
    expect(new Set(plan.map((p) => p.text.key)).size).toBe(SOLO_ROUND_ITEMS);
  });

  it('types only at the advanced difficulty', () => {
    expect(planRound('advanced', texts(30, ['word', 'phrase', 'sentence', 'type']), new Map(), 'seed')!.filter((p) => p.stage === 'type')).toHaveLength(4);
    expect(planRound('intermediate', texts(30, ['word', 'phrase', 'sentence', 'type']), new Map(), 'seed')!.some((p) => p.stage === 'type')).toBe(false);
  });

  it('makes up a rung that is short from the others', () => {
    const plan = planRound('beginner', texts(12, ['word']), new Map(), 'seed')!;
    expect(plan.map((p) => p.stage)).toEqual(Array(8).fill('word'));
  });

  it('takes texts never met first', () => {
    const seen = new Map(Array.from({ length: 20 }, (_, i) => [`t${i}`, { lastSeenAt: new Date(), recent: true, attempts: 1 }]));
    const plan = planRound('beginner', texts(30, ['word']), seen, 'seed')!;
    for (const p of plan) expect(Number(p.text.key.slice(1))).toBeGreaterThanOrEqual(20);
  });

  it('is nothing when the pool cannot fill a round', () => {
    expect(planRound('beginner', texts(7, ['word']), new Map(), 'seed')).toBeNull();
    expect(planRound('beginner', texts(30, ['type']), new Map(), 'seed')).toBeNull();
  });
});

// a variety's approved words and sentences, and recordings of some of them
const KMR_WORDS = ['bar', 'dar', 'bêr', 'ber', 'mal', 'kal', 'gund', 'gul', 'av', 'av', 'sêv', 'şêr', 'kêr', 'dest', 'dost', 'bajar', 'baran', 'çiya'];
const KMR_SENTENCES = ['Ez diçim malê.', 'Ez diçim bajêr.', 'Tu diçî malê.', 'Ez naçim malê.', 'Ew diçe gund.', 'Em diçin gund.', 'Ez av vedixwim.', 'Tu av vedixwî.'];
const MEANING: Record<string, string> = { 'Ez diçim malê.': 'I am going home.', 'Ez diçim bajêr.': 'I am going to the city.', 'Tu diçî malê.': 'You are going home.' };

function fakeSources(dialect: GameDialect): TrustedSources {
  const recordings =
    dialect === 'kmr'
      ? [
          ...KMR_WORDS.map((w, i) => rec(`w${i}`, w, i % 2 ? 'hamo' : 'hevalo', `p${i % 3}`)),
          ...KMR_SENTENCES.map((s, i) => rec(`s${i}`, s, 'xezo', 'p9')),
          rec('s0b', 'Ez diçim malê.', 'hamo', 'p8'),
        ]
      : ['ماڵ', 'باڵ', 'کاڵ', 'گوند', 'دار', 'بار', 'ئاو', 'نان', 'دەست', 'دۆست'].map((w, i) => rec(`c${i}`, w));
  const sentences: LessonSentence[] = (dialect === 'kmr' ? KMR_SENTENCES : []).map((ku) => ({
    key: ku,
    ku,
    meaning: { en: MEANING[ku] ?? `meaning of ${ku}` },
    orders: [ku],
    accepted: [ku],
    origin: 'lesson:x',
  }));
  const vocabulary: VocabularyWord[] = dialect === 'kmr' ? KMR_WORDS.map((ku) => ({ key: ku, ku, meanings: { en: `meaning of ${ku}` } })) : [];
  return {
    recordings: async () => recordings,
    lessonSentences: async () => sentences,
    conversations: async (): Promise<ConversationPair[]> => [],
    vocabulary: async () => vocabulary,
    storyPassages: async () => [],
    derived: async <T>(_name: string, _dialect: GameDialect, build: () => Promise<T>) => build(),
  } as unknown as TrustedSources;
}

const emptyDb = { query: async () => ({ rows: [] }) } as never;
const ask = (difficulty: 'beginner' | 'intermediate' | 'advanced', dialect: GameDialect = 'kmr', seed = 'seed-1') => ({ userId: 'u1', dialect, difficulty, seed });

describe('a round of Hear It, Find It', () => {
  const game = new HearItGame(fakeSources('kmr'));

  it('sends each clip as a handle of its own, never what it says', async () => {
    const round = (await game.build(ask('beginner'), emptyDb))!;
    expect(round.items).toHaveLength(SOLO_ROUND_ITEMS);
    const clips = new Set(round.items.map((i) => i.clip));
    expect(clips.size).toBe(SOLO_ROUND_ITEMS);
    for (const item of round.items) {
      const view = game.view(item, 0);
      expect(Object.keys(view).sort()).toEqual(['clip', 'index', 'level', 'meanings', 'newVoice', 'options', 'replays', 'speaker', 'stage']);
      const sent = JSON.stringify(view);
      expect(sent).not.toContain('media.test');
      expect(sent).not.toContain(item.recording.id);
      expect(view.clip).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(view.replays).toBe(HEAR_REPLAYS.beginner);
    }
  });

  it('offers the right written form among look-alikes, each once', async () => {
    const round = (await game.build(ask('beginner'), emptyDb))!;
    const words = round.items.filter((i) => i.stage === 'word');
    expect(words.length).toBeGreaterThan(0);
    for (const item of words) {
      expect(item.options).toHaveLength(HEAR_OPTIONS);
      expect(new Set(item.options).size).toBe(HEAR_OPTIONS);
      expect(item.options![item.answer!]).toBe(shownOption(item.text, 'word', 'kmr'));
    }
    // a round climbs: the words first
    expect(round.items[0]!.stage).toBe('word');
  });

  it('asks what a phrase means from approved meanings', async () => {
    const round = (await game.build(ask('intermediate'), emptyDb))!;
    for (const item of round.items.filter((i) => i.stage === 'phrase')) {
      expect(item.meaningOptions![item.answer!]).toEqual(item.meanings);
      expect(item.options).toBeNull();
    }
  });

  it('never mixes the varieties: a Soranî round plays and shows Soranî only', async () => {
    const ckb = new HearItGame(fakeSources('ckb'));
    const round = (await ckb.build(ask('beginner', 'ckb'), emptyDb))!;
    for (const item of round.items) {
      expect(textScript(item.text)).toBe('arabic');
      for (const o of item.options ?? []) expect(textScript(o)).toBe('arabic');
    }
  });

  it('counts which difficulties can be played', async () => {
    const counted = await game.availability('kmr');
    expect(counted.levels[1]).toBeGreaterThanOrEqual(20);
    expect(counted.difficulties).toContain('beginner');
    const few = await new HearItGame(fakeSources('ckb')).availability('ckb');
    expect(few.difficulties).toEqual([]);
  });
});

describe('an answer heard', () => {
  const game = new HearItGame(fakeSources('kmr'));
  const item = (over: Partial<HearItem>): HearItem => ({
    key: 'k',
    level: 1,
    stage: 'word',
    text: 'Sêv',
    meanings: { en: 'apple' },
    clip: 'c'.repeat(22),
    recording: { source: 'lesson', id: 'x' },
    speaker: 'hamo',
    newVoice: false,
    options: ['şêr', 'sêv', 'kêr', 'sev'],
    meaningOptions: null,
    answer: 1,
    replays: 3,
    ...over,
  });

  it('is right picked, and struck out when picked wrong', () => {
    expect(game.grade(item({}), { choice: 1 }, 'kmr')).toBe(true);
    expect(game.grade(item({}), { choice: 3 }, 'kmr')).toBe(false);
    expect(game.hint(item({}), { choice: 3 }, 'kmr')).toEqual({ struck: 3, right: null });
    // a typed answer is no answer on a picking rung
    expect(game.grade(item({}), { text: 'sêv' }, 'kmr')).toBe(false);
  });

  it('is right typed with a mark lost, called a typo, and nudged word by word when wrong', () => {
    const typed = item({ stage: 'type', text: 'Ez diçim malê.', options: null, answer: null });
    expect(game.grade(typed, { text: 'ez dicim male' }, 'kmr')).toBe(true);
    expect(game.correction(typed, { text: 'ez dicim male' }, 'kmr').verdict).toBe('typo');
    expect(game.grade(typed, { text: 'ez diçim bajêr' }, 'kmr')).toBe(false);
    expect(game.hint(typed, { text: 'ez diçim bajêr' }, 'kmr')).toEqual({ struck: null, right: [true, true, false] });
  });

  it('comes back with what was said, what it means and who said it', () => {
    expect(game.correction(item({}), { choice: 3 }, 'kmr')).toEqual({ text: 'Sêv', meanings: { en: 'apple' }, verdict: 'wrong', choice: 1, speaker: 'hamo' });
    expect(game.why(item({ stage: 'sentence' }))).toBe('sentence');
  });
});
