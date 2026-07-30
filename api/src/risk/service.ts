import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { Redis } from 'ioredis';
import { assessRisk, type RiskAssessment, type RiskSignals } from './score.js';
import { isDisposableEmail } from '../auth/disposable-domains.js';
import { safeLookup, type IpReputationProvider } from './ip-reputation.js';

export type RiskEvent = 'signup' | 'login';

export interface AssessInput {
  /** email is only used for the disposable-domain signal; may be omitted on login */
  email?: string;
  ip: string;
  /** opaque client device fingerprint (#110); hashed before it touches storage */
  deviceId?: string | null;
  now?: Date;
}

export interface AssessResult {
  assessment: RiskAssessment;
  signals: RiskSignals;
  decisionId: string;
}

/** Recent window for per-device/IP account-creation counting (24h). */
export const RISK_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Retention bound for logged decisions (#109). */
export const RISK_RETENTION_DAYS = 90;

/**
 * Orchestrates signup/login risk scoring (KUR-296). It gathers the signals the
 * pure engine (`score.ts`) needs — IP reputation (provider-agnostic, degrades
 * gracefully), per-device/IP account velocity from `risk_decisions`, request
 * velocity from Redis, disposable-email (#025), known-good device — assesses
 * the risk, and logs the decision for tuning + audit (#104). IP/device values
 * are stored **hashed only**.
 */
export class RiskService {
  private readonly pool: pg.Pool;
  private readonly redis?: Redis;
  private readonly ipReputation?: IpReputationProvider;
  private readonly now: () => Date;

  constructor(
    pool: pg.Pool,
    deps: { redis?: Redis; ipReputation?: IpReputationProvider; now?: () => Date } = {},
  ) {
    this.pool = pool;
    this.redis = deps.redis;
    this.ipReputation = deps.ipReputation;
    this.now = deps.now ?? (() => new Date());
  }

  assessSignup(input: AssessInput): Promise<AssessResult> {
    return this.assess('signup', input);
  }

  assessLogin(input: AssessInput): Promise<AssessResult> {
    return this.assess('login', input);
  }

  /** Attach the created/authenticated user to a logged decision (post-hoc). */
  async attachUser(decisionId: string, userId: string): Promise<void> {
    await this.pool.query(`UPDATE risk_decisions SET user_id = $2 WHERE id = $1`, [
      decisionId,
      userId,
    ]);
  }

  /** Retention prune (#109): drop decisions older than the bound. */
  async prune(olderThanDays: number = RISK_RETENTION_DAYS): Promise<number> {
    const res = await this.pool.query(
      `DELETE FROM risk_decisions WHERE created_at < now() - ($1 || ' days')::interval`,
      [String(olderThanDays)],
    );
    return res.rowCount ?? 0;
  }

  private async assess(event: RiskEvent, input: AssessInput): Promise<AssessResult> {
    const now = input.now ?? this.now();
    const ipHash = hash(input.ip);
    const deviceHash = input.deviceId ? hash(input.deviceId) : null;
    const rep = await safeLookup(this.ipReputation, input.ip);

    // account-creation volume only gates signups; login uses velocity/reputation
    const accountsFromDeviceRecently =
      event === 'signup' && deviceHash
        ? (await this.countRecentSignups('device_hash', deviceHash, now)) + 1
        : 0;
    const accountsFromIpRecently =
      event === 'signup' ? (await this.countRecentSignups('ip_hash', ipHash, now)) + 1 : 0;

    const signals: RiskSignals = {
      ipReputation: rep.reputation,
      deviceKnownGood: deviceHash ? await this.deviceHasGoodAccount(deviceHash) : false,
      accountsFromDeviceRecently,
      accountsFromIpRecently,
      disposableEmail: input.email ? isDisposableEmail(input.email) : false,
      velocityPerMin: await this.bumpVelocity(event, ipHash, now),
      geoMismatch: false, // computed once login-history geo lands (follow-up)
      sharedNetwork: rep.sharedNetwork,
    };

    const assessment = assessRisk(signals);
    const decisionId = await this.record(event, ipHash, deviceHash, assessment, signals);
    return { assessment, signals, decisionId };
  }

  private async record(
    event: RiskEvent,
    ipHash: string,
    deviceHash: string | null,
    a: RiskAssessment,
    signals: RiskSignals,
  ): Promise<string> {
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO risk_decisions (event, ip_hash, device_hash, score, band, action, hard_block, signals)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`,
      [event, ipHash, deviceHash, a.score, a.band, a.action, a.hardBlock, JSON.stringify(signals)],
    );
    return res.rows[0]!.id;
  }

  private async countRecentSignups(
    column: 'device_hash' | 'ip_hash',
    value: string,
    now: Date,
  ): Promise<number> {
    const since = new Date(now.getTime() - RISK_WINDOW_MS);
    const res = await this.pool.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM risk_decisions
       WHERE event = 'signup' AND ${column} = $1 AND created_at >= $2`,
      [value, since],
    );
    return Number(res.rows[0]?.n ?? 0);
  }

  /** A device is "known good" if a verified account was created from it. */
  private async deviceHasGoodAccount(deviceHash: string): Promise<boolean> {
    const res = await this.pool.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM risk_decisions rd
         JOIN users u ON u.id = rd.user_id
         WHERE rd.device_hash = $1 AND u.email_verified_at IS NOT NULL
       ) AS ok`,
      [deviceHash],
    );
    return res.rows[0]?.ok ?? false;
  }

  /** Requests-per-minute for this IP, via a Redis minute bucket (0 if no Redis). */
  private async bumpVelocity(event: RiskEvent, ipHash: string, now: Date): Promise<number> {
    if (!this.redis) return 0;
    const minute = Math.floor(now.getTime() / 60_000);
    const key = `risk:vel:${event}:${ipHash}:${minute}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 120);
    return count;
  }
}

/** SHA-256 hex of an identifier — minimization: raw IP/device never stored. */
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
