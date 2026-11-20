import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  APPEAL_STATUSES,
  BAN_CONTENT_CHOICES,
  CASE_SOURCES,
  CASE_STATUSES,
  MAX_STATEMENT_LEN,
  REPORT_CATEGORY_KEYS,
  SANCTION_KINDS,
  type CaseSourceGroup,
  type ReportPriority,
} from '@kurda/shared';
import { requireCapability } from '../admin/routes.js';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import type { AppealsService } from './appeals-service.js';
import type { CasesService, DecideInput } from './cases-service.js';
import { RETURNS_PAGE_MAX, type PossibleReturnsService } from './returns.js';
import { contentSummary, parseContentChoice } from './takedown.js';
import type { ModerationQueueService, QueueFilters } from './queue-service.js';
import { logAdminAction, type SanctionsService } from './sanctions-service.js';
import { inTransaction } from './tx.js';

const idParam = z.object({ id: z.uuid() });
// an empty POST arrives with no body at all
const noBody = z.object({}).nullish();
const reasonBody = z.object({ reason: z.string().trim().min(1).max(2000) });
const statement = z.string().trim().min(1).max(MAX_STATEMENT_LEN);
const durationHours = z.number().int().min(1).max(24 * 365).nullable().optional();
/** What a suspension or ban does to the person's content; Keep when absent. */
const banContent = z.object({ choice: z.enum(BAN_CONTENT_CHOICES), includeMessages: z.boolean().default(false) }).optional();

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
  banContent,
});

const sanctionBody = z.object({
  kind: z.enum(SANCTION_KINDS),
  durationHours,
  policy: z.enum(REPORT_CATEGORY_KEYS),
  statement,
  internalNote: z.string().trim().max(2000).optional(),
  confirmUsername: z.string().max(60).optional(),
  content: banContent,
});

const returnsQuery = z.object({
  status: z.enum(['open', 'same_person', 'not_same_person', 'closed', 'all']).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(RETURNS_PAGE_MAX).optional(),
});
const panelQuery = z.object({
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(RETURNS_PAGE_MAX).optional(),
});
const returnDecideBody = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('not_same_person'), note: z.string().trim().min(1).max(2000) }),
  z.object({
    decision: z.literal('same_person'),
    note: z.string().trim().min(1).max(2000),
    statement,
    policy: z.enum(REPORT_CATEGORY_KEYS).optional(),
    content: banContent,
    confirmUsername: z.string().max(60).optional(),
  }),
]);

const appealDecideBody = z.object({
  outcome: z.enum(['upheld', 'overturned', 'modified']),
  note: z.string().trim().min(1).max(2000),
  modifiedSanction: z.object({ kind: z.enum(SANCTION_KINDS), durationHours, statement }).optional(),
});

/**
 * The moderation admin API (M4). Every route needs the `moderation.act` capability (moderators, superadmins and the
 * legacy `admin` role) and, being under /admin, a verified second factor. Every successful call is audited with its
 * case, sanction or user as target.
 */
export function registerModerationQueueRoutes(
  app: FastifyInstance,
  deps: { queue: ModerationQueueService; cases: CasesService; sanctions: SanctionsService; appeals: AppealsService; returns: PossibleReturnsService },
): void {
  const { queue, cases, sanctions, appeals, returns } = deps;
  const guard = [requireAuth, requireCapability('moderation.act')];

  // ---- the queue ---------------------------------------------------------------

  /**
   * The queue, a page at a time. Syncs the automated feeds first, but a failed sync is logged and the page still loads:
   * one bad feed row must never make the queue answer 500.
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
    const { banContent: chosen, ...rest } = body;
    // the target's shape is the schema's pattern, which its type cannot say
    const decision = { ...rest, ...(chosen ? { banContent: parseContentChoice(chosen.choice, chosen.includeMessages) } : {}) } as DecideInput;
    return cases.decide((req.params as { id: string }).id, req.user!.id, decision);
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

  /** Sanction a person directly, under the same rules as a case decision; a suspension or ban says what happens to their content. */
  app.post('/admin/users/:id/sanctions', { schema: { params: idParam, body: sanctionBody }, preHandler: guard }, async (req, reply) => {
    const body = req.body as z.infer<typeof sanctionBody>;
    const out = await cases.sanctionUser(req.user!.id, (req.params as { id: string }).id, {
      kind: body.kind,
      policy: body.policy,
      statement: body.statement,
      internalNote: body.internalNote ?? null,
      durationHours: body.durationHours ?? null,
      confirmUsername: body.confirmUsername,
      content: body.content ? parseContentChoice(body.content.choice, body.content.includeMessages) : null,
    });
    return reply.code(201).send(out);
  });

  /** What a ban's content choice would cover for this person now, for the ban dialog's summary. */
  app.get('/admin/users/:id/content-summary', { schema: { params: idParam }, preHandler: guard }, async (req) => {
    const { id } = req.params as { id: string };
    const exists = await app.db.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
    if (!exists.rowCount) throw new AppError('NOT_FOUND', 404, 'no such user');
    return { summary: await contentSummary(app.db, id) };
  });

  // ---- possible returns ---------------------------------------------------------

  /** Accounts that may belong to someone banned, newest first, a page at a time. */
  app.get('/admin/moderation/possible-returns', { schema: { querystring: returnsQuery }, preHandler: guard }, async (req) => {
    const q = req.query as z.infer<typeof returnsQuery>;
    return { ...(await returns.list(q)), counts: await returns.openCount() };
  });

  /** Same person (the ban is applied to this account too) or not (the hold ends and the pair is never flagged again). */
  app.post(
    '/admin/moderation/possible-returns/:id/decide',
    { schema: { params: idParam, body: returnDecideBody }, preHandler: guard },
    async (req) => {
      const body = req.body as z.infer<typeof returnDecideBody>;
      const input =
        body.decision === 'same_person'
          ? { ...body, content: body.content ? parseContentChoice(body.content.choice, body.content.includeMessages) : undefined }
          : body;
      return { entry: await returns.decide((req.params as { id: string }).id, req.user!.id, input) };
    },
  );

  /** "Possibly the same person as…" on a user page: every entry and shared device or network, a page at a time. */
  app.get('/admin/users/:id/possible-matches', { schema: { params: idParam, querystring: panelQuery }, preHandler: guard }, async (req) =>
    returns.panel((req.params as { id: string }).id, req.query as z.infer<typeof panelQuery>),
  );

  app.post('/admin/sanctions/:id/revoke', { schema: { params: idParam, body: reasonBody }, preHandler: guard }, async (req) => {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };
    // lifting a content removal puts the content back (cases-service.ts `revokeSanction`)
    return { sanction: await cases.revokeSanction(id, req.user!.id, reason) };
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
