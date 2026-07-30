import { describe, expect, it } from 'vitest';
import { safeEqual, SharedSecretWebhookVerifier } from './webhook-auth.js';

describe('safeEqual', () => {
  it('matches equal strings and rejects different ones', () => {
    expect(safeEqual('s3cret', 's3cret')).toBe(true);
    expect(safeEqual('s3cret', 's3creX')).toBe(false);
  });
  it('rejects length mismatches without throwing', () => {
    expect(safeEqual('short', 'longer-secret')).toBe(false);
  });
});

describe('SharedSecretWebhookVerifier', () => {
  it('accepts the correct secret header', () => {
    const v = new SharedSecretWebhookVerifier('top-secret');
    expect(v.verify('apple', { 'x-iap-secret': 'top-secret' })).toBe(true);
  });
  it('rejects a wrong or missing header', () => {
    const v = new SharedSecretWebhookVerifier('top-secret');
    expect(v.verify('apple', { 'x-iap-secret': 'nope' })).toBe(false);
    expect(v.verify('google', {})).toBe(false);
  });
  it('fails closed when no secret is configured', () => {
    const v = new SharedSecretWebhookVerifier(undefined);
    expect(v.verify('apple', { 'x-iap-secret': 'anything' })).toBe(false);
  });
});
