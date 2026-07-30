import type pg from 'pg';
import { scanImageForSurface, StubImageScanner, type ImageScanner } from './image-scanner.js';
import type { ImageAction, ImageSurface, ImageVerdict } from './image-scan.js';

/** Servable gate values → the actual `media_uploads.scan_status`. */
function statusForAction(action: ImageAction): 'cleared' | 'gated' | 'blocked' {
  switch (action) {
    case 'allow':
    case 'flag':
      return 'cleared'; // flag = published-but-flagged (#102)
    case 'gate':
      return 'gated'; // withheld pending review (blur/hold)
    case 'auto_block':
    case 'hard_block':
      return 'blocked';
  }
}

export interface ImageModerationOutcome extends ImageVerdict {
  scanStatus: 'cleared' | 'gated' | 'blocked';
  scanId: string | null;
}

export interface PendingImageScan {
  id: string;
  mediaKey: string;
  surface: string;
  action: string;
  reasons: string[];
  nsfwScore: number;
  violenceScore: number;
  csamMatch: boolean;
  preserveEvidence: boolean;
  modelVersion: string;
  createdAt: Date;
}

/**
 * Automatic image scanning at the media finalize step (KUR-294). Image
 * consumers (profile pictures #181, memes #290, …) call {@link scan} once an
 * upload is confirmed and **before serving it**; the verdict sets
 * `media_uploads.scan_status` so unscanned/blocked images are never publicly
 * served, and records every above-`allow` verdict in `image_scans` for audit +
 * moderator reversal. A CSAM match is hard-blocked with the record preserved
 * (evidence + mandated reporting) — never soft-deleted.
 */
export class ImageModerationService {
  private readonly pool: pg.Pool;
  private readonly scanner: ImageScanner;

  constructor(pool: pg.Pool, deps: { scanner?: ImageScanner } = {}) {
    this.pool = pool;
    this.scanner = deps.scanner ?? new StubImageScanner();
  }

  /** Scan a confirmed upload for a surface and gate its visibility. */
  async scan(mediaKey: string, surface: ImageSurface): Promise<ImageModerationOutcome> {
    const { verdict, report } = await scanImageForSurface(this.scanner, mediaKey, surface);
    const scanStatus = statusForAction(verdict.action);

    await this.pool.query(`UPDATE media_uploads SET scan_status = $2 WHERE key = $1`, [mediaKey, scanStatus]);

    let scanId: string | null = null;
    if (verdict.action !== 'allow') {
      const res = await this.pool.query<{ id: string }>(
        `INSERT INTO image_scans
           (media_key, surface, nsfw_score, violence_score, csam_match, action, reasons, preserve_evidence, model_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          mediaKey, surface, report?.nsfwScore ?? 0, report?.violenceScore ?? 0, report?.csamMatch ?? false,
          verdict.action, verdict.reasons, verdict.preserveEvidence, report?.modelVersion ?? 'unavailable',
        ],
      );
      scanId = res.rows[0]!.id;
    }

    return { ...verdict, scanStatus, scanId };
  }

  /** Is this media cleared for public serving? Consumers check before serving. */
  async isServable(mediaKey: string): Promise<boolean> {
    const res = await this.pool.query<{ scan_status: string }>(
      `SELECT scan_status FROM media_uploads WHERE key = $1`,
      [mediaKey],
    );
    return res.rows[0]?.scan_status === 'cleared';
  }

  /** Pending image flags oldest-first — the automated feed for the #102 queue. */
  async pending(limit = 50): Promise<PendingImageScan[]> {
    const res = await this.pool.query<{
      id: string; media_key: string; surface: string; action: string; reasons: string[];
      nsfw_score: string; violence_score: string; csam_match: boolean; preserve_evidence: boolean;
      model_version: string; created_at: Date;
    }>(
      `SELECT id, media_key, surface, action, reasons, nsfw_score, violence_score, csam_match,
              preserve_evidence, model_version, created_at
       FROM image_scans WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => ({
      id: r.id, mediaKey: r.media_key, surface: r.surface, action: r.action, reasons: r.reasons,
      nsfwScore: Number(r.nsfw_score), violenceScore: Number(r.violence_score), csamMatch: r.csam_match,
      preserveEvidence: r.preserve_evidence, modelVersion: r.model_version, createdAt: r.created_at,
    }));
  }

  /**
   * Resolve a flag. `reversed` = false positive → the image is cleared for
   * serving. A CSAM (preserve-evidence) flag can be actioned but is **never**
   * reversed to cleared here — it stays blocked with evidence retained.
   */
  async resolve(scanId: string, moderatorId: string, outcome: 'actioned' | 'reversed'): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const flag = await client.query<{ media_key: string; preserve_evidence: boolean }>(
        `SELECT media_key, preserve_evidence FROM image_scans WHERE id = $1 AND status = 'pending' FOR UPDATE`,
        [scanId],
      );
      const row = flag.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return false;
      }
      // CSAM evidence is never restored to servable, even on a "reverse".
      const effective = row.preserve_evidence ? 'actioned' : outcome;
      await client.query(
        `UPDATE image_scans SET status = $2, resolved_at = now(), resolved_by = $3 WHERE id = $1`,
        [scanId, effective, moderatorId],
      );
      if (effective === 'reversed') {
        await client.query(`UPDATE media_uploads SET scan_status = 'cleared' WHERE key = $1`, [row.media_key]);
      }
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
