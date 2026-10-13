import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type pg from 'pg';
import { activate } from './activate.js';
import { pass2fa } from './admin-2fa.js';

/**
 * People for the moderation suites: confirmed accounts with tokens, and admins
 * who have been through the real 2FA flow. Every request gets its own address
 * from a range the suite picks, so per-IP limits on sign-up and sign-in never
 * decide a test's outcome.
 */
export interface Person {
  id: string;
  username: string;
  email: string;
  token: string;
  refreshToken: string;
}

export function moderationKit(app: () => FastifyInstance, pool: () => pg.Pool, prefix: string, net: number) {
  let seq = 0;
  const ip = (): string => {
    seq++;
    return `10.${net}.${Math.floor(seq / 250) % 250}.${(seq % 250) + 1}`;
  };
  const suffix = Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 5);

  async function person(tag: string, birth: { birthYear: number; birthMonth: number } = { birthYear: 1990, birthMonth: 6 }): Promise<Person> {
    const username = `${prefix}${tag}${suffix}`.slice(0, 30);
    const email = `${prefix}_${tag}_${suffix}@it.kurda.app`;
    const res = await app().inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, username, password: 'a-strong-password1', acceptTerms: true, ...birth },
      remoteAddress: ip(),
    });
    if (res.statusCode !== 201) throw new Error(`register ${tag} failed (${res.statusCode}): ${res.body}`);
    await activate(app(), pool(), res);
    const body = res.json() as { user: { id: string }; tokens: { accessToken: string; refreshToken: string } };
    return { id: body.user.id, username, email, token: body.tokens.accessToken, refreshToken: body.tokens.refreshToken };
  }

  async function admin(tag: string, roles: string[]): Promise<Person> {
    const p = await person(tag);
    await pool().query(`UPDATE users SET roles = $2 WHERE id = $1`, [p.id, roles]);
    await pass2fa(app(), p.token, ip());
    return p;
  }

  function call(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    token?: string | null,
    payload?: unknown,
  ): Promise<LightMyRequestResponse> {
    return app().inject({
      method,
      url,
      payload: payload as object | undefined,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      remoteAddress: ip(),
    });
  }

  async function login(p: Pick<Person, 'email'>): Promise<LightMyRequestResponse> {
    return app().inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: p.email, password: 'a-strong-password1' },
      remoteAddress: ip(),
    });
  }

  return { suffix, ip, person, admin, call, login };
}
