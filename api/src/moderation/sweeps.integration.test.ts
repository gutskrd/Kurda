/**
 * The moderation timers against real Postgres: missed urgent alerts, lapsed
 * second approvals, cases decided on another page, expired claims, and the
 * evidence retention — plus every cleanup path keeping evidence media.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { SECOND_APPROVAL_HOURS } from '@kurda/shared';
import { MediaService } from '../media/service.js';
import { FakeStorage } from '../test/fake-storage.js';
import { eraseChildData } from '../gdpr/service.js';
import { ModerationAlerts } from './alerts.js';
import { CasesService } from './cases-service.js';
import { ModerationQueueService } from './queue-service.js';
import { ReportsService } from './reports-service.js';
import { SanctionsService } from './sanctions-service.js';
import { AiModerationService } from './ai-service.js';
import { evidenceObjectKey } from './pseudonym.js';
import { runQuarantine } from './quarantine.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('moderation sweeps (integration)', () => {
  let pool: pg.Pool;
  let sanctions: SanctionsService;
  let cases: CasesService;
  let queue: ModerationQueueService;
  let reports: ReportsService;
  const suffix = Math.random().toString(36).slice(2, 8);
  const ids: string[] = [];
  const keys: string[] = [];

  async function user(tag: string, extra = ''): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, birth_year, birth_month, created_at${extra ? ', roles' : ''})
       VALUES ($1, $2, 1990, 6, now() - interval '3 days'${extra ? ', $3' : ''}) RETURNING id`,
      extra ? [`sw_${tag}_${suffix}@it.kurda.app`, `sw${tag}${suffix}`, extra] : [`sw_${tag}_${suffix}@it.kurda.app`, `sw${tag}${suffix}`],
    );
    ids.push(r.rows[0]!.id);
    return r.rows[0]!.id;
  }
  async function media(key: string, confirmed: boolean): Promise<void> {
    keys.push(key);
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, created_at)
       VALUES ($1, 'image/webp', 10, ${confirmed ? 'now()' : 'NULL'}, now() - interval '3 days')`,
      [key],
    );
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    sanctions = new SanctionsService(pool, { moderatorCount: async () => 2 });
    cases = new CasesService(pool, sanctions);
    queue = new ModerationQueueService(pool, { cases, sanctions });
    reports = new ReportsService(pool);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM moderation_cases WHERE subject_user_id = ANY($1)`, [ids]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    await pool.query(`DELETE FROM media_uploads WHERE key = ANY($1)`, [keys]);
    await pool.end();
  });

  it('sends a P0 alert the report path could not send, once', async () => {
    const reporter = await user('rep1');
    const subject = await user('sub1');
    const admin = await user('adm1', '{moderator}');
    await pool.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [admin]);
    // a report filed with no alerting wired (as an old route might): nobody was told
    const { receipt } = await reports.file(reporter, { targetType: 'user', targetId: subject, category: 'violence' });
    const caseId = (await pool.query<{ case_id: string }>(`SELECT case_id FROM reports WHERE id = $1`, [receipt.report.id])).rows[0]!.case_id;

    const sent: string[] = [];
    const alerts = new ModerationAlerts(pool, { send: async (to) => void sent.push(to) }, undefined);
    await alerts.sendMissed();
    expect(sent).toContain(`sw_adm1_${suffix}@it.kurda.app`);
    const n = sent.length;
    await alerts.sendMissed();
    await alerts.caseUrgent(caseId);
    expect(sent.length).toBe(n); // at most one email per case

    // a failed send hands the claim back for the next sweep
    const other = await user('sub1b');
    const second = await reports.file(reporter, { targetType: 'user', targetId: other, category: 'child_safety' });
    const otherCase = (await pool.query<{ case_id: string }>(`SELECT case_id FROM reports WHERE id = $1`, [second.receipt.report.id])).rows[0]!.case_id;
    const failing = new ModerationAlerts(pool, { send: async () => { throw new Error('provider down'); } }, undefined);
    await expect(failing.caseUrgent(otherCase)).rejects.toThrow('provider down');
    const row = await pool.query<{ alert_sent_at: Date | null }>(`SELECT alert_sent_at FROM moderation_cases WHERE id = $1`, [otherCase]);
    expect(row.rows[0]!.alert_sent_at).toBeNull();

    // one address failing: the others are still told, and nobody is told twice
    const admin2 = await user('adm1b', '{superadmin}');
    await pool.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [admin2]);
    const partial: string[] = [];
    const flaky = new ModerationAlerts(
      pool,
      {
        send: async (to) => {
          if (to === `sw_adm1_${suffix}@it.kurda.app`) throw new Error('mailbox full');
          partial.push(to);
        },
      },
      undefined,
    );
    expect(await flaky.caseUrgent(otherCase)).toBeGreaterThanOrEqual(1);
    expect(partial).toContain(`sw_adm1b_${suffix}@it.kurda.app`);
    const kept = await pool.query<{ alert_sent_at: Date | null }>(`SELECT alert_sent_at FROM moderation_cases WHERE id = $1`, [otherCase]);
    expect(kept.rows[0]!.alert_sent_at).not.toBeNull();
    const before = partial.length;
    await flaky.sendMissed();
    expect(partial.length).toBe(before);
  });

  it('lets a permanent ban lapse when no second admin confirms it in 72 hours', async () => {
    const reporter = await user('rep2');
    const subject = await user('sub2');
    const admin = await user('adm2');
    const { receipt } = await reports.file(reporter, { targetType: 'user', targetId: subject, category: 'harassment' });
    const caseId = (await pool.query<{ case_id: string }>(`SELECT case_id FROM reports WHERE id = $1`, [receipt.report.id])).rows[0]!.case_id;
    await cases.decide(caseId, admin, {
      outcome: 'actioned', policy: 'harassment', removeContent: false, notifyReporters: true,
      actions: [{ target: 'subject', kind: 'permanent_ban', statement: 'Abuse.' }],
    });
    // as if three days had passed
    await pool.query(
      `UPDATE sanctions SET created_at = created_at - make_interval(hours => $2::int + 1),
              starts_at = starts_at - make_interval(hours => $2::int + 1),
              ends_at = ends_at - make_interval(hours => $2::int + 1)
        WHERE case_id = $1`,
      [caseId, SECOND_APPROVAL_HOURS],
    );
    await sanctions.syncEnforcedColumns(pool, subject);
    expect(await cases.expireApprovals()).toBeGreaterThanOrEqual(1);
    const s = await pool.query<{ kind: string; revoked_at: Date | null; revoke_reason: string | null }>(
      `SELECT kind, revoked_at, revoke_reason FROM sanctions WHERE case_id = $1 AND kind = 'permanent_ban'`,
      [caseId],
    );
    expect(s.rows[0]!.revoked_at).not.toBeNull();
    expect(s.rows[0]!.revoke_reason).toMatch(/72 hours/);
    const c = await pool.query<{ status: string }>(`SELECT status FROM moderation_cases WHERE id = $1`, [caseId]);
    expect(c.rows[0]!.status).toBe('open');
    const u = await pool.query<{ banned_at: Date | null }>(`SELECT banned_at FROM users WHERE id = $1`, [subject]);
    expect(u.rows[0]!.banned_at).toBeNull();
  });

  it('takes a closed account off the banned-address list when its ban is lifted', async () => {
    const subject = await user('sub5');
    const admin = await user('adm5');
    const solo = new CasesService(pool, new SanctionsService(pool, { moderatorCount: async () => 1 }));
    const out = await solo.sanctionUser(admin, subject, {
      kind: 'permanent_ban', policy: 'spam', statement: 'Bot account.', confirmUsername: `sw${'sub5'}${suffix}`,
    });
    const registered = async () => (await pool.query(`SELECT 1 FROM ban_registry WHERE sanction_id = $1`, [out.sanctions[0]!.id])).rowCount;
    expect(await registered()).toBe(1);
    // the account is closed meanwhile: its address is anonymised and no longer hashes to the entry
    await pool.query(`UPDATE users SET email = 'deleted_' || id || '@deleted.kurda.app' WHERE id = $1`, [subject]);
    await sanctions.unban(admin, subject, 'banned by mistake');
    expect(await registered()).toBe(0);
  });

  it('closes a case whose flag was decided on another page, and hands back expired claims', async () => {
    const author = await user('auth3');
    const admin = await user('adm3');
    const ai = new AiModerationService(pool);
    const flag = await pool.query<{ id: string }>(
      `INSERT INTO moderation_flags (surface, content_type, author_id, action, top_category, top_score, scores, model_version)
       VALUES ('chat', 'dm', $1, 'flag', 'harassment', 0.7, '{}'::jsonb, 'test') RETURNING id`,
      [author],
    );
    await queue.sync();
    const open = (await queue.queue({ q: `sw${'auth3'}${suffix}` })).cases.find((c) => c.source === 'text_flag')!;
    expect(open).toMatchObject({ status: 'open', priority: 2, category: 'harassment' });

    // claimed, and the lease runs out
    await cases.claim(open.id, admin);
    await pool.query(`UPDATE moderation_cases SET lease_until = now() - interval '1 minute' WHERE id = $1`, [open.id]);
    await queue.reconcile();
    expect((await cases.find(pool, open.id))!.status).toBe('open');

    // decided on the AI Mod page: the case follows instead of staying open for ever
    expect(await ai.resolve(flag.rows[0]!.id, admin, 'reversed')).toBe(true);
    await queue.sync();
    const after = await cases.find(pool, open.id);
    expect(after).toMatchObject({ status: 'no_violation', resolution_note: 'Decided outside the queue' });
  });

  it('a closed child’s reported picture leaves the public bucket, and is deleted a year after the decision', async () => {
    const reporter = await user('rep4');
    const author = await user('auth4');
    const admin = await user('adm4');
    const key = `image-post/sweep_${suffix}.webp`;
    await media(key, true);
    const storage = new FakeStorage();
    storage.upload(key);
    const post = await pool.query<{ id: string }>(
      `INSERT INTO image_posts (author_id, author_role, image_media_id, caption) VALUES ($1, 'user', $2, 'c') RETURNING id`,
      [author, key],
    );
    const { receipt } = await reports.file(reporter, { targetType: 'image_post', targetId: post.rows[0]!.id, category: 'sexual' });
    const row = async () =>
      (
        await pool.query<{ preserve_evidence: boolean; confirmed: boolean; quarantine_state: string | null }>(
          `SELECT preserve_evidence, confirmed_at IS NOT NULL AS confirmed, quarantine_state FROM media_uploads WHERE key = $1`,
          [key],
        )
      ).rows[0];
    expect((await row())!.preserve_evidence).toBe(true);

    // the account is closed: the file is not deleted (a report holds it), but it
    // is an orphan now, and on its way off the public bucket
    const erased = await eraseChildData(pool, author);
    expect(erased).not.toContain(key);
    expect(await row()).toEqual({ preserve_evidence: true, confirmed: false, quarantine_state: 'pending' });
    // while the evidence is kept, no cleanup takes it
    await new MediaService(pool, storage.asStorage).cleanupOrphans();
    expect(storage.publicObjects.has(key)).toBe(true);
    await runQuarantine(pool, storage.asStorage, { keys: [key] });
    expect(storage.publicObjects.has(key)).toBe(false);
    expect(storage.evidence.has(evidenceObjectKey(key))).toBe(true);
    await new MediaService(pool, storage.asStorage).cleanupOrphans();
    expect(storage.evidence.has(evidenceObjectKey(key))).toBe(true);

    const caseId = (await pool.query<{ case_id: string }>(`SELECT case_id FROM reports WHERE id = $1`, [receipt.report.id])).rows[0]!.case_id;
    await cases.decide(caseId, admin, { outcome: 'no_violation', actions: [], removeContent: false, notifyReporters: false });
    // as if decided a year and a day ago, with a removal's copy kept for an appeal
    await pool.query(
      `UPDATE moderation_cases SET resolved_at = now() - interval '366 days',
              removed_content = jsonb_build_object('type', 'image_post', 'id', $2::text, 'previousStatus', 'published')
        WHERE id = $1`,
      [caseId, post.rows[0]!.id],
    );

    expect(await queue.pruneEvidence()).toBeGreaterThanOrEqual(1);
    const r = await pool.query<{ evidence: Record<string, unknown>; evidence_pruned_at: Date | null }>(
      `SELECT evidence, evidence_pruned_at FROM reports WHERE id = $1`,
      [receipt.report.id],
    );
    expect(r.rows[0]!.evidence).toEqual({ pruned: true, targetType: 'image_post', targetId: post.rows[0]!.id });
    expect(r.rows[0]!.evidence_pruned_at).not.toBeNull();
    const c = await pool.query<{ evidence: Record<string, unknown>; removed_content: unknown }>(
      `SELECT evidence, removed_content FROM moderation_cases WHERE id = $1`,
      [caseId],
    );
    expect(c.rows[0]).toEqual({ evidence: { pruned: true }, removed_content: null });
    expect(await row()).toEqual({ preserve_evidence: false, confirmed: false, quarantine_state: 'done' });
    // and now the sweep takes it, private copy and all
    await new MediaService(pool, storage.asStorage).cleanupOrphans();
    expect(storage.evidence.has(evidenceObjectKey(key))).toBe(false);
    expect(await row()).toBeUndefined();
  });

  it('a year on, lets go of a reported picture that is still published, and keeps serving it', async () => {
    const reporter = await user('rep6');
    const author = await user('auth6');
    const admin = await user('adm6');
    const key = `image-post/sweep6_${suffix}.webp`;
    await media(key, true);
    const post = await pool.query<{ id: string }>(
      `INSERT INTO image_posts (author_id, author_role, image_media_id, caption) VALUES ($1, 'user', $2, 'c') RETURNING id`,
      [author, key],
    );
    const { receipt } = await reports.file(reporter, { targetType: 'image_post', targetId: post.rows[0]!.id, category: 'spam' });
    const caseId = (await pool.query<{ case_id: string }>(`SELECT case_id FROM reports WHERE id = $1`, [receipt.report.id])).rows[0]!.case_id;
    await cases.decide(caseId, admin, { outcome: 'no_violation', actions: [], removeContent: false, notifyReporters: false });
    await pool.query(`UPDATE moderation_cases SET resolved_at = now() - interval '366 days' WHERE id = $1`, [caseId]);
    await queue.pruneEvidence();
    const m = await pool.query<{ preserve_evidence: boolean; confirmed: boolean }>(
      `SELECT preserve_evidence, confirmed_at IS NOT NULL AS confirmed FROM media_uploads WHERE key = $1`,
      [key],
    );
    expect(m.rows[0]).toEqual({ preserve_evidence: false, confirmed: true });
  });

  it('a year after a CSAM case is filed, lets its quarantined files go', async () => {
    const reporter = await user('rep7');
    const author = await user('auth7');
    const admin = await user('adm7');
    const key = `image-post/sweep7_${suffix}.webp`;
    await media(key, true);
    const storage = new FakeStorage();
    storage.upload(key);
    const withStorage = new CasesService(pool, sanctions, { storage: storage.asStorage });
    const post = await pool.query<{ id: string }>(
      `INSERT INTO image_posts (author_id, author_role, image_media_id, caption) VALUES ($1, 'user', $2, 'c') RETURNING id`,
      [author, key],
    );
    const { receipt } = await reports.file(reporter, { targetType: 'image_post', targetId: post.rows[0]!.id, category: 'child_safety' });
    const caseId = (await pool.query<{ case_id: string }>(`SELECT case_id FROM reports WHERE id = $1`, [receipt.report.id])).rows[0]!.case_id;
    const out = await withStorage.csam(caseId, admin);
    await withStorage.fileEscalation(out.escalation.id, admin, 'CT-1');
    expect(storage.evidence.has(evidenceObjectKey(key))).toBe(true);

    // not before its year is out
    await queue.pruneEvidence();
    expect((await pool.query<{ p: boolean }>(`SELECT preserve_evidence AS p FROM media_uploads WHERE key = $1`, [key])).rows[0]!.p).toBe(true);

    await pool.query(`UPDATE moderation_cases SET resolved_at = now() - interval '366 days' WHERE id = $1`, [caseId]);
    await queue.pruneEvidence();
    // the removed post still points at it, but its public copy is long gone: an orphan
    const m = await pool.query<{ preserve_evidence: boolean; confirmed: boolean }>(
      `SELECT preserve_evidence, confirmed_at IS NOT NULL AS confirmed FROM media_uploads WHERE key = $1`,
      [key],
    );
    expect(m.rows[0]).toEqual({ preserve_evidence: false, confirmed: false });
    await new MediaService(pool, storage.asStorage).cleanupOrphans();
    expect(storage.evidence.has(evidenceObjectKey(key))).toBe(false);
  });
});
