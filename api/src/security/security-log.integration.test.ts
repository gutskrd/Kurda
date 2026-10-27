/**
 * The security log against real Postgres: what each sign-in, failure, lock,
 * probe and change of access leaves behind; that nothing in it can be rewritten
 * or erased early; that the console reads it only for superadmins; and that a
 * critical event is emailed once, with nothing from the log in the email.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';
import { networkHashOf } from '../net/network-key.js';
import { SecurityAlerts } from './alerts.js';

const DATABASE_URL = process.env.DATABASE_URL;
const PASSWORD = 'a-strong-password1';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface LoggedEvent {
  id: string;
  kind: string;
  severity: string;
  user: { id: string; username: string | null } | null;
  network: string | null;
  country: string | null;
  device: string | null;
  details: Record<string, unknown>;
  hasAddress: boolean;
  alert: { reviewedAt: string | null; emailedAt: string | null } | null;
}

async function eventually<T>(fn: () => Promise<T>, ok: (v: T) => boolean, tries = 60, delayMs = 25): Promise<T> {
  let value = await fn();
  for (let i = 0; i < tries && !ok(value); i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    value = await fn();
  }
  return value;
}

describe.skipIf(!DATABASE_URL)('the security log (integration)', () => {
  const s = Date.now().toString(36);
  const sent: Array<{ to: string; vars: { headline: string; list: string; link: string } }> = [];
  const mailer = { send: async (to: string, vars: { headline: string; list: string; link: string }) => void sent.push({ to, vars }) };
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal', ADMIN_BASE_URL: 'https://admin.example' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let n = 0;
  const ip = (): string => `10.207.${Math.floor((n += 1) / 250)}.${(n % 250) + 1}`;
  const started = new Date();

  const owner = { email: `secown_${s}@it.kurda.app`, id: '', token: '' };
  const member = { email: `secmem_${s}@it.kurda.app`, id: '', token: '', refresh: '' };
  const moderator = { email: `secmod_${s}@it.kurda.app`, id: '', token: '' };

  async function register(person: { email: string; id: string; token: string; refresh?: string }): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: person.email, username: person.email.split('@')[0]!.slice(0, 30), password: PASSWORD, acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: ip(),
    });
    expect(res.statusCode, res.body).toBe(201);
    await activate(app, pool, res);
    person.id = res.json().user.id;
    person.token = res.json().tokens.accessToken;
    if ('refresh' in person) person.refresh = res.json().tokens.refreshToken;
  }

  const login = (email: string, password: string, from: string, headers: Record<string, string> = {}, url = '/auth/login') =>
    app.inject({ method: 'POST', url, payload: { email, password }, remoteAddress: from, headers: { 'user-agent': CHROME, ...headers } });

  const asOwner = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${owner.token}` }, payload: payload as object, remoteAddress: '10.207.250.1' });

  const events = async (query: string): Promise<LoggedEvent[]> => {
    const res = await asOwner('GET', `/admin/security/events?${query}`);
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { events: LoggedEvent[] }).events;
  };

  beforeAll(async () => {
    app = buildApp(config, { security: { mailer } });
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await register(owner);
    await register(member);
    await register(moderator);
    await pool.query(`UPDATE users SET roles = '{admin,superadmin}' WHERE id = $1`, [owner.id]);
    await pool.query(`UPDATE users SET roles = '{moderator}' WHERE id = $1`, [moderator.id]);
    await pass2fa(app, owner.token, '10.207.250.1');
    await pass2fa(app, moderator.token, '10.207.250.2');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[owner.email, member.email, moderator.email]]);
    await pool.end();
    await app.close();
  });

  it('records a wrong password and a right one, with where they came from and nothing secret', async () => {
    const from = ip();
    expect((await login(member.email, 'not-the-password1', from, { 'cf-ipcountry': 'DE' })).statusCode).toBe(401);
    expect((await login(member.email, PASSWORD, from)).statusCode).toBe(200);

    const mine = await events(`userId=${member.id}&kind=signin.`);
    const failed = mine.find((e) => e.kind === 'signin.failed')!;
    expect(failed).toMatchObject({ severity: 'notice', network: networkHashOf(from), device: 'Chrome on Windows', hasAddress: true });
    expect(failed.details).toMatchObject({ reason: 'wrong-password', route: 'POST /auth/login' });
    // a country is believed only from a Cloudflare edge this server trusts, never from the caller
    expect(failed.country).toBeNull();
    expect(mine.some((e) => e.kind === 'signin.succeeded')).toBe(true);
    // never the address in the clear, the email, or the password
    const text = JSON.stringify(mine);
    expect(text).not.toContain(from);
    expect(text).not.toContain(member.email);
    expect(text).not.toContain('not-the-password1');
  });

  it('says which check refused a sign-up', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `throwaway_${s}@mailinator.com`, username: `throwaway_${s}`.slice(0, 30), password: PASSWORD, acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: ip(),
    });
    expect(res.json().code).toBe('SIGNUP_REJECTED');
    const refused = await events(`kind=signup.rejected&since=${started.toISOString()}`);
    expect(refused.some((e) => e.details.why === 'throwaway email address')).toBe(true);
  });

  it('ends a session whose old key comes back, and records it', async () => {
    const first = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: member.refresh }, remoteAddress: ip() });
    expect(first.statusCode).toBe(200);
    const again = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: member.refresh }, remoteAddress: ip() });
    expect(again.json().code).toBe('REFRESH_REUSED');
    const reused = await events(`userId=${member.id}&kind=session.reused`);
    expect(reused).toHaveLength(1);
    // a warning: on the list until someone has looked
    expect(reused[0]).toMatchObject({ severity: 'warning', alert: { reviewedAt: null } });
  });

  it('notes an ordinary account trying admin pages, once an hour', async () => {
    // signed in afresh: the session before was ended when its old key came back
    const token = (await login(member.email, PASSWORD, ip())).json().tokens.accessToken as string;
    const probe = () => app.inject({ method: 'GET', url: '/admin/users', headers: { authorization: `Bearer ${token}` }, remoteAddress: ip() });
    expect((await probe()).statusCode).toBe(404);
    expect((await probe()).statusCode).toBe(404);
    const probes = await eventually(
      () => events(`userId=${member.id}&kind=console.probe&since=${started.toISOString()}`),
      (list) => list.length > 0,
    );
    expect(probes).toHaveLength(1);
    expect(probes[0]!.severity).toBe('warning');
  });

  it('records a request slowed down, once per network and page', async () => {
    const from = ip();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await login(`nobody_${s}_${i}@it.kurda.app`, 'wrong-password1', from)).statusCode);
    expect(statuses.filter((c) => c === 429).length).toBeGreaterThanOrEqual(2);
    const limited = await eventually(
      async () => (await events(`kind=request.rate_limited&network=${networkHashOf(from)}&since=${started.toISOString()}`)).length,
      (count) => count > 0,
    );
    expect(limited).toBe(1);
  });

  it('records the console’s sign-in, emails the owner about a new place once, and never puts the log in the email', async () => {
    // a member with the right password is refused, as a wrong password would be
    const refused = await login(member.email, PASSWORD, ip(), {}, '/admin/auth/login');
    expect(refused.statusCode).toBe(401);
    expect((await events(`userId=${member.id}&kind=console.signin_refused`))[0]).toMatchObject({ severity: 'warning' });

    // let the gap between alert emails lapse, so this test's email is the next one
    await pool.query(`UPDATE security_alerts SET emailed_at = now() - interval '1 day' WHERE emailed_at > now() - interval '1 day'`);
    sent.length = 0;
    const from = ip();
    const signedIn = await login(owner.email, PASSWORD, from, { 'x-device-id': `console-${s}` }, '/admin/auth/login');
    expect(signedIn.statusCode, signedIn.body).toBe(200);
    const newPlace = (await events(`userId=${owner.id}&kind=console.signin_new_device`))[0]!;
    expect(newPlace.severity).toBe('critical');
    await eventually(
      async () => sent.length,
      (count) => count > 0,
    );
    const mail = sent.find((m) => m.to === owner.email)!;
    expect(mail.vars.headline).toBe('Admin console sign-in from a new device or network');
    expect(mail.vars.link).toBe('https://admin.example/#/security-log');
    expect(JSON.stringify(mail)).not.toContain(from);

    // a second one inside the gap waits for the sweep, and is not sent twice
    const second = await login(owner.email, PASSWORD, ip(), { 'x-device-id': `console2-${s}` }, '/admin/auth/login');
    expect(second.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    const before = sent.length;
    const alerts = new SecurityAlerts(pool, mailer, 'https://admin.example');
    expect(await alerts.sendDue()).toBe(0);
    await pool.query(`UPDATE security_alerts SET emailed_at = now() - interval '1 day' WHERE emailed_at > now() - interval '1 day'`);
    expect(await alerts.sendDue()).toBeGreaterThan(0);
    expect(await alerts.sendDue()).toBe(0);
    expect(sent.length).toBeGreaterThan(before);
  });

  it('records wrong two-step codes as a warning', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/auth/verify',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { code: '000000' },
      remoteAddress: ip(),
    });
    expect(res.statusCode).toBe(401);
    expect((await events(`userId=${owner.id}&kind=console.2fa_failed`))[0]).toMatchObject({ severity: 'warning', details: { step: 'sign-in' } });
    // and the setup that opened the console before it
    expect((await events(`userId=${owner.id}&kind=console.2fa_enrolled`)).length).toBe(1);
  });

  it('sums up the last day, filters by how serious, marks alerts reviewed', async () => {
    const summary = (await asOwner('GET', '/admin/security/summary')).json();
    expect(summary.counts.total).toBeGreaterThan(0);
    expect(summary.failedSignIns.now).toBeGreaterThan(0);
    expect(summary.hourly.length).toBeGreaterThanOrEqual(24);
    expect(summary.open.critical).toBeGreaterThan(0);
    expect(summary.lastConsoleSignIn).not.toBeNull();

    const serious = await events('severity=warning&limit=200');
    expect(serious.every((e) => e.severity === 'warning' || e.severity === 'critical')).toBe(true);

    const reviewed = await asOwner('POST', '/admin/security/alerts/review', { kind: 'console.signin_new_device', note: 'it was me' });
    expect(reviewed.json().reviewed).toBeGreaterThan(0);
    const open = await events(`open=true&kind=console.signin_new_device`);
    expect(open).toHaveLength(0);
    // asking for no alerts at all, or for two ways at once, is refused
    expect((await asOwner('POST', '/admin/security/alerts/review', {})).statusCode).toBe(400);
    expect((await asOwner('POST', '/admin/security/alerts/review', { all: true, kind: 'signin.failed' })).statusCode).toBe(400);
  });

  it('shows the address an event came from only with a reason, and records that it did', async () => {
    const from = ip();
    await login(member.email, 'wrong-again-1', from);
    const event = (await events(`userId=${member.id}&kind=signin.failed&network=${networkHashOf(from)}`))[0]!;
    expect((await asOwner('POST', `/admin/security/events/${event.id}/reveal-address`, { reason: '' })).statusCode).toBe(400);
    const revealed = await asOwner('POST', `/admin/security/events/${event.id}/reveal-address`, { reason: 'checking failed sign-ins' });
    expect(revealed.json()).toEqual({ address: from });
    const record = (await events(`kind=console.ip_revealed&userId=${member.id}`))[0]!;
    expect(record.details).toMatchObject({ eventId: event.id, reason: 'checking failed sign-ins', found: true });
    // and the admin trail has it too
    const audit = await eventually(
      async () => (await pool.query(`SELECT 1 FROM admin_audit_log WHERE admin_id = $1 AND target_id = $2`, [owner.id, event.id])).rowCount,
      (count) => (count ?? 0) > 0,
    );
    expect(audit).toBe(1);
  });

  it('is for superadmins only', async () => {
    const asModerator = await app.inject({
      method: 'GET',
      url: '/admin/security/events',
      headers: { authorization: `Bearer ${moderator.token}` },
      remoteAddress: '10.207.250.2',
    });
    expect(asModerator.statusCode).toBe(403);
    const signedOut = await app.inject({ method: 'GET', url: '/admin/security/summary', remoteAddress: ip() });
    expect(signedOut.statusCode).toBe(401);
  });

  it('cannot be rewritten, and keeps every event for its whole retention', async () => {
    const event = (await events(`userId=${member.id}&kind=signin.failed`))[0]!;
    await expect(pool.query(`UPDATE security_events SET kind = 'signin.succeeded' WHERE id = $1`, [event.id])).rejects.toThrow(/append-only/);
    await expect(pool.query(`UPDATE security_events SET ip_sealed = 'v1.x.y.z' WHERE id = $1`, [event.id])).rejects.toThrow(/append-only/);
    await expect(pool.query(`DELETE FROM security_events WHERE id = $1`, [event.id])).rejects.toThrow(/retention/);
    // forgetting the address is the one change it allows
    await pool.query(`UPDATE security_events SET ip_sealed = NULL WHERE id = $1`, [event.id]);
    expect((await asOwner('POST', `/admin/security/events/${event.id}/reveal-address`, { reason: 'checking again' })).json()).toEqual({ address: null });

    // past its retention an event can go: a routine one after 90 days, a warning after a year
    const old = await pool.query<{ id: string }>(
      `INSERT INTO security_events (occurred_at, kind, severity, category) VALUES
         (now() - interval '91 days', 'signin.failed', 'notice', 'sign-in'),
         (now() - interval '91 days', 'signin.locked', 'warning', 'sign-in')
       RETURNING id`,
    );
    const [routine, serious] = old.rows.map((r) => r.id);
    await pool.query(`DELETE FROM security_events WHERE id = $1`, [routine]);
    await expect(pool.query(`DELETE FROM security_events WHERE id = $1`, [serious])).rejects.toThrow(/retention/);
    // the purge leaves the young warning alone too
    const purged = await pool.query(`SELECT count(*)::int AS n FROM security_events WHERE id = $1`, [serious]);
    expect(purged.rows[0]!.n).toBe(1);
  });
});
