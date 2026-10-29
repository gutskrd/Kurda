import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('@react-navigation/native', () => ({ useFocusEffect: () => undefined }));
import { SYNTHESISED_WORD_CLIPS, WORD_COLOURS, WORD_SET_IDS } from '@kurda/shared';
import { TILE_GAP } from '../alphabet/grid';
import { WORDS_BASE, wordsAudio } from './audio';
import { wordGrid } from './grid';
import { countSeen } from './seen';

const red = WORD_COLOURS[0]!;

describe('the words on the phone', () => {
  it('plays the synthesised clips from the website, under the files the manifest names', () => {
    const { sounds } = wordsAudio({ clips: {} });
    expect(WORDS_BASE).toBe('https://hevalo.app/audio/words/');
    expect(sounds.of(red, 'kmr')).toBe(`https://hevalo.app/audio/words/${SYNTHESISED_WORD_CLIPS['words:colours:kmr:red']}`);
    expect(sounds.isSynthesised(sounds.of(red, 'kmr'))).toBe(true);
  });

  it('plays a recording in its place, says who says it, and ignores the letters', () => {
    const audio = wordsAudio({
      clips: { 'words:colours:kmr:red': 'https://media.test/sor.wav', 'kmr:sound:b': 'https://media.test/b.wav' },
      voices: { 'words:colours:kmr:red': { speaker: 'hamo' }, 'kmr:sound:b': { speaker: 'xezo' } },
    });
    expect(audio.sounds.of(red, 'kmr')).toBe('https://media.test/sor.wav');
    expect(audio.voiceOf('https://media.test/sor.wav')).toEqual({ voice: { speaker: 'hamo' }, text: 'sor' });
    expect(audio.voiceOf('https://media.test/b.wav')).toBeNull();
    expect(audio.voiceOf(audio.sounds.of(red, 'ckb'))).toBeNull();
    expect(wordsAudio(null).sounds.of(red, 'ckb')).toMatch(/^https:\/\/hevalo\.app\/audio\/words\//);
  });
});

describe('the grid of a set', () => {
  /** each width less the 16-point gutters either side: a 375, a 430, and a tablet's 680 column */
  it('fits three colours or months, four numbers and two days across a phone', () => {
    expect(wordGrid(343, 'colours').columns).toBe(3);
    expect(wordGrid(343, 'months').columns).toBe(3);
    expect(wordGrid(343, 'numbers').columns).toBe(4);
    expect(wordGrid(343, 'days').columns).toBe(2);
    expect(wordGrid(648, 'numbers').columns).toBe(8);
  });

  it('gives larger text fewer, wider tiles rather than cutting words short', () => {
    for (const set of WORD_SET_IDS) {
      expect(wordGrid(343, set, 1.6).columns, set).toBeLessThan(wordGrid(343, set).columns);
      expect(wordGrid(343, set, 3).columns, set).toBeGreaterThanOrEqual(1);
    }
    expect(wordGrid(343, 'days', 1.6).columns).toBe(1);
    for (const width of [343, 358, 398, 648]) {
      for (const set of WORD_SET_IDS) {
        const { columns, tile } = wordGrid(width, set);
        expect(columns * tile + (columns - 1) * TILE_GAP).toBeLessThanOrEqual(width);
        // a fingertip's width and more
        expect(tile).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

describe('the words opened on this phone', () => {
  it('counts a word opened in either dialect once, and nothing it does not know', () => {
    expect(countSeen('colours', JSON.stringify({ kmr: ['red', 'blue'], ckb: ['red', 'teal'] }))).toBe(2);
    expect(countSeen('days', null)).toBe(0);
    expect(countSeen('days', 'not json')).toBe(0);
  });
});
