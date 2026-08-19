/** OAuth sign-in logic against real Postgres with locally-signed provider
 *  tokens (injected JWKS — no network). CI integration job. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from 'jose';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';
import { OAuthService, type OAuthProvider } from './oauth.js';
import { hashPassword } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('OAuth sign-in (integration)', () => {
  const config = loadConfig({
    DATABASE_URL,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    GOOGLE_CLIENT_IDS: 'kurda-web,kurda-ios',
    APPLE_CLIENT_IDS: 'app.kurda.mobile',
  });
  let pool: pg.Pool;
  let service: OAuthService;
  let privateKey: CryptoKey;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey as CryptoKey;
    const getKey: JWTVerifyGetKey = async () => pair.publicKey;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    service = new OAuthService(config, pool, () => getKey);
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM users WHERE email LIKE '%_${suffix}@%' OR username LIKE '%_${suffix}%'`,
    );
    await pool.end();
  });

  interface TokenOpts {
    sub: string;
    email?: string;
    emailVerified?: boolean | 'true';
    name?: string;
    aud?: string;
    iss?: string;
    expired?: boolean;
  }

  function makeToken(provider: OAuthProvider, opts: TokenOpts): Promise<string> {
    const iss =
      opts.iss ?? (provider === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com');
    const aud = opts.aud ?? (provider === 'google' ? 'kurda-ios' : 'app.kurda.mobile');
    const jwt = new SignJWT({
      ...(opts.email ? { email: opts.email } : {}),
      ...(opts.emailVerified !== undefined ? { email_verified: opts.emailVerified } : {}),
      ...(opts.name ? { name: opts.name } : {}),
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(opts.sub)
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt(opts.expired ? Math.floor(Date.now() / 1000) - 7200 : undefined)
      .setExpirationTime(opts.expired ? Math.floor(Date.now() / 1000) - 3600 : '1h');
    return jwt.sign(privateKey);
  }

  it('creates a new account on first Google sign-in', async () => {
    const token = await makeToken('google', {
      sub: `g-new-${suffix}`,
      email: `şêrîn_${suffix}@gmail.com`,
      emailVerified: true,
      name: 'Şêrîn Amed',
    });
    const result = await service.signIn('google', token, 'Pixel 9');
    expect(result.created).toBe(true);
    expect(result.tokens.accessToken).toBeDefined();
    expect(result.user.username.length).toBeGreaterThanOrEqual(3);

    const identity = await pool.query(
      `SELECT user_id FROM oauth_identities WHERE provider = 'google' AND provider_user_id = $1`,
      [`g-new-${suffix}`],
    );
    expect(identity.rows[0].user_id).toBe(result.user.id);
    const u = await pool.query(`SELECT email_verified_at FROM users WHERE id = $1`, [result.user.id]);
    expect(u.rows[0].email_verified_at).not.toBeNull();
  });

  it('second sign-in with the same provider account logs into the same user', async () => {
    const token = await makeToken('google', {
      sub: `g-new-${suffix}`,
      email: `şêrîn_${suffix}@gmail.com`,
      emailVerified: true,
    });
    const result = await service.signIn('google', token);
    expect(result.created).toBe(false);
  });

  it('links to an existing password account only when our email is verified', async () => {
    const email = `linked_${suffix}@gmail.com`;
    const created = await pool.query(
      `INSERT INTO users (email, username, password_hash, email_verified_at)
       VALUES ($1, $2, $3, now()) RETURNING id`,
      [email, `linked_${suffix}`.slice(0, 30), await hashPassword('a-strong-password1')],
    );
    const token = await makeToken('google', { sub: `g-link-${suffix}`, email, emailVerified: true });
    const result = await service.signIn('google', token);
    expect(result.created).toBe(false);
    expect(result.user.id).toBe(created.rows[0].id);
  });

  it('refuses to link when our account email is unverified (takeover guard)', async () => {
    const email = `unverified_${suffix}@gmail.com`;
    await pool.query(
      `INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3)`,
      [email, `unver_${suffix}`.slice(0, 30), await hashPassword('a-strong-password1')],
    );
    const token = await makeToken('google', { sub: `g-unver-${suffix}`, email, emailVerified: true });
    await expect(service.signIn('google', token)).rejects.toMatchObject({
      code: 'LINK_REQUIRES_VERIFIED_EMAIL',
    });
  });

  it('rejects wrong audience, wrong issuer and expired tokens', async () => {
    const wrongAud = await makeToken('google', { sub: 'x', aud: 'evil-client' });
    const wrongIss = await makeToken('google', { sub: 'x', iss: 'https://evil.example' });
    const expired = await makeToken('google', { sub: 'x', expired: true });
    for (const token of [wrongAud, wrongIss, expired]) {
      await expect(service.signIn('google', token)).rejects.toMatchObject({
        code: 'INVALID_OAUTH_TOKEN',
      });
    }
  });

  it('handles Apple relay emails and string email_verified', async () => {
    const token = await makeToken('apple', {
      sub: `a-relay-${suffix}`,
      email: `relay_${suffix}@privaterelay.appleid.com`,
      emailVerified: 'true',
    });
    const result = await service.signIn('apple', token);
    expect(result.created).toBe(true);
    expect(result.user.email).toContain('privaterelay.appleid.com');
  });

  it('disabled linked accounts cannot sign in', async () => {
    const token = await makeToken('google', {
      sub: `g-banned-${suffix}`,
      email: `banned_${suffix}@gmail.com`,
      emailVerified: true,
    });
    const first = await service.signIn('google', token);
    await pool.query(`UPDATE users SET banned_at = now() WHERE id = $1`, [first.user.id]);
    await expect(service.signIn('google', token)).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
  });

  it('route returns 503 OAUTH_NOT_CONFIGURED without client ids', async () => {
    const bare = buildApp(loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' }));
    const res = await bare.inject({
      method: 'POST',
      url: '/auth/oauth',
      payload: { provider: 'google', idToken: 'x'.repeat(40) },
      remoteAddress: '10.8.0.1',
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('OAUTH_NOT_CONFIGURED');
    await (bare as FastifyInstance).close();
  });

  it('AppError shape sanity', () => {
    expect(new AppError('X', 400, 'y').statusCode).toBe(400);
  });
});
