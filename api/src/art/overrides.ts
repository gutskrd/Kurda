import type pg from 'pg';
import { ART_SLOT_FAMILY_INFO, isArtSlot, parseArtSlot, type ArtOverridesResponse } from '@kurda/shared';
import { isUploadedArtKey, uploadedArtKind, type ArtKind, type PublicUrl } from '../cosmetics/access.js';
import { claimArt, releaseArt } from '../shop/art.js';

/** How long the list the apps load is reused before the database is asked again (any change clears it at once). */
const CACHE_MS = 60_000;

export interface ArtOverrideRow {
  slot: string;
  assetKey: string;
  url: string | null;
  note: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface ArtHistoryRow {
  assetKey: string | null;
  url: string | null;
  note: string | null;
  changedAt: Date;
  changedBy: string | null;
}

export type ArtChange =
  | { ok: true; override: ArtOverrideRow | null }
  | { ok: false; status: number; code: string; message: string };

/** The kind of uploaded art a slot takes: the shop's square pictures, or its 16:9 ones for a banner. */
export function slotArtKind(slot: string): ArtKind | null {
  const parts = parseArtSlot(slot);
  return parts ? (ART_SLOT_FAMILY_INFO[parts.family].shape === 'wide' ? 'background' : 'icon') : null;
}

/**
 * Pictures put in place of the art that ships (migration 1751000201000).
 *
 * A picture is uploaded first, exactly as shop art is (`POST
 * /admin/shop/art/:kind`: checked, re-encoded, stored content-addressed), and
 * then given to a slot here. Giving it holds the upload for as long as the slot
 * uses it (`claimArt`); replacing or resetting a slot lets the old picture go
 * (`releaseArt`), unless something else still uses it, and the orphan sweep
 * takes it a day later: the day in which "put the previous one back" works.
 * Every change, the resets too, goes in the slot's history.
 *
 * The apps load the whole list at once, which is small (a slot is replaced
 * only by hand) and cached here, so the many requests for it cost one query a
 * minute at most.
 */
export class ArtOverrideService {
  private cached: { at: number; value: ArtOverridesResponse } | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly publicUrl: PublicUrl,
  ) {}

  /** What the apps load: every replaced slot's picture, and a version that changes with any change. */
  async published(now = Date.now()): Promise<ArtOverridesResponse> {
    if (this.cached && now - this.cached.at < CACHE_MS) return this.cached.value;
    const res = await this.pool.query<{ slot: string; asset_key: string; updated_at: Date }>(
      `SELECT slot, asset_key, updated_at FROM art_overrides ORDER BY slot`,
    );
    const overrides: Record<string, string> = {};
    let latest = 0;
    for (const row of res.rows) {
      // a slot the apps no longer draw (a badge retired since) is left out, not sent
      const url = isArtSlot(row.slot) ? this.publicUrl(row.asset_key) : null;
      if (url) overrides[row.slot] = url;
      latest = Math.max(latest, row.updated_at.getTime());
    }
    const value = { version: `${res.rowCount ?? 0}-${latest}`, overrides };
    this.cached = { at: now, value };
    return value;
  }

  /** Every replaced slot, for the admin. */
  async list(): Promise<ArtOverrideRow[]> {
    const res = await this.pool.query<{ slot: string; asset_key: string; note: string | null; updated_at: Date; username: string | null }>(
      `SELECT o.slot, o.asset_key, o.note, o.updated_at, u.username
         FROM art_overrides o LEFT JOIN users u ON u.id = o.updated_by
        ORDER BY o.slot`,
    );
    return res.rows.map((r) => ({
      slot: r.slot,
      assetKey: r.asset_key,
      url: this.publicUrl(r.asset_key),
      note: r.note,
      updatedAt: r.updated_at,
      updatedBy: r.username,
    }));
  }

  /** What a slot held before, newest first. */
  async history(slot: string, limit = 20): Promise<ArtHistoryRow[]> {
    const res = await this.pool.query<{ asset_key: string | null; note: string | null; changed_at: Date; username: string | null }>(
      `SELECT h.asset_key, h.note, h.changed_at, u.username
         FROM art_override_history h LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.slot = $1 ORDER BY h.changed_at DESC, h.id DESC LIMIT $2`,
      [slot, limit],
    );
    return res.rows.map((r) => ({
      assetKey: r.asset_key,
      url: r.asset_key ? this.publicUrl(r.asset_key) : null,
      note: r.note,
      changedAt: r.changed_at,
      changedBy: r.username,
    }));
  }

  /**
   * Put an uploaded picture in a slot, or (assetKey null) take the slot back
   * to the art that ships. One transaction: the slot, its history, holding the
   * new picture and letting go of the old.
   */
  async set(adminId: string, slot: string, assetKey: string | null, note: string | null): Promise<ArtChange> {
    if (!isArtSlot(slot)) return { ok: false, status: 404, code: 'UNKNOWN_SLOT', message: 'there is no such picture to replace' };
    const kind = slotArtKind(slot)!;
    if (assetKey !== null && (!isUploadedArtKey(assetKey) || uploadedArtKind(assetKey) !== kind)) {
      return {
        ok: false,
        status: 400,
        code: 'BAD_ART_KEY',
        message: kind === 'background' ? 'this needs a 16:9 picture uploaded for it' : 'this needs a square picture uploaded for it',
      };
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const was = await client.query<{ asset_key: string }>(`SELECT asset_key FROM art_overrides WHERE slot = $1 FOR UPDATE`, [slot]);
      const before = was.rows[0]?.asset_key ?? null;
      if (before === assetKey) {
        await client.query('ROLLBACK');
        return { ok: true, override: assetKey ? await this.one(slot) : null };
      }
      if (assetKey !== null) {
        const claimed = await claimArt(client, assetKey, kind);
        if (!claimed.ok) {
          await client.query('ROLLBACK');
          return { ok: false, status: 409, code: claimed.code, message: claimed.message };
        }
        await client.query(
          `INSERT INTO art_overrides (slot, asset_key, note, updated_by) VALUES ($1, $2, $3, $4)
           ON CONFLICT (slot) DO UPDATE SET asset_key = EXCLUDED.asset_key, note = EXCLUDED.note,
             updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [slot, assetKey, note, adminId],
        );
      } else {
        await client.query(`DELETE FROM art_overrides WHERE slot = $1`, [slot]);
      }
      await client.query(`INSERT INTO art_override_history (slot, asset_key, note, changed_by) VALUES ($1, $2, $3, $4)`, [slot, assetKey, note, adminId]);
      await releaseArt(client, before);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    this.cached = null;
    return { ok: true, override: assetKey ? await this.one(slot) : null };
  }

  private async one(slot: string): Promise<ArtOverrideRow | null> {
    return (await this.list()).find((r) => r.slot === slot) ?? null;
  }
}
