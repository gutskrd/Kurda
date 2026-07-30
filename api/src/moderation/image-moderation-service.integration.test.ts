/** Automatic image scanning + visibility gating vs real Postgres (CI job). KUR-294. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ImageModerationService } from './image-moderation-service.js';
import { StubImageScanner } from './image-scanner.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('image moderation service (integration)', () => {
  let pool: pg.Pool;
  let scanner: StubImageScanner;
  let svc: ImageModerationService;
  const suffix = Math.random().toString(36).slice(2, 8);
  const keys: string[] = [];

  async function upload(): Promise<string> {
    const key = `img-${suffix}-${keys.length}`;
    keys.push(key);
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at)
       VALUES ($1, 'image/png', 1024, now())`,
      [key],
    );
    return key;
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    scanner = new StubImageScanner();
    svc = new ImageModerationService(pool, { scanner });
  });
  afterAll(async () => {
    if (keys.length) {
      await pool.query(`DELETE FROM image_scans WHERE media_key = ANY($1)`, [keys]);
      await pool.query(`DELETE FROM media_uploads WHERE key = ANY($1)`, [keys]);
    }
    await pool.end();
  });

  it('clears a benign image (servable, no flag)', async () => {
    const key = await upload();
    const out = await svc.scan(key, 'feed');
    expect(out.action).toBe('allow');
    expect(out.scanStatus).toBe('cleared');
    expect(out.scanId).toBeNull();
    expect(await svc.isServable(key)).toBe(true);
  });

  it('gates high-NSFW: withheld from serving + flagged', async () => {
    const key = await upload();
    scanner.setVerdict(key, { nsfwScore: 0.85, violenceScore: 0, csamMatch: false });
    const out = await svc.scan(key, 'feed');
    expect(out.action).toBe('gate');
    expect(out.scanStatus).toBe('gated');
    expect(await svc.isServable(key)).toBe(false);

    const row = await pool.query<{ action: string; reasons: string[] }>(
      `SELECT action, reasons FROM image_scans WHERE id = $1`,
      [out.scanId],
    );
    expect(row.rows[0]!.action).toBe('gate');
    expect(row.rows[0]!.reasons).toContain('nsfw');
  });

  it('hard-blocks a CSAM match and preserves the record', async () => {
    const key = await upload();
    scanner.setVerdict(key, { nsfwScore: 0, violenceScore: 0, csamMatch: true });
    const out = await svc.scan(key, 'feed');
    expect(out.action).toBe('hard_block');
    expect(out.scanStatus).toBe('blocked');
    expect(out.preserveEvidence).toBe(true);
    expect(await svc.isServable(key)).toBe(false);

    // a preserved-evidence flag is never reversed to servable, even on "reverse"
    const ok = await svc.resolve(out.scanId!, await moderator(), 'reversed');
    expect(ok).toBe(true);
    expect(await svc.isServable(key)).toBe(false); // still blocked
    const st = await pool.query<{ status: string }>(`SELECT status FROM image_scans WHERE id = $1`, [out.scanId]);
    expect(st.rows[0]!.status).toBe('actioned'); // forced, not reversed
  });

  it('reverses a false-positive gate → image re-cleared', async () => {
    const key = await upload();
    scanner.setVerdict(key, { nsfwScore: 0.85, violenceScore: 0, csamMatch: false });
    const out = await svc.scan(key, 'feed');
    expect(await svc.isServable(key)).toBe(false);

    const ok = await svc.resolve(out.scanId!, await moderator(), 'reversed');
    expect(ok).toBe(true);
    expect(await svc.isServable(key)).toBe(true); // restored
  });

  async function moderator(): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`,
      [`imgmod_${suffix}_${Math.random().toString(36).slice(2, 6)}@it.kurda.app`, `imgmod_${suffix}_${Math.random().toString(36).slice(2, 6)}`],
    );
    return res.rows[0]!.id;
  }
});
