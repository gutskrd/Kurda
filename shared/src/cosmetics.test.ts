import { describe, expect, it } from 'vitest';
import * as shared from './index.js';
import { shouldShowRefreshNotice } from './cosmetics.js';

describe('refreshed shop items', () => {
  it('shows the notice only while there is something to tell', () => {
    expect(shouldShowRefreshNotice({ refreshedItems: ['bg-background-01'] })).toBe(true);
    expect(shouldShowRefreshNotice({ refreshedItems: [] })).toBe(false);
    // an older API without the field, or no inventory yet, shows nothing
    expect(shouldShowRefreshNotice({})).toBe(false);
    expect(shouldShowRefreshNotice(null)).toBe(false);
    expect(shouldShowRefreshNotice(undefined)).toBe(false);
  });

  it('offers no way to return an item: purchases are final', () => {
    // the return flow’s error list went with the flow itself
    expect('ITEM_RETURN_ERRORS' in shared).toBe(false);
  });
});
