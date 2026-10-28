import type pg from 'pg';
import {
  MAINTENANCE_LIMITS,
  MAINTENANCE_MAX_LEAD_DAYS,
  maintenancePhase,
  type MaintenanceNotice,
  type MaintenancePhase,
  type MaintenanceSettings,
} from '@kurda/shared';
import { isUploadedArtKey, uploadedArtKind, type PublicUrl } from '../cosmetics/access.js';
import { claimArt, releaseArt } from '../shop/art.js';
import { NO_SECURITY_LOG, type SecurityRecorder } from '../security/log.js';

/**
 * How long the setting is reused before the database is asked again. Every
 * request asks, so this is what keeps that free; a change here clears it at
 * once, and another server instance picks it up within this long.
 */
const CACHE_MS = 5_000;

interface Row {
  enabled: boolean;
  title: string | null;
  message: string | null;
  asset_key: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
  reopen_at_end: boolean;
  updated_at: Date;
  updated_by: string | null;
}

/** The setting as the admin sees it, with where it stands now and who last changed it. */
export interface MaintenanceState {
  settings: MaintenanceSettings;
  phase: MaintenancePhase;
  pictureUrl: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export type MaintenanceChange = { ok: true; state: MaintenanceState } | { ok: false; status: number; code: string; message: string };

const OFF: Row = {
  enabled: false,
  title: null,
  message: null,
  asset_key: null,
  starts_at: null,
  ends_at: null,
  reopen_at_end: true,
  updated_at: new Date(0),
  updated_by: null,
};

function settingsOf(row: Row): MaintenanceSettings {
  return {
    enabled: row.enabled,
    title: row.title,
    message: row.message,
    assetKey: row.asset_key,
    startsAt: row.starts_at?.toISOString() ?? null,
    endsAt: row.ends_at?.toISOString() ?? null,
    reopenAtEnd: row.reopen_at_end,
  };
}

/**
 * Taking Hevalo offline for a while (migration 1751000202000; @kurda/shared
 * maintenance.ts for what the apps do with it).
 *
 * One row says whether it is on, from and until when, and what people see.
 * Nothing runs at the start or the end: whether it is on is worked out from
 * the times on every ask (`maintenancePhase`), so a start set for tonight
 * begins tonight and an end that reopens does, with no job to miss it.
 *
 * The picture is uploaded first, as shop art is, and held while this row
 * names it, exactly as a replaced picture is (art/overrides.ts).
 */
export class MaintenanceService {
  private cached: { at: number; row: Row } | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly publicUrl: PublicUrl,
    private readonly security: SecurityRecorder = NO_SECURITY_LOG,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async row(): Promise<Row> {
    const at = Date.now();
    if (this.cached && at - this.cached.at < CACHE_MS) return this.cached.row;
    return (await this.fresh()).row;
  }

  /** The row read again (and cached), with the username of whoever last changed it. */
  private async fresh(): Promise<{ row: Row; updatedBy: string | null }> {
    const at = Date.now();
    const res = await this.pool.query<Row & { updated_by_name: string | null }>(
      `SELECT m.enabled, m.title, m.message, m.asset_key, m.starts_at, m.ends_at, m.reopen_at_end, m.updated_at, m.updated_by,
              u.username AS updated_by_name
         FROM maintenance m LEFT JOIN users u ON u.id = m.updated_by WHERE m.id = 1`,
    );
    const found = res.rows[0];
    const row: Row = found
      ? {
          enabled: found.enabled,
          title: found.title,
          message: found.message,
          asset_key: found.asset_key,
          starts_at: found.starts_at,
          ends_at: found.ends_at,
          reopen_at_end: found.reopen_at_end,
          updated_at: found.updated_at,
          updated_by: found.updated_by,
        }
      : OFF;
    this.cached = { at, row };
    return { row, updatedBy: found?.updated_by_name ?? null };
  }

  /** What people see, while Hevalo is offline; null while it is open. */
  async notice(): Promise<MaintenanceNotice | null> {
    const row = await this.row();
    const now = this.now();
    if (maintenancePhase(settingsOf(row), now) !== 'on') return null;
    return {
      title: row.title,
      message: row.message,
      pictureUrl: row.asset_key ? this.publicUrl(row.asset_key) : null,
      since: (row.starts_at ?? row.updated_at).toISOString(),
      backBy: row.ends_at && row.ends_at > now ? row.ends_at.toISOString() : null,
    };
  }

  /** The setting, for the admin. */
  async state(): Promise<MaintenanceState> {
    // read fresh, with who changed it last, in one query
    const { row, updatedBy } = await this.fresh();
    return {
      settings: settingsOf(row),
      phase: maintenancePhase(settingsOf(row), this.now()),
      pictureUrl: row.asset_key ? this.publicUrl(row.asset_key) : null,
      updatedAt: row.updated_at.toISOString(),
      updatedBy,
    };
  }

  /**
   * Change it: turn it on (now, or from a start), change what people see
   * while it is on, or turn it off. Turned on with no start, it starts now,
   * and that moment is kept while it stays on, as "since".
   */
  async set(adminId: string, input: MaintenanceSettings): Promise<MaintenanceChange> {
    const bad = (message: string): MaintenanceChange => ({ ok: false, status: 400, code: 'INVALID_SCHEDULE', message });
    const now = this.now();
    const title = input.title?.trim() || null;
    const message = input.message?.trim() || null;
    if (title && title.length > MAINTENANCE_LIMITS.title) return bad(`the title can be at most ${MAINTENANCE_LIMITS.title} characters`);
    if (message && message.length > MAINTENANCE_LIMITS.message) return bad(`the message can be at most ${MAINTENANCE_LIMITS.message} characters`);
    if (input.assetKey !== null && (!isUploadedArtKey(input.assetKey) || uploadedArtKind(input.assetKey) !== 'background')) {
      return { ok: false, status: 400, code: 'BAD_ART_KEY', message: 'the picture needs to be a 16:9 picture uploaded for it' };
    }
    let startsAt = input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) return bad('that is not a date and time');
    if (startsAt && startsAt.getTime() > now.getTime() + MAINTENANCE_MAX_LEAD_DAYS * 86_400_000) {
      return bad(`a start can be set at most ${MAINTENANCE_MAX_LEAD_DAYS} days ahead`);
    }

    const client = await this.pool.connect();
    let was: Row;
    try {
      await client.query('BEGIN');
      const res = await client.query<Row>(
        `SELECT enabled, title, message, asset_key, starts_at, ends_at, reopen_at_end, updated_at, updated_by FROM maintenance WHERE id = 1 FOR UPDATE`,
      );
      was = res.rows[0] ?? OFF;
      const wasOn = maintenancePhase(settingsOf(was), now);
      if (input.enabled) {
        // a start already past is now; an offline screen that is up keeps the moment it went up
        if (!startsAt || startsAt < now) startsAt = wasOn === 'on' && was.starts_at ? was.starts_at : now;
        if (endsAt && endsAt <= now) {
          await client.query('ROLLBACK');
          return bad('the time Hevalo is back has to be in the future');
        }
        if (endsAt && endsAt <= startsAt) {
          await client.query('ROLLBACK');
          return bad('the time Hevalo is back has to be after it goes offline');
        }
      } else if (endsAt && startsAt && endsAt <= startsAt) {
        await client.query('ROLLBACK');
        return bad('the time Hevalo is back has to be after it goes offline');
      }
      if (input.assetKey !== null) {
        const claimed = await claimArt(client, input.assetKey, 'background');
        if (!claimed.ok) {
          await client.query('ROLLBACK');
          return { ok: false, status: 409, code: claimed.code, message: claimed.message };
        }
      }
      await client.query(
        `INSERT INTO maintenance (id, enabled, title, message, asset_key, starts_at, ends_at, reopen_at_end, updated_by, updated_at)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, title = EXCLUDED.title, message = EXCLUDED.message,
           asset_key = EXCLUDED.asset_key, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
           reopen_at_end = EXCLUDED.reopen_at_end, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [input.enabled, title, message, input.assetKey, startsAt, endsAt, input.reopenAtEnd, adminId],
      );
      if (was.asset_key !== input.assetKey) await releaseArt(client, was.asset_key);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    const state = await this.state();

    // into the security log when it goes up, is set for later, or comes down: taking the app away from
    // everyone is the one thing in the console nobody should find out about from the users
    const before = maintenancePhase(settingsOf(was), now);
    const going = before !== 'on' && before !== 'scheduled' && (state.phase === 'on' || state.phase === 'scheduled');
    const ending = (before === 'on' || before === 'scheduled') && (state.phase === 'off' || state.phase === 'ended');
    if (going) {
      void this.security.record('console.offline_on', {
        userId: adminId,
        details: { from: state.settings.startsAt, backBy: state.settings.endsAt, reopensByItself: state.settings.reopenAtEnd },
      });
    } else if (ending) {
      void this.security.record('console.offline_off', { userId: adminId, details: { wasPhase: before } });
    }
    return { ok: true, state };
  }
}
