import { beforeEach, describe, expect, it } from 'vitest';
import { readRenamed } from './renamedKey';

const KEY = 'hevalo_thing';
const LEGACY = 'mykurda_thing';

beforeEach(() => {
  localStorage.clear();
});

describe('readRenamed', () => {
  // Renaming a key does not move its value: without this, the rename would sign everybody out and forget their language.
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

  // Once moved, a later write under the old name (an older tab still open) must not override the new value.
  it('prefers the new name once there is one', () => {
    localStorage.setItem(KEY, 'current');
    localStorage.setItem(LEGACY, 'stale');
    expect(readRenamed(localStorage, KEY, LEGACY)).toBe('current');
    expect(localStorage.getItem(LEGACY)).toBe('stale');
  });

  it('returns null when neither name has anything', () => {
    expect(readRenamed(localStorage, KEY, LEGACY)).toBeNull();
  });

  // A private window or blocked storage; the caller's fallback applies.
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

  // `getItem` returns '' for a stored empty string and null for a missing key; `if (!current)` would confuse them.
  it('treats an empty string as a value, not as a miss', () => {
    localStorage.setItem(KEY, '');
    localStorage.setItem(LEGACY, 'stale');
    expect(readRenamed(localStorage, KEY, LEGACY)).toBe('');
    expect(localStorage.getItem(LEGACY)).toBe('stale');
  });
});
