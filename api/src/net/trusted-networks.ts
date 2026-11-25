import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { logAdminAction } from '../moderation/sanctions-service.js';
import { inTransaction, type Executor } from '../moderation/tx.js';
import { parseIp } from './ip.js';
import { networkHashOf, networkKey } from './network-key.js';

/**
 * Networks a superadmin vouched for as shared by many people, such as a school's: a class signing up together is not
 * stopped by the sign-up cap per network, and the network never counts as quiet when telling whether two accounts are
 * one person. Each entry has a reason and ends within a year; there are at most {@link MAX_TRUSTED_NETWORKS}; adding
 * and removing are audited. The network is kept as its keyed hash, with a hint for the console (the address with its
 * last part hidden), never the address.
 */

export const MAX_TRUSTED_NETWORKS = 100;
/** The longest an entry lasts before it must be added again. */
export const MAX_TRUSTED_DAYS = 365;

export interface TrustedNetwork {
  id: string;
  hint: string;
  reason: string;
  createdAt: string;
  createdBy: string | null;
  expiresAt: string;
  expired: boolean;
}

/** What the console shows of a network: an IPv4 address without its last part, an IPv6 network as its /64. */
export function networkHint(ip: string): string | null {
  const parsed = parseIp(ip);
  if (!parsed) return null;
  const key = networkKey(ip)!;
  if (parsed.family === 4) return `${key.split('.').slice(0, 3).join('.')}.x`;
  return key;
}

/** Whether a network is on the list now. */
export async function isTrustedNetwork(db: Executor, netHash: string): Promise<boolean> {
  const r = await db.query(`SELECT 1 FROM trusted_networks WHERE net_hash = $1 AND removed_at IS NULL AND expires_at > now()`, [netHash]);
  return (r.rowCount ?? 0) > 0;
}

/** Whether the network an address belongs to is on the list now. */
export async function isTrustedAddress(db: Executor, ip: string): Promise<boolean> {
  const netHash = networkHashOf(ip);
  return netHash ? isTrustedNetwork(db, netHash) : false;
}

interface Row {
  id: string;
  network_hint: string;
  reason: string;
  created_at: Date;
  created_by_username: string | null;
  expires_at: Date;
}

function toView(r: Row, now = Date.now()): TrustedNetwork {
  return {
    id: r.id,
    hint: r.network_hint,
    reason: r.reason,
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by_username,
    expiresAt: r.expires_at.toISOString(),
    expired: r.expires_at.getTime() <= now,
  };
}

export class TrustedNetworksService {
  constructor(private readonly pool: pg.Pool) {}

  /** The entries not removed, soonest to end first; ended ones stay listed for a month so they can be added again. */
  async list(): Promise<TrustedNetwork[]> {
    const r = await this.pool.query<Row>(
      `SELECT t.id, t.network_hint, t.reason, t.created_at, u.username AS created_by_username, t.expires_at
         FROM trusted_networks t LEFT JOIN users u ON u.id = t.created_by
        WHERE t.removed_at IS NULL AND t.expires_at > now() - interval '30 days'
        ORDER BY t.expires_at
        LIMIT $1`,
      [MAX_TRUSTED_NETWORKS * 2],
    );
    return r.rows.map((row) => toView(row));
  }

  async add(adminId: string, input: { ip: string; reason: string; expiresAt: Date }): Promise<TrustedNetwork> {
    const reason = input.reason.trim();
    if (!reason) throw new AppError('REASON_REQUIRED', 400, 'say why this network is shared');
    const netHash = networkHashOf(input.ip);
    const hint = networkHint(input.ip);
    if (!netHash || !hint) throw new AppError('INVALID_ADDRESS', 400, 'that is not an IP address');
    const now = Date.now();
    if (input.expiresAt.getTime() <= now) throw new AppError('INVALID_EXPIRY', 400, 'the end must be in the future');
    if (input.expiresAt.getTime() > now + MAX_TRUSTED_DAYS * 86_400_000) {
      throw new AppError('INVALID_EXPIRY', 400, `an entry lasts at most ${MAX_TRUSTED_DAYS} days`);
    }
    return inTransaction(this.pool, async (client) => {
      // one at a time, so two superadmins cannot both add the hundred-and-first
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('trusted_networks'))`);
      const live = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM trusted_networks WHERE removed_at IS NULL AND expires_at > now()`,
      );
      if ((live.rows[0]?.n ?? 0) >= MAX_TRUSTED_NETWORKS) {
        throw new AppError('TRUSTED_NETWORKS_FULL', 409, `at most ${MAX_TRUSTED_NETWORKS} networks can be trusted at once; remove one first`);
      }
      // the same network again replaces its entry, so it has one end and one reason
      await client.query(`UPDATE trusted_networks SET removed_at = now(), removed_by = $2 WHERE net_hash = $1 AND removed_at IS NULL`, [
        netHash,
        adminId,
      ]);
      const r = await client.query<Row>(
        `INSERT INTO trusted_networks (net_hash, network_hint, reason, created_by, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, network_hint, reason, created_at, NULL::text AS created_by_username, expires_at`,
        [netHash, hint, reason.slice(0, 500), adminId, input.expiresAt],
      );
      await logAdminAction(client, {
        targetUserId: null,
        adminId,
        action: 'trusted_network_add',
        reason,
        meta: { network: hint, expiresAt: input.expiresAt.toISOString(), id: r.rows[0]!.id },
      });
      return toView(r.rows[0]!);
    });
  }

  async remove(adminId: string, id: string, reason: string): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      const r = await client.query<{ network_hint: string }>(
        `UPDATE trusted_networks SET removed_at = now(), removed_by = $2 WHERE id = $1 AND removed_at IS NULL RETURNING network_hint`,
        [id, adminId],
      );
      if (!r.rows[0]) throw new AppError('NOT_FOUND', 404, 'no such trusted network');
      await logAdminAction(client, {
        targetUserId: null,
        adminId,
        action: 'trusted_network_remove',
        reason: reason.trim() || 'removed',
        meta: { network: r.rows[0].network_hint, id },
      });
    });
  }
}

const addBody = z.object({
  ip: z.string().trim().min(2).max(64),
  reason: z.string().trim().min(1).max(500),
  expiresAt: z.iso.datetime({ offset: true }),
});
const removeBody = z.object({ reason: z.string().trim().min(1).max(500) });

/**
 * The superadmin's list (under /admin, so behind the console's second factor):
 *   GET    /admin/trusted-networks          → { networks: TrustedNetwork[], max }
 *   POST   /admin/trusted-networks          { ip, reason, expiresAt } → 201 { network }
 *   DELETE /admin/trusted-networks/:id      { reason } → { removed: true }
 */
export function registerTrustedNetworkRoutes(app: FastifyInstance, service: TrustedNetworksService): void {
  const guard = [requireAuth, requireRoles('superadmin')];
  app.get('/admin/trusted-networks', { config: { skipValidation: true }, preHandler: guard }, async () => ({
    networks: await service.list(),
    max: MAX_TRUSTED_NETWORKS,
    maxDays: MAX_TRUSTED_DAYS,
  }));
  app.post('/admin/trusted-networks', { schema: { body: addBody }, preHandler: guard }, async (req, reply) => {
    const body = req.body as z.infer<typeof addBody>;
    const network = await service.add(req.user!.id, { ip: body.ip, reason: body.reason, expiresAt: new Date(body.expiresAt) });
    return reply.code(201).send({ network });
  });
  app.delete(
    '/admin/trusted-networks/:id',
    { schema: { params: z.object({ id: lowerUuid() }), body: removeBody }, preHandler: guard },
    async (req) => {
      await service.remove(req.user!.id, (req.params as { id: string }).id, (req.body as z.infer<typeof removeBody>).reason);
      return { removed: true };
    },
  );
}
