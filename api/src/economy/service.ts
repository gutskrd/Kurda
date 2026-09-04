import type pg from 'pg';
import { driftRatio, isDrifting, EXCLUDED_REASONS } from './metrics.js';

const EXCLUDED = [...EXCLUDED_REASONS];

export interface DailyPoint {
  day: string;
  faucet: number;
  sink: number;
  net: number;
  /** running total supply through this day (net cumulative). */
  supply: number;
}

export interface DriftReport {
  currency: string;
  windowDays: number;
  faucet: number;
  sink: number;
  /**
   * faucet/sink, or null when nothing was ever spent so the ratio is infinite.
   *
   * Nullable rather than Infinity because JSON has no infinity: JSON.stringify
   * emits null for it regardless, which crashed the dashboard the moment a
   * currency had faucets and no sinks — the normal state of a young economy.
   * Making it explicit means clients handle the case on purpose.
   */
  ratio: number | null;
  target: number;
  drifting: boolean;
}

/**
 * Economy monitoring (KUR-074). Rolls the append-only wallet ledger into a
 * per-day faucet/sink table, serves the net-supply time series for the
 * dashboard, and reports weekly faucet/sink drift for alerting. Admin/migration
 * reason codes are excluded so backfills don't distort inflation stats.
 */
export class EconomyService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Aggregate one UTC day of ledger activity into economy_daily. Idempotent —
   * a re-run overwrites that day. `day` is truncated to a date.
   */
  async aggregateDay(day: Date): Promise<void> {
    const rows = await this.pool.query<{ currency: string; faucet: string; sink: string }>(
      `SELECT currency,
              COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS faucet,
              COALESCE(SUM(-amount) FILTER (WHERE amount < 0), 0) AS sink
         FROM wallet_ledger
        WHERE created_at >= $1::date AND created_at < ($1::date + INTERVAL '1 day')
          AND NOT (reason = ANY($2))
        GROUP BY currency`,
      [day, EXCLUDED],
    );

    for (const r of rows.rows) {
      const faucet = Number(r.faucet);
      const sink = Number(r.sink);
      await this.pool.query(
        `INSERT INTO economy_daily (day, currency, faucet, sink, net, updated_at)
         VALUES ($1::date, $2, $3, $4, $5, now())
         ON CONFLICT (day, currency)
         DO UPDATE SET faucet = EXCLUDED.faucet, sink = EXCLUDED.sink, net = EXCLUDED.net, updated_at = now()`,
        [day, r.currency, faucet, sink, faucet - sink],
      );
    }
  }

  /** Net-supply time series for the dashboard chart (last `days`, oldest first). */
  async supply(currency: string, days = 30): Promise<DailyPoint[]> {
    const rows = await this.pool.query<{ day: string; faucet: string; sink: string; net: string }>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, faucet, sink, net
         FROM economy_daily
        WHERE currency = $1 AND day > (CURRENT_DATE - $2::int)
        ORDER BY day`,
      [currency, days],
    );
    // baseline supply before the window, so the running total is absolute
    const prior = await this.pool.query<{ sum: string | null }>(
      `SELECT COALESCE(SUM(net), 0)::text AS sum FROM economy_daily
        WHERE currency = $1 AND day <= (CURRENT_DATE - $2::int)`,
      [currency, days],
    );
    let supply = Number(prior.rows[0]?.sum ?? 0);
    return rows.rows.map((r) => {
      const net = Number(r.net);
      supply += net;
      return { day: r.day, faucet: Number(r.faucet), sink: Number(r.sink), net, supply };
    });
  }

  /** Weekly faucet/sink drift vs a target ratio (KUR-074 alert). */
  async drift(currency: string, target = 1, windowDays = 7): Promise<DriftReport> {
    const row = await this.pool.query<{ faucet: string; sink: string }>(
      `SELECT COALESCE(SUM(faucet), 0) AS faucet, COALESCE(SUM(sink), 0) AS sink
         FROM economy_daily
        WHERE currency = $1 AND day > (CURRENT_DATE - $2::int)`,
      [currency, windowDays],
    );
    const faucet = Number(row.rows[0]?.faucet ?? 0);
    const sink = Number(row.rows[0]?.sink ?? 0);
    const ratio = driftRatio(faucet, sink);
    return {
      currency,
      windowDays,
      faucet,
      sink,
      // drifting is judged on the real (possibly infinite) ratio; only the wire
      // value is narrowed, so a currency nobody can spend still raises the flag
      ratio: Number.isFinite(ratio) ? ratio : null,
      target,
      drifting: isDrifting(ratio, target),
    };
  }
}
