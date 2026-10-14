/**
 * Copyright notices (contract-3 §C) against real Postgres: the public form,
 * the case it opens in the moderation queue, the receipt and the decision
 * emailed to the notifier, the uploader's counter-notice, and strikes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import {
  COPYRIGHT_NOTICES_PER_HOUR,
  type AppealView,
  type CaseDetail,
  type CopyrightNoticeReceipt,
  type CounterNoticeReceipt,
  type MyCopyrightNotice,
  type ReportReceipt,
} from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';
import { CopyrightService, copyrightCaseSummary, copyrightStrikes, type CopyrightMailer } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Mail {
  to: string;
  template: string;
  vars: Record<string, string>;
  locale: string;
}

describe.skipIf(!DATABASE_URL)('copyright notices (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal', APP_BASE_URL: 'https://hevalo.example.test' });
  const mails: Mail[] = [];
  let app: FastifyInstance;
  let pool: pg.Pool;
  const kit = moderationKit(() => app, () => pool, 'cr', 167);
  const { call } = kit;
  let author: Person, other: Person, modA: Person, modB: Person;
  const userIds: string[] = [];
  let seq = 0;

  /** The public form, from its own address each time unless one is given. */
  const send = (body: Record<string, unknown>, ip?: string) =>
    app.inject({ method: 'POST', url: '/copyright/notices', payload: body, remoteAddress: ip ?? kit.ip() });
  const notice = (contentUrl: string, over: Record<string, unknown> = {}) => ({
    name: 'Rojda Amed',
    email: `rojda${++seq}@example.com`,
    address: 'Keizersgracht 1, 1015 Amsterdam',
    role: 'owner',
    work: 'My photograph of the Zagros at dawn',
    contentUrl,
    explanation: 'It is my photo, posted without my permission.',
    goodFaith: true,
    accurate: true,
    signature: 'Rojda Amed',
    ...over,
  });
  const post = async (who: Person, body = 'A poem I copied.'): Promise<string> => {
    const res = await call('POST', '/library/posts', who.token, { type: 'gotin', body });
    if (res.statusCode !== 201) throw new Error(`post failed (${res.statusCode}): ${res.body}`);
    return (res.json() as { id: string }).id;
  };
  const caseOfNotice = async (email: string): Promise<string> =>
    (await pool.query<{ case_id: string }>(`SELECT case_id FROM copyright_notices WHERE notifier_email = $1`, [email])).rows[0]!.case_id;
  const detail = async (caseId: string, by: Person = modA): Promise<CaseDetail> =>
    (await call('GET', `/admin/moderation/cases/${caseId}`, by.token)).json() as CaseDetail;
  const decide = (caseId: string, body: Record<string, unknown>, by: Person = modA) =>
    call('POST', `/admin/moderation/cases/${caseId}/decide`, by.token, { removeContent: false, notifyReporters: false, actions: [], ...body });
  const takeDown = (caseId: string) =>
    decide(caseId, { outcome: 'actioned', policy: 'copyright', removeContent: true, actions: [{ target: 'subject', kind: 'content_removal', statement: 'You posted a photo that belongs to someone else.' }] });
  const mailer: CopyrightMailer = { send: async (to, template, vars, locale) => void mails.push({ to, template, vars, locale }) };
  /** The outcome sweep, run now instead of in five minutes (it reads only the database). */
  const sweep = () => new CopyrightService(pool, { mailer }).sendOutcomes();

  beforeAll(async () => {
    app = buildApp(config, {
      moderation: { moderatorCount: async () => 2, mailer: { send: async () => undefined } },
      copyright: { mailer },
    });
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    author = await kit.person('author');
    other = await kit.person('other');
    modA = await kit.admin('moda', ['moderator']);
    modB = await kit.admin('modb', ['superadmin']);
    userIds.push(author.id, other.id, modA.id, modB.id);
    await pool.query(`UPDATE users SET created_at = now() - interval '3 days' WHERE id = ANY($1)`, [userIds]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM moderation_cases WHERE id IN (SELECT case_id FROM copyright_notices WHERE notifier_email LIKE '%@example.com')`);
    await pool.query(`DELETE FROM copyright_notices WHERE notifier_email LIKE '%@example.com'`);
    await pool.query(`DELETE FROM moderation_cases WHERE subject_user_id = ANY($1)`, [userIds]);
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`%_${kit.suffix}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  it('takes a notice from anyone, opens a P1 copyright case, and emails a receipt', async () => {
    const id = await post(author);
    const body = notice(`https://hevalo.app/app/library/${id}`, { locale: 'ku', phone: '+31 6 1234 5678' });
    const res = await send(body);
    expect(res.statusCode).toBe(201);
    const receipt = res.json() as CopyrightNoticeReceipt;
    expect(receipt.reference).toMatch(/^CN-[0-9A-F]{8}$/);
    // nothing about the post comes back: the form never confirms what exists
    expect(Object.keys(receipt).sort()).toEqual(['receivedAt', 'reference']);

    const mail = mails.find((m) => m.to === body.email)!;
    expect(mail).toMatchObject({ template: 'copyright-received', locale: 'ku' });
    expect(mail.vars.reference).toBe(receipt.reference);
    expect(mail.vars.link).toBe(`https://hevalo.example.test/app/library/${id}`);

    const d = await detail(await caseOfNotice(body.email as string));
    expect(d.case).toMatchObject({
      source: 'copyright',
      sourceGroup: 'reports',
      priority: 1,
      category: 'copyright',
      targetType: 'library_post',
      status: 'open',
      reportCount: 1,
      subject: { id: author.id },
    });
    expect(d.case.summary).toBe(`1 copyright notice · written post by @${author.username}`);
    expect(d.copyright!.notices).toHaveLength(1);
    expect(d.copyright!.notices[0]).toMatchObject({
      reference: receipt.reference,
      status: 'received',
      target: { type: 'library_post', id },
      targetFound: true,
      notifier: { name: 'Rojda Amed', email: body.email, phone: '+31 6 1234 5678', role: 'owner', rightsHolder: null, locale: 'ku' },
      goodFaith: true,
      accurate: true,
      counterNotice: null,
    });
    expect(d.copyright!.notices[0]!.receiptSentAt).not.toBeNull();
    expect(d.copyright!.strikes).toMatchObject({ count: 0, threshold: 3, terminationSuggested: false });

    // in the queue, under the copyright source and in the reports group
    const queue = (await call('GET', '/admin/moderation/queue?source=copyright', modA.token)).json() as { cases: Array<{ id: string }> };
    expect(queue.cases.map((c) => c.id)).toContain(d.case.id);
  });

  it('joins notices about the same post into its one open case', async () => {
    const id = await post(author, 'Copied twice.');
    const a = notice(`/app/library/${id}`);
    const b = notice(id, { role: 'authorised', rightsHolder: 'Zagros Photo BV', name: 'Agent Smith' });
    expect((await send(a)).statusCode).toBe(201);
    expect((await send(b)).statusCode).toBe(201);
    const caseId = await caseOfNotice(a.email as string);
    expect(await caseOfNotice(b.email as string)).toBe(caseId);
    const d = await detail(caseId);
    expect(d.case).toMatchObject({ reportCount: 2, reporterCount: 2 });
    expect(d.case.summary).toBe(`2 copyright notices · written post by @${author.username}`);
    expect(d.copyright!.notices.map((n) => n.notifier.rightsHolder)).toEqual([null, 'Zagros Photo BV']);
  });

  it('answers a link that matches nothing exactly as one that does, and still opens a case', async () => {
    const missing = notice('https://hevalo.app/app/dimen/00000000-0000-4000-8000-000000000000');
    const res = await send(missing);
    expect(res.statusCode).toBe(201);
    expect(Object.keys(res.json() as object).sort()).toEqual(['receivedAt', 'reference']);
    const d = await detail(await caseOfNotice(missing.email as string));
    expect(d.case).toMatchObject({ source: 'copyright', subject: null, targetType: null });
    expect(d.case.summary).toBe('1 copyright notice · a link that matched nothing');
    expect(d.copyright!.notices[0]).toMatchObject({ targetFound: false, target: { type: 'image_post' } });
    expect(d.copyright!.strikes).toBeNull();
  });

  it('refuses an incomplete notice with every problem, field by field', async () => {
    const res = await send({ name: 'x', email: 'nope', contentUrl: 'https://elsewhere.example/a', goodFaith: false });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { code: string; details: { problems: Array<{ field: string; code: string }> } };
    expect(body.code).toBe('INVALID_NOTICE');
    expect(body.details.problems).toEqual(
      expect.arrayContaining([
        { field: 'email', code: 'INVALID_EMAIL' },
        { field: 'address', code: 'REQUIRED' },
        { field: 'role', code: 'REQUIRED' },
        { field: 'work', code: 'REQUIRED' },
        { field: 'contentUrl', code: 'INVALID_LINK' },
        { field: 'explanation', code: 'REQUIRED' },
        { field: 'goodFaith', code: 'NOT_CONFIRMED' },
        { field: 'accurate', code: 'NOT_CONFIRMED' },
        { field: 'signature', code: 'REQUIRED' },
      ]),
    );
    // someone acting for the holder must say who the holder is
    const agent = await send(notice(`https://hevalo.app/app/library/${await post(author, 'x y')}`, { role: 'authorised' }));
    expect((agent.json() as { details: { problems: unknown[] } }).details.problems).toEqual([{ field: 'rightsHolder', code: 'REQUIRED' }]);
    // nothing was stored for any of them
    expect((await pool.query(`SELECT 1 FROM copyright_notices WHERE notifier_email = 'nope'`)).rowCount).toBe(0);
  });

  it('limits notices per network address', async () => {
    const ip = '10.167.250.250';
    const id = await post(other, 'Rate limited.');
    for (let i = 0; i < COPYRIGHT_NOTICES_PER_HOUR; i++) expect((await send(notice(`/app/library/${id}`), ip)).statusCode).toBe(201);
    const over = await send(notice(`/app/library/${id}`), ip);
    expect(over.statusCode).toBe(429);
    // another address is not held back by it
    expect((await send(notice(`/app/library/${id}`))).statusCode).toBe(201);
    // and the database keeps a keyed hash of the address, never the address
    const stored = await pool.query<{ ip_hash: string }>(`SELECT ip_hash FROM copyright_notices WHERE target_id = $1 LIMIT 1`, [id]);
    expect(stored.rows[0]!.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.rows[0]!.ip_hash).not.toContain('10.167');
  });

  it('takes the post down, tells the uploader how to answer, and emails the notifier once', async () => {
    const id = await post(author, 'Taken down.');
    const n = notice(`/app/library/${id}`);
    await send(n);
    const caseId = await caseOfNotice(n.email as string);
    const res = await takeDown(caseId);
    expect(res.statusCode).toBe(200);

    const live = await pool.query<{ status: string }>(`SELECT status FROM library_posts WHERE id = $1`, [id]);
    expect(live.rows[0]!.status).toBe('removed');
    const told = await pool.query<{ body: string }>(
      `SELECT body FROM notifications WHERE user_id = $1 AND data->>'kind' = 'sanction' ORDER BY created_at DESC LIMIT 1`,
      [author.id],
    );
    expect(told.rows[0]!.body).toContain('This came from a copyright complaint');
    expect(told.rows[0]!.body).toContain('counter-notice');

    const before = mails.length;
    expect(await sweep()).toBeGreaterThanOrEqual(1);
    const outcome = mails.slice(before).find((m) => m.to === n.email)!;
    expect(outcome).toMatchObject({ template: 'copyright-removed' });
    // once: the next round has nothing for it
    await sweep();
    expect(mails.filter((m) => m.to === n.email && m.template === 'copyright-removed')).toHaveLength(1);
    expect((await detail(caseId)).copyright!.notices[0]).toMatchObject({ status: 'actioned' });
  });

  it('emails "we did not remove it" for a notice found not to infringe', async () => {
    const id = await post(other, 'A quotation, with its source.');
    const n = notice(`/app/library/${id}`);
    await send(n);
    const caseId = await caseOfNotice(n.email as string);
    expect((await decide(caseId, { outcome: 'no_violation' })).statusCode).toBe(200);
    await sweep();
    expect(mails.find((m) => m.to === n.email && m.template === 'copyright-kept')).toBeTruthy();
    expect((await call('GET', '/me/copyright/notices', other.token)).json()).toEqual({ notices: [] });
  });

  it('upholds a notice about a post only by taking the post down', async () => {
    const id = await post(author, 'Warned, not removed.');
    const n = notice(`/app/library/${id}`);
    await send(n);
    const caseId = await caseOfNotice(n.email as string);
    const warnOnly = await decide(caseId, {
      outcome: 'actioned',
      policy: 'copyright',
      actions: [{ target: 'subject', kind: 'warning', statement: 'That photo is not yours.' }],
    });
    expect(warnOnly.statusCode).toBe(422);
    expect((warnOnly.json() as { code: string }).code).toBe('CONTENT_REMOVAL_REQUIRED');
    // refused before anything was applied
    expect((await pool.query<{ status: string }>(`SELECT status FROM library_posts WHERE id = $1`, [id])).rows[0]!.status).toBe('published');
    expect((await pool.query(`SELECT 1 FROM sanctions WHERE case_id = $1`, [caseId])).rowCount).toBe(0);
    expect((await detail(caseId)).copyright!.notices[0]).toMatchObject({ status: 'received' });
  });

  it('never tells a notifier "removed" when the decision took nothing down', async () => {
    const profileOwner = await kit.person('profile');
    userIds.push(profileOwner.id);
    await pool.query(`UPDATE users SET created_at = now() - interval '3 days' WHERE id = $1`, [profileOwner.id]);
    const n = notice(`https://hevalo.app/app/users/${profileOwner.id}`);
    await send(n);
    const caseId = await caseOfNotice(n.email as string);
    const res = await decide(caseId, {
      outcome: 'actioned',
      policy: 'copyright',
      actions: [{ target: 'subject', kind: 'warning', statement: 'Your profile photo belongs to someone else.' }],
    });
    expect(res.statusCode).toBe(200);
    expect((await detail(caseId)).copyright!.notices[0]).toMatchObject({ status: 'upheld' });

    await sweep();
    const told = mails.filter((m) => m.to === n.email).map((m) => m.template);
    expect(told).toContain('copyright-upheld');
    expect(told).not.toContain('copyright-removed');
    // nothing was taken down, so the uploader has nothing to counter, and is not invited to
    expect(((await call('GET', '/me/copyright/notices', profileOwner.token)).json() as { notices: unknown[] }).notices).toEqual([]);
    const warned = await pool.query<{ body: string }>(
      `SELECT body FROM notifications WHERE user_id = $1 AND data->>'kind' = 'sanction' ORDER BY created_at DESC LIMIT 1`,
      [profileOwner.id],
    );
    expect(warned.rows[0]!.body).not.toContain('counter-notice');
  });

  it('refuses a counter-notice from a minor and forwards nothing', async () => {
    const teen = await kit.person('teen', { birthYear: new Date().getUTCFullYear() - 15, birthMonth: 1 });
    userIds.push(teen.id);
    await pool.query(`UPDATE users SET created_at = now() - interval '3 days' WHERE id = $1`, [teen.id]);
    const id = await post(teen, 'My own drawing.');
    const n = notice(`/app/library/${id}`);
    await send(n);
    await takeDown(await caseOfNotice(n.email as string));
    const listed = ((await call('GET', '/me/copyright/notices', teen.token)).json() as { notices: MyCopyrightNotice[] }).notices[0]!;
    expect(listed).toMatchObject({ status: 'actioned' });

    const res = await call('POST', `/me/copyright/notices/${listed.id}/counter`, teen.token, {
      name: 'Teen Author',
      address: 'Home Street 1, Rotterdam',
      phone: '+31 6 0000 0000',
      email: 'teen@example.com',
      statement: 'I drew it.',
      goodFaith: true,
      consent: true,
      signature: 'Teen Author',
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe('COUNTER_NOTICE_ADULT_REQUIRED');
    expect(mails.some((m) => m.template === 'copyright-counter-notice' && m.vars.address === 'Home Street 1, Rotterdam')).toBe(false);
    expect((await pool.query(`SELECT 1 FROM copyright_counter_notices WHERE notice_id = $1`, [listed.id])).rowCount).toBe(0);
    expect((await detail(await caseOfNotice(n.email as string))).copyright!.notices[0]).toMatchObject({ status: 'actioned', counterNotice: null });
  });

  it('lets the uploader answer with a counter-notice that reaches the admin and the notifier', async () => {
    const id = await post(author, 'Mine after all.');
    const n = notice(`/app/library/${id}`);
    await send(n);
    const caseId = await caseOfNotice(n.email as string);
    await takeDown(caseId);

    const mine = (await call('GET', '/me/copyright/notices', author.token)).json() as { notices: MyCopyrightNotice[] };
    const listed = mine.notices.find((x) => x.target?.id === id)!;
    expect(listed).toMatchObject({ claimant: 'Rojda Amed', status: 'actioned', canCounter: true, counterNotice: null });
    expect(listed.counterDeadline).not.toBeNull();
    // the notifier's contact details are not part of it
    expect(JSON.stringify(listed)).not.toContain(n.email as string);

    const counter = {
      name: 'Baran Author',
      address: 'Oudegracht 2, Utrecht',
      email: 'baran@example.com',
      statement: 'I took this photograph myself in 2019.',
      goodFaith: true,
      consent: true,
      signature: 'Baran Author',
    };
    const url = `/me/copyright/notices/${listed.id}/counter`;
    expect((await call('POST', url, null, counter)).statusCode).toBe(401);
    expect((await call('POST', url, other.token, counter)).statusCode).toBe(404);
    const bad = await call('POST', url, author.token, { ...counter, consent: false });
    expect(bad.statusCode).toBe(422);
    expect((bad.json() as { code: string }).code).toBe('INVALID_COUNTER_NOTICE');

    const res = await call('POST', url, author.token, counter);
    expect(res.statusCode).toBe(201);
    const receipt = res.json() as CounterNoticeReceipt;
    expect(new Date(receipt.restoreNotBefore).getTime()).toBeGreaterThan(Date.now() + 12 * 86_400_000);
    expect((await call('POST', url, author.token, counter)).statusCode).toBe(409);

    // a copy to the notifier, with what the uploader said and when the post may come back
    const copy = mails.find((m) => m.to === n.email && m.template === 'copyright-counter-notice')!;
    expect(copy.vars).toMatchObject({ name: 'Baran Author', statement: counter.statement, restoreDate: receipt.restoreNotBefore.slice(0, 10) });

    // the case view has it, with a note on what to do next; the removal has a review request
    const d = await detail(caseId);
    expect(d.copyright!.notices[0]).toMatchObject({ status: 'countered', counterNotice: { name: 'Baran Author', consent: true } });
    expect(d.copyright!.notices[0]!.counterNotice!.forwardedAt).not.toBeNull();
    expect(d.notes.map((x) => x.text).join(' ')).toMatch(/^Counter-notice to CN-.* restored from \d{4}-\d{2}-\d{2} by overturning/);
    const appeals = (await call('GET', '/admin/appeals?status=open', modB.token)).json() as { appeals: Array<AppealView & { user: { id: string } | null }> };
    const appeal = appeals.appeals.find((a) => a.user?.id === author.id && a.text.startsWith('Copyright counter-notice'));
    expect(appeal).toBeTruthy();

    // the notice stays listed, answered
    const after = (await call('GET', '/me/copyright/notices', author.token)).json() as { notices: MyCopyrightNotice[] };
    expect(after.notices.find((x) => x.id === listed.id)).toMatchObject({ status: 'countered', canCounter: false });
    // and the notifier is still told the decision, even though the answer came first
    await sweep();
    expect(mails.find((m) => m.to === n.email && m.template === 'copyright-removed')).toBeTruthy();

    // putting the post back (overturning the review) takes the strike away
    const strikesBefore = (await copyrightStrikes(pool, author.id)).count;
    const overturn = await call('POST', `/admin/appeals/${appeal!.id}/decide`, modB.token, { outcome: 'overturned', note: 'No court action was reported; restored.' });
    expect(overturn.statusCode).toBe(200);
    expect((await pool.query<{ status: string }>(`SELECT status FROM library_posts WHERE id = $1`, [id])).rows[0]!.status).toBe('published');
    expect((await copyrightStrikes(pool, author.id)).count).toBe(strikesBefore - 1);
  });

  it('suggests closing the account at three standing strikes in twelve months', async () => {
    const infringer = await kit.person('infringer');
    userIds.push(infringer.id);
    await pool.query(`UPDATE users SET created_at = now() - interval '3 days' WHERE id = $1`, [infringer.id]);
    let lastCase = '';
    for (let i = 0; i < 3; i++) {
      const id = await post(infringer, `Copied work ${i}.`);
      const n = notice(`/app/library/${id}`);
      await send(n);
      lastCase = await caseOfNotice(n.email as string);
      if (i < 2) expect((await takeDown(lastCase)).statusCode).toBe(200);
    }
    // two decided, the third still open: the case view counts what is confirmed
    expect((await detail(lastCase)).copyright!.strikes).toMatchObject({ count: 2, terminationSuggested: false });
    await takeDown(lastCase);
    const strikes = (await detail(lastCase)).copyright!.strikes!;
    expect(strikes).toMatchObject({ count: 3, threshold: 3, windowDays: 365, terminationSuggested: true });
    expect(strikes.caseIds[0]).toBe(lastCase);

    // a strike older than the window no longer counts
    await pool.query(
      `UPDATE sanctions SET created_at = now() - interval '400 days', starts_at = now() - interval '400 days'
        WHERE id = (SELECT id FROM sanctions WHERE user_id = $1 AND policy = 'copyright' ORDER BY created_at LIMIT 1)`,
      [infringer.id],
    );
    expect(await copyrightStrikes(pool, infringer.id)).toMatchObject({ count: 2, terminationSuggested: false });
  });

  it('sends a reopened case’s notices back for a new decision', async () => {
    const id = await post(other, 'Second look.');
    const n = notice(`/app/library/${id}`);
    await send(n);
    const caseId = await caseOfNotice(n.email as string);
    await decide(caseId, { outcome: 'no_violation' });
    await sweep();
    expect((await call('POST', `/admin/moderation/cases/${caseId}/reopen`, modB.token, { reason: 'New evidence' })).statusCode).toBe(200);
    const d = await detail(caseId);
    expect(d.copyright!.notices[0]).toMatchObject({ status: 'received', outcomeSentAt: null });
  });

  it('accepts copyright as a reason in the in-app report sheet, and shows it in the case', async () => {
    const id = await post(author, 'Reported in the app.');
    const res = await call('POST', '/reports', other.token, { targetType: 'library_post', targetId: id, category: 'copyright' });
    expect(res.statusCode).toBe(201);
    const receipt = res.json() as ReportReceipt;
    expect(receipt.report.category).toBe('copyright');
    const caseId = (await pool.query<{ case_id: string }>(`SELECT case_id FROM reports WHERE id = $1`, [receipt.report.id])).rows[0]!.case_id;
    const d = await detail(caseId);
    expect(d.case).toMatchObject({ source: 'report', category: 'copyright', priority: 2 });
    // no notices behind it, but the strikes are there for the decision
    expect(d.copyright).toMatchObject({ notices: [], strikes: { threshold: 3 } });
  });

  it('leaves the copyright part out of every other case', async () => {
    const res = await call('POST', '/reports', other.token, { targetType: 'user', targetId: author.id, category: 'spam' });
    const caseId = (await pool.query<{ case_id: string }>(`SELECT case_id FROM reports WHERE id = $1`, [(res.json() as ReportReceipt).report.id])).rows[0]!.case_id;
    expect((await detail(caseId)).copyright).toBeNull();
  });

  it('writes a summary that is never empty', () => {
    expect(copyrightCaseSummary(1, 'image_post', null)).toBe('1 copyright notice · picture post');
    expect(copyrightCaseSummary(3, 'user', 'rojda')).toBe('3 copyright notices · profile by @rojda');
  });
});
