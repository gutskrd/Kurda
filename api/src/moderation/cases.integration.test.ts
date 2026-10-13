/**
 * The moderation admin API (M4/M5) against real Postgres: the queue and its
 * filters, the claim lease, decisions with their preview, sanctions on the
 * reported person and on reporters, the second-approval rule and its
 * single-admin fallback, CSAM, reopen and escalate, appeals, and the audit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type {
  AccountStanding,
  AdminAppealItem,
  CaseDetail,
  CaseQueuePage,
  DecideResult,
  ModerationSummary,
  PendingApproval,
  ReportReceipt,
} from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('moderation cases (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let moderators = 2;
  let app: FastifyInstance;
  let pool: pg.Pool;
  const kit = moderationKit(() => app, () => pool, 'mc', 142);
  const { call } = kit;
  let modA: Person, modB: Person, legacy: Person, support: Person, reporter: Person, reporter2: Person, author: Person;
  const created: string[] = [];

  /** A plain account made in SQL — enough to be reported. */
  async function target(tag: string): Promise<{ id: string; username: string; email: string }> {
    const username = `mct${tag}${kit.suffix}`.slice(0, 30);
    const email = `mct_${tag}_${kit.suffix}@it.kurda.app`;
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, email_verified_at, birth_year, birth_month, created_at)
       VALUES ($1, $2, now(), 1990, 6, now() - interval '3 days') RETURNING id`,
      [email, username],
    );
    created.push(r.rows[0]!.id);
    return { id: r.rows[0]!.id, username, email };
  }
  async function reportCase(who: Person, body: Record<string, unknown>): Promise<string> {
    const res = await call('POST', '/reports', who.token, body);
    if (res.statusCode !== 201) throw new Error(`report failed (${res.statusCode}): ${res.body}`);
    const id = (res.json() as ReportReceipt).report.id;
    return (await pool.query<{ case_id: string }>(`SELECT case_id FROM reports WHERE id = $1`, [id])).rows[0]!.case_id;
  }
  const decide = (by: Person, caseId: string, body: Record<string, unknown>) =>
    call('POST', `/admin/moderation/cases/${caseId}/decide`, by.token, { removeContent: false, notifyReporters: true, actions: [], ...body });
  const detail = async (caseId: string): Promise<CaseDetail> =>
    (await call('GET', `/admin/moderation/cases/${caseId}`, modA.token)).json() as CaseDetail;
  async function eventually<T>(fn: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
    let v = await fn();
    for (let i = 0; i < 40 && !ok(v); i++) {
      await new Promise((r) => setTimeout(r, 25));
      v = await fn();
    }
    return v;
  }

  beforeAll(async () => {
    app = buildApp(config, { moderation: { moderatorCount: async () => moderators, mailer: { send: async () => undefined } } });
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    modA = await kit.admin('moda', ['moderator']);
    modB = await kit.admin('modb', ['superadmin']);
    legacy = await kit.admin('legacy', ['admin']);
    support = await kit.admin('support', ['support']);
    reporter = await kit.person('reporter');
    reporter2 = await kit.person('reporter2');
    author = await kit.person('author');
    created.push(modA.id, modB.id, legacy.id, support.id, reporter.id, reporter2.id, author.id);
    await pool.query(`UPDATE users SET created_at = now() - interval '3 days' WHERE id = ANY($1)`, [created]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM moderation_cases WHERE subject_user_id = ANY($1)`, [created]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [created]);
    await pool.end();
    await app.close();
  });

  it('lets moderators, superadmins and the legacy admin role in, and nobody else', async () => {
    for (const who of [modA, modB, legacy]) {
      expect((await call('GET', '/admin/moderation/queue?limit=1', who.token)).statusCode).toBe(200);
    }
    expect((await call('GET', '/admin/moderation/queue', support.token)).statusCode).toBe(403);
    expect((await call('GET', '/admin/moderation/queue', reporter.token)).statusCode).toBe(403);
    expect((await call('GET', '/admin/moderation/queue')).statusCode).toBe(401);
    // and /admin/session tells the panel so
    const session = (await call('GET', '/admin/session', legacy.token)).json() as { capabilities: string[] };
    expect(session.capabilities).toContain('moderation.act');
  });

  it('pages the queue most urgent first, filters it, and survives a row about nothing', async () => {
    const people = [await target('pga'), await target('pgb'), await target('pgc')];
    await reportCase(reporter, { targetType: 'user', targetId: people[0]!.id, category: 'spam' });
    await reportCase(reporter, { targetType: 'user', targetId: people[1]!.id, category: 'hate' });
    await reportCase(reporter, { targetType: 'user', targetId: people[2]!.id, category: 'harassment' });
    const q = `mctpg`;

    const seen: string[] = [];
    let cursor: string | null = null;
    const priorities: number[] = [];
    do {
      const url: string = `/admin/moderation/queue?q=${q}&limit=1${cursor ? `&cursor=${cursor}` : ''}`;
      const page = (await call('GET', url, modA.token)).json() as CaseQueuePage;
      seen.push(...page.cases.map((c) => c.id));
      priorities.push(...page.cases.map((c) => c.priority));
      cursor = page.nextCursor;
    } while (cursor && seen.length < 10);
    expect(new Set(seen).size).toBe(3);
    expect(priorities).toEqual([1, 2, 3]);

    const hate = (await call('GET', `/admin/moderation/queue?q=${q}&priority=1`, modA.token)).json() as CaseQueuePage;
    expect(hate.cases.map((c) => c.category)).toEqual(['hate']);
    const spam = (await call('GET', `/admin/moderation/queue?q=${q}&category=spam`, modA.token)).json() as CaseQueuePage;
    expect(spam.cases).toHaveLength(1);
    expect(((await call('GET', `/admin/moderation/queue?q=${q}&source=reports`, modA.token)).json() as CaseQueuePage).cases).toHaveLength(3);
    expect(((await call('GET', `/admin/moderation/queue?q=${q}&source=automated`, modA.token)).json() as CaseQueuePage).cases).toHaveLength(0);
    expect((await call('GET', '/admin/moderation/queue?cursor=garbage', modA.token)).json().code).toBe('BAD_CURSOR');

    // an old report about a post that is gone: still a case, never a 500
    const ghost = '00000000-0000-4000-8000-0000000000aa';
    await pool.query(`INSERT INTO library_reports (target_type, target_id, reporter_id, reason) VALUES ('library_post', $1, $2, 'gone')`, [ghost, reporter.id]);
    const res = await call('GET', `/admin/moderation/queue?q=${ghost}`, modA.token);
    expect(res.statusCode).toBe(200);
    expect((res.json() as CaseQueuePage).cases[0]).toMatchObject({ source: 'library_report', subject: null });
  });

  it('summarises the open queue by priority, with SLA breaches counted from the first report', async () => {
    const late = await target('late');
    const caseId = await reportCase(reporter, { targetType: 'user', targetId: late.id, category: 'hate' });
    await pool.query(`UPDATE moderation_cases SET first_reported_at = now() - interval '2 days' WHERE id = $1`, [caseId]);
    const s = (await call('GET', '/admin/moderation/summary', modA.token)).json() as ModerationSummary;
    expect(s.open).toBeGreaterThanOrEqual(1);
    expect(s.byPriority[1]).toBeGreaterThanOrEqual(1);
    expect(s.slaBreachesByPriority[1]).toBeGreaterThanOrEqual(1);
    expect(s.oldestOpenAgeSeconds).toBeGreaterThanOrEqual(2 * 86_400 - 60);
    expect((await detail(caseId)).case.slaBreached).toBe(true);
  });

  it('holds a claimed case for its moderator', async () => {
    const t = await target('lease');
    const caseId = await reportCase(reporter, { targetType: 'user', targetId: t.id, category: 'spam' });
    const claim = await call('POST', `/admin/moderation/cases/${caseId}/claim`, modA.token);
    expect(claim.statusCode).toBe(200);
    const lease = Date.parse((claim.json() as { leaseUntil: string }).leaseUntil);
    expect(lease - Date.now()).toBeGreaterThan(14 * 60_000);
    expect((await detail(caseId)).case).toMatchObject({ status: 'in_review', claimedBy: { id: modA.id } });

    const blocked = await decide(modB, caseId, { outcome: 'no_violation' });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('CLAIMED_BY_OTHER');
    expect((await call('POST', `/admin/moderation/cases/${caseId}/claim`, modB.token)).json().code).toBe('ALREADY_CLAIMED');
    expect((await call('POST', `/admin/moderation/cases/${caseId}/claim`, modA.token)).statusCode).toBe(200); // refresh

    expect((await call('POST', `/admin/moderation/cases/${caseId}/release`, modA.token)).json()).toEqual({ released: true });
    expect((await call('POST', `/admin/moderation/cases/${caseId}/claim`, modB.token)).statusCode).toBe(200);
    expect((await decide(modB, caseId, { outcome: 'no_violation' })).statusCode).toBe(200);
  });

  let decidedCase = '';
  let postId = '';
  let muteId = '';
  let removalId = '';

  it('previews the exact messages, and changes nothing', async () => {
    postId = ((await call('POST', '/library/posts', author.token, { type: 'poem', title: 'Helbest', body: 'words that hurt' })).json() as { id: string }).id;
    decidedCase = await reportCase(reporter, { targetType: 'library_post', targetId: postId, category: 'hate', note: 'line two' });
    const res = await decide(modA, decidedCase, {
      outcome: 'actioned',
      policy: 'hate',
      actions: [{ target: 'subject', kind: 'chat_mute', durationHours: 24, statement: 'Your poem attacks people for their dialect.' }],
      removeContent: true,
      preview: true,
    });
    expect(res.statusCode).toBe(200);
    const out = res.json() as DecideResult;
    expect(out.preview).toBe(true);
    // the removal comes with its own statement of reasons, for the same reason as the mute
    expect(out.messages).toHaveLength(3);
    expect(out.messages[0]).toMatchObject({ to: 'subject', userId: author.id, title: 'We removed something you shared' });
    expect(out.messages[0]!.body).toContain('Your poem attacks people for their dialect.');
    expect(out.messages[1]).toMatchObject({ to: 'subject', userId: author.id, title: "You can't send messages for a while" });
    expect(out.messages[1]!.body).toContain('Your poem attacks people for their dialect.');
    expect(out.messages[1]!.body).toContain('The rule: Hate, including attacks on ethnicity, religion or dialect.');
    expect(out.messages[2]).toMatchObject({ to: 'reporters', body: 'We took action. Thanks for keeping Hevalo safe.' });
    expect(out.permanentBans).toEqual([]);

    const nothing = await pool.query(`SELECT 1 FROM sanctions WHERE user_id = $1`, [author.id]);
    expect(nothing.rowCount).toBe(0);
    expect((await detail(decidedCase)).case.status).toBe('open');
  });

  it('decides: mutes the author, removes the post, tells everyone, and logs it on the case', async () => {
    const res = await decide(modA, decidedCase, {
      outcome: 'actioned',
      policy: 'hate',
      actions: [{ target: 'subject', kind: 'chat_mute', durationHours: 24, statement: 'Your poem attacks people for their dialect.' }],
      removeContent: true,
      note: 'second line is a slur',
    });
    expect(res.statusCode).toBe(200);
    const out = res.json() as DecideResult;
    expect(out.status).toBe('actioned');
    muteId = out.sanctions.find((s) => s.kind === 'chat_mute')!.id;
    removalId = out.sanctions.find((s) => s.kind === 'content_removal')!.id;

    expect((await pool.query<{ status: string }>(`SELECT status FROM library_posts WHERE id = $1`, [postId])).rows[0]!.status).toBe('removed');
    const standing = (await call('GET', '/me/standing', author.token)).json() as AccountStanding;
    expect(standing.status).toBe('limited');
    expect(standing.active[0]).toMatchObject({ kind: 'chat_mute', policy: 'hate', origin: 'report', reviewedByPerson: true });
    expect(standing.restrictions.chat?.until).toBeTruthy();

    const authorInbox = await pool.query<{ data: { kind: string; sanction: string } }>(`SELECT data FROM notifications WHERE user_id = $1`, [author.id]);
    expect(authorInbox.rows.filter((r) => r.data.kind === 'sanction').map((r) => r.data.sanction).sort()).toEqual(['chat_mute', 'content_removal']);
    const reporterInbox = await pool.query<{ data: { kind: string; outcome: string } }>(
      `SELECT data FROM notifications WHERE user_id = $1 AND data->>'kind' = 'report_outcome'`,
      [reporter.id],
    );
    expect(reporterInbox.rows.some((r) => r.data.outcome === 'actioned')).toBe(true);

    const d = await detail(decidedCase);
    expect(d.case).toMatchObject({ status: 'actioned', policy: 'hate', contentRemoved: true, resolution: 'actioned' });
    expect(d.notes.map((n) => n.text)).toContain('second line is a slur');
    expect(d.sanctions.map((s) => s.kind)).toEqual(['content_removal', 'chat_mute']);
    expect(d.audit.map((a) => a.action)).toEqual(expect.arrayContaining(['content_removal', 'mute', 'case_decision']));

    // the request audit carries the case as its target
    const logged = await eventually(
      () => pool.query<{ target_type: string }>(`SELECT target_type FROM admin_audit_log WHERE target_id = $1 AND action LIKE '%/decide'`, [decidedCase]),
      (r) => (r.rowCount ?? 0) > 0,
    );
    expect(logged.rows[0]!.target_type).toBe('moderation_case');
    // the preview before it is in the log too, under its own name — never as a second decision
    expect(logged.rowCount).toBe(1);
    const previews = await pool.query(`SELECT 1 FROM admin_audit_log WHERE target_id = $1 AND action LIKE '%/decide (preview)'`, [decidedCase]);
    expect(previews.rowCount).toBe(1);

    // decided is decided
    expect((await decide(modA, decidedCase, { outcome: 'no_violation' })).json().code).toBe('CASE_CLOSED');
  });

  it('an appeal is reviewed by someone else, one decision at a time; overturning the removal puts the post back', async () => {
    const filed = await call('POST', '/me/appeals', author.token, { sanctionId: muteId, text: 'It was a quote from a famous poem.' });
    expect(filed.statusCode).toBe(201);
    expect((await call('POST', '/me/appeals', author.token, { sanctionId: muteId, text: 'again' })).json().code).toBe('ALREADY_APPEALED');

    const list = (await call('GET', '/admin/appeals', modA.token)).json() as { appeals: AdminAppealItem[] };
    const mine = list.appeals.find((a) => a.sanctionId === muteId)!;
    expect(mine).toMatchObject({ status: 'open', originalDeciderId: modA.id, user: { id: author.id } });

    const self = await call('POST', `/admin/appeals/${mine.id}/decide`, modA.token, { outcome: 'overturned', note: 'fair' });
    expect(self.json().code).toBe('DIFFERENT_ADMIN_REQUIRED');
    const res = await call('POST', `/admin/appeals/${mine.id}/decide`, modB.token, { outcome: 'overturned', note: 'It is a quotation, in context.' });
    expect(res.statusCode).toBe(200);

    // the mute is lifted; the removal is a decision of its own and stands until it is appealed
    const status = async () => (await pool.query<{ status: string }>(`SELECT status FROM library_posts WHERE id = $1`, [postId])).rows[0]!.status;
    expect(await status()).toBe('removed');
    let standing = (await call('GET', '/me/standing', author.token)).json() as AccountStanding;
    expect(standing.status).toBe('good');
    expect(standing.past.find((p) => p.id === muteId)!.appeal.current).toMatchObject({ status: 'overturned', decisionNote: 'It is a quotation, in context.' });
    const removal = standing.past.find((p) => p.id === removalId)!;
    expect(removal).toMatchObject({ kind: 'content_removal', policy: 'hate', appeal: { allowed: true, current: null } });

    const second = (await call('POST', '/me/appeals', author.token, { sanctionId: removalId, text: 'And please put the poem back.' })).json() as { id: string };
    expect((await call('POST', `/admin/appeals/${second.id}/decide`, modB.token, { outcome: 'overturned', note: 'Restored.' })).statusCode).toBe(200);
    expect(await status()).toBe('published');
    standing = (await call('GET', '/me/standing', author.token)).json() as AccountStanding;
    expect(standing.past.find((p) => p.id === removalId)!.appeal.current).toMatchObject({ status: 'overturned' });
    const inbox = await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND data->>'kind' = 'appeal_decided'`, [author.id]);
    expect(inbox.rowCount).toBe(2);
  });

  it('can sanction a false reporter, who then sees the warning once', async () => {
    const t = await target('falsely');
    const caseId = await reportCase(reporter2, { targetType: 'user', targetId: t.id, category: 'child_safety', note: 'just angry at them' });
    const stray = await decide(modA, caseId, { outcome: 'no_violation', actions: [{ target: `reporter:${modB.id}`, kind: 'warning', statement: 'x' }] });
    expect(stray.json().code).toBe('NOT_A_REPORTER');

    const res = await decide(modA, caseId, {
      outcome: 'no_violation',
      actions: [{ target: `reporter:${reporter2.id}`, kind: 'warning', statement: 'Please only report real problems.' }],
    });
    expect(res.statusCode).toBe(200);
    const standing = (await call('GET', '/me/standing', reporter2.token)).json() as AccountStanding;
    expect(standing.unacknowledgedWarnings).toHaveLength(1);
    expect(standing.unacknowledgedWarnings[0]!.statement).toBe('Please only report real problems.');
    expect((await call('POST', '/me/standing/ack', reporter2.token, {})).json()).toEqual({ acknowledged: 1 });
    expect(((await call('GET', '/me/standing', reporter2.token)).json() as AccountStanding).unacknowledgedWarnings).toHaveLength(0);
  });

  it('never sanctions someone who may hurt themselves — it sends help', async () => {
    const t = await target('atrisk');
    const caseId = await reportCase(reporter, { targetType: 'user', targetId: t.id, category: 'self_harm' });
    const punish = await decide(modA, caseId, {
      outcome: 'actioned',
      policy: 'self_harm',
      actions: [{ target: 'subject', kind: 'suspension', durationHours: 24, statement: 'x' }],
    });
    expect(punish.json().code).toBe('SELF_HARM_NOT_SANCTIONED');
    const contradict = await decide(modA, caseId, { outcome: 'no_violation', actions: [{ target: 'subject', kind: 'warning', statement: 'x' }] });
    expect(contradict.json().code).toBe('CONTRADICTORY_DECISION');
    // not under another decision's rule with the action's own set to self-harm either
    const relabelled = await decide(modA, caseId, {
      outcome: 'actioned',
      policy: 'harassment',
      actions: [{ target: 'subject', kind: 'post_mute', durationHours: 24, statement: 'x', policy: 'self_harm' }],
    });
    expect(relabelled.json().code).toBe('SELF_HARM_NOT_SANCTIONED');
    // nor from the user page
    const direct = await call('POST', `/admin/users/${t.id}/sanctions`, modA.token, {
      kind: 'suspension', durationHours: 24, policy: 'self_harm', statement: 'x',
    });
    expect(direct.statusCode).toBe(422);
    expect(direct.json().code).toBe('SELF_HARM_NOT_SANCTIONED');

    const care = await decide(modA, caseId, {
      outcome: 'actioned',
      policy: 'self_harm',
      actions: [{ target: 'subject', kind: 'caring_message', statement: 'Someone who cares about you asked us to check in.' }],
    });
    expect(care.statusCode).toBe(200);
    const inbox = await pool.query<{ body: string }>(`SELECT body FROM notifications WHERE user_id = $1 AND data->>'kind' = 'caring_message'`, [t.id]);
    expect(inbox.rows[0]!.body).toContain('findahelpline.com');
    expect((await pool.query(`SELECT 1 FROM sanctions WHERE user_id = $1`, [t.id])).rowCount).toBe(0);
  });

  it('takes a self-harm post down to protect others, and its author only gets help', async () => {
    const t = await target('shpost');
    const post = await pool.query<{ id: string }>(
      `INSERT INTO library_posts (author_id, author_role, type, body, status, published_at)
       VALUES ($1, 'user', 'gotin', 'I do not want to be here any more.', 'published', now()) RETURNING id`,
      [t.id],
    );
    const caseId = await reportCase(reporter, { targetType: 'library_post', targetId: post.rows[0]!.id, category: 'self_harm' });
    const res = await decide(modA, caseId, {
      outcome: 'actioned',
      policy: 'self_harm',
      removeContent: true,
      actions: [{ target: 'subject', kind: 'caring_message' }],
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as DecideResult).messages.map((m) => m.title)).toEqual(["We're thinking of you", 'Thanks for your report']);
    expect((await pool.query<{ status: string }>(`SELECT status FROM library_posts WHERE id = $1`, [post.rows[0]!.id])).rows[0]!.status).toBe('removed');
    expect((await pool.query(`SELECT 1 FROM sanctions WHERE user_id = $1`, [t.id])).rowCount).toBe(0);
  });

  it('a removal asked for as an action removes the content, and one about nothing is refused up front', async () => {
    const post = ((await call('POST', '/library/posts', author.token, { type: 'poem', title: 'Duyem', body: 'spam spam spam' })).json() as { id: string }).id;
    const caseId = await reportCase(reporter2, { targetType: 'library_post', targetId: post, category: 'spam' });
    const res = await decide(modA, caseId, {
      outcome: 'actioned',
      policy: 'spam',
      actions: [{ target: 'subject', kind: 'content_removal', statement: 'Advertising is not allowed in the library.' }],
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as DecideResult).sanctions.map((s) => s.kind)).toEqual(['content_removal']);
    expect((await pool.query<{ status: string }>(`SELECT status FROM library_posts WHERE id = $1`, [post])).rows[0]!.status).toBe('removed');
    expect((await detail(caseId)).case.contentRemoved).toBe(true);

    const person = await target('nothingtoremove');
    const userCase = await reportCase(reporter2, { targetType: 'user', targetId: person.id, category: 'spam' });
    const refused = await decide(modA, userCase, { outcome: 'actioned', policy: 'spam', removeContent: true, preview: true });
    expect(refused.statusCode).toBe(422);
    expect(refused.json().code).toBe('NOTHING_TO_REMOVE');
  });

  it('a permanent ban waits for a second admin, with an emergency suspension meanwhile', async () => {
    const victim = await kit.person('banned');
    created.push(victim.id);
    const caseId = await reportCase(reporter, { targetType: 'user', targetId: victim.id, category: 'harassment' });
    const banAction = { target: 'subject', kind: 'permanent_ban', statement: 'Months of abuse towards several members.' };
    const preview = (await decide(modA, caseId, { outcome: 'actioned', policy: 'harassment', actions: [banAction], preview: true })).json() as DecideResult;
    expect(preview.permanentBans[0]).toMatchObject({ mode: 'second_approval', usernameRequired: false });
    // what the person gets now (the emergency suspension) and once it is confirmed
    expect(preview.messages.map((m) => m.title)).toEqual(['Your account is suspended', 'Your account has been closed', 'Thanks for your report']);
    const res = await decide(modA, caseId, { outcome: 'actioned', policy: 'harassment', actions: [banAction] });
    expect(res.statusCode).toBe(200);
    expect((res.json() as DecideResult).status).toBe('needs_second_approval');

    const login = await kit.login(victim);
    expect(login.statusCode).toBe(403);
    expect(login.json().code).toBe('ACCOUNT_SUSPENDED');
    const until = Date.parse(login.json().details.until);
    expect(until - Date.now()).toBeGreaterThan(71 * 3_600_000);

    const pending = ((await call('GET', '/admin/moderation/approvals', modB.token)).json() as { approvals: PendingApproval[] }).approvals.find(
      (a) => a.caseId === caseId,
    )!;
    expect(pending.inForce).toBe(false);
    expect((await call('POST', `/admin/moderation/approvals/${pending.sanction.id}/approve`, modA.token)).json().code).toBe('SAME_ADMIN');
    // a second decision while it waits is refused
    expect((await decide(modB, caseId, { outcome: 'no_violation' })).json().code).toBe('PENDING_APPROVAL');

    expect((await call('POST', `/admin/moderation/approvals/${pending.sanction.id}/approve`, modB.token)).statusCode).toBe(200);
    const after = await kit.login(victim);
    expect(after.json().details).toMatchObject({ until: null, policy: 'harassment', statement: 'Months of abuse towards several members.' });
    expect((await detail(caseId)).case.status).toBe('actioned');
    expect(
      (await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND data->>'kind' = 'report_outcome' AND data->>'outcome' = 'actioned'`, [reporter.id])).rowCount,
    ).toBeGreaterThanOrEqual(1);

    // the address cannot simply sign up again, not even with a +tag
    const [local, domain] = victim.email.split('@');
    const again = await call('POST', '/auth/register', null, {
      email: `${local}+new@${domain}`,
      username: `mcagain${kit.suffix}`,
      password: 'a-strong-password1',
      acceptTerms: true,
      birthYear: 1990,
      birthMonth: 6,
    });
    expect(again.statusCode).toBe(400);
    expect(again.json().code).toBe('SIGNUP_REJECTED');
  });

  it('a turned-down ban lifts the emergency suspension and puts the case back', async () => {
    const victim = await kit.person('spared');
    created.push(victim.id);
    const caseId = await reportCase(reporter, { targetType: 'user', targetId: victim.id, category: 'spam' });
    await decide(modA, caseId, {
      outcome: 'actioned',
      policy: 'spam',
      actions: [{ target: 'subject', kind: 'permanent_ban', statement: 'Spam.' }],
    });
    expect((await kit.login(victim)).statusCode).toBe(403);
    const pending = ((await call('GET', '/admin/moderation/approvals', modB.token)).json() as { approvals: PendingApproval[] }).approvals.find(
      (a) => a.caseId === caseId,
    )!;
    const rejected = await call('POST', `/admin/moderation/approvals/${pending.sanction.id}/reject`, modB.token, { reason: 'too harsh for a first time' });
    expect(rejected.statusCode).toBe(200);
    expect((await kit.login(victim)).statusCode).toBe(200);
    expect((await detail(caseId)).case).toMatchObject({ status: 'open', resolutionNote: 'Permanent ban not confirmed: too harsh for a first time' });
  });

  it('with only one moderator, a permanent ban needs the username typed, and says so', async () => {
    moderators = 1;
    try {
      const t = await target('solo');
      const caseId = await reportCase(reporter, { targetType: 'user', targetId: t.id, category: 'violence' });
      const ban = { target: 'subject', kind: 'permanent_ban', statement: 'A credible threat of violence.' };
      // the preview tells the panel to ask for the username, instead of refusing
      const preview = await decide(modA, caseId, { outcome: 'actioned', policy: 'violence', actions: [ban], preview: true });
      expect(preview.statusCode).toBe(200);
      expect((preview.json() as DecideResult).permanentBans).toEqual([
        { target: 'subject', userId: t.id, username: t.username, mode: 'single', usernameRequired: true },
      ]);
      const untyped = await decide(modA, caseId, { outcome: 'actioned', policy: 'violence', actions: [ban] });
      expect(untyped.json().code).toBe('CONFIRM_USERNAME_REQUIRED');
      const wrong = await decide(modA, caseId, { outcome: 'actioned', policy: 'violence', actions: [ban], confirmUsername: 'someone_else' });
      expect(wrong.json().code).toBe('CONFIRM_USERNAME_REQUIRED');
      const typed = await decide(modA, caseId, { outcome: 'actioned', policy: 'violence', actions: [ban], confirmUsername: t.username.toUpperCase() });
      expect(typed.statusCode).toBe(200);
      const out = typed.json() as DecideResult;
      expect(out.status).toBe('actioned');
      expect(out.sanctions[0]).toMatchObject({ kind: 'permanent_ban', singleApproved: true, active: true, pendingApproval: false });
    } finally {
      moderators = 2;
    }
  });

  it('a child-safety ban applies at once, and is confirmed afterwards', async () => {
    const t = await target('zerotol');
    const caseId = await reportCase(reporter, { targetType: 'user', targetId: t.id, category: 'child_safety' });
    const res = await decide(modA, caseId, {
      outcome: 'actioned',
      policy: 'child_safety',
      actions: [{ target: 'subject', kind: 'permanent_ban', statement: 'You sent sexual messages to a child.' }],
    });
    expect((res.json() as DecideResult).status).toBe('actioned');
    expect((res.json() as DecideResult).sanctions[0]).toMatchObject({ zeroTolerance: true, active: true, singleApproved: false });
    const waiting = ((await call('GET', '/admin/moderation/approvals', modB.token)).json() as { approvals: PendingApproval[] }).approvals.find(
      (a) => a.caseId === caseId,
    )!;
    expect(waiting.inForce).toBe(true);
    expect((await call('POST', `/admin/moderation/approvals/${waiting.sanction.id}/approve`, modB.token)).statusCode).toBe(200);
    const s = await pool.query<{ approved_by: string }>(`SELECT approved_by FROM sanctions WHERE id = $1`, [waiting.sanction.id]);
    expect(s.rows[0]!.approved_by).toBe(modB.id);
  });

  it('CSAM: hides, preserves, bans for good, and opens the filing task', async () => {
    const offender = await kit.person('offender');
    created.push(offender.id);
    const key = `image-post/csam_${kit.suffix}.webp`;
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status) VALUES ($1, 'image/webp', 1024, now(), 'cleared')`,
      [key],
    );
    const post = (await call('POST', '/images', offender.token, { imageMediaId: key, caption: 'x' })).json() as { id: string };
    const caseId = await reportCase(reporter, { targetType: 'image_post', targetId: post.id, category: 'child_safety' });

    const res = await call('POST', `/admin/moderation/cases/${caseId}/csam`, modA.token, { note: 'hash-checked by eye, blurred' });
    expect(res.statusCode).toBe(200);
    const out = res.json() as { status: string; escalation: { id: string; links: Array<{ url: string }> } };
    expect(out.status).toBe('escalated');
    expect(out.escalation.links.map((l) => l.url)).toContain('https://report.cybertip.org/');

    expect((await pool.query<{ status: string }>(`SELECT status FROM image_posts WHERE id = $1`, [post.id])).rows[0]!.status).toBe('removed');
    const media = await pool.query<{ scan_status: string; preserve_evidence: boolean }>(`SELECT scan_status, preserve_evidence FROM media_uploads WHERE key = $1`, [key]);
    expect(media.rows[0]).toEqual({ scan_status: 'blocked', preserve_evidence: true });
    const ban = await pool.query<{ kind: string; zero_tolerance: boolean; policy: string }>(
      `SELECT kind, zero_tolerance, policy FROM sanctions WHERE user_id = $1 AND revoked_at IS NULL`,
      [offender.id],
    );
    expect(ban.rows).toEqual([{ kind: 'permanent_ban', zero_tolerance: true, policy: 'child_safety' }]);
    expect((await kit.login(offender)).json().details.until).toBeNull();

    // filed with the hotline: the reference is kept and the case closes
    const filed = await call('POST', `/admin/moderation/escalations/${out.escalation.id}/filed`, modA.token, { reference: 'CT-12345' });
    expect(filed.statusCode).toBe(200);
    expect((await detail(caseId)).case.status).toBe('actioned');
  });

  it('a CSAM hash match cannot be dismissed', async () => {
    const scan = await pool.query<{ id: string }>(
      `INSERT INTO image_scans (media_key, surface, action, reasons, csam_match, preserve_evidence, model_version)
       VALUES ($1, 'feed', 'hard_block', ARRAY['csam'], true, true, 'test') RETURNING id`,
      [`mc-scan-${kit.suffix}`],
    );
    const page = (await call('GET', `/admin/moderation/queue?q=${scan.rows[0]!.id}`, modA.token)).json() as CaseQueuePage;
    const c = page.cases[0]!;
    expect(c).toMatchObject({ source: 'image_flag', priority: 0, category: 'child_safety' });
    const res = await decide(modA, c.id, { outcome: 'no_violation' });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('PRESERVED_EVIDENCE');
    expect((await pool.query<{ status: string }>(`SELECT status FROM image_scans WHERE id = $1`, [scan.rows[0]!.id])).rows[0]!.status).toBe('pending');
    await pool.query(`DELETE FROM moderation_cases WHERE id = $1`, [c.id]);
    await pool.query(`DELETE FROM image_scans WHERE id = $1`, [scan.rows[0]!.id]);
  });

  it('reopens a decided case and escalates an open one', async () => {
    const t = await target('reopen');
    const caseId = await reportCase(reporter, { targetType: 'user', targetId: t.id, category: 'impersonation' });
    await decide(modA, caseId, { outcome: 'no_violation' });
    expect((await call('POST', `/admin/moderation/cases/${caseId}/reopen`, modB.token, { reason: 'new screenshots' })).statusCode).toBe(200);
    expect((await detail(caseId)).case.status).toBe('open');
    expect((await call('POST', `/admin/moderation/cases/${caseId}/reopen`, modB.token, { reason: 'x' })).json().code).toBe('CASE_OPEN');

    const esc = await call('POST', `/admin/moderation/cases/${caseId}/escalate`, modA.token, { reason: 'needs a lawyer' });
    expect(esc.statusCode).toBe(200);
    const d = await detail(caseId);
    expect(d.case.status).toBe('escalated');
    expect(d.escalations[0]).toMatchObject({ kind: 'escalation', reason: 'needs a lawyer', status: 'open' });
    // still decidable once escalated
    expect((await decide(modB, caseId, { outcome: 'actioned', policy: 'impersonation', actions: [{ target: 'subject', kind: 'warning', statement: 'Do not pretend to be others.' }] })).statusCode).toBe(200);
  });

  it('notes are for admins, and the case view shows reporters with their record', async () => {
    const t = await target('notes');
    const caseId = await reportCase(reporter, { targetType: 'user', targetId: t.id, category: 'spam' });
    const note = await call('POST', `/admin/moderation/cases/${caseId}/note`, modA.token, { text: 'asked for a screenshot' });
    expect(note.statusCode).toBe(201);
    const d = await detail(caseId);
    expect(d.notes[0]).toMatchObject({ text: 'asked for a screenshot', authorId: modA.id, authorUsername: modA.username });
    const r = d.reports[0]!.reporter!;
    expect(r.id).toBe(reporter.id);
    expect(r.reportsLast30Days).toBeGreaterThanOrEqual(5);
    expect(r.accuracyPercent).not.toBeNull(); // several of theirs were decided above
    expect(d.subject).toMatchObject({ id: t.id, age: 'adult' });
    expect(Array.isArray(d.subject!.linkedAccounts)).toBe(true);
  });

  it('sanctions, lifts, revokes and signs out from the user page', async () => {
    const victim = await kit.person('userpage');
    created.push(victim.id);
    const applied = await call('POST', `/admin/users/${victim.id}/sanctions`, modA.token, {
      kind: 'post_mute', durationHours: 72, policy: 'spam', statement: 'Lots of copy-pasted comments.', internalNote: 'see case',
    });
    expect(applied.statusCode).toBe(201);
    const sanctionId = (applied.json() as { sanctions: Array<{ id: string }> }).sanctions[0]!.id;
    expect((await call('POST', `/admin/users/${modA.id}/sanctions`, modA.token, { kind: 'warning', policy: 'spam', statement: 'x' })).json().code).toBe(
      'CONFLICT_OF_INTEREST',
    );

    const page = (await call('GET', `/admin/users/${victim.id}`, modA.token)).json() as { sanctions: Array<{ id: string }>; reportsAgainst: unknown[]; appeals: unknown[] };
    expect(page.sanctions.map((s) => s.id)).toContain(sanctionId);
    expect(Array.isArray(page.reportsAgainst)).toBe(true);

    const revoked = await call('POST', `/admin/sanctions/${sanctionId}/revoke`, modB.token, { reason: 'mistake' });
    expect(revoked.statusCode).toBe(200);
    expect((revoked.json() as { sanction: { revokedAt: string | null } }).sanction.revokedAt).not.toBeNull();
    expect((await call('POST', `/admin/sanctions/${sanctionId}/revoke`, modB.token, { reason: 'again' })).json().code).toBe('ALREADY_REVOKED');

    expect((await call('GET', '/me', victim.token)).statusCode).toBe(200);
    const out = await call('POST', `/admin/users/${victim.id}/sessions/revoke`, modA.token);
    expect(out.statusCode).toBe(200);
    expect((await call('GET', '/me', victim.token)).statusCode).toBe(401);
    const refresh = await call('POST', '/auth/refresh', null, { refreshToken: victim.refreshToken });
    expect(refresh.statusCode).toBe(401);
  });

  it('nobody handles a case about themselves, lifts their own sanctions, or reviews their own appeal', async () => {
    const accuser = await kit.person('accuser');
    created.push(accuser.id);
    const caseId = await reportCase(accuser, { targetType: 'user', targetId: modA.id, category: 'harassment', note: 'the moderator insulted me' });
    const conflict = (res: { statusCode: number; json: () => { code: string } }) => {
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('CONFLICT_OF_INTEREST');
    };

    // not in their queue, and they cannot open, hold or annotate it
    const mine = (await call('GET', `/admin/moderation/queue?q=${caseId}`, modA.token)).json() as CaseQueuePage;
    expect(mine.cases).toHaveLength(0);
    expect(((await call('GET', `/admin/moderation/queue?q=${caseId}`, modB.token)).json() as CaseQueuePage).cases).toHaveLength(1);
    conflict(await call('GET', `/admin/moderation/cases/${caseId}`, modA.token));
    conflict(await call('POST', `/admin/moderation/cases/${caseId}/claim`, modA.token));
    conflict(await call('POST', `/admin/moderation/cases/${caseId}/note`, modA.token, { text: 'nothing happened' }));
    // nor retaliate against the person who reported them
    conflict(await call('POST', `/admin/users/${accuser.id}/sanctions`, modA.token, { kind: 'warning', policy: 'spam', statement: 'Stop.' }));

    // another moderator mutes them; they cannot lift it themselves, by any route
    const muted = await call('POST', `/admin/users/${modA.id}/sanctions`, modB.token, {
      kind: 'post_mute', durationHours: 24, policy: 'harassment', statement: 'Insults in comments.',
    });
    expect(muted.statusCode).toBe(201);
    const muteOnA = (muted.json() as { sanctions: Array<{ id: string }> }).sanctions[0]!.id;
    conflict(await call('POST', `/admin/sanctions/${muteOnA}/revoke`, modA.token, { reason: 'mistake' }));
    conflict(await call('POST', `/admin/users/${modA.id}/unmute`, modA.token, { reason: 'mistake' }));
    conflict(await call('POST', `/admin/users/${modA.id}/chat-mute/lift`, modA.token, { reason: 'mistake' }));
    // nor answer their own appeal
    const appeal = (await call('POST', '/me/appeals', modA.token, { sanctionId: muteOnA, text: 'I did nothing wrong.' })).json() as { id: string };
    conflict(await call('POST', `/admin/appeals/${appeal.id}/decide`, modA.token, { outcome: 'overturned', note: 'agreed' }));

    // decided by someone else, it cannot be reopened by the person it was about
    expect((await decide(modB, caseId, { outcome: 'no_violation' })).statusCode).toBe(200);
    conflict(await call('POST', `/admin/moderation/cases/${caseId}/reopen`, modA.token, { reason: 'look again' }));

    // a reporter is no second opinion on a ban of the person they reported
    const offender = await target('coiban');
    const banCase = await reportCase(modA, { targetType: 'user', targetId: offender.id, category: 'harassment' });
    await decide(modB, banCase, { outcome: 'actioned', policy: 'harassment', actions: [{ target: 'subject', kind: 'permanent_ban', statement: 'Abuse.' }] });
    const pending = ((await call('GET', '/admin/moderation/approvals', legacy.token)).json() as { approvals: PendingApproval[] }).approvals.find(
      (a) => a.caseId === banCase,
    )!;
    conflict(await call('POST', `/admin/moderation/approvals/${pending.sanction.id}/approve`, modA.token));
    expect((await call('POST', `/admin/moderation/approvals/${pending.sanction.id}/approve`, legacy.token)).statusCode).toBe(200);
  });
});
