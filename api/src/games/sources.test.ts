/**
 * Reading approved lessons for the learning games, without a database: which
 * English a translation asks for, which sentences an exercise teaches and in
 * which orders, a conversation as line pairs and whole, the alphabet's letter
 * sounds told from its words, and the rule that a sentence in
 * the other variety's script is left out.
 */
import { describe, expect, it } from 'vitest';
import { LEARN_GAME_XP_SOURCES } from '@kurda/shared';
import { GAME_XP_SOURCES, isGameSource, isLearningSource } from '../xp/rules.js';
import { conversationOf, isAlphabetSoundKey, meaningOfPrompt, pairsOf, sentenceKey, sentencesOf, wordsOfExercise } from './sources.js';

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

describe('the learning games’ XP', () => {
  it('is all game XP, under the league’s daily cap, and none of it a learning source', () => {
    for (const source of LEARN_GAME_XP_SOURCES) {
      expect(GAME_XP_SOURCES).toContain(source);
      expect(isGameSource(source)).toBe(true);
      expect(isLearningSource(source)).toBe(false);
    }
  });
});
