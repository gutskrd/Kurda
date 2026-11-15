import { describe, expect, it } from 'vitest';
import type { DeliveredExercise } from '@kurda/shared';
import { en } from '../i18n/en';
import { askHeadline, lineIsEnglish, lineTokens } from './asks';

/*
 * What an item that says what it asks is shown with: its headline, and its
 * line as the bubble lays it out — the server's words when they add up to
 * the line, the new words marked with their own meaning first, and the gap.
 */

const t = (key: keyof typeof en, vars: Record<string, string | number> = {}): string =>
  en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
const item = (over: Partial<DeliveredExercise>): DeliveredExercise => ({ id: 'x', type: 'multiple_choice', ...over });

describe('the headline', () => {
  it('names each ask, and nothing for an item without one', () => {
    const how = { tiles: true, dialect: 'kurmanji' };
    expect(askHeadline(item({ ask: 'meaning' }), t, how)).toBe('What does this mean?');
    expect(askHeadline(item({ ask: 'choose-kurdish' }), t, how)).toBe('Select the correct translation');
    expect(askHeadline(item({ ask: 'picture' }), t, how)).toBe('Which picture is it?');
    expect(askHeadline(item({ ask: 'reply' }), t, how)).toBe('What do you answer?');
    expect(askHeadline(item({ ask: 'missing' }), t, how)).toBe('Fill in the missing word');
    expect(askHeadline(item({ type: 'translate', ask: 'to-english' }), t, how)).toBe('Translate this sentence');
    expect(askHeadline(item({ type: 'translate', ask: 'to-kurdish' }), t, how)).toBe('Write this in Kurmancî');
    expect(askHeadline(item({ type: 'listening', ask: 'hear' }), t, how)).toBe('Tap what you hear');
    expect(askHeadline(item({ type: 'listening', ask: 'hear' }), t, { ...how, tiles: false })).toBe('Type what you hear');
    expect(askHeadline(item({}), t, how)).toBeNull();
  });

  it('asks a Soranî course for Kurdish rather than for Kurmancî', () => {
    expect(askHeadline(item({ type: 'translate', ask: 'to-kurdish' }), t, { tiles: true, dialect: 'sorani' })).toBe('Write this in Kurdish');
  });

  it('names who to repeat after from the voice of the model, and says “Say it aloud” with nobody', () => {
    const how = { tiles: false, dialect: 'kurmanji' };
    const repeat = item({ type: 'speaking', ask: 'repeat', modelAudioUrl: 'm.mp3', modelAudioVoice: { speaker: 'xezo' } });
    expect(askHeadline(repeat, t, how)).toBe('Repeat after Xezo');
    expect(askHeadline(item({ type: 'speaking', ask: 'repeat', modelAudioUrl: 'm.mp3' }), t, how)).toBe('Say it aloud');
  });

  it('knows the two asks whose line is English', () => {
    expect(lineIsEnglish(item({ ask: 'choose-kurdish' }))).toBe(true);
    expect(lineIsEnglish(item({ type: 'translate', ask: 'to-kurdish' }))).toBe(true);
    expect(lineIsEnglish(item({ ask: 'meaning' }))).toBe(false);
  });
});

describe('the line', () => {
  it('keeps the server’s words, and puts a new word’s own meaning first, once', () => {
    const tokens = [{ text: 'Ez', meanings: ['I'] }, { text: ' ' }, { text: 'baş', meanings: ['good', 'well', 'fine'] }, { text: ' im.' }];
    expect(lineTokens('Ez baş im.', tokens, [{ ku: 'baş', en: 'well' }])).toEqual([
      { text: 'Ez', meanings: ['I'] },
      { text: ' ' },
      { text: 'baş', meanings: ['well', 'good', 'fine'], isNew: true },
      { text: ' im.' },
    ]);
  });

  it('finds the new words in a line the server sent no words for, whatever their case', () => {
    expect(lineTokens('Silav!', undefined, [{ ku: 'silav', en: 'hello' }])).toEqual([{ text: 'Silav', meanings: ['hello'], isNew: true }, { text: '!' }]);
  });

  it('does not trust words that do not add up to the line', () => {
    expect(lineTokens('Roj baş', [{ text: 'Roj', meanings: ['day'] }], undefined)).toEqual([{ text: 'Roj' }, { text: ' ' }, { text: 'baş' }]);
  });

  it('gives a missing word’s gap a place of its own', () => {
    const tokens = [{ text: 'Ez', meanings: ['I'] }, { text: ' ___ ' }, { text: 'im' }, { text: '.' }];
    expect(lineTokens('Ez ___ im.', tokens, undefined)).toEqual([
      { text: 'Ez', meanings: ['I'] },
      { text: ' ' },
      { text: '___', gap: true },
      { text: ' ' },
      { text: 'im' },
      { text: '.' },
    ]);
    expect(lineTokens('Ez Hamo ___.', undefined, undefined).filter((token) => token.gap)).toHaveLength(1);
  });
});
