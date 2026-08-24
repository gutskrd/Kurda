import { describe, it, expect } from 'vitest';
import { API_URL } from './config';

describe('API_URL', () => {
  it('resolves to a non-empty absolute URL', () => {
    expect(API_URL).toMatch(/^https?:\/\//);
  });

  it('has no trailing slash so `${API_URL}${path}` stays clean', () => {
    expect(API_URL.endsWith('/')).toBe(false);
  });
});
