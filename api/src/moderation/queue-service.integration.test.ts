/** Unified moderation queue vs real Postgres (CI job). KUR-102. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ModerationQueueService } from './queue-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('moderation queue (integration)', () => {
  let pool: pg.Pool;
  let svc: ModerationQueueService;
  const suffix = Math.random().toString(36).slice(2, 8);
  const userIds: string[] = [];
  const mediaKeys: string[] = [];
  let reporter: string, subject: string, cheater: string, moderator: string;

  async function makeUser(tag: string): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`,
      [`q_${tag}_${suffix}@it.kurda.app`, `q_${tag}_${suffix}`],
    );
    userIds.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    svc = new ModerationQueueService(pool);
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
    await pool.query(
      `INSERT INTO image_scans (media_key, surface, action, reasons, csam_match, preserve_evidence, model_version)
       VALUES ($1, 'feed', 'hard_block', ARRAY['csam'], true, true, 'stub-clean-v1')`,
      [mk],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM moderation_cases WHERE source_ref IN (SELECT id::text FROM image_scans WHERE media_key = ANY($1))`, [mediaKeys]);
    await pool.query(`DELETE FROM image_scans WHERE media_key = ANY($1)`, [mediaKeys]);
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
  });

  it('syncs all sources into one severity-sorted queue (idempotent)', async () => {
    const added = await svc.sync();
    expect(added).toBeGreaterThanOrEqual(4);
    expect(await svc.sync()).toBe(0); // idempotent

    const q = await svc.queue();
    const mine = q.filter((c) =>
      [reporter, subject, cheater].includes(c.subjectUserId ?? '') || c.source === 'image_flag',
    );
    // CSAM image (100) > anti-cheat shadow (90) > text auto_block (85) > chat report (50)
    const bySource = Object.fromEntries(mine.map((c) => [c.source, c.severity]));
    expect(bySource.image_flag).toBe(100);
    expect(bySource.anti_cheat).toBe(90);
    expect(bySource.text_flag).toBe(85);
    expect(bySource.chat_report).toBe(50);
    // severity-desc ordering holds
    const sevs = q.map((c) => c.severity);
    expect([...sevs]).toEqual([...sevs].sort((a, b) => b - a));
  });

  it('claim-locks a case to the first moderator', async () => {
    const q = await svc.queue();
    const target = q.find((c) => c.source === 'anti_cheat' && c.subjectUserId === cheater)!;
    const mod2 = await makeUser('mod2');
    expect(await svc.claim(target.id, moderator)).toBe(true);
    expect(await svc.claim(target.id, mod2)).toBe(false); // already claimed
  });

  it('resolves with a ban: subject banned, source closed, case done', async () => {
    const q = await svc.queue();
    const textCase = q.find((c) => c.source === 'text_flag' && c.subjectUserId === subject)!;
    expect(await svc.resolve(textCase.id, moderator, 'ban')).toBe(true);
    expect(await svc.resolve(textCase.id, moderator, 'ban')).toBe(false); // already resolved

    const u = await pool.query<{ banned_at: Date | null; token_version: number }>(
      `SELECT banned_at, token_version FROM users WHERE id = $1`,
      [subject],
    );
    expect(u.rows[0]!.banned_at).not.toBeNull();
    expect(u.rows[0]!.token_version).toBeGreaterThan(0);

    const flag = await pool.query<{ status: string }>(`SELECT status FROM moderation_flags WHERE author_id = $1`, [subject]);
    expect(flag.rows[0]!.status).toBe('actioned');

    const act = await pool.query<{ action: string }>(`SELECT action FROM admin_actions WHERE target_user_id = $1 ORDER BY created_at DESC LIMIT 1`, [subject]);
    expect(act.rows[0]!.action).toBe('perm_ban');
  });

  it('dismiss closes the chat report without actioning the user', async () => {
    const q = await svc.queue();
    const rep = q.find((c) => c.source === 'chat_report')!;
    expect(await svc.resolve(rep.id, moderator, 'dismiss')).toBe(true);
    const r = await pool.query<{ status: string }>(`SELECT status FROM chat_reports WHERE reporter_id = $1`, [reporter]);
    expect(r.rows[0]!.status).toBe('dismissed');
  });

  it('reports an SLA median over resolved cases', async () => {
    const sla = await svc.sla();
    expect(sla.resolved).toBeGreaterThanOrEqual(2);
    expect(sla.medianSeconds).not.toBeNull();
    expect(sla.medianSeconds!).toBeGreaterThanOrEqual(0);
  });
});
