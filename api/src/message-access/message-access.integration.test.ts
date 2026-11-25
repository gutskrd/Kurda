/**
 * Who may read letters and private chats, against real Postgres: only a superadmin opens a safety review, with a reason
 * and a note; only its reader opens what it covers, for 24 hours; every grant and reading is on the Access log, in the
 * audit trail and in the security log, never a word of what was read; and nobody is told. Reported and flagged letters
 * and messages are read in their cases, recorded the same way.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { AccessLogPage, CaseDetail, CaseQueuePage, ReviewConversationPage, ReviewOpened, SafetyReview } from '@kurda/shared';
import { SAFETY_REVIEWS_PER_DAY } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { canonicalPair } from '../friends/pair.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';

const DATABASE_URL = process.env.DATABASE_URL;

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
  let notifiedBefore = 0;
  const notified = async (): Promise<number> =>
    (await pool.query(`SELECT 1 FROM notifications WHERE user_id = ANY($1::uuid[])`, [[rojda.id, baran.id, dilan.id]])).rowCount ?? 0;

  const note = 'A report about these letters says an adult is asking a teen to meet in secret.';
  const grant = (by: Person, subject: string, body: Record<string, unknown>) => call('POST', `/admin/users/${subject}/safety-reviews`, by.token, body);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    owner = await kit.admin('own', ['superadmin']);
    checker = await kit.admin('chk', ['superadmin']);
    other = await kit.admin('oth', ['superadmin']);
    moderator = await kit.admin('mod', ['moderator']);
    support = await kit.admin('sup', ['support']);
    rojda = await kit.person('rojda');
    baran = await kit.person('baran');
    dilan = await kit.person('dilan');
    people.push(owner, checker, other, moderator, support, rojda, baran, dilan);

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
    const pair = canonicalPair(rojda.id, dilan.id);
    await pool.query(
      `INSERT INTO dm_messages (user_lo, user_hi, sender_id, body, created_at) VALUES ($1, $2, $3, $4, now() - interval '10 minutes'), ($1, $2, $5, $6, now())`,
      [pair.lo, pair.hi, rojda.id, `Hi Dilan ${secret}`, dilan.id, `Hi Rojda ${secret}`],
    );
    // a group she joined after its first message
    groupId = (await pool.query<{ id: string }>(`INSERT INTO groups (name, owner_id) VALUES ($1, $2) RETURNING id`, [`Kom ${kit.suffix}`, baran.id])).rows[0]!.id;
    await pool.query(`INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES ($1, $2, 'owner', now() - interval '3 days')`, [groupId, baran.id]);
    await pool.query(`INSERT INTO group_messages (group_id, sender_id, body, created_at) VALUES ($1, $2, $3, now() - interval '2 days')`, [
      groupId,
      baran.id,
      `before she came ${secret}`,
    ]);
    await pool.query(`INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES ($1, $2, 'member', now() - interval '1 day')`, [groupId, rojda.id]);
    await pool.query(`INSERT INTO group_messages (group_id, sender_id, body, created_at) VALUES ($1, $2, $3, now() - interval '10 minutes'), ($1, $4, $5, now())`, [
      groupId,
      rojda.id,
      `Silav hemû ${secret}`,
      baran.id,
      `Bi xêr hatî ${secret}`,
    ]);
    notifiedBefore = await notified();
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM groups WHERE id = $1`, [groupId]);
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
      expect(Date.parse(review.expiresAt) - Date.parse(review.grantedAt)).toBe(24 * 3_600_000);
      const again = await grant(owner, rojda.id, { reason: 'child_safety', note, reviewerId: moderator.id });
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('REVIEW_OPEN');
    });

    it('stops a superadmin after a few in a day', async () => {
      for (let i = 0; i < SAFETY_REVIEWS_PER_DAY; i++) {
        await pool.query(
          `INSERT INTO safety_reviews (subject_id, reviewer_id, granted_by, reason, note, granted_at, expires_at)
           VALUES ($1, $2, $2, 'legal_request', $3, now() - make_interval(mins => $4), now() - make_interval(mins => $4) + interval '24 hours')`,
          [i % 2 === 0 ? baran.id : dilan.id, other.id, note, i + 1],
        );
      }
      const res = await grant(other, support.id, { reason: 'legal_request', note });
      expect(res.statusCode).toBe(429);
      expect(res.json().code).toBe('REVIEW_LIMIT');
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
        ['group', groupId, 2],
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
      // a group from when she joined, not before
      expect((await read('group', groupId)).messages.map((m) => m.body)).toEqual([`Silav hemû ${secret}`, `Bi xêr hatî ${secret}`]);

      // nothing of anyone else's: Baran and Dilan's own conversations are not hers
      const { lo, hi } = canonicalPair(baran.id, dilan.id);
      await pool.query(`INSERT INTO dm_messages (user_lo, user_hi, sender_id, body) VALUES ($1, $2, $3, 'not hers')`, [lo, hi, baran.id]);
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
        ['read', 'group', 2],
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
      const events = await eventually(
        () => pool.query<{ kind: string }>(`SELECT kind FROM security_events WHERE user_id = $1 AND kind LIKE 'messages.%' ORDER BY occurred_at, id`, [rojda.id]),
        (r) => r.rows.length >= 6,
      );
      expect(events.rows.map((r) => r.kind)).toEqual([
        'messages.review_granted',
        'messages.review_read',
        'messages.review_read',
        'messages.review_read',
        'messages.review_read',
        'messages.review_read',
      ]);
    });

    it('never puts a word of what was read in any log', async () => {
      const security = await pool.query(`SELECT details FROM security_events WHERE user_id = $1 OR actor_id = $2`, [rojda.id, moderator.id]);
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
      const stale = await pool.query<{ id: string }>(
        `INSERT INTO safety_reviews (subject_id, reviewer_id, granted_by, reason, note, granted_at, expires_at)
         VALUES ($1, $2, $3, 'threat_to_life', $4, now() - interval '25 hours', now() - interval '1 hour') RETURNING id`,
        [dilan.id, moderator.id, owner.id, note],
      );
      const gone = await call('GET', `/admin/safety-reviews/${stale.rows[0]!.id}`, moderator.token);
      expect(gone.statusCode).toBe(410);
      expect(gone.json().code).toBe('REVIEW_ENDED');

      const ended = await call('POST', `/admin/safety-reviews/${reviewId}/end`, moderator.token);
      expect(ended.statusCode, ended.body).toBe(200);
      expect((ended.json() as { review: SafetyReview }).review).toMatchObject({ open: false, endedBy: { id: moderator.id } });
      expect((await call('GET', `/admin/safety-reviews/${reviewId}`, moderator.token)).statusCode).toBe(410);
      expect((await call('GET', `/admin/safety-reviews/${reviewId}/conversations/birds/${rojda.id}`, moderator.token)).statusCode).toBe(410);
      expect((await call('POST', `/admin/safety-reviews/${reviewId}/end`, moderator.token)).statusCode).toBe(409);
    });

    it('keeps reviews and their record as they were written', async () => {
      await expect(pool.query(`UPDATE safety_reviews SET note = 'something else entirely, and long enough' WHERE id = $1`, [reviewId])).rejects.toThrow();
      await expect(pool.query(`UPDATE safety_reviews SET expires_at = expires_at + interval '1 day' WHERE id = $1`, [reviewId])).rejects.toThrow();
      await expect(pool.query(`DELETE FROM safety_reviews WHERE id = $1`, [reviewId])).rejects.toThrow();
      await expect(pool.query(`DELETE FROM message_access_log WHERE review_id = $1`, [reviewId])).rejects.toThrow();
      await expect(pool.query(`UPDATE message_access_log SET messages = 0 WHERE review_id = $1`, [reviewId])).rejects.toThrow();
    });
  });

  describe('the Access log', () => {
    it('is read by every admin, says who opened whose messages and why, and is closed to members', async () => {
      const res = await call('GET', '/admin/message-access/log?limit=200', support.token);
      expect(res.statusCode, res.body).toBe(200);
      const page = res.json() as AccessLogPage;
      const mine = page.entries.filter((e) => e.review?.id === reviewId);
      expect(mine.map((e) => e.kind)).toEqual(['ended', 'read', 'read', 'read', 'read', 'listed', 'granted']);
      expect(mine.at(-1)).toMatchObject({ staff: { id: owner.id }, subject: { id: rojda.id }, review: { reason: 'child_safety', note } });
      // which kind of conversation, never with whom
      expect(mine[1]!.conversation).toEqual({ kind: 'group' });
      expect(res.body).not.toContain(secret);
      expect(mine.every((e) => e.conversation === null || Object.keys(e.conversation).join() === 'kind')).toBe(true);
      expect((await call('GET', '/admin/message-access/log', rojda.token)).statusCode).toBe(404);
    });
  });

  describe('reported and flagged letters and messages', () => {
    it('records a moderator reading a reported letter in its case, once while they work on it', async () => {
      const letter = await pool.query<{ id: string }>(`SELECT id FROM letters WHERE thread_id = $1 AND sender_id = $2`, [threadId, baran.id]);
      const filed = await call('POST', '/reports', rojda.token, { targetType: 'letter', targetId: letter.rows[0]!.id, category: 'harassment' });
      expect(filed.statusCode, filed.body).toBe(201);
      const caseId = filed.json().report.caseId as string;
      const detail = await call('GET', `/admin/moderation/cases/${caseId}`, moderator.token);
      expect(detail.statusCode, detail.body).toBe(200);
      // the reported letter in full, with the letters round it marked
      const evidence = (detail.json() as CaseDetail).reports[0]!.evidence as { decor?: { notes: Array<{ text: string }> }; context?: Array<{ reported: boolean }> };
      expect(evidence.decor?.notes[0]?.text).toBe(`note ${secret}`);
      expect(evidence.context?.map((m) => m.reported)).toEqual([false, true]);
      expect((await call('GET', `/admin/moderation/cases/${caseId}`, moderator.token)).statusCode).toBe(200);
      const reads = await pool.query(`SELECT basis, subject_id FROM message_access_log WHERE kind = 'case' AND case_id = $1`, [caseId]);
      expect(reads.rows).toEqual([{ basis: 'report', subject_id: baran.id }]);
      const audit = await pool.query(`SELECT 1 FROM admin_audit_log WHERE action = 'case.read_messages' AND target_id = $1`, [caseId]);
      expect(audit.rowCount).toBe(1);
    });

    it('sends a direct message and a letter the word filter flags to the queue, each shown alone', async () => {
      const { lo, hi } = canonicalPair(baran.id, dilan.id);
      await pool.query(`INSERT INTO friendships (user_lo, user_hi, status) VALUES ($1, $2, 'accepted') ON CONFLICT DO NOTHING`, [lo, hi]);
      const sent = await call('POST', `/chat/${dilan.id}/messages`, baran.token, { body: `you shit ${secret}` });
      expect(sent.statusCode, sent.body).toBe(200);
      const messageId = sent.json().id as string;
      const bird = await call('POST', '/letters/out', dilan.token, { body: 'Silav, ez Dilan im. Fuuuck, kurdî zehmet e!' });
      expect(bird.statusCode, bird.body).toBe(200);
      const letterId = (await pool.query<{ id: string }>(`SELECT id FROM letters WHERE sender_id = $1 AND status = 'flying'`, [dilan.id])).rows[0]!.id;

      await eventually(
        () => pool.query(`SELECT 1 FROM moderation_flags WHERE content_ref = ANY($1::text[]) AND model_version = 'wordlist'`, [[messageId, letterId]]),
        (r) => (r.rowCount ?? 0) === 2,
      );
      const flagsOf = async (p: Person) => {
        const res = await call('GET', `/admin/moderation/queue?source=automated&q=${p.username}`, moderator.token);
        expect(res.statusCode, res.body).toBe(200);
        return (res.json() as CaseQueuePage).cases.filter((c) => c.subject?.id === p.id && c.summary.startsWith('Word filter'));
      };
      const dm = (await flagsOf(baran))[0]!;
      const flaggedLetter = (await flagsOf(dilan))[0]!;
      expect(dm).toMatchObject({ source: 'text_flag', targetType: 'dm_message', category: 'harassment', summary: 'Word filter: a direct message' });
      expect(flaggedLetter).toMatchObject({ targetType: 'letter', summary: 'Word filter: a letter' });

      const detail = (await call('GET', `/admin/moderation/cases/${dm.id}`, moderator.token)).json() as CaseDetail;
      const shown = detail.case.evidence as { words?: string; snapshot?: { text: string; context: unknown[] } };
      expect(shown.words).toBe('shit');
      // masked as it was delivered, and nothing of the conversation around it
      expect(shown.snapshot?.text).toBe(`you **** ${secret}`);
      expect(shown.snapshot?.context).toEqual([]);
      const letterCase = (await call('GET', `/admin/moderation/cases/${flaggedLetter.id}`, moderator.token)).json() as CaseDetail;
      expect((letterCase.case.evidence as { words?: string; snapshot?: { text: string } }).words).toBe('fuck');
      expect((letterCase.case.evidence as { snapshot?: { text: string } }).snapshot?.text).toContain('Silav, ez Dilan im.');

      const reads = await pool.query(`SELECT case_id, basis FROM message_access_log WHERE kind = 'case' AND case_id = ANY($1::uuid[]) ORDER BY at`, [
        [dm.id, flaggedLetter.id],
      ]);
      expect(reads.rows).toEqual([
        { case_id: dm.id, basis: 'flag' },
        { case_id: flaggedLetter.id, basis: 'flag' },
      ]);
    });
  });
});
