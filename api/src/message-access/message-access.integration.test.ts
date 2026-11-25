/**
 * Who may read letters and private chats, against real Postgres: only a superadmin opens a safety review, with a reason
 * and a note; only its reader opens what it covers, for 24 hours, and never someone they write with; every grant and
 * reading is on the Access log, in the audit trail and in the security log, never a word of what was read; and nobody
 * is told. Reported and flagged letters and messages are read in their cases, recorded the same way, and only serious
 * flags, or flags on what was sent to a minor, reach a moderator at all.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { AccessLogPage, CaseDetail, CaseQueuePage, ReviewConversationPage, ReviewOpened, SafetyReview } from '@kurda/shared';
import { SAFETY_REVIEW_READS_PER_HOUR, SAFETY_REVIEWS_PER_DAY } from '@kurda/shared';
import { buildApp } from '../app.js';
import { AuditService } from '../admin/audit-service.js';
import { loadConfig } from '../config/env.js';
import { canonicalPair } from '../friends/pair.js';
import { eraseAccountData } from '../gdpr/service.js';
import { ModerationQueueService } from '../moderation/queue-service.js';
import { NO_SECURITY_LOG } from '../security/log.js';
import { bornYearsAgo } from '../test/age.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';
import { MessageAccessService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const HOUR = 3_600_000;

async function eventually<T>(fn: () => Promise<T>, ok: (v: T) => boolean, tries = 80, delayMs = 25): Promise<T> {
  let value = await fn();
  for (let i = 0; i < tries && !ok(value); i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    value = await fn();
  }
  return value;
}

describe.skipIf(!DATABASE_URL)('reading letters and private chats (integration)', { timeout: 60_000 }, () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const kit = moderationKit(() => app, () => pool, 'ma', 151);
  const { call } = kit;
  // words no log may ever hold: they are only ever in the letters, notes and messages themselves
  const secret = `nightingale${kit.suffix}`;
  const people: Person[] = [];
  const groups: string[] = [];

  let owner: Person;
  let checker: Person;
  let other: Person;
  let moderator: Person;
  let support: Person;
  let rojda: Person;
  let baran: Person;
  let dilan: Person;
  let threadId: string;
  let groupId: string;
  let reviewId: string;
  let reportCaseId: string;
  let notifiedBefore = 0;
  const notified = async (): Promise<number> =>
    (await pool.query(`SELECT 1 FROM notifications WHERE user_id = ANY($1::uuid[])`, [[rojda.id, baran.id, dilan.id]])).rowCount ?? 0;

  const note = 'A report about these letters says an adult is asking a teen to meet in secret.';
  const grant = (by: Person, subject: string, body: Record<string, unknown>) => call('POST', `/admin/users/${subject}/safety-reviews`, by.token, body);
  const person = async (tag: string, years = 30): Promise<Person> => {
    const p = await kit.person(tag, bornYearsAgo(years));
    people.push(p);
    return p;
  };
  const admin = async (tag: string, roles: string[]): Promise<Person> => {
    const p = await kit.admin(tag, roles);
    people.push(p);
    return p;
  };
  const dm = async (from: Person, to: Person, body: string, minutesAgo = 0): Promise<string> => {
    const { lo, hi } = canonicalPair(from.id, to.id);
    const r = await pool.query<{ id: string }>(
      `INSERT INTO dm_messages (user_lo, user_hi, sender_id, body, created_at) VALUES ($1, $2, $3, $4, now() - make_interval(mins => $5)) RETURNING id`,
      [lo, hi, from.id, body, minutesAgo],
    );
    return r.rows[0]!.id;
  };
  const group = async (owner: Person): Promise<string> => {
    const id = (await pool.query<{ id: string }>(`INSERT INTO groups (name, owner_id) VALUES ($1, $2) RETURNING id`, [`Kom ${randomUUID().slice(0, 6)}`, owner.id])).rows[0]!.id;
    groups.push(id);
    await pool.query(`INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES ($1, $2, 'owner', now() - interval '3 days')`, [id, owner.id]);
    return id;
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    owner = await admin('own', ['superadmin']);
    checker = await admin('chk', ['superadmin']);
    other = await admin('oth', ['superadmin']);
    moderator = await admin('mod', ['moderator']);
    support = await admin('sup', ['support']);
    rojda = await person('rojda');
    baran = await person('baran');
    dilan = await person('dilan');

    // Rojda and Baran write letters, one with a note; she has a letter of her own not in a correspondence yet
    const { lo, hi } = canonicalPair(rojda.id, baran.id);
    threadId = (await pool.query<{ id: string }>(`INSERT INTO letter_threads (user_lo, user_hi) VALUES ($1, $2) RETURNING id`, [lo, hi])).rows[0]!.id;
    const decor = { paper: { style: 'plain', tone: 'cream', ink: 'ink' }, strokes: [], notes: [{ text: `note ${secret}`, x: 0.5, y: 0.5, color: 'ink', size: 'm', angle: 0 }] };
    await pool.query(
      `INSERT INTO letters (sender_id, recipient_id, thread_id, body, age_band, status, delivered_at, created_at, decor)
       VALUES ($1, $2, $3, $4, '18+', 'delivered', now(), now() - interval '2 hours', NULL),
              ($2, $1, $3, $5, '18+', 'delivered', now(), now() - interval '1 hour', $6::jsonb)`,
      [rojda.id, baran.id, threadId, `Silav Baran, ${secret}`, `Silav Rojda, ${secret}`, JSON.stringify(decor)],
    );
    await pool.query(`INSERT INTO letters (sender_id, body, age_band, status) VALUES ($1, $2, '18+', 'recalled')`, [rojda.id, `A bird of ${secret}`]);
    // she writes to Dilan directly
    await dm(rojda, dilan, `Hi Dilan ${secret}`, 10);
    await dm(dilan, rojda, `Hi Rojda ${secret}`);
    // a group she joined after its first message, with one message its writer deleted
    groupId = await group(baran);
    await pool.query(`INSERT INTO group_messages (group_id, sender_id, body, created_at) VALUES ($1, $2, $3, now() - interval '2 days')`, [
      groupId,
      baran.id,
      `before she came ${secret}`,
    ]);
    await pool.query(`INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES ($1, $2, 'member', now() - interval '1 day')`, [groupId, rojda.id]);
    await pool.query(
      `INSERT INTO group_messages (group_id, sender_id, body, created_at, deleted_at)
       VALUES ($1, $2, $3, now() - interval '10 minutes', NULL), ($1, $4, $5, now() - interval '5 minutes', now()), ($1, $4, $6, now(), NULL)`,
      [groupId, rojda.id, `Silav hemû ${secret}`, baran.id, `taken back ${secret}`, `Bi xêr hatî ${secret}`],
    );
    notifiedBefore = await notified();
  });

  afterAll(async () => {
    for (const id of groups) await pool.query(`DELETE FROM groups WHERE id = $1`, [id]);
    await pool.query(`DELETE FROM moderation_cases WHERE subject_user_id = ANY($1::uuid[])`, [people.map((p) => p.id)]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [people.map((p) => p.id)]);
    await pool.end();
    await app.close();
  });

  describe('opening a safety review', () => {
    it('is refused to a moderator, and nothing is stored', async () => {
      const res = await grant(moderator, rojda.id, { reason: 'child_safety', note });
      expect(res.statusCode).toBe(403);
      const stored = await pool.query(`SELECT 1 FROM safety_reviews WHERE subject_id = $1`, [rojda.id]);
      expect(stored.rowCount).toBe(0);
    });

    it('needs a reason from the list and a note saying why', async () => {
      expect((await grant(checker, rojda.id, { note })).statusCode).toBe(400);
      expect((await grant(checker, rojda.id, { reason: 'curiosity', note })).statusCode).toBe(400);
      expect((await grant(checker, rojda.id, { reason: 'child_safety', note: 'because' })).statusCode).toBe(400);
      const noCase = await grant(checker, rojda.id, { reason: 'report_context', note });
      expect(noCase.statusCode).toBe(422);
      expect(noCase.json().code).toBe('CASE_REQUIRED');
      expect((await pool.query(`SELECT 1 FROM safety_reviews WHERE granted_by = $1`, [checker.id])).rowCount).toBe(0);
    });

    it('is refused for one’s own account, and for a reader who does not moderate or who writes with the account', async () => {
      const own = await grant(other, other.id, { reason: 'child_safety', note });
      expect(own.json().code).toBe('OWN_MESSAGES');
      const reader = await grant(other, rojda.id, { reason: 'child_safety', note, reviewerId: support.id });
      expect(reader.json().code).toBe('REVIEWER_NOT_STAFF');
      await pool.query(`INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`, [groupId, other.id]);
      const involved = await grant(other, baran.id, { reason: 'child_safety', note });
      expect(involved.json().code).toBe('REVIEWER_INVOLVED');
      expect((await grant(other, randomUUID(), { reason: 'child_safety', note })).statusCode).toBe(404);
    });

    it('opens one account to its reader for exactly 24 hours, once at a time', async () => {
      const res = await grant(owner, rojda.id, { reason: 'child_safety', note, reviewerId: moderator.id });
      expect(res.statusCode, res.body).toBe(201);
      const review = (res.json() as { review: SafetyReview }).review;
      reviewId = review.id;
      expect(review).toMatchObject({ subject: { id: rojda.id }, reviewer: { id: moderator.id }, grantedBy: { id: owner.id }, reason: 'child_safety', open: true });
      expect(Date.parse(review.expiresAt) - Date.parse(review.grantedAt)).toBe(24 * HOUR);
      const again = await grant(owner, rojda.id, { reason: 'child_safety', note, reviewerId: moderator.id });
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('REVIEW_OPEN');
    });

    it('stops a superadmin after a few in a day', async () => {
      for (let i = 0; i < SAFETY_REVIEWS_PER_DAY; i++) {
        await pool.query(`INSERT INTO safety_reviews (subject_id, reviewer_id, granted_by, reason, note, expires_at) VALUES ($1, $2, $2, 'legal_request', $3, now())`, [
          i % 2 === 0 ? baran.id : dilan.id,
          other.id,
          note,
        ]);
      }
      const res = await grant(other, support.id, { reason: 'legal_request', note });
      expect(res.statusCode).toBe(429);
      expect(res.json().code).toBe('REVIEW_LIMIT');
    });

    it('lets exactly one of two grants at once through at the day’s edge', async () => {
      const edge = await admin('edge', ['superadmin']);
      const [a, b, c, d, e, f] = await Promise.all(['ea', 'eb', 'ec', 'ed', 'ee', 'ef'].map((t) => person(t)));
      for (const subject of [a!, b!, c!, d!]) {
        await pool.query(`INSERT INTO safety_reviews (subject_id, reviewer_id, granted_by, reason, note, expires_at) VALUES ($1, $2, $2, 'legal_request', $3, now())`, [
          subject.id,
          edge.id,
          note,
        ]);
      }
      const both = await Promise.all([e!, f!].map((p) => grant(edge, p.id, { reason: 'child_safety', note })));
      expect(both.map((r) => r.statusCode).sort()).toEqual([201, 429]);
    });
  });

  describe('who counts as writing with the account', () => {
    let boss: Person;
    beforeAll(async () => {
      boss = await admin('boss', ['superadmin']);
    });

    it('refuses a reader who wrote in a group with the account and left it', async () => {
      const [kawa, sana, reader] = [await person('kawa'), await person('sana'), await admin('moda', ['moderator'])];
      const g = await group(kawa);
      await pool.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1, $2, now() - interval '2 days'), ($1, $3, now() - interval '2 days')`, [
        g,
        sana.id,
        reader.id,
      ]);
      await pool.query(`INSERT INTO group_messages (group_id, sender_id, body) VALUES ($1, $2, 'hi'), ($1, $3, 'hi back')`, [g, sana.id, reader.id]);
      await pool.query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [g, reader.id]);
      const res = await grant(boss, sana.id, { reason: 'child_safety', note, reviewerId: reader.id });
      expect(res.json().code).toBe('REVIEWER_INVOLVED');
    });

    it('refuses a reader whose bird the account called, or who called the account’s bird', async () => {
      const [aso, zin, reader] = [await person('aso'), await person('zin'), await admin('modd', ['moderator'])];
      const asos = (await pool.query<{ id: string }>(`INSERT INTO letters (sender_id, body, age_band, status) VALUES ($1, 'a bird', '18+', 'recalled') RETURNING id`, [aso.id]))
        .rows[0]!.id;
      await pool.query(`INSERT INTO letter_visits (letter_id, visitor_id, ended_at, outcome) VALUES ($1, $2, now(), 'sent_on')`, [asos, reader.id]);
      expect((await grant(boss, aso.id, { reason: 'child_safety', note, reviewerId: reader.id })).json().code).toBe('REVIEWER_INVOLVED');
      const theirs = (await pool.query<{ id: string }>(`INSERT INTO letters (sender_id, body, age_band, status) VALUES ($1, 'a bird', '18+', 'recalled') RETURNING id`, [reader.id]))
        .rows[0]!.id;
      await pool.query(`INSERT INTO letter_visits (letter_id, visitor_id, ended_at, outcome) VALUES ($1, $2, now(), 'sent_on')`, [theirs, zin.id]);
      expect((await grant(boss, zin.id, { reason: 'child_safety', note, reviewerId: reader.id })).json().code).toBe('REVIEWER_INVOLVED');
    });

    it('closes a review to a reader who starts writing with the account', async () => {
      const [rez, friend, reader] = [await person('rez'), await person('rezf'), await admin('modb', ['moderator'])];
      await dm(rez, friend, 'hello');
      const res = await grant(boss, rez.id, { reason: 'child_safety', note, reviewerId: reader.id });
      expect(res.statusCode, res.body).toBe(201);
      const id = res.json().review.id as string;
      expect((await call('GET', `/admin/safety-reviews/${id}`, reader.token)).statusCode).toBe(200);
      await dm(reader, rez, 'hi there');
      const refused = await call('GET', `/admin/safety-reviews/${id}/conversations/direct/${friend.id}`, reader.token);
      expect(refused.statusCode).toBe(403);
      expect(refused.json().code).toBe('REVIEWER_INVOLVED');
    });
  });

  describe('reading under a review', () => {
    it('shows nothing without a review, or to anyone but its reader', async () => {
      expect((await call('GET', `/admin/safety-reviews/${randomUUID()}`, moderator.token)).statusCode).toBe(404);
      // not even the superadmin who opened it, or another one, may read it
      expect((await call('GET', `/admin/safety-reviews/${reviewId}`, owner.token)).statusCode).toBe(404);
      expect((await call('GET', `/admin/safety-reviews/${reviewId}`, other.token)).statusCode).toBe(404);
      expect((await call('GET', `/admin/safety-reviews/${reviewId}/conversations/letters/${threadId}`, owner.token)).statusCode).toBe(404);
      // a member is answered as if the route were not there
      expect((await call('GET', `/admin/safety-reviews/${reviewId}`, rojda.token)).statusCode).toBe(404);
    });

    it('lists the account’s conversations and opens each, read-only, recording every view', async () => {
      const opened = await call('GET', `/admin/safety-reviews/${reviewId}`, moderator.token);
      expect(opened.statusCode, opened.body).toBe(200);
      const { conversations } = opened.json() as ReviewOpened;
      expect(conversations.map((c) => [c.kind, c.id, c.messages])).toEqual([
        ['letters', threadId, 2],
        ['birds', rojda.id, 1],
        ['direct', dilan.id, 2],
        ['group', groupId, 3],
      ]);
      // the list itself says nothing anyone wrote
      expect(opened.body).not.toContain(secret);

      const read = async (kind: string, id: string): Promise<ReviewConversationPage> => {
        const res = await call('GET', `/admin/safety-reviews/${reviewId}/conversations/${kind}/${id}`, moderator.token);
        expect(res.statusCode, res.body).toBe(200);
        return res.json() as ReviewConversationPage;
      };
      const letters = await read('letters', threadId);
      expect(letters.messages.map((m) => [m.sender?.id, m.fromSubject])).toEqual([
        [rojda.id, true],
        [baran.id, false],
      ]);
      expect(letters.messages[1]!.decor?.notes[0]?.text).toBe(`note ${secret}`);
      expect((await read('birds', rojda.id)).messages).toHaveLength(1);
      expect((await read('direct', dilan.id)).messages.map((m) => m.body)).toEqual([`Hi Dilan ${secret}`, `Hi Rojda ${secret}`]);
      // a group from when she joined, not before; what its writer took back shows that it was, and not a word of it
      const chat = await read('group', groupId);
      expect(chat.messages.map((m) => [m.body, m.status])).toEqual([
        [`Silav hemû ${secret}`, null],
        [null, 'deleted'],
        [`Bi xêr hatî ${secret}`, null],
      ]);
      expect(JSON.stringify(chat)).not.toContain('taken back');

      // nothing of anyone else's: Baran and Dilan's own conversations are not hers
      await dm(baran, dilan, 'not hers');
      expect((await call('GET', `/admin/safety-reviews/${reviewId}/conversations/direct/${rojda.id}`, moderator.token)).statusCode).toBe(404);
      expect((await call('GET', `/admin/safety-reviews/${reviewId}/conversations/birds/${baran.id}`, moderator.token)).statusCode).toBe(404);
      expect((await call('GET', `/admin/safety-reviews/${reviewId}/conversations/letters/${randomUUID()}`, moderator.token)).statusCode).toBe(404);

      const log = await pool.query<{ kind: string; staff_id: string; subject_id: string; conversation_kind: string | null; messages: number | null }>(
        `SELECT kind, staff_id, subject_id, conversation_kind, messages FROM message_access_log WHERE review_id = $1 ORDER BY at, id`,
        [reviewId],
      );
      expect(log.rows.map((r) => [r.kind, r.conversation_kind, r.messages])).toEqual([
        ['granted', null, null],
        ['listed', null, null],
        ['read', 'letters', 2],
        ['read', 'birds', 1],
        ['read', 'direct', 2],
        ['read', 'group', 3],
      ]);
      expect(log.rows.every((r) => r.subject_id === rojda.id)).toBe(true);
      expect(log.rows.slice(1).every((r) => r.staff_id === moderator.id)).toBe(true);

      const audit = await pool.query<{ action: string }>(
        `SELECT action FROM admin_audit_log WHERE target_id = $1 AND action LIKE 'safety_review.%' ORDER BY created_at, id`,
        [rojda.id],
      );
      expect(audit.rows.map((r) => r.action)).toEqual([
        'safety_review.grant',
        'safety_review.list',
        'safety_review.read',
        'safety_review.read',
        'safety_review.read',
        'safety_review.read',
      ]);
      // filed under the staff member, with the account's id alone and the kind of conversation, never another person's
      const events = await eventually(
        () =>
          pool.query<{ kind: string; user_id: string; details: Record<string, unknown> }>(
            `SELECT kind, user_id, details FROM security_events WHERE details->>'subjectId' = $1 AND kind LIKE 'messages.%' ORDER BY occurred_at, id`,
            [rojda.id],
          ),
        (r) => r.rows.length >= 6,
      );
      expect(events.rows.map((r) => [r.kind, r.user_id])).toEqual([
        ['messages.review_granted', owner.id],
        ['messages.review_read', moderator.id],
        ['messages.review_read', moderator.id],
        ['messages.review_read', moderator.id],
        ['messages.review_read', moderator.id],
        ['messages.review_read', moderator.id],
      ]);
      expect(events.rows.map((r) => r.details.conversation)).toEqual([undefined, null, 'letters', 'birds', 'direct', 'group']);
      expect(JSON.stringify(events.rows)).not.toContain(dilan.id);
    });

    it('pages back only within the conversation being read', async () => {
      const ids = (await pool.query<{ id: string; body: string }>(`SELECT id, body FROM dm_messages WHERE sender_id = $1 AND body = $2`, [dilan.id, `Hi Rojda ${secret}`]))
        .rows;
      const back = await call('GET', `/admin/safety-reviews/${reviewId}/conversations/direct/${dilan.id}?before=${ids[0]!.id}`, moderator.token);
      expect(back.statusCode, back.body).toBe(200);
      expect((back.json() as ReviewConversationPage).messages.map((m) => m.body)).toEqual([`Hi Dilan ${secret}`]);
      // a message of someone else's conversation is no place to start from
      const foreign = (await pool.query<{ id: string }>(`SELECT id FROM dm_messages WHERE body = 'not hers' AND sender_id = $1`, [baran.id])).rows[0]!.id;
      expect((await call('GET', `/admin/safety-reviews/${reviewId}/conversations/direct/${dilan.id}?before=${foreign}`, moderator.token)).statusCode).toBe(404);
    });

    it('never puts a word of what was read in any log', async () => {
      const security = await pool.query(`SELECT details FROM security_events WHERE user_id = ANY($1::uuid[]) OR actor_id = ANY($1::uuid[])`, [[owner.id, moderator.id, rojda.id]]);
      const audit = await pool.query(`SELECT action, reason, before, after FROM admin_audit_log WHERE admin_id = ANY($1::uuid[])`, [[owner.id, moderator.id]]);
      const access = await pool.query(`SELECT * FROM message_access_log WHERE subject_id = $1`, [rojda.id]);
      expect(access.rowCount).toBeGreaterThan(0);
      for (const rows of [security.rows, audit.rows, access.rows]) expect(JSON.stringify(rows)).not.toContain(secret);
    });

    it('tells nobody, the person under review least of all, and changes nothing they see', async () => {
      expect(await notified()).toBe(notifiedBefore);
      const unread = await pool.query(`SELECT read_at FROM dm_messages WHERE sender_id = $1`, [rojda.id]);
      expect(unread.rows.every((r: { read_at: Date | null }) => r.read_at === null)).toBe(true);
      expect((await call('GET', '/me/reports', rojda.token)).body).not.toContain(reviewId);
    });

    it('ends after 24 hours, or sooner when its reader ends it', async () => {
      // the table sets the times, so a review cannot be written as already running, or for longer
      const stale = await pool.query<{ granted_at: Date; expires_at: Date }>(
        `INSERT INTO safety_reviews (subject_id, reviewer_id, granted_by, reason, note, granted_at, expires_at)
         VALUES ($1, $2, $3, 'threat_to_life', $4, now() - interval '25 hours', now() + interval '30 days') RETURNING granted_at, expires_at`,
        [dilan.id, moderator.id, owner.id, note],
      );
      expect(Math.abs(stale.rows[0]!.granted_at.getTime() - Date.now())).toBeLessThan(60_000);
      expect(stale.rows[0]!.expires_at.getTime() - stale.rows[0]!.granted_at.getTime()).toBe(24 * HOUR);

      // a day and an hour later, the review opens nothing
      const later = new MessageAccessService(pool, { audit: new AuditService(pool), securityLog: () => NO_SECURITY_LOG, now: () => new Date(Date.now() + 25 * HOUR) });
      await expect(later.opened(reviewId, moderator.id)).rejects.toMatchObject({ code: 'REVIEW_ENDED' });
      await expect(later.read(reviewId, moderator.id, 'birds', rojda.id, null)).rejects.toMatchObject({ code: 'REVIEW_ENDED' });

      const ended = await call('POST', `/admin/safety-reviews/${reviewId}/end`, moderator.token);
      expect(ended.statusCode, ended.body).toBe(200);
      expect((ended.json() as { review: SafetyReview }).review).toMatchObject({ open: false, endedBy: { id: moderator.id } });
      expect((await call('GET', `/admin/safety-reviews/${reviewId}`, moderator.token)).statusCode).toBe(410);
      expect((await call('GET', `/admin/safety-reviews/${reviewId}/conversations/birds/${rojda.id}`, moderator.token)).statusCode).toBe(410);
      expect((await call('POST', `/admin/safety-reviews/${reviewId}/end`, moderator.token)).statusCode).toBe(409);
    });

    it('stops a reader past the pages an hour allows, counted in the database', async () => {
      const [ara, friend, reader] = [await person('ara'), await person('araf'), await admin('modr', ['moderator'])];
      await dm(ara, friend, 'hello');
      const id = (
        await pool.query<{ id: string }>(
          `INSERT INTO safety_reviews (subject_id, reviewer_id, granted_by, reason, note, expires_at) VALUES ($1, $2, $3, 'legal_request', $4, now()) RETURNING id`,
          [ara.id, reader.id, owner.id, note],
        )
      ).rows[0]!.id;
      await pool.query(
        `INSERT INTO message_access_log (kind, staff_id, subject_id, review_id, basis, conversation_kind, conversation_id, messages)
         SELECT 'read', $1, $2, $3, 'safety_review', 'direct', $4, 1 FROM generate_series(1, $5)`,
        [reader.id, ara.id, id, friend.id, SAFETY_REVIEW_READS_PER_HOUR],
      );
      const res = await call('GET', `/admin/safety-reviews/${id}/conversations/direct/${friend.id}`, reader.token);
      expect(res.statusCode).toBe(429);
      expect(res.json().code).toBe('READ_LIMIT');
      const count = await pool.query(`SELECT 1 FROM message_access_log WHERE staff_id = $1 AND kind = 'read'`, [reader.id]);
      expect(count.rowCount).toBe(SAFETY_REVIEW_READS_PER_HOUR);
    });

    it('keeps reviews and their record as they were written, and cannot be emptied', async () => {
      await expect(pool.query(`UPDATE safety_reviews SET note = 'something else entirely, and long enough' WHERE id = $1`, [reviewId])).rejects.toThrow();
      await expect(pool.query(`UPDATE safety_reviews SET expires_at = expires_at + interval '1 day' WHERE id = $1`, [reviewId])).rejects.toThrow();
      await expect(pool.query(`DELETE FROM safety_reviews WHERE id = $1`, [reviewId])).rejects.toThrow();
      await expect(pool.query(`DELETE FROM message_access_log WHERE review_id = $1`, [reviewId])).rejects.toThrow();
      await expect(pool.query(`UPDATE message_access_log SET messages = 0 WHERE review_id = $1`, [reviewId])).rejects.toThrow();
      for (const table of ['safety_reviews', 'message_access_log', 'admin_audit_log', 'security_events']) {
        await expect(pool.query(`TRUNCATE ${table} CASCADE`)).rejects.toThrow(/append-only/);
      }
    });
  });

  describe('the Access log', () => {
    it('is read by every admin, says who opened whose messages and why, and is closed to members', async () => {
      const res = await call('GET', '/admin/message-access/log?limit=200', support.token);
      expect(res.statusCode, res.body).toBe(200);
      const page = res.json() as AccessLogPage;
      const mine = page.entries.filter((e) => e.review?.id === reviewId);
      expect(mine[0]!.kind).toBe('ended');
      expect(mine.at(-1)).toMatchObject({ kind: 'granted', staff: { id: owner.id }, subject: { id: rojda.id }, review: { reason: 'child_safety' } });
      expect(mine.filter((e) => e.kind === 'read').map((e) => e.conversation)).toEqual([{ kind: 'direct' }, { kind: 'group' }, { kind: 'direct' }, { kind: 'birds' }, { kind: 'letters' }]);
      expect(res.body).not.toContain(secret);
    });

    it('keeps the note and the case for superadmins', async () => {
      const support_ = (await call('GET', '/admin/message-access/log?limit=200', support.token)).json() as AccessLogPage;
      expect(support_.entries.every((e) => e.caseId === null && (e.review === null || e.review.note === null))).toBe(true);
      expect(support_.open.every((r) => r.note === null && r.caseId === null)).toBe(true);
      const owners = (await call('GET', '/admin/message-access/log?limit=200', owner.token)).json() as AccessLogPage;
      expect(owners.entries.find((e) => e.review?.id === reviewId)?.review?.note).toBe(note);
      // a moderator sees which reviews are open, and only their own with its note
      const open = (await call('GET', '/admin/safety-reviews', moderator.token)).json() as { reviews: SafetyReview[] };
      expect(open.reviews.every((r) => r.yours || (r.note === null && r.caseId === null))).toBe(true);
      expect((await call('GET', '/admin/message-access/log', rojda.token)).statusCode).toBe(404);
    });
  });

  describe('reported letters, and a review for a report that needs more context', () => {
    it('records a moderator reading a reported letter in its case, once while they work on it', async () => {
      const letter = await pool.query<{ id: string }>(`SELECT id FROM letters WHERE thread_id = $1 AND sender_id = $2`, [threadId, baran.id]);
      const filed = await call('POST', '/reports', rojda.token, { targetType: 'letter', targetId: letter.rows[0]!.id, category: 'harassment' });
      expect(filed.statusCode, filed.body).toBe(201);
      reportCaseId = filed.json().report.caseId as string;
      const detail = await call('GET', `/admin/moderation/cases/${reportCaseId}`, moderator.token);
      expect(detail.statusCode, detail.body).toBe(200);
      // the reported letter in full, with the letters round it marked
      const evidence = (detail.json() as CaseDetail).reports[0]!.evidence as { decor?: { notes: Array<{ text: string }> }; context?: Array<{ reported: boolean }> };
      expect(evidence.decor?.notes[0]?.text).toBe(`note ${secret}`);
      expect(evidence.context?.map((m) => m.reported)).toEqual([false, true]);
      expect((await call('GET', `/admin/moderation/cases/${reportCaseId}`, moderator.token)).statusCode).toBe(200);
      const reads = await pool.query(`SELECT basis, subject_id FROM message_access_log WHERE kind = 'case' AND case_id = $1`, [reportCaseId]);
      expect(reads.rows).toEqual([{ basis: 'report', subject_id: baran.id }]);
      const audit = await pool.query(`SELECT 1 FROM admin_audit_log WHERE action = 'case.read_messages' AND target_id = $1`, [reportCaseId]);
      expect(audit.rowCount).toBe(1);
    });

    it('opens only the conversation of its open case, and never ties a reporter to their report for other admins', async () => {
      const judge = await admin('judge', ['superadmin']);
      // the case is about Baran's letter; Dilan is in it nowhere
      expect((await grant(judge, dilan.id, { reason: 'report_context', note, caseId: reportCaseId })).json().code).toBe('CASE_NOT_ABOUT_ACCOUNT');
      const res = await grant(judge, rojda.id, { reason: 'report_context', note, caseId: reportCaseId, reviewerId: moderator.id });
      expect(res.statusCode, res.body).toBe(201);
      const id = res.json().review.id as string;
      const opened = (await call('GET', `/admin/safety-reviews/${id}`, moderator.token)).json() as ReviewOpened;
      expect(opened.conversations.map((c) => [c.kind, c.id])).toEqual([['letters', threadId]]);
      expect((await call('GET', `/admin/safety-reviews/${id}/conversations/letters/${threadId}`, moderator.token)).statusCode).toBe(200);
      expect((await call('GET', `/admin/safety-reviews/${id}/conversations/direct/${dilan.id}`, moderator.token)).statusCode).toBe(404);

      const forSupport = (await call('GET', '/admin/message-access/log?limit=200', support.token)).json() as AccessLogPage;
      expect(forSupport.entries.some((e) => e.caseId !== null)).toBe(false);

      // a decided case needs no more context
      await pool.query(`UPDATE moderation_cases SET status = 'no_violation', resolution = 'no_violation', resolved_at = now() WHERE id = $1`, [reportCaseId]);
      expect((await grant(judge, rojda.id, { reason: 'report_context', note, caseId: reportCaseId })).json().code).toBe('CASE_CLOSED');
    });
  });

  describe('letters and messages the word filter flags', () => {
    const flagged = (ref: string) =>
      eventually(
        () => pool.query<{ top_category: string; minor_target: boolean }>(`SELECT top_category, minor_target FROM moderation_flags WHERE content_ref = $1`, [ref]),
        (r) => (r.rowCount ?? 0) > 0,
      );
    const wordCase = async (p: Person) => {
      const res = await call('GET', `/admin/moderation/queue?source=automated&q=${p.username}`, moderator.token);
      expect(res.statusCode, res.body).toBe(200);
      return (res.json() as CaseQueuePage).cases.find((c) => c.subject?.id === p.id && c.summary.startsWith('Word filter'));
    };
    let teen: Person;

    beforeAll(async () => {
      const { lo, hi } = canonicalPair(baran.id, dilan.id);
      await pool.query(`INSERT INTO friendships (user_lo, user_hi, status) VALUES ($1, $2, 'accepted') ON CONFLICT DO NOTHING`, [lo, hi]);
    });

    it('only counts plain swearing between adults against its writer', async () => {
      const before = await pool.query<{ offense_count: number }>(`SELECT offense_count FROM chat_offenses WHERE user_id = $1`, [baran.id]);
      const sent = await call('POST', `/chat/${dilan.id}/messages`, baran.token, { body: `you shit ${secret}` });
      expect(sent.statusCode, sent.body).toBe(200);
      await eventually(
        () => pool.query<{ offense_count: number }>(`SELECT offense_count FROM chat_offenses WHERE user_id = $1`, [baran.id]),
        (r) => (r.rows[0]?.offense_count ?? 0) > (before.rows[0]?.offense_count ?? 0),
      );
      expect((await pool.query(`SELECT 1 FROM moderation_flags WHERE content_ref = $1`, [sent.json().id])).rowCount).toBe(0);
      expect(await wordCase(baran)).toBeUndefined();
    });

    it('puts a sexual word in a direct message before a moderator, shown alone', async () => {
      const sent = await call('POST', `/chat/${dilan.id}/messages`, baran.token, { body: `send me your dick ${secret}` });
      expect(sent.statusCode, sent.body).toBe(200);
      expect((await flagged(sent.json().id)).rows[0]).toMatchObject({ top_category: 'sexual', minor_target: false });
      const c = (await wordCase(baran))!;
      expect(c).toMatchObject({ source: 'text_flag', targetType: 'dm_message', category: 'sexual', priority: 1, summary: 'Word filter: a direct message' });
      const detail = (await call('GET', `/admin/moderation/cases/${c.id}`, moderator.token)).json() as CaseDetail;
      const shown = detail.case.evidence as { words?: string; snapshot?: { text: string; context: unknown[] } };
      expect(shown.words).toBe('dick');
      // masked as it was delivered, and nothing of the conversation around it
      expect(shown.snapshot?.text).toBe(`send me your **** ${secret}`);
      expect(shown.snapshot?.context).toEqual([]);
      const reads = await pool.query(`SELECT basis FROM message_access_log WHERE kind = 'case' AND case_id = $1`, [c.id]);
      expect(reads.rows).toEqual([{ basis: 'flag' }]);
    });

    it('puts any flagged letter of the teens’ bands before a moderator, as about a minor', async () => {
      teen = await person('teen', 14);
      const bird = await call('POST', '/letters/out', teen.token, { body: 'Silav, ez Zara me. Fuuuck, kurdî zehmet e!' });
      expect(bird.statusCode, bird.body).toBe(200);
      const letterId = (await pool.query<{ id: string }>(`SELECT id FROM letters WHERE sender_id = $1 AND status = 'flying'`, [teen.id])).rows[0]!.id;
      expect((await flagged(letterId)).rows[0]).toMatchObject({ top_category: 'profanity', minor_target: true });
      const c = (await wordCase(teen))!;
      expect(c).toMatchObject({ targetType: 'letter', summary: 'Word filter: a letter', minorInvolved: true });
      const detail = (await call('GET', `/admin/moderation/cases/${c.id}`, moderator.token)).json() as CaseDetail;
      expect((detail.case.evidence as { words?: string }).words).toBe('fuck');
    });

    it('closes and forgets a deleted account’s flags and what they kept', async () => {
      const c = (await wordCase(teen))!;
      await eraseAccountData(pool, teen.id);
      const after = await pool.query<{ status: string; evidence: Record<string, unknown> }>(`SELECT status, evidence FROM moderation_cases WHERE id = $1`, [c.id]);
      expect(after.rows[0]).toEqual({ status: 'no_violation', evidence: { pruned: true } });
      expect((await pool.query(`SELECT 1 FROM moderation_flags WHERE author_id = $1`, [teen.id])).rowCount).toBe(0);
    });

    it('keeps a decided flag only as long as the evidence it led to', async () => {
      const old = await pool.query<{ id: string }>(
        `INSERT INTO moderation_flags (surface, content_type, author_id, action, model_version, status, resolved_at)
         VALUES ('chat', 'dm', $1, 'flag', 'wordlist', 'reversed', now() - interval '400 days'),
                ('chat', 'dm', $1, 'flag', 'wordlist', 'reversed', now() - interval '10 days') RETURNING id`,
        [baran.id],
      );
      await new ModerationQueueService(pool).pruneEvidence();
      const left = await pool.query<{ id: string }>(`SELECT id FROM moderation_flags WHERE id = ANY($1::uuid[])`, [old.rows.map((r) => r.id)]);
      expect(left.rows.map((r) => r.id)).toEqual([old.rows[1]!.id]);
    });
  });
});
