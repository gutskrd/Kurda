import { describe, expect, it } from 'vitest';
import { isOnline, ONLINE_WINDOW_MS } from './presence.js';

describe('isOnline', () => {
  const now = new Date('2026-08-26T12:00:00Z');
  it('is online within the window, offline outside it', () => {
    expect(isOnline(new Date(now.getTime() - 1_000), now)).toBe(true);
    expect(isOnline(new Date(now.getTime() - (ONLINE_WINDOW_MS - 1)), now)).toBe(true);
    expect(isOnline(new Date(now.getTime() - ONLINE_WINDOW_MS), now)).toBe(false);
    expect(isOnline(new Date(now.getTime() - 60 * 60_000), now)).toBe(false);
  });
  it('is offline when never seen', () => {
    expect(isOnline(null, now)).toBe(false);
  });
});
