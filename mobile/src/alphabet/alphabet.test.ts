import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
import { SYNTHESISED_ALPHABET_CLIPS } from '@kurda/shared';
import { SYNTHESISED_BASE, alphabetAudio } from './audio';
import { TILE_GAP, tileGrid } from './grid';
import { parseSeen } from './seen';

describe('the sounds on the phone', () => {
  it('plays the synthesised clips from the website, under the files the manifest names', () => {
    const { sounds } = alphabetAudio({ clips: {} });
    expect(SYNTHESISED_BASE).toBe('https://hevalo.app/audio/alphabet/');
    expect(sounds.latinSound('c')).toBe(`https://hevalo.app/audio/alphabet/${SYNTHESISED_ALPHABET_CLIPS['kmr:sound:c']}`);
    expect(sounds.isSynthesised(sounds.latinSound('c'))).toBe(true);
  });

  it('plays a recording in its place, and says who says it with the words it says', () => {
    const audio = alphabetAudio({
      clips: { 'kmr:sound:b': 'https://media.test/b.wav', 'kmr:word:b': 'https://media.test/bav.wav' },
      voices: { 'kmr:sound:b': { speaker: 'hevalo' } },
    });
    expect(audio.sounds.latinSound('b')).toBe('https://media.test/b.wav');
    expect(audio.voiceOf('https://media.test/b.wav')).toEqual({ voice: { speaker: 'hevalo' }, text: 'ba' });
    // a recording nobody was chosen for, and a synthesised clip, have nobody
    expect(audio.voiceOf('https://media.test/bav.wav')).toBeNull();
    expect(audio.voiceOf(audio.sounds.latinSound('c'))).toBeNull();
    expect(audio.voiceOf(null)).toBeNull();
  });

  /** a newer server's speaker is not one this app can draw: the button stands alone */
  it('shows nobody for a speaker this version does not know, or a recording it should not play', () => {
    const audio = alphabetAudio({
      clips: { 'kmr:sound:b': 'https://media.test/b.wav', 'kmr:sound:c': 'http://media.test/c.wav' },
      voices: { 'kmr:sound:b': { speaker: 'rojda' as never }, 'kmr:sound:c': { speaker: 'hamo' } },
    });
    expect(audio.voiceOf('https://media.test/b.wav')).toBeNull();
    expect(audio.sounds.latinSound('c')).toMatch(/^https:\/\/hevalo\.app\//);
    expect(alphabetAudio(null).sounds.latinWord('ç')).toMatch(/^https:\/\/hevalo\.app\//);
  });
});

describe('the letters opened on this phone', () => {
  it('reads back what was stored, and nothing from anything else', () => {
    expect(parseSeen(JSON.stringify({ kmr: ['c', 'ç'], ckb: ['be'] }))).toEqual({ kmr: ['c', 'ç'], ckb: ['be'] });
    expect(parseSeen(JSON.stringify({ kmr: ['c', 4, null] }))).toEqual({ kmr: ['c'], ckb: [] });
    expect(parseSeen('not json')).toEqual({ kmr: [], ckb: [] });
    expect(parseSeen(null)).toEqual({ kmr: [], ckb: [] });
  });
});

describe('the grid', () => {
  /** each width less the 16-point gutters either side: a 375, a 430, and a tablet's 680 column */
  it('fits four letters across the narrowest phone, five on a large one and eight in a tablet’s column', () => {
    expect(tileGrid(375 - 32).columns).toBe(4);
    expect(tileGrid(430 - 32).columns).toBe(5);
    expect(tileGrid(680 - 32).columns).toBe(8);
    for (const width of [343, 358, 398, 648]) {
      const { columns, tile } = tileGrid(width);
      expect(columns * tile + (columns - 1) * TILE_GAP).toBeLessThanOrEqual(width);
      // a fingertip's width and more
      expect(tile).toBeGreaterThanOrEqual(44);
    }
  });
});
