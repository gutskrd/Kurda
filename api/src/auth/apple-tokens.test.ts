import { generateKeyPairSync, verify, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { compactVerify } from 'jose';
import type pg from 'pg';
import { loadConfig } from '../config/env.js';
import { appleClientSecret, appleSigningKey, appleTokens, DEFAULT_APPLE_CLIENT_ID, type AppleSigningKey } from './apple-tokens.js';

function signingKey(): { key: AppleSigningKey; publicKey: KeyObject } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    key: {
      teamId: 'TEAM123456',
      keyId: 'KEY1234567',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      clientId: 'app.hevalo.mobile',
    },
    publicKey,
  };
}

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('the client secret for Apple', () => {
  it('is an ES256 JWT naming the key, the team, the client and Apple, signed with the key', () => {
    const { key, publicKey } = signingKey();
    const now = Date.UTC(2026, 9, 21, 12, 0, 0);
    const secret = appleClientSecret(key, now);
    const [header, payload, signature] = secret.split('.') as [string, string, string];

    expect(decode(header)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    const claims = decode(payload);
    expect(claims).toEqual({
      iss: 'TEAM123456',
      iat: now / 1000,
      exp: now / 1000 + 3_600,
      aud: 'https://appleid.apple.com',
      sub: 'app.hevalo.mobile',
    });
    // Apple refuses a secret that lives longer than six months
    expect((claims.exp as number) - (claims.iat as number)).toBeLessThanOrEqual(180 * 24 * 3_600);

    // a JWT's ES256 signature is the raw 64-byte r‖s, not DER
    const raw = Buffer.from(signature, 'base64url');
    expect(raw).toHaveLength(64);
    expect(verify('SHA256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, raw)).toBe(true);
  });

  it('verifies as a JWT with a standard library, and not with another key', async () => {
    const { key, publicKey } = signingKey();
    const secret = appleClientSecret(key);
    const { protectedHeader } = await compactVerify(secret, publicKey);
    expect(protectedHeader.alg).toBe('ES256');
    await expect(compactVerify(secret, signingKey().publicKey)).rejects.toThrow();
  });
});

describe('the Sign in with Apple key from the environment', () => {
  const { key } = signingKey();
  const base = { APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: key.privateKey };

  it('is null while any of the team, the key id or the key is unset', () => {
    for (const unset of ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'] as const) {
      expect(appleSigningKey(loadConfig({ ...base, [unset]: undefined })), unset).toBeNull();
      expect(appleTokens(loadConfig({ ...base, [unset]: '' }), {} as pg.Pool), unset).toBeNull();
    }
    expect(appleSigningKey(loadConfig({ ...base }))).not.toBeNull();
  });

  it('takes a key written on one line, with "\\n" for its line breaks', () => {
    const oneLine = key.privateKey.trim().replace(/\n/g, '\\n');
    expect(oneLine).not.toContain('\n');
    const parsed = appleSigningKey(loadConfig({ ...base, APPLE_PRIVATE_KEY: oneLine }))!;
    expect(parsed.privateKey).toBe(key.privateKey.trim());
    expect(() => appleClientSecret(parsed)).not.toThrow();
  });

  it('names the client APPLE_CLIENT_ID gives, else the first Apple audience, else the app’s bundle id', () => {
    expect(appleSigningKey(loadConfig({ ...base, APPLE_CLIENT_ID: 'app.hevalo.other', APPLE_CLIENT_IDS: 'x' }))!.clientId).toBe(
      'app.hevalo.other',
    );
    expect(appleSigningKey(loadConfig({ ...base, APPLE_CLIENT_IDS: ' app.hevalo.mobile , app.hevalo.web' }))!.clientId).toBe(
      'app.hevalo.mobile',
    );
    expect(appleSigningKey(loadConfig({ ...base }))!.clientId).toBe(DEFAULT_APPLE_CLIENT_ID);
    expect(DEFAULT_APPLE_CLIENT_ID).toBe('app.hevalo.mobile');
  });
});
