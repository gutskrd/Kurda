import { describe, expect, it } from 'vitest';
import { canGiveGifts, isChildProfile } from './access';

describe('who may give a gift', () => {
  it('offers the gift button to a signed-in person, and never to a guest, a child’s profile or nobody', () => {
    expect(canGiveGifts({ id: 'a', kind: 'person' })).toBe(true);
    expect(canGiveGifts({ id: 'a' })).toBe(true);
    expect(canGiveGifts({ id: 'g', guest: true })).toBe(false);
    expect(canGiveGifts({ id: 'k', kind: 'child' })).toBe(false);
    expect(canGiveGifts(null)).toBe(false);
  });

  it('reads a child’s profile from the session’s kind', () => {
    expect(isChildProfile({ kind: 'child' })).toBe(true);
    expect(isChildProfile({ kind: 'person' })).toBe(false);
    expect(isChildProfile(null)).toBe(false);
  });
});
