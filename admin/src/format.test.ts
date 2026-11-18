import { describe, expect, it } from 'vitest';
import { ratioLabel } from './format';

describe('ratioLabel', () => {
  it('formats a real ratio to two decimals', () => {
    expect(ratioLabel({ ratio: 1.2345, faucet: 100 })).toBe('1.23');
  });

  it('shows infinity when currency was earned but never spent', () => {
    // JSON has no Infinity, so the API sends null.
    expect(ratioLabel({ ratio: null, faucet: 500 })).toBe('∞');
  });

  it('shows a dash when nothing moved at all', () => {
    expect(ratioLabel({ ratio: null, faucet: 0 })).toBe('—');
  });

  it('shows a dash before the report has loaded', () => {
    expect(ratioLabel(null)).toBe('—');
  });
});
