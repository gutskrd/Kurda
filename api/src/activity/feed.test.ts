import { describe, expect, it } from 'vitest';
import { broadcasts, FEED_CAP } from './feed.js';

describe('activity feed helpers', () => {
  it('caps feeds at 100', () => {
    expect(FEED_CAP).toBe(100);
  });
  it('broadcasts for everyone/friends visibility but not nobody', () => {
    expect(broadcasts('everyone')).toBe(true);
    expect(broadcasts('friends')).toBe(true);
    expect(broadcasts('nobody')).toBe(false);
  });
});
