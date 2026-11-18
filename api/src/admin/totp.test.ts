import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, generateSecret, matchTotpStep, otpauthUri, totpCode } from './totp.js';

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

describe('matchTotpStep', () => {
  it('names the time step a code belongs to, so a used one can be refused', () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 1000 / 30);
    expect(matchTotpStep(RFC_SECRET, totpCode(RFC_SECRET, now), now)).toBe(step);
    expect(matchTotpStep(RFC_SECRET, totpCode(RFC_SECRET, now - 30_000), now)).toBe(step - 1);
    expect(matchTotpStep(RFC_SECRET, totpCode(RFC_SECRET, now + 30_000), now)).toBe(step + 1);
    expect(matchTotpStep(RFC_SECRET, totpCode(RFC_SECRET, now + 120_000), now)).toBeNull();
    expect(matchTotpStep(RFC_SECRET, 'abcdef', now)).toBeNull();
    expect(matchTotpStep(RFC_SECRET, '000000', now)).toBeNull();
    expect(matchTotpStep(RFC_SECRET, '12345', now)).toBeNull();
  });
});

describe('generateSecret / otpauthUri', () => {
  it('generates a usable base32 secret and provisioning URI', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    const code = totpCode(secret);
    expect(matchTotpStep(secret, code)).not.toBeNull();
    const uri = otpauthUri(secret, 'admin@hevalo.app');
    expect(uri).toContain('otpauth://totp/Hevalo%20Admin:admin%40hevalo.app');
    expect(uri).toContain(`secret=${secret}`);
  });
});
