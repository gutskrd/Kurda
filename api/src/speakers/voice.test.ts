import { describe, expect, it } from 'vitest';
import { decodeLipsync, encodeLipsync, lipsyncFromText } from '@kurda/shared';
import { textLipsync, voiceOf } from './voice.js';

describe('voiceOf', () => {
  const words = { text: 'Ez baş im.', durationMs: 1400 };

  it('sends nothing without a speaker, timeline or not', () => {
    expect(voiceOf({ speaker: null, lipsync: null }, words)).toBeUndefined();
    expect(voiceOf({ speaker: 'nobody', lipsync: { v: 1, d: 10, k: [] } }, words)).toBeUndefined();
  });

  it('sends a stored timeline as it is stored', () => {
    const stored = encodeLipsync(lipsyncFromText('Ez', 500));
    expect(voiceOf({ speaker: 'hamo', lipsync: stored }, words)).toEqual({ speaker: 'hamo', lipsync: stored });
  });

  it('makes one from the words over the recording’s length when none is stored, and says so', () => {
    const voice = voiceOf({ speaker: 'xezo', lipsync: null }, words);
    expect(voice).toEqual({
      speaker: 'xezo',
      lipsync: encodeLipsync(lipsyncFromText(words.text, words.durationMs)),
      lipsyncSource: 'text',
    });
    expect(decodeLipsync(voice!.lipsync).durationMs).toBe(1400);
  });

  it('makes none without the words or the length', () => {
    expect(voiceOf({ speaker: 'hevalo', lipsync: null })).toEqual({ speaker: 'hevalo' });
    expect(voiceOf({ speaker: 'hevalo', lipsync: null }, { text: 'sêv', durationMs: null })).toEqual({ speaker: 'hevalo' });
    expect(voiceOf({ speaker: 'hevalo', lipsync: null }, { text: 'sêv', durationMs: 0 })).toEqual({ speaker: 'hevalo' });
  });
});

describe('textLipsync', () => {
  it('makes each timeline once, by its words, length and script', () => {
    const first = textLipsync({ text: 'Roj baş', durationMs: 900 });
    expect(textLipsync({ text: 'Roj baş', durationMs: 900 })).toBe(first);
    expect(textLipsync({ text: 'Roj baş', durationMs: 901 })).not.toBe(first);
    expect(textLipsync({ text: 'Roj baş', durationMs: 900, script: 'latin' })).toEqual(first);
    expect(textLipsync({ text: 'ڕۆژ باش', durationMs: 900, script: 'arabic' })?.d).toBe(900);
  });

  it('makes none for a recording longer than any timeline may be', () => {
    expect(textLipsync({ text: 'Roj baş', durationMs: 10 * 60 * 60_000 })).toBeNull();
  });
});
