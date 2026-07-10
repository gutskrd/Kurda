import { describe, expect, it } from 'vitest';
import { StubReceiptVerifier } from './verifier.js';

const v = new StubReceiptVerifier();

describe('StubReceiptVerifier', () => {
  it('accepts a well-formed receipt and carries its fields through', async () => {
    const r = await v.verify('apple', JSON.stringify({ transactionId: 't1', environment: 'production' }), 'gems_100');
    expect(r).toEqual({ valid: true, transactionId: 't1', productId: 'gems_100', environment: 'production' });
  });

  it('defaults the environment to sandbox', async () => {
    const r = await v.verify('google', JSON.stringify({ transactionId: 't2' }), 'gems_100');
    expect(r.environment).toBe('sandbox');
  });

  it('rejects receipts with no transaction id or an explicit invalid flag', async () => {
    expect((await v.verify('apple', JSON.stringify({ environment: 'production' }), 'p')).valid).toBe(false);
    expect((await v.verify('apple', JSON.stringify({ transactionId: 't', valid: false }), 'p')).valid).toBe(false);
  });

  it('rejects malformed tokens', async () => {
    expect((await v.verify('apple', 'not-json', 'p')).valid).toBe(false);
  });
});
