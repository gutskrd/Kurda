import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isParentalBedtime, isParentalDailyLimit, PARENTAL_SWITCHES, type ParentalControls } from '@kurda/shared';
import { requireAccount, requireAuth } from '../plugins/auth.js';
import type { RateLimitOptions } from '../ratelimit/plugin.js';
import type { ParentalService } from './service.js';

/**
 * Parental controls (parental/service.ts), all under the caller's own account:
 *
 *   GET    /me/parental                          the caller's part: teen, parent or none, and what goes with it
 *   POST   /me/parental/code                     a parent's new code, the old one void (6 an hour)
 *   POST   /me/parental/lookup    { code }       a teen sees whose code it is
 *   POST   /me/parental/connect   { code }       and connects; the two share 10 per 15 minutes per account and 20 per network
 *   GET    /me/parental/teens/:teenId            a parent's page for one teen
 *   PATCH  /me/parental/teens/:teenId/controls   a parent changes the teen's controls
 *   DELETE /me/parental/teens/:teenId            a parent stops supervising
 *   DELETE /me/parental/parents/:parentId        a teen disconnects a parent
 *   POST   /me/usage              { timeZone }   a supervised teen's minute beat; 204 for anyone else
 *
 * A teen or parent id the caller has no live link with answers 404 like an unknown id, so no link is ever revealed.
 */

const FIFTEEN_MINUTES = 15 * 60_000;

/**
 * A code is a short secret: guessing is held back per account and per network (an IPv6 customer's whole block) alike,
 * across looking up and connecting together, and still while Redis is down.
 */
const CODE_LIMITS: RateLimitOptions[] = [
  { max: 10, windowMs: FIFTEEN_MINUTES, per: 'user-or-ip', onStoreDown: 'local', bucket: 'parent-code' },
  { max: 20, windowMs: FIFTEEN_MINUTES, per: 'ip', wideNetwork: true, onStoreDown: 'local', bucket: 'parent-code' },
];

const codeBody = z.object({ code: z.string().min(1).max(32) });
const teenParam = z.object({ teenId: z.uuid() });
const parentParam = z.object({ parentId: z.uuid() });
const usageBody = z.object({ timeZone: z.string().min(1).max(64) });

/** Only what a parent may choose: one of the offered limits or none, one of the offered bedtimes or none, and the switches. */
export const controlsPatchSchema = z
  .strictObject({
    dailyLimitMinutes: z
      .number()
      .nullable()
      .refine((v) => v === null || isParentalDailyLimit(v), { message: 'must be one of the offered daily limits, or null' })
      .optional(),
    bedtime: z
      .object({ from: z.string(), to: z.string() })
      .nullable()
      .refine((v) => v === null || isParentalBedtime(v), { message: 'must be one of the offered bedtimes, or null' })
      .optional(),
    ...(Object.fromEntries(PARENTAL_SWITCHES.map((s) => [s, z.boolean().optional()])) as Record<(typeof PARENTAL_SWITCHES)[number], z.ZodOptional<z.ZodBoolean>>),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'nothing to change' });

export function registerParentalRoutes(app: FastifyInstance, parental: ParentalService): void {
  // open to a guest, who is told to make an account first
  app.get('/me/parental', { preHandler: requireAuth }, async (req) => parental.overview(req.user!.id));

  app.post(
    '/me/parental/code',
    { config: { skipValidation: true, rateLimit: { max: 6, windowMs: 60 * 60_000, per: 'user-or-ip' as const } }, preHandler: requireAccount },
    async (req) => parental.createCode(req.user!.id),
  );

  app.post('/me/parental/lookup', { schema: { body: codeBody }, config: { rateLimit: CODE_LIMITS }, preHandler: requireAccount }, async (req) =>
    parental.lookup(req.user!.id, (req.body as z.infer<typeof codeBody>).code),
  );

  app.post('/me/parental/connect', { schema: { body: codeBody }, config: { rateLimit: CODE_LIMITS }, preHandler: requireAccount }, async (req) =>
    parental.connect(req.user!.id, (req.body as z.infer<typeof codeBody>).code),
  );

  app.get('/me/parental/teens/:teenId', { schema: { params: teenParam }, preHandler: requireAccount }, async (req) =>
    parental.teen(req.user!.id, (req.params as z.infer<typeof teenParam>).teenId),
  );

  app.patch(
    '/me/parental/teens/:teenId/controls',
    { schema: { params: teenParam, body: controlsPatchSchema }, config: { rateLimit: { max: 60, windowMs: 60_000, per: 'user-or-ip' as const } }, preHandler: requireAccount },
    async (req) => parental.updateControls(req.user!.id, (req.params as z.infer<typeof teenParam>).teenId, req.body as Partial<ParentalControls>),
  );

  app.delete('/me/parental/teens/:teenId', { schema: { params: teenParam }, preHandler: requireAccount }, async (req) =>
    parental.stopSupervising(req.user!.id, (req.params as z.infer<typeof teenParam>).teenId),
  );

  app.delete('/me/parental/parents/:parentId', { schema: { params: parentParam }, preHandler: requireAccount }, async (req) =>
    parental.disconnectParent(req.user!.id, (req.params as z.infer<typeof parentParam>).parentId),
  );

  // Every open app of a supervised teen sends this once a minute; for anyone else it answers 204 and the app stops.
  app.post('/me/usage', { schema: { body: usageBody }, preHandler: requireAuth }, async (req, reply) => {
    const state = await parental.beat(req.user!.id, (req.body as z.infer<typeof usageBody>).timeZone);
    if (!state) return reply.code(204).send();
    return state;
  });
}
