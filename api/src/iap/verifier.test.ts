import { describe, expect, it } from 'vitest';
import { createReceiptVerifier, StubReceiptVerifier, UnavailableReceiptVerifier } from './verifier.js';
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

  it('lets production boot without store credentials — but never with the stub', () => {
    const verifier = createReceiptVerifier(cfg({ ...PROD, IAP_ALLOW_STUB: 'true' }));
    expect(verifier).toBeInstanceOf(UnavailableReceiptVerifier);
    expect(verifier).not.toBeInstanceOf(StubReceiptVerifier);
    // any other value keeps the hard error
    expect(() => createReceiptVerifier(cfg({ ...PROD, IAP_ALLOW_STUB: 'false' }))).toThrow();
  });

  /**
   * The reason the stub must never be the production verifier.
   *
   * Every field it returns is read out of the token it was handed, so a caller
   * writes their own receipt — including `environment: 'production'`, which is
   * what the sandbox check in IapService.redeem tests. Nothing here is a
   * vulnerability while the stub stays in dev; all of it is the moment it does
   * not.
   */
  it('shows what the stub would have accepted in production', async () => {
    const forged = JSON.stringify({ transactionId: 'i-made-this-up', environment: 'production' });
    const receipt = await new StubReceiptVerifier().verify('apple', forged, 'gems_500');

    expect(receipt.valid).toBe(true);
    expect(receipt.transactionId).toBe('i-made-this-up');
    // and past the "never accept sandbox receipts on the live store" check
    expect(receipt.environment).toBe('production');
  });

  it('refuses every receipt, rather than answering for a store it cannot reach', async () => {
    const verifier = new UnavailableReceiptVerifier();
    await expect(verifier.verify()).rejects.toMatchObject({ code: 'IAP_UNAVAILABLE', statusCode: 503 });
  });
});
