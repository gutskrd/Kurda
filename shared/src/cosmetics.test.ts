import { describe, expect, it } from 'vitest';
import { ITEM_RETURN_ERRORS, shouldShowRefreshNotice } from './cosmetics.js';

describe('refreshed shop items', () => {
  it('shows the notice only while there is something to tell', () => {
    expect(shouldShowRefreshNotice({ refreshedItems: ['bg-background-01'] })).toBe(true);
    expect(shouldShowRefreshNotice({ refreshedItems: [] })).toBe(false);
    // an older API without the field, or no inventory yet, shows nothing
    expect(shouldShowRefreshNotice({})).toBe(false);
    expect(shouldShowRefreshNotice(null)).toBe(false);
    expect(shouldShowRefreshNotice(undefined)).toBe(false);
  });

  it('names the three ways a return can be refused', () => {
    expect([...ITEM_RETURN_ERRORS]).toEqual(['ITEM_NOT_FOUND', 'NOT_RETURNABLE', 'NOTHING_TO_REFUND']);
  });
});
