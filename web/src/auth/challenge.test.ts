import { describe, it, expect } from 'vitest';
import { challengeSiteKey } from './challenge';

describe('challengeSiteKey', () => {
  it('is null while no site key is configured, which is how production runs', () => {
    expect(challengeSiteKey({})).toBeNull();
    expect(challengeSiteKey({ VITE_TURNSTILE_SITE_KEY: '   ' })).toBeNull();
  });

  it('hands back a configured key', () => {
    expect(challengeSiteKey({ VITE_TURNSTILE_SITE_KEY: ' 0x4AAAA ' })).toBe('0x4AAAA');
  });
});
