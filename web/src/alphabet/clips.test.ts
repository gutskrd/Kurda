import { describe, expect, it } from 'vitest';
import { SYNTHESISED_ALPHABET_CLIPS, SYNTHESISED_WORD_CLIPS } from '@kurda/shared';

describe('the synthesised clips', () => {
  // the files on disk, listed without loading them
  const names = (paths: Record<string, unknown>) => new Set(Object.keys(paths).map((p) => p.split('/').pop()));
  const alphabet = names(import.meta.glob('../../public/audio/alphabet/*.mp3'));
  const words = names(import.meta.glob('../../public/audio/words/*.mp3'));

  /** A clip in the manifest with no file would be a play button that plays nothing, here and on the phone. */
  it('has a file for every clip, and no file without one', () => {
    expect(alphabet.size).toBe(Object.keys(SYNTHESISED_ALPHABET_CLIPS).length);
    for (const [key, file] of Object.entries(SYNTHESISED_ALPHABET_CLIPS)) expect(alphabet.has(file), key).toBe(true);
  });

  it('has a file for every word set clip, and no file without one', () => {
    expect(words.size).toBe(Object.keys(SYNTHESISED_WORD_CLIPS).length);
    for (const [key, file] of Object.entries(SYNTHESISED_WORD_CLIPS)) expect(words.has(file), key).toBe(true);
  });
});
