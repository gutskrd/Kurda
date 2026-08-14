import { describe, expect, it } from 'vitest';
import { createReceiptVerifier, StubReceiptVerifier } from './verifier.js';
import { loadConfig } from '../config/env.js';

const v = new StubReceiptVerifier();

// production config needs a JWT_SECRET; everything else defaults
const cfg = (env: Record<string, string | undefined>) => loadConfig(env);
const PROD = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) };

describe('StubReceiptVerifier', () => {
  it('accepts a well-formed receipt and carries its fields through', async () => {
    const r = await v.verify('apple', JSON.stringify({ transactionId: 't1', environment: 'production' }), 'gems_100');
    expect(r).toEqual({
      valid: true,
      transactionId: 't1',
      productId: 'gems_100',
      environment: 'production',
      ownershipType: 'purchased',
    });
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

describe('createReceiptVerifier', () => {
  it('uses the stub outside production', () => {
    expect(createReceiptVerifier(cfg({ NODE_ENV: 'development' }))).toBeInstanceOf(StubReceiptVerifier);
    expect(createReceiptVerifier(cfg({ NODE_ENV: 'test' }))).toBeInstanceOf(StubReceiptVerifier);
  });

  it('hard-errors in production without a real verifier (default — protects the live store)', () => {
    expect(() => createReceiptVerifier(cfg(PROD))).toThrow(/no production receipt verifier/);
  });

  it('permits the stub in production ONLY when IAP_ALLOW_STUB=true', () => {
    expect(createReceiptVerifier(cfg({ ...PROD, IAP_ALLOW_STUB: 'true' }))).toBeInstanceOf(StubReceiptVerifier);
    // any other value keeps the hard error
    expect(() => createReceiptVerifier(cfg({ ...PROD, IAP_ALLOW_STUB: 'false' }))).toThrow();
  });
});
