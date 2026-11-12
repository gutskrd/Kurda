/**
 * Reading approved lessons for the learning games, without a database: which
 * English a translation asks for, which sentences an exercise teaches and in
 * which orders, a conversation as line pairs, whole and line by line with
 * each line's level, the alphabet's letter sounds told from its words, and
 * the rule that a sentence in the other variety's script is left out. Then
 * which recordings a game may
 * play and what each one's own item says it means, what a lesson attests its
 * words mean (exactly as written, never a look-alike), and the pools' own
 * memo, which follows the cache's generation.
 */
import { describe, expect, it } from 'vitest';
import { LEARN_GAME_XP_SOURCES, conversationLineKey, lessonAudioKey } from '@kurda/shared';
import { GAME_XP_SOURCES, isGameSource, isLearningSource } from '../xp/rules.js';
import {
  DERIVED_TTL_MS,
  TrustedSources,
  bustGamePools,
  conversationLinesOf,
  conversationOf,
  isAlphabetSoundKey,
  meaningOfPrompt,
  pairsOf,
  lessonWordMeanings,
  mergeAttested,
  publishedRecordingTexts,
  sentenceKey,
  taughtIn,
  sentencesOf,
  unitLevel,
  wordsOfExercise,
} from './sources.js';

describe('meaningOfPrompt', () => {
  it('takes the quoted English out of a prompt that sets a scene', () => {
    expect(meaningOfPrompt('Your turn to be the guide. Say: “This is a wall.”')).toBe('This is a wall.');
    expect(meaningOfPrompt('Tell Xezal what Hamo just said about the roof: “The roof is old.”')).toBe('The roof is old.');
  });

  it('takes the text after a label, or a short prompt as it is', () => {
    expect(meaningOfPrompt('In Kurdish: Good morning')).toBe('Good morning');
    expect(meaningOfPrompt('Good morning')).toBe('Good morning');
  });

  it('gives nothing for a long scene with no meaning to lift out of it', () => {
    expect(meaningOfPrompt('Hevalo is at the door of the house and wants to say hello to everyone inside')).toBeNull();
  });
});

describe('sentencesOf', () => {
  const translate = (payload: unknown) => ({ id: '00000000-0000-4000-8000-000000000001', type: 'translate', payload });

  it('reads a translation into Kurdish with its English and every order with the same words', () => {
    const [s, ...rest] = sentencesOf(
      translate({ prompt: 'In Kurdish: “This is our house.”', accepted: ['Ev xaniyê me ye.', 'Ev xaniyê me ye', 'Ev mala me ye.', 'Xaniyê me ev e'] }),
      'kmr',
    );
    expect(rest).toEqual([]);
    expect(s!.ku).toBe('Ev xaniyê me ye.');
    expect(s!.meaning).toEqual({ en: 'This is our house.' });
    // the other wording is accepted when graded, but is not another order of these words
    expect(s!.orders).toEqual(['Ev xaniyê me ye.']);
    expect(s!.accepted).toContain('Ev mala me ye.');
    expect(s!.key).toBe(sentenceKey('kmr', 'ev xaniyê me ye'));
  });

  it('reads a translation from Kurdish by the Kurdish it says', () => {
    const [s] = sentencesOf(translate({ say: 'Pencere mezin e.', prompt: 'What does Hamo say? “Pencere mezin e.”', accepted: ['The window is big'] }), 'kmr');
    expect(s!.ku).toBe('Pencere mezin e.');
    expect(s!.meaning.en).toBe('The window is big');
  });

  it('reads every conversation line that has its English, and keeps out the short ones', () => {
    const rows = sentencesOf(
      {
        id: '00000000-0000-4000-8000-000000000002',
        type: 'conversation',
        payload: {
          id: 'conv123abc',
          speakers: [{ character: 'hamo' }, { character: 'xezo' }],
          lines: [
            { speaker: 0, text: 'Silav!', en: 'Hello!' },
            { speaker: 1, text: 'Tu çawa yî?', en: 'How are you?' },
            { speaker: 0, text: 'Ez baş im, spas.', en: 'I am well, thanks.' },
          ],
          prompt: 'How is Hamo?',
          options: ['Well', 'Ill'],
          correctIndex: 0,
        },
      },
      'kmr',
    );
    expect(rows.map((r) => r.ku)).toEqual(['Tu çawa yî?', 'Ez baş im, spas.']);
    expect(rows[0]!.origin).toBe('conversation:00000000-0000-4000-8000-000000000002:1');
  });

  it('never lets Kurmancî into a Soranî pool, or the other way round', () => {
    const kmr = translate({ prompt: 'In Kurdish: “I am going home.”', accepted: ['Ez diçim malê'] });
    expect(sentencesOf(kmr, 'kmr')).toHaveLength(1);
    expect(sentencesOf(kmr, 'ckb')).toHaveLength(0);
    const ckb = translate({ prompt: 'In Kurdish: “I am going home.”', accepted: ['من دەچمە ماڵەوە'] });
    expect(sentencesOf(ckb, 'ckb')).toHaveLength(1);
    expect(sentencesOf(ckb, 'kmr')).toHaveLength(0);
  });

  it('ignores an exercise whose payload is not valid', () => {
    expect(sentencesOf(translate({ prompt: 'x' }), 'kmr')).toEqual([]);
  });
});

describe('pairsOf and wordsOfExercise', () => {
  it('pairs each line with the next one said by someone else', () => {
    const pairs = pairsOf(
      {
        id: '00000000-0000-4000-8000-000000000003',
        type: 'conversation',
        payload: {
          id: 'conv456def',
          speakers: [{ character: 'hamo' }, { character: 'xezo' }],
          lines: [
            { speaker: 0, text: 'Silav!', en: 'Hello!' },
            { speaker: 1, text: 'Silav, Hamo.', en: 'Hello, Hamo.' },
            { speaker: 1, text: 'Tu çawa yî?', en: 'How are you?' },
            { speaker: 0, text: 'Baş im.', en: 'Well.' },
          ],
          prompt: 'Who says hello first?',
          options: ['Hamo', 'Xezo'],
          correctIndex: 0,
        },
      },
      'kmr',
    );
    expect(pairs.map((p) => [p.line.ku, p.reply.ku])).toEqual([
      ['Silav!', 'Silav, Hamo.'],
      ['Tu çawa yî?', 'Baş im.'],
    ]);
    expect(pairs[0]!.line.speaker).toBe('hamo');
  });

  it('reads a whole conversation, each line with who says it and what it means', () => {
    const row = (lines: Array<{ speaker: number; text: string; en?: string }>) => ({
      id: '00000000-0000-4000-8000-000000000004',
      type: 'conversation',
      payload: { id: 'conv789ghi', title: 'Silav', speakers: [{ character: 'hamo' }, { character: 'xezo' }], lines, prompt: 'Who?', options: ['Hamo', 'Xezo'], correctIndex: 0 },
    });
    const text = conversationOf(
      row([
        { speaker: 0, text: 'Silav!', en: 'Hello!' },
        { speaker: 1, text: 'Tu çawa yî?' },
        { speaker: 0, text: 'Baş im.', en: 'Well.' },
      ]),
      'kmr',
    )!;
    expect(text.title).toBe('Silav');
    expect(text.lines).toEqual([
      { ku: 'Silav!', en: 'Hello!', speaker: 'hamo' },
      { ku: 'Tu çawa yî?', en: null, speaker: 'xezo' },
      { ku: 'Baş im.', en: 'Well.', speaker: 'hamo' },
    ]);
    // a line in the other variety's script keeps the whole conversation out
    expect(conversationOf(row([{ speaker: 0, text: 'Silav!' }, { speaker: 1, text: 'سڵاو' }]), 'kmr')).toBeNull();
    expect(conversationOf({ ...row([]), type: 'translate' }, 'kmr')).toBeNull();
  });

  it('tells a letter’s sound from a word among the alphabet’s recordings', () => {
    expect(isAlphabetSoundKey('kmr:sound:c')).toBe(true);
    expect(isAlphabetSoundKey('ckb:sound:ڵ')).toBe(true);
    expect(isAlphabetSoundKey('kmr:word:c')).toBe(false);
    expect(isAlphabetSoundKey('pair:bar')).toBe(false);
  });

  it('reads the single words a match-pairs item teaches', () => {
    const words = wordsOfExercise({ type: 'match_pairs', payload: { pairs: [{ left: 'sêv', right: 'apple' }, { left: 'nan', right: 'bread' }] } }, 'kmr');
    expect(words.map((w) => [w.ku, w.meanings.en])).toEqual([
      ['sêv', 'apple'],
      ['nan', 'bread'],
    ]);
  });
});

describe('a conversation line by line', () => {
  it('gives every line its place, its part, its English and its recording’s key', () => {
    const payload = {
      id: 'roadu02s3l3a',
      title: 'Tu çend salî yî?',
      speakers: [{ character: 'xezo' }, { character: 'hamo' }],
      lines: [
        { speaker: 0, text: 'Tu çend salî yî?', en: 'How old are you?' },
        { speaker: 1, text: 'Ez heft salî me.', en: 'I am seven.' },
      ],
      prompt: 'How old?',
      options: ['Seven', 'Eight'],
      correctIndex: 0,
    };
    const lines = conversationLinesOf({ id: 'ex1', type: 'conversation', payload }, 'kmr', 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ exerciseId: 'ex1', index: 1, part: 1, speaker: 'hamo', en: 'I am seven.', level: 2, origin: 'conversation:ex1:1' });
    expect(lines[1]!.recording).toBe(conversationLineKey('roadu02s3l3a', 1, 'Ez heft salî me.'));
    expect(conversationLinesOf({ id: 'ex1', type: 'conversation', payload }, 'ckb', 2)).toEqual([]);
  });

  it('takes a line’s level from its unit’s place in its course', () => {
    expect([1, 3, 4, 6, 9, 11, 12].map((u) => unitLevel(u, 12))).toEqual([1, 1, 2, 3, 4, 5, 5]);
    expect(unitLevel(1, 1)).toBe(1);
    expect(unitLevel(0, 0)).toBe(1);
  });
});

describe('the learning games’ XP', () => {
  it('is all game XP, under the league’s daily cap, and none of it a learning source', () => {
    for (const source of LEARN_GAME_XP_SOURCES) {
      expect(GAME_XP_SOURCES).toContain(source);
      expect(isGameSource(source)).toBe(true);
      expect(isLearningSource(source)).toBe(false);
    }
  });
});

describe('the recordings a game may play', () => {
  const lessons = [
    { type: 'translate', payload: { prompt: 'In Kurdish: “Good morning.”', accepted: ['Rojbaş!'] } },
    { type: 'match_pairs', payload: { pairs: [{ left: 'sêv', right: 'apple' }] } },
    {
      type: 'conversation',
      payload: {
        id: 'conv456def',
        speakers: [{ character: 'hamo' }, { character: 'xezo' }],
        lines: [
          { speaker: 0, text: 'Silav!', en: 'Hello!' },
          { speaker: 1, text: 'Tu çawa yî?', en: 'How are you?' },
        ],
        prompt: 'Who says hello first?',
        options: ['Hamo', 'Xezo'],
        correctIndex: 0,
      },
    },
  ];
  const published = publishedRecordingTexts(lessons, ['Pisîk li malê ye. Ew radize.']);

  it('are of texts published lessons and approved stories say, keyed as the studio files them, with what their own item says they mean', () => {
    expect(published.get(lessonAudioKey('Rojbaş!'))).toEqual({ text: 'Rojbaş!', meanings: { en: 'Good morning.' } });
    expect(published.get(lessonAudioKey('sêv'))).toEqual({ text: 'sêv', meanings: { en: 'apple' } });
    expect(published.get(conversationLineKey('conv456def', 1, 'Tu çawa yî?'))).toEqual({ text: 'Tu çawa yî?', meanings: { en: 'How are you?' } });
    // a story's sentence has no English of its own
    expect(published.get(lessonAudioKey('Ew radize.'))).toEqual({ text: 'Ew radize.', meanings: null });
  });

  it('give a text two items mean differently no meaning at all', () => {
    const torn = publishedRecordingTexts(
      [
        { type: 'match_pairs', payload: { pairs: [{ left: 'ne', right: 'not' }, { left: 'sêv', right: 'apple' }] } },
        { type: 'match_pairs', payload: { pairs: [{ left: 'ne', right: 'are' }, { left: 'nan', right: 'bread' }] } },
      ],
      [],
    );
    expect(torn.get(lessonAudioKey('ne'))).toEqual({ text: 'ne', meanings: null });
    expect(torn.get(lessonAudioKey('nan'))!.meanings).toEqual({ en: 'bread' });
  });

  it('are never of a draft’s text, a corrected text’s old spelling, or a conversation line filed as plain text', () => {
    expect(published.has(lessonAudioKey('Şev baş!'))).toBe(false);
    expect(published.has(lessonAudioKey('Rojbash!'))).toBe(false);
    expect(published.has(lessonAudioKey('Tu çawa yî?'))).toBe(false);
  });
});

describe('what a lesson attests its words mean', () => {
  // two lessons: one teaches the sentence, the other words that only look like some of its words
  const rows = [
    { lesson_id: 'L1', type: 'translate', payload: { prompt: 'In Kurdish: “Baran comes, they are decorated.”', accepted: ['Baran tê, ew xemlandî ne.'] } },
    { lesson_id: 'L1', type: 'match_pairs', payload: { pairs: [{ left: 'xemlandî', right: 'decorated' }, { left: 'tê', right: 'comes' }] } },
    {
      lesson_id: 'L2',
      type: 'match_pairs',
      payload: {
        pairs: [
          { left: 'te', right: 'your; you' },
          { left: 'xwê', right: 'salt' },
          { left: 'dê', right: 'mother' },
          { left: 'baran', right: 'rain' },
          { left: 'ne', right: 'not' },
        ],
      },
    },
  ];
  const taught = lessonWordMeanings(rows, 'kmr');

  it('is by lesson, each word exactly as the lesson writes it', () => {
    expect(taught.get('L1')).toEqual(new Map([['xemlandî', { en: 'decorated' }], ['tê', { en: 'comes' }]]));
    expect(taught.get('L2')!.get('xwê')).toEqual({ en: 'salt' });
  });

  it('gives a sentence only its own lesson’s meanings, for its words exactly as written', () => {
    const glosses = taughtIn('Baran tê, ew xemlandî ne.', taught.get('L1'));
    expect(glosses).toEqual([
      { word: 'tê', meanings: { en: 'comes' } },
      { word: 'xemlandî', meanings: { en: 'decorated' } },
    ]);
    // the other lesson's look-alikes mean nothing here: te is not tê, xwê is not xwe, dê is not de, baran is not Baran, its ne is not this ne
    expect(taughtIn('Baran tê, ew xwe xemlandî dikin û de.', taught.get('L2'))).toEqual([]);
    expect(taughtIn('Baran tê.', undefined)).toEqual([]);
  });

  it('drops a word one lesson, or two lessons of one sentence, give different meanings', () => {
    const twice = lessonWordMeanings([{ lesson_id: 'L3', type: 'match_pairs', payload: { pairs: [{ left: 'ne', right: 'not' }, { left: 'ne', right: 'are' }] } }], 'kmr');
    expect(twice.get('L3')!.has('ne')).toBe(false);
    expect(mergeAttested([{ word: 'ne', meanings: { en: 'not' } }], [{ word: 'ne', meanings: { en: 'are' } }, { word: 'tê', meanings: { en: 'comes' } }])).toEqual([
      { word: 'tê', meanings: { en: 'comes' } },
    ]);
  });
});

describe('what a game works out from the pools', () => {
  const memoryCache = () => {
    const kv = new Map<string, unknown>();
    return {
      get: async <T>(domain: string, id: string) => (kv.get(`${domain}:${id}`) as T | undefined) ?? null,
      set: async (domain: string, id: string, value: unknown) => {
        kv.set(`${domain}:${id}`, value);
      },
    };
  };

  it('is built once while the pools stand, again once a publish bumps them or it grows old', async () => {
    const cache = memoryCache();
    let now = 1_000;
    const sources = new TrustedSources({ query: async () => ({ rows: [] }) } as never, cache as never, () => now);
    let builds = 0;
    const build = async () => ++builds;
    expect(await sources.derived('hear-it:pool', 'kmr', build)).toBe(1);
    expect(await sources.derived('hear-it:pool', 'kmr', build)).toBe(1);
    // another variety is its own
    expect(await sources.derived('hear-it:pool', 'ckb', build)).toBe(2);
    await bustGamePools(cache as never);
    expect(await sources.derived('hear-it:pool', 'kmr', build)).toBe(3);
    now += DERIVED_TTL_MS;
    expect(await sources.derived('hear-it:pool', 'kmr', build)).toBe(4);
  });

  it('is built every time where there is no cache to follow', async () => {
    const sources = new TrustedSources({ query: async () => ({ rows: [] }) } as never, null);
    let builds = 0;
    await sources.derived('x', 'kmr', async () => ++builds);
    await sources.derived('x', 'kmr', async () => ++builds);
    expect(builds).toBe(2);
  });
});
