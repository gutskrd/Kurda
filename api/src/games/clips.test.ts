/**
 * The byte ranges a round's clip answers: one range, from its start, to its
 * end or as a suffix; anything else is the whole file, and a range past the
 * end is refused as unsatisfiable.
 */
import { describe, expect, it } from 'vitest';
import { byteRange } from './clips.js';

describe('a clip’s byte range', () => {
  it('is none without a header, or for a header it does not answer', () => {
    expect(byteRange(undefined, 100)).toBeNull();
    expect(byteRange('bytes=0-1,5-9', 100)).toBeNull();
    expect(byteRange('items=0-1', 100)).toBeNull();
    expect(byteRange('bytes=-', 100)).toBeNull();
  });

  it('answers the start a player asks for first, and the rest', () => {
    expect(byteRange('bytes=0-1', 100)).toEqual({ start: 0, end: 1 });
    expect(byteRange('bytes=10-', 100)).toEqual({ start: 10, end: 99 });
    expect(byteRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
  });

  it('answers a suffix: the last bytes', () => {
    expect(byteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 });
  });

  it('refuses a range past the end', () => {
    expect(byteRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(byteRange('bytes=9-3', 100)).toBe('unsatisfiable');
    expect(byteRange('bytes=-0', 100)).toBe('unsatisfiable');
  });
});
