import { describe, expect, it } from 'vitest';
import { SYNTHESISED_ALPHABET_CLIPS } from '@kurda/shared';

describe('the synthesised clips', () => {
  // the files on disk, listed without loading them
  const files = new Set(Object.keys(import.meta.glob('../../public/audio/alphabet/*.mp3')).map((p) => p.split('/').pop()));

  /** A clip in the manifest with no file would be a play button that plays nothing, here and on the phone. */
  it('has a file for every clip, and no file without one', () => {
    expect(files.size).toBe(Object.keys(SYNTHESISED_ALPHABET_CLIPS).length);
    for (const [key, file] of Object.entries(SYNTHESISED_ALPHABET_CLIPS)) expect(files.has(file), key).toBe(true);
  });
});
