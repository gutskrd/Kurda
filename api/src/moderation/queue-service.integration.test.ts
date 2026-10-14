/** Unified moderation queue vs real Postgres (CI job). KUR-102. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { CaseQueueItem } from '@kurda/shared';
import { ModerationQueueService } from './queue-service.js';
import { SanctionsService } from './sanctions-service.js';
import { CasesService } from './cases-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('moderation queue (integration)', () => {
  let pool: pg.Pool;
  let svc: ModerationQueueService;
  const suffix = Math.random().toString(36).slice(2, 8);
  const userIds: string[] = [];
  const mediaKeys: string[] = [];
  let reporter: string, subject: string, cheater: string, moderator: string;
  let scanId: string;

  async function makeUser(tag: string): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`,
      [`q_${tag}_${suffix}@it.kurda.app`, `q_${tag}_${suffix}`],
    );
    userIds.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  }

  /** This suite's cases: the ones about its users, and its image scan. */
  async function mine(): Promise<CaseQueueItem[]> {
    const page = await svc.queue({ q: suffix, limit: 200 });
    const image = await svc.queue({ q: scanId, limit: 10 });
    return [...page.cases, ...image.cases];
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // two moderators, so a permanent ban waits for the second one
    const sanctions = new SanctionsService(pool, { moderatorCount: async () => 2 });
    svc = new ModerationQueueService(pool, { sanctions, cases: new CasesService(pool, sanctions) });
    reporter = await makeUser('rep');
    subject = await makeUser('sub');
    cheater = await makeUser('cheat');
    moderator = await makeUser('mod');

    // one item in each source
    await pool.query(
      `INSERT INTO chat_reports (reporter_id, reported_user_id, message_type, message_id, context)
       VALUES ($1, $2, 'dm', gen_random_uuid(), '{}'::jsonb)`,
      [reporter, subject],
    );
    await pool.query(
      `INSERT INTO cheat_reviews (user_id, room_id, flags, evidence, confidence, shadow_flagged)
       VALUES ($1, 'room-1', '{}'::jsonb, '{}'::jsonb, 0.95, true)`,
      [cheater],
    );
    await pool.query(
      `INSERT INTO moderation_flags (surface, content_type, author_id, action, top_category, top_score, scores, model_version)
       VALUES ('chat', 'dm', $1, 'auto_block', 'spam', 0.96, '{}'::jsonb, 'heuristic-spam-v1')`,
      [subject],
    );
    const mk = `qimg-${suffix}`;
    mediaKeys.push(mk);
    const scan = await pool.query<{ id: string }>(
      `INSERT INTO image_scans (media_key, surface, action, reasons, csam_match, preserve_evidence, model_version)
       VALUES ($1, 'feed', 'hard_block', ARRAY['csam'], true, true, 'stub-clean-v1') RETURNING id`,
      [mk],
    );
    scanId = scan.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM moderation_cases WHERE source_ref IN (SELECT id::text FROM image_scans WHERE media_key = ANY($1))`, [mediaKeys]);
    await pool.query(`DELETE FROM image_scans WHERE media_key = ANY($1)`, [mediaKeys]);
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
  });

  /*
   * Changed on purpose with the rebuilt queue: cases are ordered by priority
   * (P0 first) rather than the old 0–100 severity, which is still recorded for
   * the automated feeds, and `queue()` returns a page rather than an array.
   */
  it('syncs all sources into one priority-sorted queue (idempotent)', async () => {
    const added = await svc.sync();
    expect(added).toBeGreaterThanOrEqual(4);
    expect(await svc.sync()).toBe(0); // idempotent

    const cases = await mine();
    const bySource = Object.fromEntries(cases.map((c) => [c.source, c]));
    // the old severities are kept for the automated feeds
    expect(bySource.image_flag!.severity).toBe(100);
    expect(bySource.anti_cheat!.severity).toBe(90);
    expect(bySource.text_flag!.severity).toBe(85);
    expect(bySource.chat_report!.severity).toBe(50);
    // a CSAM hash match is P0 child safety; cheating is no safety matter
    expect(bySource.image_flag!.priority).toBe(0);
    expect(bySource.image_flag!.category).toBe('child_safety');
    expect(bySource.anti_cheat!.priority).toBe(2);
    expect(bySource.text_flag!.priority).toBe(3);

    // the whole queue is in priority order, oldest first report first within one
    const page = await svc.queue({ limit: 200 });
    const keys = page.cases.map((c) => [c.priority, c.firstReportedAt] as const);
    const sorted = [...keys].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
    expect(keys).toEqual(sorted);
  });

  it('claim-locks a case to the first moderator', async () => {
    const target = (await mine()).find((c) => c.source === 'anti_cheat' && c.subject?.id === cheater)!;
    const mod2 = await makeUser('mod2');
    expect(await svc.claim(target.id, moderator)).toBe(true);
    expect(await svc.claim(target.id, mod2)).toBe(false); // already claimed
    expect(await svc.claim(target.id, moderator)).toBe(true); // the holder refreshes the lease
  });

  /*
   * Changed on purpose: a permanent ban by one of two moderators is an
   * emergency suspension until the second confirms (M4), so the subject is
   * banned at once but the case waits — and the decision is logged against the
   * case with its rule, not "moderation queue".
   */
  it('resolves with a ban: subject banned, source closed, decision logged on the case', async () => {
    const textCase = (await mine()).find((c) => c.source === 'text_flag' && c.subject?.id === subject)!;
    expect(await svc.resolve(textCase.id, moderator, 'ban')).toBe(true);
    // waiting for a second admin: no second decision on it
    await expect(svc.resolve(textCase.id, moderator, 'ban')).rejects.toMatchObject({ code: 'PENDING_APPROVAL' });

    const u = await pool.query<{ banned_at: Date | null; token_version: number }>(
      `SELECT banned_at, token_version FROM users WHERE id = $1`,
      [subject],
    );
    expect(u.rows[0]!.banned_at).not.toBeNull();
    expect(u.rows[0]!.token_version).toBeGreaterThan(0);

    const act = await pool.query<{ action: string; case_id: string | null; reason: string }>(
      `SELECT action, case_id, reason FROM admin_actions WHERE target_user_id = $1 ORDER BY created_at`,
      [subject],
    );
    const actions = act.rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['temp_ban', 'perm_ban', 'case_decision']));
    expect(act.rows.every((r) => r.case_id === textCase.id)).toBe(true);
    expect(act.rows.some((r) => r.reason === 'moderation queue')).toBe(false);
  });

  it('dismiss closes the chat report without actioning the user', async () => {
    const rep = (await mine()).find((c) => c.source === 'chat_report')!;
    expect(await svc.resolve(rep.id, moderator, 'dismiss')).toBe(true);
    expect(await svc.resolve(rep.id, moderator, 'dismiss')).toBe(false); // already decided
    const r = await pool.query<{ status: string; reviewed_by: string | null }>(
      `SELECT status, reviewed_by FROM chat_reports WHERE reporter_id = $1`,
      [reporter],
    );
    expect(r.rows[0]!.status).toBe('dismissed');
    // and the deciding moderator is on the row now (it used to be dropped)
    expect(r.rows[0]!.reviewed_by).toBe(moderator);
  });

  it('pages cases reported in the same millisecond without repeating any', async () => {
    const tag = `cur${suffix}`;
    const ids: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const c = await pool.query<{ id: string }>(
        `INSERT INTO moderation_cases (source, source_ref, severity, summary, evidence, source_created_at, priority,
                                       first_reported_at, last_reported_at)
         VALUES ('report', $1, 40, $2, '{}'::jsonb, now(), 3, $3::timestamptz, $3::timestamptz) RETURNING id`,
        // microseconds Postgres keeps and a JavaScript Date does not
        [`user:${tag}-${i}`, `Case ${tag}`, `2026-01-01T10:00:00.1234${i}0Z`],
      );
      ids.push(c.rows[0]!.id);
    }
    try {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let n = 0; n < 6; n++) {
        const page = await svc.queue({ q: tag, limit: 1, cursor });
        seen.push(...page.cases.map((c) => c.id));
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      expect(seen).toEqual(ids);
    } finally {
      await pool.query(`DELETE FROM moderation_cases WHERE id = ANY($1)`, [ids]);
    }
  });

  it('names who uploaded a flagged picture for a post, and who posted it once it is on a written post', async () => {
    const uploader = await makeUser('upl');
    const poster = await makeUser('pst');
    const [waiting, posted] = [`image-post/qw-${suffix}.webp`, `image-post/qp-${suffix}.webp`];
    mediaKeys.push(waiting, posted);
    // scanned at upload, before any post has it: only its uploader is known
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, uploader_id, kind) VALUES ($1, 'image/webp', 10, $2, 'image-post')`,
      [waiting, uploader],
    );
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, uploader_id, kind)
       VALUES ($1, 'image/webp', 10, now(), $2, 'image-post')`,
      [posted, poster],
    );
    const post = await pool.query<{ id: string }>(
      `INSERT INTO library_posts (author_id, author_role, type, body, status, published_at)
       VALUES ($1, 'user', 'gotin', '', 'published', now()) RETURNING id`,
      [poster],
    );
    await pool.query(`INSERT INTO library_post_media (post_id, position, media_key) VALUES ($1, 0, $2)`, [post.rows[0]!.id, posted]);
    const scans = await pool.query<{ id: string; media_key: string }>(
      `INSERT INTO image_scans (media_key, surface, action, reasons, model_version)
       VALUES ($1, 'feed', 'flag', ARRAY['nsfw'], 'test'), ($2, 'feed', 'flag', ARRAY['nsfw'], 'test') RETURNING id, media_key`,
      [waiting, posted],
    );
    await svc.sync();
    const subjects = await pool.query<{ source_ref: string; subject_user_id: string | null }>(
      `SELECT source_ref, subject_user_id FROM moderation_cases WHERE source = 'image_flag' AND source_ref = ANY($1)`,
      [scans.rows.map((r) => r.id)],
    );
    const subjectOf = new Map(subjects.rows.map((r) => [r.source_ref, r.subject_user_id]));
    const scanOf = new Map(scans.rows.map((r) => [r.media_key, r.id]));
    expect(subjectOf.get(scanOf.get(waiting)!)).toBe(uploader);
    expect(subjectOf.get(scanOf.get(posted)!)).toBe(poster);
    await pool.query(`DELETE FROM media_uploads WHERE key = ANY($1)`, [[waiting, posted]]);
  });

  it('reports an SLA median over decided cases, counted from the first report', async () => {
    const sla = await svc.sla();
    expect(sla.resolved).toBeGreaterThanOrEqual(1);
    expect(sla.medianSeconds).not.toBeNull();
    expect(sla.medianSeconds!).toBeGreaterThanOrEqual(0);
  });
});
