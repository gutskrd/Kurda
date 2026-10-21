import { describe, expect, it } from 'vitest';
import { SORANI } from './letters.js';
import { alphabetClipText, alphabetRecordings, alphabetSounds, soraniSoundKey } from './sounds.js';

const sorani = (id: string) => SORANI.find((l) => l.id === id)!;

describe('where a sound plays from', () => {
  it('plays a recording instead of the synthesised clip, for its key only', () => {
    const before = alphabetSounds();
    expect(before.latinSound('c')).toMatch(/^\/audio\/alphabet\/a[0-9a-f]+\.mp3$/);
    expect(before.isSynthesised(before.latinSound('c'))).toBe(true);

    const after = alphabetSounds({ 'kmr:sound:c': 'https://cdn.example/alphabet-audio/c.wav' });
    expect(after.latinSound('c')).toBe('https://cdn.example/alphabet-audio/c.wav');
    expect(after.isSynthesised(after.latinSound('c'))).toBe(false);
    expect(after.isSynthesised(after.latinSound('ç'))).toBe(true);
  });

  /** a Soranî letter shares its Kurmancî partner's sound, recording included */
  it('gives a Soranî letter its partner’s sound, unless only Soranî has it', () => {
    expect(soraniSoundKey(sorani('cîm'))).toBe('kmr:sound:c');
    expect(soraniSoundKey(sorani('ḧe'))).toBe('ckb:sound:ḧe');
    const sounds = alphabetSounds({ 'kmr:sound:c': 'https://cdn.example/c.wav' });
    expect(sounds.soraniSound(sorani('cîm'))).toBe('https://cdn.example/c.wav');
  });

  /** the phone plays the synthesised clips from the website */
  it('finds the synthesised clips wherever it is told they are', () => {
    const phone = alphabetSounds({}, 'https://hevalo.app/audio/alphabet/');
    expect(phone.latinWord('ç')).toMatch(/^https:\/\/hevalo\.app\/audio\/alphabet\/a[0-9a-f]+\.mp3$/);
    expect(phone.isSynthesised(phone.latinWord('ç'))).toBe(true);
    expect(phone.url(null)).toBeNull();
    expect(phone.url('kmr:sound:zz')).toBeNull();
  });
});

describe('the recordings worth playing', () => {
  it('keeps https URLs under keys the pages know, and nothing else', () => {
    expect(
      alphabetRecordings({
        'kmr:sound:c': 'https://cdn.test/c.wav',
        'kmr:sound:zz': 'https://x/y.wav',
        'kmr:sound:d': 'javascript:alert(1)',
        'kmr:sound:e': 42,
        toString: 'https://x/y.wav',
      }),
    ).toEqual({ 'kmr:sound:c': 'https://cdn.test/c.wav' });
    expect(alphabetRecordings(undefined)).toEqual({});
    expect(alphabetRecordings('clips')).toEqual({});
  });
});

describe('what a recording says', () => {
  /** what was read into the microphone: "ba" for b, since a stop cannot be heard alone */
  it('is the text the recording was made from', () => {
    expect(alphabetClipText('kmr:sound:b')).toBe('ba');
    expect(alphabetClipText('kmr:word:ç')).toBe('çav');
    expect(alphabetClipText('ckb:word:be')).toBe('باوک');
    expect(alphabetClipText('kmr:sound:zz')).toBeNull();
  });
});
