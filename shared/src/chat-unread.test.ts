import { describe, expect, it } from 'vitest';
import { GROUP_UNREAD_CAP, unreadLabel } from './chat-unread.js';

describe('unreadLabel', () => {
  it('writes a count as it is up to 99, and a capped one as 99+', () => {
    expect(unreadLabel(0)).toBe('0');
    expect(unreadLabel(3)).toBe('3');
    expect(unreadLabel(99)).toBe('99');
    expect(unreadLabel(GROUP_UNREAD_CAP)).toBe('99+');
    expect(unreadLabel(5000)).toBe('99+');
  });
});
