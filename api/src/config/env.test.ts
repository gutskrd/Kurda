import { describe, expect, it } from 'vitest';
import { loadConfig, DEV_JWT_SECRET } from './env.js';

describe('loadConfig', () => {
  it('applies defaults for a minimal environment', () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.GIT_SHA).toBe('unknown');
  });

  it('rejects an invalid PORT and names the variable', () => {
    expect(() => loadConfig({ PORT: 'not-a-port' })).toThrow(/PORT/);
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV and names the variable', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging-ish' })).toThrow(/NODE_ENV/);
  });

  it('lists every invalid variable in one error', () => {
    let message = '';
    try {
      loadConfig({ PORT: 'x', LOG_LEVEL: 'shouty' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('PORT');
    expect(message).toContain('LOG_LEVEL');
  });

  it('accepts postgres:// and postgresql:// DATABASE_URL', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' }).DATABASE_URL).toBeDefined();
    expect(loadConfig({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' }).DATABASE_URL).toBeDefined();
  });

  it('rejects a non-postgres DATABASE_URL and names the variable', () => {
    expect(() => loadConfig({ DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow(/DATABASE_URL/);
  });

  it('requires JWT_SECRET in production (no silent dev default)', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(
      loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) }).JWT_SECRET,
    ).toBe('x'.repeat(32));
  });

  it('rejects the built-in dev JWT secret in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: DEV_JWT_SECRET })).toThrow(
      /JWT_SECRET.*development secret/,
    );
    // but it's fine in dev/test (that's the whole point of the default)
    expect(loadConfig({ NODE_ENV: 'development' }).JWT_SECRET).toBe(DEV_JWT_SECRET);
  });

  it('rejects a wildcard CORS_ORIGINS in production', () => {
    const prod = { NODE_ENV: 'production', JWT_SECRET: 'a-real-production-secret-32-chars-long!!' };
    expect(() => loadConfig({ ...prod, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS.*wildcard/);
    expect(() => loadConfig({ ...prod, CORS_ORIGINS: 'https://a.com,*' })).toThrow(/CORS_ORIGINS/);
    // an explicit allowlist is accepted
    expect(
      loadConfig({ ...prod, CORS_ORIGINS: 'https://admin.mykurda.com' }).CORS_ORIGINS,
    ).toBe('https://admin.mykurda.com');
    // wildcard is fine outside production
    expect(loadConfig({ CORS_ORIGINS: '*' }).CORS_ORIGINS).toBe('*');
  });

  it('validates CDN_BASE_URL in production', () => {
    const prod = { NODE_ENV: 'production', JWT_SECRET: 'a-real-production-secret-32-chars-long!!' };
    // a clean public https origin is accepted
    expect(loadConfig({ ...prod, CDN_BASE_URL: 'https://media.mykurda.com' }).CDN_BASE_URL).toBe(
      'https://media.mykurda.com',
    );
    // trailing slash, a path, http, and credentials are all rejected
    expect(() => loadConfig({ ...prod, CDN_BASE_URL: 'https://media.mykurda.com/' })).toThrow(/CDN_BASE_URL.*trailing/);
    expect(() => loadConfig({ ...prod, CDN_BASE_URL: 'https://media.mykurda.com/profile-photo' })).toThrow(
      /CDN_BASE_URL.*path/,
    );
    expect(() => loadConfig({ ...prod, CDN_BASE_URL: 'http://media.mykurda.com' })).toThrow(/CDN_BASE_URL.*https/);
    expect(() => loadConfig({ ...prod, CDN_BASE_URL: 'https://user:pass@media.mykurda.com' })).toThrow(
      /CDN_BASE_URL.*credentials/,
    );
    // must not be the private S3 endpoint
    expect(() =>
      loadConfig({
        ...prod,
        S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
        CDN_BASE_URL: 'https://acct.r2.cloudflarestorage.com',
      }),
    ).toThrow(/CDN_BASE_URL.*private S3/);
  });

  it('boots the local docker-compose shape (prod mode, placeholder secret, no CORS wildcard)', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'local-compose-jwt-secret-change-me-min-32-chars',
        IAP_ALLOW_STUB: 'true',
      }),
    ).not.toThrow();
  });

  it('returns a frozen config object', () => {
    const config = loadConfig({});
    expect(Object.isFrozen(config)).toBe(true);
  });
});
