/**
 * The CSAM action against real Postgres, with storage faked in memory: the
 * original leaves the public bucket for private storage and the CDN is told to
 * forget it; every post and profile carrying the picture is cleared, not only
 * the one reported; a failed move is finished by the sweep; and the action does
 * not wait for another moderator's claim or a pending second approval.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadConfig } from '../config/env.js';
import { storeAudioMedia } from '../media/audioMedia.js';
import { audioLimits } from '../media/mediaLimits.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { mediaKey } from '../media/storage.js';
import { FakeStorage } from '../test/fake-storage.js';
import { CasesService } from './cases-service.js';
import { evidenceObjectKey } from './pseudonym.js';
import { runQuarantine } from './quarantine.js';
import { ReportsService } from './reports-service.js';
import { SanctionsService } from './sanctions-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('the CSAM action (integration)', () => {
  let pool: pg.Pool;
  let storage: FakeStorage;
  let cases: CasesService;
  let reports: ReportsService;
  const suffix = Math.random().toString(36).slice(2, 8);
  const ids: string[] = [];
  const keys: string[] = [];

  async function user(tag: string, roles = '{}'): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, birth_year, birth_month, created_at, roles)
       VALUES ($1, $2, 1990, 6, now() - interval '3 days', $3) RETURNING id`,
      [`cs_${tag}_${suffix}@it.kurda.app`, `cs${tag}${suffix}`, roles],
    );
    ids.push(r.rows[0]!.id);
    return r.rows[0]!.id;
  }
  async function picture(tag: string): Promise<string> {
    const key = `image-post/${createHash('sha256').update(`${tag}${suffix}`).digest('hex')}.webp`;
    keys.push(key);
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status) VALUES ($1, 'image/webp', 2048, now(), 'cleared')`,
      [key],
    );
    storage.upload(key);
    return key;
  }
  async function post(author: string, key: string): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO image_posts (author_id, author_role, image_media_id, caption) VALUES ($1, 'user', $2, 'x') RETURNING id`,
      [author, key],
    );
    return r.rows[0]!.id;
  }
  async function caseOf(reportId: string): Promise<string> {
    return (await pool.query<{ case_id: string }>(`SELECT case_id FROM reports WHERE id = $1`, [reportId])).rows[0]!.case_id;
  }
  const upload = async (key: string) =>
    (
      await pool.query<{ scan_status: string; preserve_evidence: boolean; quarantine_state: string | null; quarantine_key: string | null; cdn_purged: boolean | null }>(
        `SELECT scan_status, preserve_evidence, quarantine_state, quarantine_key, cdn_purged FROM media_uploads WHERE key = $1`,
        [key],
      )
    ).rows[0]!;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    storage = new FakeStorage();
    const sanctions = new SanctionsService(pool, { moderatorCount: async () => 2 });
    cases = new CasesService(pool, sanctions, { storage: storage.asStorage });
    reports = new ReportsService(pool);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM moderation_cases WHERE subject_user_id = ANY($1)`, [ids]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    await pool.query(`DELETE FROM media_uploads WHERE key = ANY($1)`, [keys]);
    await pool.end();
  });

  it('takes the picture off the public bucket, and out of every post and profile that carries it', async () => {
    const offender = await user('off1');
    const other = await user('oth1');
    const third = await user('thr1');
    const reporter = await user('rep1');
    const admin = await user('adm1', '{moderator}');
    const key = await picture('one');
    const reported = await post(offender, key);
    // keys are content hashes: the same picture under someone else's post and two profiles
    const copy = await post(other, key);
    await pool.query(`UPDATE users SET profile_photo_key = $2 WHERE id = ANY($1)`, [[other, third], key]);

    const { receipt } = await reports.file(reporter, { targetType: 'image_post', targetId: reported, category: 'child_safety' });
    const caseId = await caseOf(receipt.report.id);
    const out = await cases.csam(caseId, admin, 'checked by eye, blurred');

    // gone from the public bucket, kept privately, and the CDN told to forget it
    expect(storage.publicObjects.has(key)).toBe(false);
    expect(storage.evidence.get(evidenceObjectKey(key))).toEqual({ contentType: 'image/webp', cacheControl: 'private, no-store, max-age=0' });
    expect(storage.purged).toContain(`https://cdn.test/${key}`);
    expect(await upload(key)).toEqual({
      scan_status: 'blocked',
      preserve_evidence: true,
      quarantine_state: 'done',
      quarantine_key: evidenceObjectKey(key),
      cdn_purged: true,
    });

    // hidden everywhere: both posts, both profiles
    const posts = await pool.query<{ id: string; status: string }>(`SELECT id, status FROM image_posts WHERE id = ANY($1)`, [[reported, copy]]);
    expect(posts.rows.map((p) => p.status)).toEqual(['removed', 'removed']);
    const photos = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE profile_photo_key = $1`, [key]);
    expect(photos.rows[0]!.n).toBe(0);

    // the filing task names the file and where it stands; the case view signs the private copy
    expect(out.escalation.media).toEqual([{ key, quarantine: 'done', cdnPurged: true, publicUrl: null }]);
    const detail = await cases.detail(caseId);
    expect(detail!.media).toEqual([
      { key, url: `https://signed.test/evidence/${evidenceObjectKey(key)}?ttl=300`, contentType: 'image/webp', quarantine: 'done' },
    ]);
    expect(detail!.escalations[0]!.media[0]!.quarantine).toBe('done');
    const removed = await pool.query<{ removed_content: { type: string; parts: Array<{ type: string }> } }>(
      `SELECT removed_content FROM moderation_cases WHERE id = $1`,
      [caseId],
    );
    expect(removed.rows[0]!.removed_content.type).toBe('csam');
    expect(removed.rows[0]!.removed_content.parts.map((p) => p.type)).toEqual(['image_post', 'media']);
  });

  it('a reported profile picture comes off every profile; a move that fails is finished by the sweep', async () => {
    const offender = await user('off2');
    const other = await user('oth2');
    const reporter = await user('rep2');
    const admin = await user('adm2', '{moderator}');
    const key = await picture('two');
    await pool.query(`UPDATE users SET profile_photo_key = $2 WHERE id = ANY($1)`, [[offender, other], key]);

    const { receipt } = await reports.file(reporter, { targetType: 'user', targetId: offender, category: 'child_safety' });
    storage.failCopies = 1;
    storage.purgeAnswer = null; // no purge configured
    try {
      const out = await cases.csam(await caseOf(receipt.report.id), admin);
      // hidden in the database at once; the file is still waiting to move
      const photos = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE profile_photo_key = $1`, [key]);
      expect(photos.rows[0]!.n).toBe(0);
      expect(storage.publicObjects.has(key)).toBe(true);
      expect(out.escalation.media).toEqual([{ key, quarantine: 'pending', cdnPurged: null, publicUrl: `https://cdn.test/${key}` }]);

      expect(await runQuarantine(pool, storage.asStorage)).toBeGreaterThanOrEqual(1);
      expect(storage.publicObjects.has(key)).toBe(false);
      // no purge configured: the task still says where to purge by hand
      expect(await upload(key)).toMatchObject({ quarantine_state: 'done', quarantine_key: evidenceObjectKey(key), cdn_purged: null });
      const again = await cases.detail(await caseOf(receipt.report.id));
      expect(again!.escalations[0]!.media).toEqual([{ key, quarantine: 'done', cdnPurged: null, publicUrl: `https://cdn.test/${key}` }]);
    } finally {
      storage.purgeAnswer = true;
    }
  });

  it('does not wait for another moderator’s claim or a ban awaiting approval — but its reporter cannot take it', async () => {
    const reporter = await user('rep3');
    const admin = await user('adm3', '{moderator}');
    const other = await user('adm3b', '{moderator}');

    const held = await user('sub3');
    const heldCase = await caseOf((await reports.file(reporter, { targetType: 'user', targetId: held, category: 'child_safety' })).receipt.report.id);
    await cases.claim(heldCase, other);
    await cases.csam(heldCase, admin);
    const log = await pool.query<{ meta: { overrodeClaimOf?: string } }>(
      `SELECT meta FROM admin_actions WHERE case_id = $1 AND action = 'csam'`,
      [heldCase],
    );
    expect(log.rows[0]!.meta.overrodeClaimOf).toBe(other);

    const waiting = await user('sub3b');
    const waitingCase = await caseOf((await reports.file(reporter, { targetType: 'user', targetId: waiting, category: 'sexual' })).receipt.report.id);
    await cases.decide(waitingCase, admin, {
      outcome: 'actioned', policy: 'sexual', removeContent: false, notifyReporters: false,
      actions: [{ target: 'subject', kind: 'permanent_ban', statement: 'Sexual messages.' }],
    });
    expect((await cases.find(pool, waitingCase))!.status).toBe('needs_second_approval');
    const res = await cases.csam(waitingCase, other);
    expect(res.status).toBe('escalated');
    // the waiting ban and its emergency suspension give way to the zero-tolerance ban
    const live = await pool.query<{ kind: string; zero_tolerance: boolean; pending_approval: boolean }>(
      `SELECT kind, zero_tolerance, pending_approval FROM sanctions WHERE user_id = $1 AND revoked_at IS NULL`,
      [waiting],
    );
    expect(live.rows).toEqual([{ kind: 'permanent_ban', zero_tolerance: true, pending_approval: false }]);
    // replaced quietly: no "your suspension was lifted" just before the ban
    const lifted = await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND data->>'kind' = 'sanction_lifted'`, [waiting]);
    expect(lifted.rowCount).toBe(0);

    // a ban waiting on another case about the same person: that case goes back to the queue
    const twice = await user('sub3d');
    const firstCase = await caseOf((await reports.file(reporter, { targetType: 'user', targetId: twice, category: 'harassment' })).receipt.report.id);
    await cases.decide(firstCase, admin, {
      outcome: 'actioned', policy: 'harassment', removeContent: false, notifyReporters: false,
      actions: [{ target: 'subject', kind: 'permanent_ban', statement: 'Abuse.' }],
    });
    const theirPost = await post(twice, await picture('three'));
    const secondCase = await caseOf((await reports.file(reporter, { targetType: 'image_post', targetId: theirPost, category: 'child_safety' })).receipt.report.id);
    expect(secondCase).not.toBe(firstCase);
    await cases.csam(secondCase, other);
    expect(await cases.find(pool, firstCase)).toMatchObject({ status: 'open', resolution_note: 'Permanent ban not confirmed: replaced by the CSAM action' });
    expect((await cases.find(pool, secondCase))!.status).toBe('escalated');

    // a moderator who reported the case is part of it
    const modReporter = await user('adm3c', '{moderator}');
    const partyCase = await caseOf((await reports.file(modReporter, { targetType: 'user', targetId: await user('sub3c'), category: 'child_safety' })).receipt.report.id);
    await expect(cases.csam(partyCase, modReporter)).rejects.toMatchObject({ code: 'CONFLICT_OF_INTEREST' });
  });

  it('never puts the same bytes back on the public bucket', async () => {
    const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
    const raw = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0]), Buffer.alloc(4096, 0x5a), Buffer.from(suffix)]);
    const key = mediaKey('voice-note', createHash('sha256').update(raw).digest('hex'), 'audio/mpeg');
    keys.push(key);
    // quarantined once and since let go as an orphan: the row is unconfirmed
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, quarantine_state, quarantine_key)
       VALUES ($1, 'audio/mpeg', 10, 'done', $2)`,
      [key, evidenceObjectKey(key)],
    );
    const res = await storeAudioMedia(
      { pool, storage: storage.asStorage, usage: new MediaUsageService(pool, null), limits: audioLimits(config), log: { warn: () => {}, error: () => {} } },
      'voice-note',
      raw,
    );
    expect(res).toMatchObject({ ok: false, code: 'MEDIA_REJECTED' });
    expect(storage.publicObjects.has(key)).toBe(false);
  });
});
