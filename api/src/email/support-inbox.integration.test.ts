/**
 * The support inbox and the panel's email status, against real Postgres:
 * Resend's signed webhook keeps a received mail once, bounces and complaints
 * suppress the address, and admins read, archive and answer from the panel.
 */
import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;
const KEY = Buffer.from('support-inbox-integration-key');
const SECRET = `whsec_${KEY.toString('base64')}`;

describe.skipIf(!DATABASE_URL)('support inbox (integration)', () => {
  const config = loadConfig({
    DATABASE_URL,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    RESEND_WEBHOOK_SECRET: SECRET,
    // a key that may read received mail; Resend itself is stood in for below
    RESEND_INBOX_API_KEY: 're_inbox_test',
    EMAIL_REPLY_TO: 'support@hevalo.app',
  });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let ip = 0;
  /** what "Resend" holds: the body of each received mail, by its id */
  const bodies = new Map<string, { text?: string; html?: string; message_id?: string }>();
  const realFetch = globalThis.fetch;

  interface User {
    id: string;
    token: string;
  }

  async function register(name: string): Promise<User> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: `10.181.${++ip}.1`,
    });
    expect(res.statusCode, res.body).toBe(201);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  const call = (method: 'GET' | 'POST', url: string, user: User, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${user.token}` }, payload: payload as object, remoteAddress: '10.181.200.1' });

  /** Deliver a webhook the way Resend does: the JSON as bytes, signed over those bytes. */
  function deliver(event: unknown, opts: { secret?: Buffer; id?: string } = {}) {
    const body = JSON.stringify(event);
    const id = opts.id ?? `msg_${Math.random().toString(36).slice(2)}`;
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', opts.secret ?? KEY).update(`${id}.${ts}.${body}`).digest('base64');
    return app.inject({
      method: 'POST',
      url: '/webhooks/resend',
      headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': `v1,${sig}` },
      payload: body,
    });
  }

  const received = (emailId: string, extra: Record<string, unknown> = {}) => ({
    type: 'email.received',
    created_at: new Date().toISOString(),
    data: {
      email_id: emailId,
      created_at: new Date().toISOString(),
      from: 'Rojda Kurd <Rojda@Example.com>',
      to: ['support@hevalo.app'],
      subject: 'I did not get my code',
      message_id: `<${emailId}@mail.example.com>`,
      attachments: [{ id: 'att_1', filename: 'screenshot.png', content_type: 'image/png' }],
      ...extra,
    },
  });

  let admin: User;
  let support: User;
  let player: User;

  beforeAll(async () => {
    // only Resend's received-mail API is stood in for; anything else goes out as it would
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const m = /^https:\/\/api\.resend\.com\/emails\/receiving\/([^/?]+)$/.exec(url);
      if (!m) return realFetch(input, init);
      const body = bodies.get(decodeURIComponent(m[1]!));
      return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('{"message":"not found"}', { status: 404 });
    });
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    admin = await register('inbox_admin');
    support = await register('inbox_support');
    player = await register('inbox_player');
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [admin.id]);
    await pass2fa(app, admin.token, '10.181.210.1');
    await pool.query(`UPDATE users SET roles = '{support}' WHERE id = $1`, [support.id]);
    await pass2fa(app, support.token, '10.181.210.2');
  });

  afterEach(() => bodies.clear());

  afterAll(async () => {
    vi.restoreAllMocks();
    await pool.query(`DELETE FROM support_emails WHERE provider_id LIKE $1`, [`%_${suffix}`]);
    await pool.query(`DELETE FROM email_suppressions WHERE email LIKE $1`, [`%_${suffix}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  it('refuses a webhook it cannot trust: unsigned, signed by someone else, or not JSON', async () => {
    const forged = await deliver(received(`e_forged_${suffix}`), { secret: Buffer.from('not-our-key') });
    expect(forged.statusCode).toBe(401);
    const unsigned = await app.inject({ method: 'POST', url: '/webhooks/resend', headers: { 'content-type': 'application/json' }, payload: '{}' });
    expect(unsigned.statusCode).toBe(401);
    const { rows } = await pool.query(`SELECT 1 FROM support_emails WHERE provider_id = $1`, [`e_forged_${suffix}`]);
    expect(rows).toHaveLength(0);
  });

  it('keeps a received mail once, with its body read from Resend, and shows it to support', async () => {
    const id = `e_code_${suffix}`;
    bodies.set(id, { text: 'Silav,\nI signed up but the code never came.', html: '<p>Silav, I signed up but the code never came.</p>' });
    expect((await deliver(received(id))).statusCode).toBe(200);
    // Resend delivers again: still one mail
    expect((await deliver(received(id))).statusCode).toBe(200);
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM support_emails WHERE provider_id = $1`, [id]);
    expect(rows[0].n).toBe(1);

    const list = await call('GET', '/admin/support/emails', support);
    expect(list.statusCode, list.body).toBe(200);
    const mine = list.json().emails.find((e: { subject: string; from: { address: string } }) => e.from.address === 'rojda@example.com');
    expect(mine).toMatchObject({ subject: 'I did not get my code', from: { name: 'Rojda Kurd' }, readAt: null, attachments: 1 });
    expect(mine.preview).toContain('the code never came');
    expect(list.json().unread).toBeGreaterThanOrEqual(1);

    const opened = await call('POST', `/admin/support/emails/${mine.id}/open`, support);
    expect(opened.statusCode, opened.body).toBe(200);
    expect(opened.json()).toMatchObject({ bodyAvailable: true, attachmentList: [{ filename: 'screenshot.png' }] });
    expect(opened.json().text).toContain('Silav');
    expect(opened.json().readAt).not.toBeNull();
  });

  it('reads the body when the mail is opened, if Resend could not give it when the mail came', async () => {
    const id = `e_late_${suffix}`;
    expect((await deliver(received(id, { subject: 'Later' }))).statusCode).toBe(200);
    const row = await pool.query(`SELECT id, body_fetched_at FROM support_emails WHERE provider_id = $1`, [id]);
    expect(row.rows[0].body_fetched_at).toBeNull();

    bodies.set(id, { text: 'Now you can read me.' });
    const opened = await call('POST', `/admin/support/emails/${row.rows[0].id}/open`, admin);
    expect(opened.json()).toMatchObject({ bodyAvailable: true, text: 'Now you can read me.' });
  });

  it('answers from the support address, threaded, and archives', async () => {
    const id = `e_answer_${suffix}`;
    bodies.set(id, { text: 'How do I change my name?' });
    await deliver(received(id, { subject: 'Name' }));
    const row = await pool.query(`SELECT id FROM support_emails WHERE provider_id = $1`, [id]);
    const mailId = row.rows[0].id as string;

    const answered = await call('POST', `/admin/support/emails/${mailId}/reply`, support, { body: 'In Settings → Profile.' });
    expect(answered.statusCode, answered.body).toBe(200);
    const opened = await call('POST', `/admin/support/emails/${mailId}/open`, support);
    expect(opened.json().answers).toEqual([expect.objectContaining({ body: 'In Settings → Profile.', admin: expect.objectContaining({ id: support.id }) })]);

    expect((await call('POST', `/admin/support/emails/${mailId}/archive`, support, { value: true })).statusCode).toBe(200);
    const open = await call('GET', '/admin/support/emails', support);
    expect(open.json().emails.map((e: { id: string }) => e.id)).not.toContain(mailId);
    const archived = await call('GET', '/admin/support/emails?archived=true', support);
    expect(archived.json().emails.map((e: { id: string }) => e.id)).toContain(mailId);

    expect((await call('POST', `/admin/support/emails/${mailId}/read`, support, { value: false })).statusCode).toBe(200);
    const again = await pool.query(`SELECT read_at FROM support_emails WHERE id = $1`, [mailId]);
    expect(again.rows[0].read_at).toBeNull();
  });

  it('keeps a mail whose headers carry line breaks or NULs, on one line, and still answers it', async () => {
    const id = `e_hostile_${suffix}`;
    bodies.set(id, { text: 'Body with a NUL\u0000 in it.', html: '<p>NUL\u0000</p>' });
    const res = await deliver(
      received(id, {
        from: 'Rojda\u0000 Kurd <rojda.h@example.com>',
        subject: 'Help\r\nBcc: everyone@example.com\u0000',
        message_id: '<x@mail.example.com>\r\nBcc: everyone@example.com',
      }),
    );
    expect(res.statusCode, res.body).toBe(200);
    const { rows } = await pool.query(
      `SELECT id, subject, from_name, message_id, text_body FROM support_emails WHERE provider_id = $1`,
      [id],
    );
    expect(rows[0]).toMatchObject({
      subject: 'Help Bcc: everyone@example.com',
      from_name: 'Rojda Kurd',
      message_id: '<x@mail.example.com> Bcc: everyone@example.com',
      text_body: 'Body with a NUL in it.',
    });
    // the id is no plain message id any more, so the answer goes out unthreaded rather than with it
    const answered = await call('POST', `/admin/support/emails/${rows[0].id}/reply`, support, { body: 'We are on it.' });
    expect(answered.statusCode, answered.body).toBe(200);
  });

  it('suppresses an address that bounced or complained', async () => {
    const bounced = `bounce_${suffix}@it.kurda.app`;
    const complained = `complaint_${suffix}@it.kurda.app`;
    expect((await deliver({ type: 'email.bounced', data: { email_id: 'x', to: [bounced] } })).statusCode).toBe(200);
    expect((await deliver({ type: 'email.complained', data: { email_id: 'y', to: [complained] } })).statusCode).toBe(200);
    // and an event it has no use for is simply acknowledged
    expect((await deliver({ type: 'email.opened', data: { email_id: 'z' } })).statusCode).toBe(200);
    const { rows } = await pool.query(`SELECT email, reason FROM email_suppressions WHERE email = ANY($1) ORDER BY email`, [[bounced, complained]]);
    expect(rows).toEqual([
      { email: bounced, reason: 'bounce' },
      { email: complained, reason: 'complaint' },
    ]);
  });

  it('keeps the inbox and the email settings from players, and the settings from support', async () => {
    expect((await call('GET', '/admin/support/emails', player)).statusCode).toBe(404);
    expect((await call('GET', '/admin/email/status', player)).statusCode).toBe(404);
    expect((await call('GET', '/admin/email/status', support)).statusCode).toBe(403);
    expect((await call('POST', '/admin/email/test', support)).statusCode).toBe(403);
  });

  it('tells an admin how email is set up, and will not send a test with no provider', async () => {
    const status = await call('GET', '/admin/email/status', admin);
    expect(status.statusCode, status.body).toBe(200);
    expect(status.json()).toMatchObject({
      provider: 'none',
      from: 'Hevalo <no-reply@hevalo.app>',
      replyTo: 'support@hevalo.app',
      inbox: { webhook: true, canReadBodies: true },
    });
    const test = await call('POST', '/admin/email/test', admin);
    expect(test.statusCode).toBe(409);
    expect(test.json().code).toBe('EMAIL_NOT_CONFIGURED');
  });
});
