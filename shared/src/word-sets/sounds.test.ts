import { describe, expect, it } from 'vitest';
import { ALPHABET_CLIPS, LETTER_CLIPS, isAlphabetClipKey } from '../alphabet-audio.js';
import { alphabetClipText, alphabetRecordings } from '../alphabet/sounds.js';
import { WORD_CLIPS } from './clips.js';
import { WORD_SET_CLIPS, isWordSetClipKey, wordClipKey, wordSetRecordings, wordSetSounds } from './sounds.js';
import { COLOURS, KURDISH_MONTHS, CALENDAR_MONTHS, WORD_SET_IDS, wordIn, wordSet } from './words.js';

describe('the sounds to record', () => {
  it('files every word in both dialects under a key of its own set', () => {
    for (const set of WORD_SET_IDS) {
      for (const word of wordSet(set)) {
        for (const dialect of ['kmr', 'ckb'] as const) {
          const key = wordClipKey(word, dialect);
          expect(key, `${set} ${word.id} ${dialect}`).toMatch(new RegExp(`^words:${set}:${dialect}:`));
          expect(isWordSetClipKey(key)).toBe(true);
          const clip = WORD_SET_CLIPS.find((c) => c.key === key)!;
          // exactly what is said into the microphone: the word as the page writes it
          expect(clip.say).toBe(wordIn(word, dialect));
          expect(clip.group).toBe(set);
          expect(clip.script).toBe(dialect);
        }
      }
    }
  });

  /** a word said the same way twice is one recording, not two */
  it('records Gulan once in Kurmancî, though it names a month on both calendars', () => {
    const may = CALENDAR_MONTHS.find((m) => m.id === 'may')!;
    const gulan = KURDISH_MONTHS.find((m) => m.id === 'gulan')!;
    expect(wordClipKey(gulan, 'kmr')).toBe(wordClipKey(may, 'kmr'));
    expect(wordClipKey(gulan, 'ckb')).not.toBe(wordClipKey(may, 'ckb'));
    const keys = WORD_SET_CLIPS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /** the admin panel, the API and the apps read one list: the letters, then the words */
  it('joins the alphabet list, which the API checks a recording against', () => {
    expect(ALPHABET_CLIPS).toEqual([...LETTER_CLIPS, ...WORD_SET_CLIPS]);
    expect(new Set(ALPHABET_CLIPS.map((c) => c.key)).size).toBe(ALPHABET_CLIPS.length);
    expect(isAlphabetClipKey('words:colours:ckb:black')).toBe(true);
    expect(isAlphabetClipKey('words:colours:ckb:teal')).toBe(false);
    expect(alphabetClipText('words:colours:ckb:black')).toBe('ڕەش');
    expect(alphabetClipText('words:numbers:kmr:90')).toBe('not');
  });

  it('ships synthesised clips only for words it knows', () => {
    for (const key of Object.keys(WORD_CLIPS)) expect(isWordSetClipKey(key), key).toBe(true);
  });
});

describe('where a word plays from', () => {
  const red = COLOURS[0]!;

  it('plays a recording in place of the synthesised clip, for its key only', () => {
    const recorded = wordSetSounds({ 'words:colours:kmr:red': 'https://cdn.example/sor.wav' });
    expect(recorded.of(red, 'kmr')).toBe('https://cdn.example/sor.wav');
    expect(recorded.isSynthesised(recorded.of(red, 'kmr'))).toBe(false);
    expect(recorded.url(null)).toBeNull();
    expect(recorded.url('words:colours:kmr:teal')).toBeNull();
  });

  it('plays a synthesised clip from wherever it is told they are, and nothing where there is none', () => {
    const phone = wordSetSounds({}, 'https://hevalo.app/audio/words/');
    for (const set of WORD_SET_IDS) {
      for (const word of wordSet(set)) {
        for (const dialect of ['kmr', 'ckb'] as const) {
          const key = wordClipKey(word, dialect);
          const src = phone.of(word, dialect);
          if (Object.hasOwn(WORD_CLIPS, key)) {
            expect(src).toBe(`https://hevalo.app/audio/words/${WORD_CLIPS[key]}`);
            expect(phone.isSynthesised(src)).toBe(true);
          } else expect(src, key).toBeNull();
        }
      }
    }
  });
});

describe('the recordings worth playing', () => {
  it('keeps https URLs under the words keys, and leaves the letters to the alphabet', () => {
    const answer = {
      'words:days:kmr:mon': 'https://cdn.test/dusem.wav',
      'words:days:kmr:xyz': 'https://cdn.test/x.wav',
      'words:days:ckb:mon': 'http://cdn.test/plain.wav',
      'kmr:sound:c': 'https://cdn.test/c.wav',
    };
    expect(wordSetRecordings(answer)).toEqual({ 'words:days:kmr:mon': 'https://cdn.test/dusem.wav' });
    expect(alphabetRecordings(answer)).toEqual({ 'kmr:sound:c': 'https://cdn.test/c.wav' });
    expect(wordSetRecordings(null)).toEqual({});
    expect(wordSetRecordings('clips')).toEqual({});
  });
});
