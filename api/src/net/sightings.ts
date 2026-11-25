import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type pg from 'pg';
import { RiskService } from '../risk/service.js';
import { networkHashOf } from './network-key.js';

type Executor = Pick<pg.Pool, 'query'>;

/** How many (account, network) pairs one process remembers having written today. */
const MAX_REMEMBERED = 50_000;

/** The UTC day of a moment, as the `day` column stores it. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Records an account on a network: a new row for the day, or the day's first and last times widened. */
export async function writeSighting(db: Executor, userId: string, netHash: string, at: Date): Promise<void> {
  await db.query(
    `INSERT INTO network_sightings (user_id, net_hash, day, first_at, last_at)
     VALUES ($1, $2, $3::date, $4, $4)
     ON CONFLICT (user_id, net_hash, day) DO UPDATE SET
       first_at = LEAST(network_sightings.first_at, EXCLUDED.first_at),
       last_at = GREATEST(network_sightings.last_at, EXCLUDED.last_at)`,
    [userId, netHash, utcDay(at), at],
  );
}

/**
 * Network sightings from signed-in requests. Each process writes a given account and network once per UTC day,
 * remembering writes in a bounded memory cleared when the day turns, so a busy process writes a sighting twice at
 * worst. Recording never delays or fails a request: the write is not awaited and failures are logged.
 */
export class NetworkSightings {
  private written = new Set<string>();
  private day = '';

  constructor(
    private readonly db: Executor,
    private readonly log?: Pick<FastifyBaseLogger, 'warn'>,
    private readonly now: () => Date = () => new Date(),
    private readonly maxRemembered = MAX_REMEMBERED,
  ) {}

  /** Notes a request from this account at this address; returns the started write (for tests) or null when nothing was written. */
  seen(userId: string, ip: string): Promise<void> | null {
    const netHash = networkHashOf(ip);
    if (!netHash) return null;
    const at = this.now();
    const day = utcDay(at);
    if (day !== this.day) {
      this.written = new Set();
      this.day = day;
    }
    const key = `${userId}|${netHash}`;
    if (this.written.has(key)) return null;
    if (this.written.size >= this.maxRemembered) {
      // forget the oldest; a second write of it is harmless
      const oldest = this.written.values().next().value;
      if (oldest !== undefined) this.written.delete(oldest);
    }
    this.written.add(key);
    return writeSighting(this.db, userId, netHash, at).catch((err: unknown) => {
      this.log?.warn({ err }, 'failed to record a network sighting');
    });
  }
}

/**
 * Sightings from every signed-in request, and the daily retention prune of sightings and risk decisions. Install
 * before any route is registered, since a fastify hook applies only to routes added after it.
 */
export function setupNetworkSightings(app: FastifyInstance, opts: { pruneAtStart: boolean }): void {
  const sightings = new NetworkSightings(app.db, app.log);
  app.addHook('onResponse', async (req) => {
    // a child's profile keeps no network (family/)
    if (req.user?.id && req.user.child !== true) void sightings.seen(req.user.id, req.ip);
  });

  // Deleting by age is idempotent, so every instance may run it, and it needs no separate worker.
  const risk = new RiskService(app.db);
  const prune = () =>
    void risk
      .prune()
      .then((pruned) => app.log.info(pruned, 'pruned old risk decisions and network sightings'))
      .catch((err) => app.log.warn({ err }, 'risk and sighting prune failed'));
  const timer = setInterval(prune, 24 * 60 * 60 * 1000);
  if (opts.pruneAtStart) app.addHook('onReady', async () => prune());
  app.addHook('onClose', async () => clearInterval(timer));
}
