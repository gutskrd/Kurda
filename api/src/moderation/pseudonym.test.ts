import { afterEach, describe, expect, it } from 'vitest';
import { DEV_JWT_SECRET, loadConfig } from '../config/env.js';
import { emailRegistryHash, evidenceObjectKey, normalizeEmailForRegistry, setModerationKey, userHash } from './pseudonym.js';
import { signAppealToken, verifyAppealToken } from './appeal-token.js';
import { issueAccessToken, verifyAccessToken } from '../auth/tokens.js';

describe('pseudonyms', () => {
  afterEach(() => setModerationKey(DEV_JWT_SECRET));

  it('are stable for one key and change with the key', () => {
    const a = userHash('0b5e1c0e-3b8f-4a4e-9d0e-2f1f6f3c9a11');
    expect(userHash('0b5e1c0e-3b8f-4a4e-9d0e-2f1f6f3c9a11')).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    setModerationKey('another-server-secret-that-is-long-enough');
    expect(userHash('0b5e1c0e-3b8f-4a4e-9d0e-2f1f6f3c9a11')).not.toBe(a);
  });

  it('keep the user hash and the email hash apart', () => {
    expect(userHash('x@y.z')).not.toBe(emailRegistryHash('x@y.z'));
  });

  it('give a quarantined file one private address that the public one does not reveal', () => {
    const key = `image-post/${'a'.repeat(64)}.webp`;
    const target = evidenceObjectKey(key);
    expect(target).toMatch(/^quarantine\/[0-9a-f]{40}\/image-post\/a{64}\.webp$/);
    expect(evidenceObjectKey(key)).toBe(target); // the same every time, so a retried move overwrites itself
    setModerationKey('another-server-secret-that-is-long-enough');
    expect(evidenceObjectKey(key)).not.toBe(target);
  });
});

describe('banned-address normalising', () => {
  it('sees through the cheap ways to make "a new address"', () => {
    expect(normalizeEmailForRegistry('  Rojda+again@Example.com ')).toBe('rojda@example.com');
    expect(normalizeEmailForRegistry('ro.j.da+x@googlemail.com')).toBe('rojda@gmail.com');
    expect(normalizeEmailForRegistry('ro.jda@example.com')).toBe('ro.jda@example.com'); // dots matter elsewhere
    expect(emailRegistryHash('Rojda+2@gmail.com')).toBe(emailRegistryHash('r.o.j.d.a@gmail.com'));
  });
});

describe('the appeal token', () => {
  const config = loadConfig({ NODE_ENV: 'test' });
  const user = { id: '0b5e1c0e-3b8f-4a4e-9d0e-2f1f6f3c9a11', token_version: 3 };

  it('names its account and version', async () => {
    const token = await signAppealToken(config, user);
    expect(await verifyAppealToken(config, token)).toEqual({ userId: user.id, tokenVersion: 3 });
  });

  it('is not an access token, and an access token is not one', async () => {
    const appeal = await signAppealToken(config, user);
    expect(await verifyAccessToken(config, appeal)).toBeNull();
    const access = await issueAccessToken(config, { sub: user.id, ver: 3 });
    expect(await verifyAppealToken(config, access)).toBeNull();
  });

  it('refuses a token signed with another secret', async () => {
    const other = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'a-different-secret-that-is-long-enough-xx' });
    expect(await verifyAppealToken(config, await signAppealToken(other, user))).toBeNull();
  });
});
