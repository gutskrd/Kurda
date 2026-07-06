import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/env.js';
import { registerBodySchema } from './routes.js';
import { hashPassword, verifyPassword } from './service.js';
import { hashRefreshToken, issueAccessToken, verifyAccessToken } from './tokens.js';

const config = loadConfig({ NODE_ENV: 'test' });

describe('password hashing', () => {
  it('hashes with argon2id and verifies round-trip', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toContain('$argon2id$');
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(hash, 'wrong password')).toBe(false);
  });

  it('verify never throws on malformed hashes', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});

describe('access tokens', () => {
  it('issues and verifies claims', async () => {
    const token = await issueAccessToken(config, { sub: 'user-1', ver: 3 });
    const claims = await verifyAccessToken(config, token);
    expect(claims).toEqual({ sub: 'user-1', ver: 3 });
  });

  it('rejects tampered tokens', async () => {
    const token = await issueAccessToken(config, { sub: 'user-1', ver: 0 });
    expect(await verifyAccessToken(config, token + 'x')).toBeNull();
    expect(await verifyAccessToken(config, 'garbage')).toBeNull();
  });

  it('rejects tokens signed with another secret', async () => {
    const other = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(32) });
    const token = await issueAccessToken(other, { sub: 'user-1', ver: 0 });
    expect(await verifyAccessToken(config, token)).toBeNull();
  });
});

describe('refresh token hashing', () => {
  it('is deterministic and irreversible-shaped', () => {
    expect(hashRefreshToken('abc')).toBe(hashRefreshToken('abc'));
    expect(hashRefreshToken('abc')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRefreshToken('abc')).not.toContain('abc');
  });
});

describe('registerBodySchema', () => {
  const valid = { email: 'rojda@example.com', username: 'rojda', password: 'longenough1' };

  it('accepts a valid payload', () => {
    expect(registerBodySchema.safeParse(valid).success).toBe(true);
  });

  it('rejects short passwords, bad emails, bad locales', () => {
    expect(registerBodySchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    expect(registerBodySchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false);
    expect(registerBodySchema.safeParse({ ...valid, locale: 'xx' }).success).toBe(false);
  });
});
