import { describe, expect, it } from 'vitest';
import { friendActionLabel, isActionable, VISIBILITY_LABEL } from './format';

describe('friendActionLabel', () => {
  it('labels each relationship state', () => {
    expect(friendActionLabel('none')).toBe('Add friend');
    expect(friendActionLabel('pending_out')).toBe('Requested');
    expect(friendActionLabel('pending_in')).toBe('Accept request');
    expect(friendActionLabel('friends')).toBe('Friends ✓');
    expect(friendActionLabel('self')).toBeNull();
  });
});

describe('isActionable', () => {
  it('is true only when the user can act (add or accept)', () => {
    expect(isActionable('none')).toBe(true);
    expect(isActionable('pending_in')).toBe(true);
    expect(isActionable('pending_out')).toBe(false);
    expect(isActionable('friends')).toBe(false);
  });
});

describe('VISIBILITY_LABEL', () => {
  it('maps every visibility option', () => {
    expect(VISIBILITY_LABEL.everyone).toBe('Everyone');
    expect(VISIBILITY_LABEL.friends).toBe('Friends only');
    expect(VISIBILITY_LABEL.nobody).toBe('Nobody');
  });
});
