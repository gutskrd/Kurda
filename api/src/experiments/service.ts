import { createHash } from 'node:crypto';
import type pg from 'pg';
import { assignVariant, type Variant } from './bucketing.js';
import type { AnalyticsService } from '../analytics/service.js';

export interface ExperimentDef {
  key: string;
  description: string | null;
  enabled: boolean;
  variants: Variant[];
}

export interface UpsertExperimentInput {
  key: string;
  description?: string | null;
  enabled?: boolean;
  variants: Variant[];
}

interface ExperimentRow {
  key: string;
  description: string | null;
  enabled: boolean;
  variants: Variant[];
}

/**
 * A/B experiment assignment + config (KUR-107). `variant` resolves a user's
 * bucket deterministically and logs an idempotent exposure event (one per
 * user per experiment) into the analytics store. A disabled experiment (kill
 * switch) always resolves to `control`.
 */
export class ExperimentService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly analytics?: AnalyticsService,
  ) {}

  /** The user's variant for one experiment, logging exposure. */
  async variant(userId: string, key: string): Promise<string> {
    const exp = await this.byKey(key);
    const assigned = exp && exp.enabled ? assignVariant(userId, key, exp.variants) : 'control';
    if (exp && exp.enabled) await this.logExposure(userId, key, assigned);
    return assigned;
  }

  /** All enabled experiments' assignments for a user (SDK bulk fetch). */
  async assignmentsFor(userId: string): Promise<Record<string, string>> {
    const res = await this.pool.query<ExperimentRow>(`SELECT * FROM experiments WHERE enabled = true`);
    const out: Record<string, string> = {};
    for (const row of res.rows) {
      const assigned = assignVariant(userId, row.key, row.variants);
      out[row.key] = assigned;
      await this.logExposure(userId, row.key, assigned);
    }
    return out;
  }

  async byKey(key: string): Promise<ExperimentDef | null> {
    const res = await this.pool.query<ExperimentRow>(`SELECT * FROM experiments WHERE key = $1`, [key]);
    const row = res.rows[0];
    return row ? { key: row.key, description: row.description, enabled: row.enabled, variants: row.variants } : null;
  }

  async list(): Promise<ExperimentDef[]> {
    const res = await this.pool.query<ExperimentRow>(`SELECT * FROM experiments ORDER BY key`);
    return res.rows.map((r) => ({ key: r.key, description: r.description, enabled: r.enabled, variants: r.variants }));
  }

  async upsert(input: UpsertExperimentInput): Promise<ExperimentDef> {
    const res = await this.pool.query<ExperimentRow>(
      `INSERT INTO experiments (key, description, enabled, variants)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (key) DO UPDATE SET
         description = EXCLUDED.description, enabled = EXCLUDED.enabled,
         variants = EXCLUDED.variants, updated_at = now()
       RETURNING *`,
      [input.key, input.description ?? null, input.enabled ?? true, JSON.stringify(input.variants)],
    );
    const row = res.rows[0]!;
    return { key: row.key, description: row.description, enabled: row.enabled, variants: row.variants };
  }

  /** Kill switch: enable/disable without touching the variant config. */
  async setEnabled(key: string, enabled: boolean): Promise<boolean> {
    const res = await this.pool.query(`UPDATE experiments SET enabled = $2, updated_at = now() WHERE key = $1`, [key, enabled]);
    return (res.rowCount ?? 0) > 0;
  }

  private async logExposure(userId: string, key: string, variant: string): Promise<void> {
    if (!this.analytics) return;
    // deterministic id → one exposure row per (user, experiment); re-fetches dedupe
    await this.analytics.ingest(userId, [
      { eventId: exposureId(userId, key), type: 'experiment_exposure', payload: { experiment: key, variant } },
    ]);
  }
}

/** Deterministic uuid-shaped exposure id so repeated exposure logs dedupe. */
function exposureId(userId: string, key: string): string {
  const hex = createHash('sha256').update(`exposure:${key}:${userId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
