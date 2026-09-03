import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, generateSecret, otpauthUri, totpCode, verifyTotp } from './totp.js';

// RFC 6238 test seed: ASCII "12345678901234567890" as base32.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('base32', () => {
  it('round-trips bytes', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(RFC_SECRET).toString('ascii')).toBe('12345678901234567890');
  });
});

describe('totpCode (RFC 6238 vectors, SHA-1, 6 digits)', () => {
  // truncated to 6 digits from the RFC's 8-digit expected values
  it('matches known times', () => {
    expect(totpCode(RFC_SECRET, 59_000)).toBe('287082'); // T=59 → 94287082
    expect(totpCode(RFC_SECRET, 1_111_111_109_000)).toBe('081804'); // → 07081804
  });
});

describe('verifyTotp', () => {
  it('accepts the current code and tolerates ±1 step skew', () => {
    const now = 1_700_000_000_000;
    const code = totpCode(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, code, now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, code, now + 30_000)).toBe(true); // next step, within window
    expect(verifyTotp(RFC_SECRET, code, now + 120_000)).toBe(false); // too far
  });

  it('rejects malformed and wrong codes', () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(RFC_SECRET, '000000', now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef', now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, '12345', now)).toBe(false);
  });
});

describe('generateSecret / otpauthUri', () => {
  it('generates a usable base32 secret and provisioning URI', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    const code = totpCode(secret);
    expect(verifyTotp(secret, code)).toBe(true);
    const uri = otpauthUri(secret, 'admin@mykurda.com');
    expect(uri).toContain('otpauth://totp/MyKurda%20Admin:admin%40mykurda.com');
    expect(uri).toContain(`secret=${secret}`);
  });
});
