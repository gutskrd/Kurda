import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  APPEAL_STATUSES,
  CASE_SOURCES,
  CASE_STATUSES,
  MAX_STATEMENT_LEN,
  REPORT_CATEGORY_KEYS,
  SANCTION_KINDS,
  type CaseSourceGroup,
  type DecideRequest,
  type ReportPriority,
} from '@kurda/shared';
import { requireCapability } from '../admin/routes.js';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import type { AppealsService } from './appeals-service.js';
import type { CasesService } from './cases-service.js';
import type { ModerationQueueService, QueueFilters } from './queue-service.js';
import { logAdminAction, type SanctionsService } from './sanctions-service.js';
import { inTransaction } from './tx.js';

const idParam = z.object({ id: z.uuid() });
// an empty POST arrives with no body at all
const noBody = z.object({}).nullish();
const reasonBody = z.object({ reason: z.string().trim().min(1).max(2000) });
const statement = z.string().trim().min(1).max(MAX_STATEMENT_LEN);
const durationHours = z.number().int().min(1).max(24 * 365).nullable().optional();

const queueQuery = z.object({
  status: z.enum([...CASE_STATUSES, 'open', 'closed', 'all'] as const).optional(),
  priority: z.coerce.number().int().min(0).max(3).optional(),
  category: z.enum(REPORT_CATEGORY_KEYS).optional(),
  source: z.enum([...CASE_SOURCES, 'reports', 'automated', 'bots', 'anti_cheat'] as const).optional(),
  q: z.string().max(200).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const decideBody = z.object({
  outcome: z.enum(['no_violation', 'actioned']),
  policy: z.enum(REPORT_CATEGORY_KEYS).optional(),
  actions: z
    .array(
      z.object({
        target: z.string().regex(/^(subject|reporter:[0-9a-f-]{36})$/i),
        kind: z.enum([...SANCTION_KINDS, 'caring_message'] as const),
        durationHours,
        statement: z.string().trim().max(MAX_STATEMENT_LEN).optional(),
        policy: z.enum(REPORT_CATEGORY_KEYS).optional(),
      }),
    )
    .max(20)
    .default([]),
  removeContent: z.boolean().default(false),
  notifyReporters: z.boolean().default(true),
  preview: z.boolean().optional(),
  confirmUsername: z.string().max(60).optional(),
  // one per permanent ban in the decision, so two bans for good can be confirmed in one go
  confirmUsernames: z.array(z.string().max(60)).max(20).optional(),
  note: z.string().trim().max(4000).optional(),
});

const sanctionBody = z.object({
  kind: z.enum(SANCTION_KINDS),
  durationHours,
  policy: z.enum(REPORT_CATEGORY_KEYS),
  statement,
  internalNote: z.string().trim().max(2000).optional(),
  confirmUsername: z.string().max(60).optional(),
});

const appealDecideBody = z.object({
  outcome: z.enum(['upheld', 'overturned', 'modified']),
  note: z.string().trim().min(1).max(2000),
  modifiedSanction: z.object({ kind: z.enum(SANCTION_KINDS), durationHours, statement }).optional(),
});

/**
 * The moderation admin API (M4). Every route here needs the `moderation.act`
 * capability — moderators, superadmins and the legacy `admin` role (the queue
 * used to accept only the last, so moderators got 403 on everything) — and,
 * being under /admin, a verified second factor. Every successful call is in the
 * audit log with its case (or sanction, or user) as the target.
 */
export function registerModerationQueueRoutes(
  app: FastifyInstance,
  deps: { queue: ModerationQueueService; cases: CasesService; sanctions: SanctionsService; appeals: AppealsService },
): void {
  const { queue, cases, sanctions, appeals } = deps;
  const guard = [requireAuth, requireCapability('moderation.act')];

  // ---- the queue ---------------------------------------------------------------

  /**
   * The queue, a page at a time. Syncs the automated feeds first, but a sync
   * that fails is logged and the page still loads: the queue must never answer
   * 500 because one feed has a bad row.
   */
  app.get('/admin/moderation/queue', { schema: { querystring: queueQuery }, preHandler: guard }, async (req) => {
    let added = 0;
    try {
      added = await queue.sync();
    } catch (err) {
      req.log.error({ err }, 'moderation sync failed; serving the queue as it is');
    }
    const q = req.query as z.infer<typeof queueQuery>;
    const filters: QueueFilters = {
      ...q,
      priority: q.priority as ReportPriority | undefined,
      source: q.source as QueueFilters['source'] | CaseSourceGroup | undefined,
      viewerId: req.user!.id,
    };
    return { added, ...(await queue.queue(filters)) };
  });

  app.get('/admin/moderation/summary', { config: { skipValidation: true }, preHandler: guard }, async () => queue.summary());

  app.get('/admin/moderation/sla', { config: { skipValidation: true }, preHandler: guard }, async () => queue.sla());

  // ---- one case ----------------------------------------------------------------

  app.get('/admin/moderation/cases/:id', { schema: { params: idParam }, preHandler: guard }, async (req) => {
    const detail = await cases.detail((req.params as { id: string }).id, req.user!.id);
    if (!detail) throw new AppError('NOT_FOUND', 404, 'no such case');
    return detail;
  });

  app.post('/admin/moderation/cases/:id/claim', { schema: { params: idParam, body: noBody }, preHandler: guard }, async (req) => {
    const lease = await cases.claim((req.params as { id: string }).id, req.user!.id);
    return { claimed: true, ...lease };
  });

  app.post('/admin/moderation/cases/:id/release', { schema: { params: idParam, body: noBody }, preHandler: guard }, async (req) => ({
    released: await cases.release((req.params as { id: string }).id, req.user!.id),
  }));

  app.post(
    '/admin/moderation/cases/:id/note',
    { schema: { params: idParam, body: z.object({ text: z.string().trim().min(1).max(4000) }) }, preHandler: guard },
    async (req, reply) => {
      const note = await cases.addNote((req.params as { id: string }).id, req.user!.id, (req.body as { text: string }).text);
      return reply.code(201).send(note);
    },
  );

  /** Decide. With `preview: true`, the exact messages people would get, and no change. */
  app.post('/admin/moderation/cases/:id/decide', { schema: { params: idParam, body: decideBody }, preHandler: guard }, async (req) => {
    const body = req.body as z.infer<typeof decideBody>;
    return cases.decide((req.params as { id: string }).id, req.user!.id, body as DecideRequest);
  });

  /** The old one-click resolve (kept for the current admin page), now with `remove`. */
  app.post(
    '/admin/moderation/cases/:id/resolve',
    {
      schema: {
        params: idParam,
        body: z.object({ resolution: z.enum(['dismiss', 'warn', 'mute', 'ban', 'remove']), confirmUsername: z.string().max(60).optional() }),
      },
      preHandler: guard,
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { resolution, confirmUsername } = req.body as { resolution: 'dismiss' | 'warn' | 'mute' | 'ban' | 'remove'; confirmUsername?: string };
      const ok = await queue.resolve(id, req.user!.id, resolution, confirmUsername);
      if (!ok) return reply.code(409).send({ code: 'ALREADY_RESOLVED', message: 'this case is already resolved' });
      return { resolved: true, resolution };
    },
  );

  app.post('/admin/moderation/cases/:id/reopen', { schema: { params: idParam, body: reasonBody }, preHandler: guard }, async (req) => {
    await cases.reopen((req.params as { id: string }).id, req.user!.id, (req.body as { reason: string }).reason);
    return { reopened: true };
  });

  app.post('/admin/moderation/cases/:id/escalate', { schema: { params: idParam, body: reasonBody }, preHandler: guard }, async (req) => ({
    escalation: await cases.escalate((req.params as { id: string }).id, req.user!.id, (req.body as { reason: string }).reason),
  }));

  /** CSAM: hide, preserve, ban (zero tolerance), and open the filing task. */
  app.post(
    '/admin/moderation/cases/:id/csam',
    { schema: { params: idParam, body: z.object({ note: z.string().trim().max(2000).optional() }).nullish() }, preHandler: guard },
    async (req) => cases.csam((req.params as { id: string }).id, req.user!.id, (req.body as { note?: string } | undefined)?.note),
  );

  app.post(
    '/admin/moderation/escalations/:id/filed',
    { schema: { params: idParam, body: z.object({ reference: z.string().trim().min(1).max(500) }) }, preHandler: guard },
    async (req) => ({
      escalation: await cases.fileEscalation((req.params as { id: string }).id, req.user!.id, (req.body as { reference: string }).reference),
    }),
  );

  // ---- second approval ---------------------------------------------------------

  app.get('/admin/moderation/approvals', { config: { skipValidation: true }, preHandler: guard }, async () => ({
    approvals: await cases.approvals(),
  }));

  app.post('/admin/moderation/approvals/:id/approve', { schema: { params: idParam, body: noBody }, preHandler: guard }, async (req) => ({
    sanction: await cases.approve((req.params as { id: string }).id, req.user!.id),
  }));

  app.post('/admin/moderation/approvals/:id/reject', { schema: { params: idParam, body: reasonBody }, preHandler: guard }, async (req) => ({
    sanction: await cases.reject((req.params as { id: string }).id, req.user!.id, (req.body as { reason: string }).reason),
  }));

  // ---- sanctions on a person -----------------------------------------------------

  /** Sanction a person directly, under the same rules as a case decision. */
  app.post('/admin/users/:id/sanctions', { schema: { params: idParam, body: sanctionBody }, preHandler: guard }, async (req, reply) => {
    const body = req.body as z.infer<typeof sanctionBody>;
    const out = await cases.sanctionUser(req.user!.id, (req.params as { id: string }).id, {
      kind: body.kind,
      policy: body.policy,
      statement: body.statement,
      internalNote: body.internalNote ?? null,
      durationHours: body.durationHours ?? null,
      confirmUsername: body.confirmUsername,
    });
    return reply.code(201).send(out);
  });

  app.post('/admin/sanctions/:id/revoke', { schema: { params: idParam, body: reasonBody }, preHandler: guard }, async (req) => {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };
    return { sanction: await inTransaction(app.db, (client) => sanctions.revoke(client, id, req.user!.id, reason)) };
  });

  app.post('/admin/users/:id/unmute', { schema: { params: idParam, body: reasonBody }, preHandler: guard }, async (req) => ({
    lifted: await sanctions.unmute(req.user!.id, (req.params as { id: string }).id, (req.body as { reason: string }).reason),
  }));

  /** Lift the automatic chat mute (the permanent step of the flagged-message ladder had no way back). */
  app.post('/admin/users/:id/chat-mute/lift', { schema: { params: idParam, body: reasonBody }, preHandler: guard }, async (req) => ({
    lifted: await sanctions.liftChatOffenses(req.user!.id, (req.params as { id: string }).id, (req.body as { reason: string }).reason),
  }));

  /** Sign a person out everywhere. */
  app.post('/admin/users/:id/sessions/revoke', { schema: { params: idParam, body: noBody }, preHandler: guard }, async (req) => {
    const { id } = req.params as { id: string };
    const revoked = await inTransaction(app.db, async (client) => {
      const exists = await client.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
      if (!exists.rowCount) return null;
      const n = await sanctions.endSessions(client, id);
      await logAdminAction(client, { targetUserId: id, adminId: req.user!.id, action: 'session_revoke', reason: 'signed out everywhere' });
      return n;
    });
    if (revoked === null) throw new AppError('NOT_FOUND', 404, 'no such user');
    return { revoked };
  });

  // ---- appeals -----------------------------------------------------------------

  app.get(
    '/admin/appeals',
    { schema: { querystring: z.object({ status: z.enum([...APPEAL_STATUSES, 'all'] as const).optional() }) }, preHandler: guard },
    async (req) => ({ appeals: await appeals.list((req.query as { status?: (typeof APPEAL_STATUSES)[number] | 'all' }).status ?? 'open') }),
  );

  app.post('/admin/appeals/:id/decide', { schema: { params: idParam, body: appealDecideBody }, preHandler: guard }, async (req) => ({
    appeal: await appeals.decide((req.params as { id: string }).id, req.user!.id, req.body as z.infer<typeof appealDecideBody>),
  }));
}
