import { beforeEach, describe, expect, it } from 'vitest';
import { readRenamed } from './renamedKey';

const KEY = 'hevalo_thing';
const LEGACY = 'mykurda_thing';

beforeEach(() => {
  localStorage.clear();
});

describe('readRenamed', () => {
  /*
   * The one that matters.
   *
   * Renaming a browser key does not move what is inside it. Swapping the
   * string on its own would have signed out everybody who was signed in and
   * forgotten the language everybody had chosen — the rebrand landing, for
   * each of them, as "why am I on the English login page".
   */
  it('finds a value left under the old name', () => {
    localStorage.setItem(LEGACY, 'kept');
    expect(readRenamed(localStorage, KEY, LEGACY)).toBe('kept');
  });

  it('moves it across on that first read, and cleans up', () => {
    localStorage.setItem(LEGACY, 'kept');
    readRenamed(localStorage, KEY, LEGACY);
    expect(localStorage.getItem(KEY)).toBe('kept');
    expect(localStorage.getItem(LEGACY)).toBeNull();
  });

  /*
   * And never looks back. Once the old key is gone, a later write under it —
   * by an older tab still running the previous bundle, say — must not be able
   * to overwrite what the user has since chosen.
   */
  it('prefers the new name once there is one', () => {
    localStorage.setItem(KEY, 'current');
    localStorage.setItem(LEGACY, 'stale');
    expect(readRenamed(localStorage, KEY, LEGACY)).toBe('current');
    expect(localStorage.getItem(LEGACY)).toBe('stale');
  });

  it('returns null when neither name has anything', () => {
    expect(readRenamed(localStorage, KEY, LEGACY)).toBeNull();
  });

  /*
   * A private window, or storage the browser has blocked. The caller's own
   * fallback is the right answer and it is not this function's to pick.
   */
  it('answers null rather than throwing when storage refuses', () => {
    const refuses = {
      getItem() {
        throw new DOMException('denied');
      },
      setItem() {
        throw new DOMException('denied');
      },
      removeItem() {
        throw new DOMException('denied');
      },
    } as unknown as Storage;
    expect(() => readRenamed(refuses, KEY, LEGACY)).not.toThrow();
    expect(readRenamed(refuses, KEY, LEGACY)).toBeNull();
  });

  /*
   * An empty string is a value somebody stored, not an absence. `getItem`
   * returns `''` for it and `null` for a key that is not there, and a check
   * written as `if (!current)` would treat the two the same and keep reaching
   * for the old key forever.
   */
  it('treats an empty string as a value, not as a miss', () => {
    localStorage.setItem(KEY, '');
    localStorage.setItem(LEGACY, 'stale');
    expect(readRenamed(localStorage, KEY, LEGACY)).toBe('');
    expect(localStorage.getItem(LEGACY)).toBe('stale');
  });
});
