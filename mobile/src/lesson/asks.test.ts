import { describe, expect, it } from 'vitest';
import { EXERCISE_ASKS, type ExerciseAsk } from '@kurda/shared';
import { TRANSLATIONS } from '../i18n/translations';
import { aroundGap, askHeadline, freshWord, glossTokens, lineIsEnglish, optionsAreKurdish } from './asks';
import type { Exercise } from './types';

const item = (ask: ExerciseAsk | undefined, more: Partial<Exercise> = {}): Exercise => ({ id: 'x', type: 'multiple_choice', ask, ...more });

describe('the headline an ask gives an item', () => {
  // Every ask the server can send has its own words in the phone's catalogue.
  it('names every ask, in English as the table has it', () => {
    const en = TRANSLATIONS.en;
    const said = (ask: ExerciseAsk, more?: Partial<Exercise>, opts?: Parameters<typeof askHeadline>[1]) => {
      const h = askHeadline(item(ask, more), opts)!;
      return en[h.key].replace('{name}', h.params?.name ?? '{name}');
    };
    expect(said('meaning')).toBe('What does this mean?');
    expect(said('choose-kurdish')).toBe('Select the correct translation');
    expect(said('picture')).toBe('Which picture is it?');
    expect(said('reply')).toBe('What do you answer?');
    expect(said('missing')).toBe('Fill in the missing word');
    expect(said('to-english')).toBe('Translate this sentence');
    expect(said('to-kurdish', {}, { dialect: 'kurmanji' })).toBe('Write this in Kurmancî');
    expect(said('to-kurdish', {}, { dialect: 'sorani' })).toBe('Write this in Soranî');
    // A review mixes courses, so the item's own variety wins over the session's.
    expect(said('to-kurdish', { dialect: 'sorani' }, { dialect: 'kurmanji' })).toBe('Write this in Soranî');
    expect(said('hear', {}, { tiles: true })).toBe('Tap what you hear');
    expect(said('hear')).toBe('Listen and type what you hear');
    expect(said('repeat', { modelAudioUrl: 'https://media.test/a.wav', modelAudioVoice: { speaker: 'hamo' } })).toBe('Repeat after Hamo');
    for (const ask of EXERCISE_ASKS) expect(askHeadline(item(ask)), ask).not.toBeNull();
  });

  it('says “Say it aloud” for a repeat with no recording, or nobody the app can draw saying it', () => {
    expect(askHeadline(item('repeat'))?.key).toBe('lesson.speak.prompt');
    expect(askHeadline(item('repeat', { modelAudioUrl: 'https://media.test/a.wav' }))?.key).toBe('lesson.speak.prompt');
    expect(askHeadline(item('repeat', { modelAudioVoice: { speaker: 'xezo' } }))?.key).toBe('lesson.speak.prompt');
  });

  it('gives an item without an ask none, so it keeps the headline it had', () => {
    expect(askHeadline(item(undefined))).toBeNull();
  });

  it('knows which lines are English and which options are Kurdish', () => {
    expect(EXERCISE_ASKS.filter(lineIsEnglish)).toEqual(['choose-kurdish', 'to-kurdish']);
    expect(EXERCISE_ASKS.filter(optionsAreKurdish)).toEqual(['choose-kurdish', 'reply', 'missing']);
  });
});

describe('the words of an item’s line', () => {
  const tokens = [{ text: 'Ez', meanings: ['I'] }, { text: ' ' }, { text: 'Hamo' }, { text: ' ' }, { text: 'me', meanings: ['we', 'us'] }, { text: '.' }];

  it('leads a new word with the meaning the item gives it, and marks it as new', () => {
    const glossed = glossTokens('Ez Hamo me.', tokens, [{ ku: 'me', en: 'am (after a vowel)' }]);
    expect(glossed[4]).toEqual({ text: 'me', meanings: ['am (after a vowel)', 'we', 'us'], fresh: true });
    expect(glossed[0]).toEqual({ text: 'Ez', meanings: ['I'] });
  });

  it('gives a new word the course does not know its meaning, and finds words in a line that came without tokens', () => {
    expect(glossTokens('Ez Hamo me.', tokens, [{ ku: 'Hamo', en: 'Hamo (a name)' }])[2]).toEqual({ text: 'Hamo', meanings: ['Hamo (a name)'], fresh: true });
    const cut = glossTokens('Silav, Hamo!', undefined, [{ ku: 'silav', en: 'hello' }]);
    expect(cut.map((t) => t.text).join('')).toBe('Silav, Hamo!');
    expect(cut[0]).toEqual({ text: 'Silav', meanings: ['hello'], fresh: true });
  });

  it('matches a new word whatever its case and the punctuation round it', () => {
    expect(freshWord('Erê,', [{ ku: 'erê', en: 'yes' }])).toEqual({ ku: 'erê', en: 'yes' });
    expect(freshWord('na', [{ ku: 'erê', en: 'yes' }])).toBeNull();
    expect(freshWord('...', [{ ku: 'erê', en: 'yes' }])).toBeNull();
  });

  it('cuts the line at its gap, even where the gap shares a token with a full stop', () => {
    const around = aroundGap([{ text: 'Ez', meanings: ['I'] }, { text: ' ' }, { text: '___.' }])!;
    expect(around.before).toEqual([{ text: 'Ez', meanings: ['I'] }, { text: ' ' }]);
    expect(around.after).toEqual([{ text: '.' }]);
    expect(aroundGap([{ text: 'Ez baş im.' }])).toBeNull();
    expect(aroundGap([{ text: '___ û ___' }])).toBeNull();
  });
});
