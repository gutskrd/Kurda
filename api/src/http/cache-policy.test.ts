import { describe, expect, it } from 'vitest';
import { cachePolicy, isEdgeCacheable } from './cache-policy.js';

describe('cachePolicy', () => {
  it('edge-caches anonymous GETs of public resources', () => {
    const p = cachePolicy('/dictionary/entries/:id', 'GET', false);
    expect(p.cacheControl).toContain('public');
    expect(p.cacheControl).toContain('s-maxage=86400');
    expect(p.vary).toContain('Authorization');
  });

  it('NEVER edge-caches an authenticated response — even on a public route (edge case)', () => {
    for (const route of ['/dictionary/entries/:id', '/me', '/shop']) {
      expect(cachePolicy(route, 'GET', true).cacheControl).toBe('private, no-store');
    }
  });

  it('does not cache non-GET or unclassified routes', () => {
    expect(cachePolicy('/dictionary/search', 'POST', false).cacheControl).toBe('no-store');
    expect(cachePolicy('/some/dynamic/route', 'GET', false).cacheControl).toBe('no-store');
  });

  it('classifies edge-cacheable routes for the audit', () => {
    expect(isEdgeCacheable('/dictionary/word-of-day')).toBe(true);
    expect(isEdgeCacheable('/me')).toBe(false);
  });
});
