import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { requireAdmin } from './routes.js';
import type { AdminTotpService } from './totp-service.js';
import { expiryFrom, normalizeReason } from './moderation.js';
import type { UserAdminService } from './user-admin-service.js';

const idParam = z.object({ id: z.uuid() });
const reasonBody = z.object({ reason: z.string() });
const muteBody = z.object({ reason: z.string(), hours: z.number().int().min(1) });
const banBody = z.object({ reason: z.string(), hours: z.number().int().min(1).optional() });
const walletBody = z.object({ reason: z.string(), currency: z.enum(['zer', 'gems']), amount: z.number().int() });
const itemBody = z.object({ reason: z.string(), sku: z.string().min(1).max(80) });
const itemParams = z.object({ id: z.uuid(), sku: z.string().min(1).max(80) });

type ActionResult =
  | { ok: true; balance?: number }
  | { ok: false; code: 'NOT_FOUND' | 'INSUFFICIENT_FUNDS' | 'ITEM_NOT_FOUND' | 'NOT_OWNED' };

function sendResult(reply: FastifyReply, res: ActionResult) {
  if (res.ok) return reply.send({ ok: true, ...(res.balance !== undefined ? { balance: res.balance } : {}) });
  if (res.code === 'NOT_FOUND') return reply.code(404).send({ code: res.code, message: 'no such user' });
  if (res.code === 'ITEM_NOT_FOUND') return reply.code(404).send({ code: res.code, message: 'no such shop item' });
  if (res.code === 'NOT_OWNED') return reply.code(409).send({ code: res.code, message: 'the user does not own that item' });
  return reply.code(402).send({ code: res.code, message: 'insufficient balance for this debit' });
}

/** Admin user management: search, detail, moderation actions (KUR-101). */
export function registerUserAdminRoutes(app: FastifyInstance, users: UserAdminService, totp: AdminTotpService): void {
  const canView = [requireAuth, requireAdmin(totp, 'superadmin', 'moderator', 'support')];
  const canModerate = [requireAuth, requireAdmin(totp, 'superadmin', 'moderator')];
  const canAdjustEconomy = [requireAuth, requireAdmin(totp, 'superadmin')];

  app.get(
    '/admin/users',
    { schema: { querystring: z.object({ q: z.string().min(1).max(200) }) }, preHandler: canView },
    async (req) => ({ users: await users.search((req.query as { q: string }).q) }),
  );

  app.get('/admin/users/:id', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: canView }, async (req, reply) => {
    const detail = await users.detail((req.params as z.infer<typeof idParam>).id);
    if (!detail) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such user' });
    return detail;
  });

  app.post('/admin/users/:id/warn', { schema: { params: idParam, body: reasonBody }, preHandler: canModerate }, async (req, reply) => {
    const reason = normalizeReason((req.body as z.infer<typeof reasonBody>).reason);
    if (!reason) return reply.code(400).send({ code: 'REASON_REQUIRED', message: 'a reason is required' });
    return sendResult(reply, await users.warn(req.user!.id, (req.params as z.infer<typeof idParam>).id, reason));
  });

  app.post('/admin/users/:id/mute', { schema: { params: idParam, body: muteBody }, preHandler: canModerate }, async (req, reply) => {
    const b = req.body as z.infer<typeof muteBody>;
    const reason = normalizeReason(b.reason);
    if (!reason) return reply.code(400).send({ code: 'REASON_REQUIRED', message: 'a reason is required' });
    const until = expiryFrom(new Date(), b.hours)!; // schema guarantees hours >= 1
    return sendResult(reply, await users.mute(req.user!.id, (req.params as z.infer<typeof idParam>).id, reason, until));
  });

  app.post('/admin/users/:id/ban', { schema: { params: idParam, body: banBody }, preHandler: canModerate }, async (req, reply) => {
    const b = req.body as z.infer<typeof banBody>;
    const reason = normalizeReason(b.reason);
    if (!reason) return reply.code(400).send({ code: 'REASON_REQUIRED', message: 'a reason is required' });
    const id = (req.params as z.infer<typeof idParam>).id;
    const res = b.hours ? await users.tempBan(req.user!.id, id, reason, expiryFrom(new Date(), b.hours)!) : await users.permBan(req.user!.id, id, reason);
    return sendResult(reply, res);
  });

  app.post('/admin/users/:id/unban', { schema: { params: idParam, body: reasonBody }, preHandler: canModerate }, async (req, reply) => {
    const reason = normalizeReason((req.body as z.infer<typeof reasonBody>).reason);
    if (!reason) return reply.code(400).send({ code: 'REASON_REQUIRED', message: 'a reason is required' });
    return sendResult(reply, await users.unban(req.user!.id, (req.params as z.infer<typeof idParam>).id, reason));
  });

  /** What the user owns (for the panel's item list). */
  app.get(
    '/admin/users/:id/items',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: canView },
    async (req) => ({ items: await users.items((req.params as z.infer<typeof idParam>).id) }),
  );

  /** Give a catalog item, free. Same economy bar as changing a balance. */
  app.post(
    '/admin/users/:id/items',
    { schema: { params: idParam, body: itemBody }, preHandler: canAdjustEconomy },
    async (req, reply) => {
      const b = req.body as z.infer<typeof itemBody>;
      const reason = normalizeReason(b.reason);
      if (!reason) return reply.code(400).send({ code: 'REASON_REQUIRED', message: 'a reason is required' });
      return sendResult(reply, await users.grantItem(req.user!.id, (req.params as z.infer<typeof idParam>).id, b.sku, reason));
    },
  );

  /** Take an item back (also un-equips it). */
  app.delete(
    '/admin/users/:id/items/:sku',
    { schema: { params: itemParams, body: reasonBody }, preHandler: canAdjustEconomy },
    async (req, reply) => {
      const { id, sku } = req.params as z.infer<typeof itemParams>;
      const reason = normalizeReason((req.body as z.infer<typeof reasonBody>).reason);
      if (!reason) return reply.code(400).send({ code: 'REASON_REQUIRED', message: 'a reason is required' });
      return sendResult(reply, await users.revokeItem(req.user!.id, id, sku, reason));
    },
  );

  app.post('/admin/users/:id/wallet', { schema: { params: idParam, body: walletBody }, preHandler: canAdjustEconomy }, async (req, reply) => {
    const b = req.body as z.infer<typeof walletBody>;
    const reason = normalizeReason(b.reason);
    if (!reason) return reply.code(400).send({ code: 'REASON_REQUIRED', message: 'a reason is required' });
    if (b.amount === 0) return reply.code(400).send({ code: 'INVALID_AMOUNT', message: 'amount must be non-zero' });
    return sendResult(reply, await users.adjustWallet(req.user!.id, (req.params as z.infer<typeof idParam>).id, b.currency, b.amount, reason));
  });
}
