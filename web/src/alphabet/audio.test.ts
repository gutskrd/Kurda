import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function fresh(response: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => response })));
  return import('./audio');
}

describe('recordings from the admin panel', () => {
  it('play instead of the synthesised clip, for their keys only', async () => {
    const audio = await fresh({ clips: { 'kmr:sound:c': 'https://cdn.example/alphabet-audio/c.wav' } });
    expect(audio.isSynthesised(audio.latinSound('c'))).toBe(true);
    await audio.loadRecordings();
    expect(audio.latinSound('c')).toBe('https://cdn.example/alphabet-audio/c.wav');
    expect(audio.isSynthesised(audio.latinSound('c'))).toBe(false);
    expect(audio.isSynthesised(audio.latinSound('ç'))).toBe(true);
  });

  /** a Soranî letter shares its Kurmancî partner's sound, recording included */
  it('carry over to the Soranî partner letter', async () => {
    const audio = await fresh({ clips: { 'kmr:sound:c': 'https://cdn.example/c.wav' } });
    await audio.loadRecordings();
    const { SORANI_LETTERS } = await import('@kurda/shared');
    expect(audio.soraniSound(SORANI_LETTERS.find((l) => l.id === 'cîm')!)).toBe('https://cdn.example/c.wav');
  });

  it('ignore unknown keys and anything not https', async () => {
    const audio = await fresh({ clips: { 'kmr:sound:zz': 'https://x/y.wav', 'kmr:sound:c': 'javascript:alert(1)' } });
    await audio.loadRecordings();
    expect(audio.isSynthesised(audio.latinSound('c'))).toBe(true);
  });

  it('leave the synthesised clips in place when the API is down', async () => {
    const audio = await fresh({}, false);
    await audio.loadRecordings();
    expect(audio.isSynthesised(audio.latinSound('c'))).toBe(true);
  });
});

/*
 * The word sets' recordings come in the same answer as the letters', under
 * the words' keys: one request serves the alphabet and the words to know.
 */
describe('recordings of the words to know', () => {
  it('play instead of a word’s synthesised clip, and say who says it', async () => {
    const audio = await fresh({
      clips: { 'words:colours:kmr:red': 'https://cdn.example/sor.wav', 'kmr:sound:b': 'https://cdn.example/b.wav' },
      voices: { 'words:colours:kmr:red': { speaker: 'hamo' } },
    });
    const { SYNTHESISED_WORD_CLIPS, WORD_COLOURS } = await import('@kurda/shared');
    const red = WORD_COLOURS[0]!;
    expect(audio.wordSound(red, 'kmr')).toBe(`/audio/words/${SYNTHESISED_WORD_CLIPS['words:colours:kmr:red']}`);
    expect(audio.isSynthesised(audio.wordSound(red, 'kmr'))).toBe(true);
    await audio.loadRecordings();
    expect(audio.wordSound(red, 'kmr')).toBe('https://cdn.example/sor.wav');
    expect(audio.isSynthesised(audio.wordSound(red, 'kmr'))).toBe(false);
    expect(audio.spokenAlphabet(audio.wordSound(red, 'kmr'))).toEqual([{ src: 'https://cdn.example/sor.wav', voice: { speaker: 'hamo' }, text: 'sor' }]);
    // the letters' recordings in the same answer arrive with them
    expect(audio.latinSound('b')).toBe('https://cdn.example/b.wav');
    expect(audio.currentWordSounds().of(red, 'ckb')).toMatch(/^\/audio\/words\//);
  });

  /** grey's dark ł has no synthesised voice: nothing to play until it is recorded */
  it('leave a word with no clip and no recording without a sound', async () => {
    const audio = await fresh({ clips: { 'words:colours:ckb:grey': 'http://insecure.example/grey.wav' } });
    const { WORD_COLOURS } = await import('@kurda/shared');
    const grey = WORD_COLOURS.find((c) => c.id === 'grey')!;
    await audio.loadRecordings();
    expect(audio.wordSound(grey, 'ckb')).toBeNull();
    expect(audio.wordSound(grey, 'kmr')).toMatch(/^\/audio\/words\//);
  });
});
