/**
 * Sign in with Apple's refresh token, kept at sign-in and revoked when the
 * account is deleted for good (App Store guideline 5.1.1(v)), against real
 * Postgres. Apple is stood in for: its signing keys, its token endpoint and its
 * revoke endpoint answer from here, and every request to them is recorded.
 */
import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { compactVerify, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { GdprService } from '../gdpr/service.js';
import { seal, unseal } from '../security/at-rest.js';
import { bornYearsAgo } from '../test/age.js';
import { APPLE_REVOKE_URL, APPLE_TOKEN_URL, appleTokens } from './apple-tokens.js';
import { OAuthService } from './oauth.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('Sign in with Apple tokens (integration)', () => {
  // the deployment's Sign in with Apple key: a P-256 key, as Apple's .p8 is
  const appleKey = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = appleKey.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const base = { DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal', APPLE_CLIENT_IDS: 'app.hevalo.mobile' } as const;
  const config = loadConfig({
    ...base,
    APPLE_TEAM_ID: 'TEAM123456',
    APPLE_KEY_ID: 'KEY1234567',
    // as a one-line dashboard holds it
    APPLE_PRIVATE_KEY: pem.trim().replace(/\n/g, '\\n'),
  });
  const unconfigured = loadConfig(base);
  const suffix = Date.now().toString(36);
  let app: FastifyInstance;
  let bare: FastifyInstance;
  let pool: pg.Pool;
  let identityKey: CryptoKey;
  let getKey: JWTVerifyGetKey;
  let ip = 0;
  const accounts: string[] = [];

  /** A request that reached "Apple", and whether the identity was still there when it did. */
  interface AppleCall {
    url: string;
    form: URLSearchParams;
    identityExisted: boolean;
  }
  const calls: AppleCall[] = [];
  const refreshTokenFor = (code: string) => `rt-${code}`;
  let tokenAnswer: (form: URLSearchParams) => Response;
  let revokeAnswer: () => Response;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    const identity = await generateKeyPair('RS256', { extractable: true });
    identityKey = identity.privateKey;
    getKey = async () => identity.publicKey;
    const jwk = { ...(await exportJWK(identity.publicKey)), kid: 'apple-test', alg: 'RS256', use: 'sig' };
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://appleid.apple.com/auth/keys') return Response.json({ keys: [jwk] });
      if (url !== APPLE_TOKEN_URL && url !== APPLE_REVOKE_URL) return realFetch(input, init);
      const form = new URLSearchParams(String(init?.body));
      // the revoked token names the identity it was kept on (see refreshTokenFor)
      const sub = (form.get('token') ?? '').replace(/^rt-code-\d+-/, '');
      const existing = await pool.query(`SELECT 1 FROM oauth_identities WHERE provider = 'apple' AND provider_user_id = $1`, [sub]);
      calls.push({ url, form, identityExisted: (existing.rowCount ?? 0) > 0 });
      return url === APPLE_TOKEN_URL ? tokenAnswer(form) : revokeAnswer();
    });
    app = buildApp(config);
    bare = buildApp(unconfigured);
    await Promise.all([app.ready(), bare.ready()]);
  });

  beforeEach(() => {
    calls.length = 0;
    tokenAnswer = (form) =>
      Response.json({ access_token: 'at', token_type: 'Bearer', expires_in: 3600, refresh_token: refreshTokenFor(form.get('code')!) });
    revokeAnswer = () => new Response(null, { status: 200 });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await Promise.all([app.close(), bare.close()]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [accounts]);
    await pool.end();
  });

  const subOf = (tag: string) => `apple-${tag}-${suffix}`;
  let codes = 0;
  const codeFor = (tag: string) => `code-${++codes}-${subOf(tag)}`;

  function identityToken(tag: string): Promise<string> {
    return new SignJWT({ email: `${subOf(tag)}@privaterelay.appleid.com`, email_verified: 'true' })
      .setProtectedHeader({ alg: 'RS256', kid: 'apple-test' })
      .setSubject(subOf(tag))
      .setIssuer('https://appleid.apple.com')
      .setAudience('app.hevalo.mobile')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(identityKey);
  }

  async function signIn(target: FastifyInstance, tag: string, extra: Record<string, unknown> = {}) {
    const res = await target.inject({
      method: 'POST',
      url: '/auth/oauth',
      payload: { provider: 'apple', idToken: await identityToken(tag), ...extra },
      remoteAddress: `10.193.${++ip}.1`,
    });
    if (res.statusCode === 200 || res.statusCode === 201) {
      if (!accounts.includes(res.json().user.id)) accounts.push(res.json().user.id);
    }
    return res;
  }

  async function kept(tag: string): Promise<string | null> {
    const row = await pool.query<{ refresh_token_sealed: string | null }>(
      `SELECT refresh_token_sealed FROM oauth_identities WHERE provider = 'apple' AND provider_user_id = $1`,
      [subOf(tag)],
    );
    return row.rows[0]?.refresh_token_sealed ?? null;
  }

  const keptToken = async (tag: string) => {
    const sealed = await kept(tag);
    return sealed === null ? null : unseal(config.JWT_SECRET, 'apple-refresh-token', sealed);
  };

  /** The account's grace period over, as two weeks and a day after DELETE /me. */
  async function deletionDue(userId: string): Promise<void> {
    await pool.query(`UPDATE users SET deletion_requested_at = now() - interval '15 days' WHERE id = $1`, [userId]);
  }

  const clientSecretClaims = async (form: URLSearchParams) =>
    JSON.parse(new TextDecoder().decode((await compactVerify(form.get('client_secret')!, appleKey.publicKey)).payload)) as Record<
      string,
      unknown
    >;

  it('exchanges the authorization code on sign-in and keeps the refresh token, encrypted', async () => {
    const code = codeFor('kept');
    const res = await signIn(app, 'kept', { authorizationCode: code, fullName: '  Rojda   Amed ' });
    expect(res.statusCode, res.body).toBe(201);
    // Apple's token carries no name: the one the app passed on names the new account
    expect(res.json().user.displayName).toBe('Rojda Amed');

    await vi.waitFor(async () => expect(await kept('kept')).not.toBeNull());
    const exchange = calls.filter((c) => c.url === APPLE_TOKEN_URL);
    expect(exchange).toHaveLength(1);
    const form = exchange[0]!.form;
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe(code);
    expect(form.get('client_id')).toBe('app.hevalo.mobile');
    expect(await clientSecretClaims(form)).toMatchObject({
      iss: 'TEAM123456',
      sub: 'app.hevalo.mobile',
      aud: 'https://appleid.apple.com',
    });

    // never in the clear, and only this server's secret opens it
    const sealed = (await kept('kept'))!;
    expect(sealed).not.toContain(refreshTokenFor(code));
    expect(unseal(config.JWT_SECRET, 'apple-refresh-token', sealed)).toBe(refreshTokenFor(code));
    expect(unseal('another-server-secret-of-32-characters!', 'apple-refresh-token', sealed)).toBeNull();
  });

  it('keeps the newest token on a later sign-in, and never renames the account', async () => {
    const code = codeFor('kept');
    const res = await signIn(app, 'kept', { authorizationCode: code, fullName: 'Somebody Else' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().user.displayName).toBe('Rojda Amed');
    await vi.waitFor(async () => expect(await keptToken('kept')).toBe(refreshTokenFor(code)));
  });

  it('names a new account from its email when Apple shared no name', async () => {
    const res = await signIn(app, 'nameless', { fullName: '   ' });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().user.displayName).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('signs in all the same when Apple refuses the code or cannot be reached', async () => {
    tokenAnswer = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    const refused = await signIn(app, 'refused', { authorizationCode: codeFor('refused') });
    expect(refused.statusCode, refused.body).toBe(201);
    expect(refused.json().tokens.accessToken).toBeDefined();
    await vi.waitFor(() => expect(calls.filter((c) => c.url === APPLE_TOKEN_URL)).toHaveLength(1));

    tokenAnswer = () => {
      throw new TypeError('fetch failed');
    };
    const unreachable = await signIn(app, 'refused', { authorizationCode: codeFor('refused') });
    expect(unreachable.statusCode, unreachable.body).toBe(200);
    await vi.waitFor(() => expect(calls.filter((c) => c.url === APPLE_TOKEN_URL)).toHaveLength(2));
    expect(await kept('refused')).toBeNull();
  });

  it('logs a refused exchange as a warning, without the code', async () => {
    tokenAnswer = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    const warn = vi.fn();
    const service = new OAuthService(config, pool, () => getKey, appleTokens(config, pool, { log: { warn } }));
    const code = codeFor('warned');
    const result = await service.signIn('apple', await identityToken('warned'), undefined, null, { authorizationCode: code });
    accounts.push(result.user.id);
    expect(result.tokens.accessToken).toBeDefined();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(warn.mock.calls[0]![0]).toEqual({ status: 400, error: 'invalid_grant' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(code);
  });

  it('takes neither a code nor a name with Google sign-in', async () => {
    for (const extra of [{ authorizationCode: 'code' }, { fullName: 'Rojda Amed' }]) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/oauth',
        payload: { provider: 'google', idToken: 'x'.repeat(40), ...extra },
        remoteAddress: `10.193.${++ip}.1`,
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('revokes the kept token at Apple when the deletion becomes final, before the identity goes', async () => {
    const code = codeFor('deleted');
    const signedIn = await signIn(app, 'deleted', { authorizationCode: code });
    const userId = signedIn.json().user.id as string;
    await vi.waitFor(async () => expect(await kept('deleted')).not.toBeNull());
    // an Apple account that never had a token kept has nothing to revoke
    const untokened = (await signIn(app, 'untokened')).json().user.id as string;

    const del = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: { authorization: `Bearer ${signedIn.json().tokens.accessToken}` },
      remoteAddress: `10.193.${++ip}.1`,
    });
    expect(del.statusCode).toBe(200);
    // the grace period: nothing is revoked while the account can still come back
    expect(calls.filter((c) => c.url === APPLE_REVOKE_URL)).toHaveLength(0);

    await deletionDue(userId);
    await deletionDue(untokened);
    await new GdprService(pool, { apple: appleTokens(config, pool) }).anonymizeExpired();

    const revokes = calls.filter((c) => c.url === APPLE_REVOKE_URL);
    const ours = revokes.filter((c) => c.form.get('token') === refreshTokenFor(code));
    expect(ours).toHaveLength(1);
    expect(ours[0]!.identityExisted).toBe(true);
    const form = ours[0]!.form;
    expect(form.get('token_type_hint')).toBe('refresh_token');
    expect(form.get('client_id')).toBe('app.hevalo.mobile');
    expect(await clientSecretClaims(form)).toMatchObject({ iss: 'TEAM123456', sub: 'app.hevalo.mobile' });
    expect(revokes.filter((c) => c.form.get('token')?.endsWith(subOf('untokened')))).toHaveLength(0);

    for (const id of [userId, untokened]) {
      const user = await pool.query(`SELECT deleted_at FROM users WHERE id = $1`, [id]);
      expect(user.rows[0].deleted_at).not.toBeNull();
      const identities = await pool.query(`SELECT 1 FROM oauth_identities WHERE user_id = $1`, [id]);
      expect(identities.rowCount).toBe(0);
    }
  });

  it('deletes the account all the same when Apple will not revoke', async () => {
    revokeAnswer = () => Response.json({ error: 'invalid_client' }, { status: 400 });
    const code = codeFor('stubborn');
    const userId = (await signIn(app, 'stubborn', { authorizationCode: code })).json().user.id as string;
    await vi.waitFor(async () => expect(await kept('stubborn')).not.toBeNull());
    await deletionDue(userId);
    const warn = vi.fn();
    await new GdprService(pool, { apple: appleTokens(config, pool, { log: { warn } }) }).anonymizeExpired();

    expect(calls.filter((c) => c.form.get('token') === refreshTokenFor(code))).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ userId, status: 400, error: 'invalid_client' }), expect.any(String));
    const user = await pool.query(`SELECT deleted_at FROM users WHERE id = $1`, [userId]);
    expect(user.rows[0].deleted_at).not.toBeNull();
  });

  it('revokes at once when a child’s account is closed', async () => {
    const code = codeFor('child');
    const signedIn = await signIn(app, 'child', { authorizationCode: code });
    expect(signedIn.json().user.birthDateRequired).toBe(true);
    await vi.waitFor(async () => expect(await kept('child')).not.toBeNull());

    const res = await app.inject({
      method: 'POST',
      url: '/me/birth-date',
      headers: { authorization: `Bearer ${signedIn.json().tokens.accessToken}` },
      payload: bornYearsAgo(10),
      remoteAddress: `10.193.${++ip}.1`,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'UNDER_MINIMUM_AGE', details: { accountClosed: true } });

    const revoked = calls.filter((c) => c.url === APPLE_REVOKE_URL && c.form.get('token') === refreshTokenFor(code));
    expect(revoked).toHaveLength(1);
    expect(revoked[0]!.identityExisted).toBe(true);
    expect(await kept('child')).toBeNull();
  });

  it('exchanges and revokes nothing without Apple’s key', async () => {
    expect(appleTokens(unconfigured, pool)).toBeNull();
    const res = await signIn(bare, 'unkeyed', { authorizationCode: codeFor('unkeyed'), fullName: 'Rojda Amed' });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().user.displayName).toBe('Rojda Amed');
    const userId = res.json().user.id as string;

    // a token kept while a key was configured, which nothing here may now spend
    await pool.query(`UPDATE oauth_identities SET refresh_token_sealed = $2 WHERE user_id = $1`, [
      userId,
      seal(config.JWT_SECRET, 'apple-refresh-token', 'rt-unkeyed'),
    ]);
    await deletionDue(userId);
    await new GdprService(pool, { apple: appleTokens(unconfigured, pool) }).anonymizeExpired();

    const user = await pool.query(`SELECT deleted_at FROM users WHERE id = $1`, [userId]);
    expect(user.rows[0].deleted_at).not.toBeNull();
    // give a stray background exchange the time it would need
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toHaveLength(0);
  });
});
