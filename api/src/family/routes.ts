import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CHILD_NAME_MAX, isValidPin, PURCHASE_REQUEST_KINDS, type PurchaseRequestKind } from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';
import { guestAccountError, requireAccount, requireAuth } from '../plugins/auth.js';
import type { RateLimitOptions } from '../ratelimit/plugin.js';
import { birthMonthSchema, birthYearSchema } from '../users/birth-month.js';
import { emailAddress } from '../auth/email-address.js';
import { PASSWORD_MAX, PASSWORD_MIN } from '../auth/password-policy.js';
import { sessionName } from '../auth/session-name.js';
import type { GdprService } from '../gdpr/service.js';
import { exportJobId } from '../gdpr/service.js';
import { makeExportJob } from '../jobs/gdpr-jobs.js';
import { childPhoneOnly, fromBrowser } from './child-gate.js';
import type { ChildService } from './children.js';
import type { FamilyService } from './service.js';
import type { ChildSessions, SignedIn } from './sessions.js';

/**
 * Families and child profiles (family/), all under the caller's own account but the sign-ins:
 *
 *   GET    /me/family                                   the caller's family, board, children and what waits (a child sees their family)
 *   POST   /me/family                                   an adult starts one
 *   DELETE /me/family                                   the owner ends it
 *   POST   /me/family/invite                            the owner's code for an adult, the old one void (6 an hour)
 *   POST   /me/family/join            { code }          an adult joins (10 per 15 minutes per account, 20 per network)
 *   POST   /me/family/leave                             an adult or teen leaves, an adult's children with them
 *   DELETE /me/family/members/:userId                   the owner takes someone out
 *   POST   /me/family/teens/:teenId                     the owner adds a teen they supervise
 *   POST   /me/family/children        { name, birthYear, birthMonth, avatar, consent }   a parent makes a child's profile (10 a day)
 *   GET    /me/family/children/:childId                 one child: profile, switches, consent, devices
 *   PATCH  /me/family/children/:childId  { name?, avatar?, remindersAllowed? }
 *   DELETE /me/family/children/:childId                 deleted now, with everything in it
 *   POST   /me/family/children/:childId/export          the child's data, as their parent's download
 *   GET    /me/family/children/:childId/export
 *   POST   /me/family/children/:childId/pairing         six digits for the child's own phone (10 an hour)
 *   DELETE /me/family/children/:childId/devices/:id     one of the child's phones signed out
 *   POST   /me/family/children/:childId/switch          the parent's phone becomes the child's, until the PIN (phone only)
 *   POST   /me/family/children/:childId/convert  { email, password, username }   at 13, the teen's own account
 *   PUT    /me/family/pin             { pin, currentPin?, password? }   set, change or reset the family PIN (10 an hour)
 *   GET    /me/family/purchase-requests                 a child's own asks, or a parent's children's
 *   POST   /me/family/purchase-requests  { kind, product }   a child asks (20 an hour)
 *   POST   /me/family/purchase-requests/:id/approve|decline   their parent answers
 *   POST   /auth/child/pair           { code }          a child's phone signs in with the code (phone only; 10 per 15 minutes per network)
 *   POST   /auth/child/return         { pin }           the parent's phone back from a child's session (10 per 15 minutes)
 *   POST   /family/child-link         { token }         what a link in a parent's email does: delete, or keep an unused profile
 *
 * A child, member or ask the caller has nothing to do with answers 404 like an unknown id.
 */

const FIFTEEN_MINUTES = 15 * 60_000;
const HOUR = 60 * 60_000;

const CODE_LIMITS: RateLimitOptions[] = [
  { max: 10, windowMs: FIFTEEN_MINUTES, per: 'user-or-ip', onStoreDown: 'local', bucket: 'family-code' },
  { max: 20, windowMs: FIFTEEN_MINUTES, per: 'ip', wideNetwork: true, onStoreDown: 'local', bucket: 'family-code' },
];
/** Six digits are a short secret: guessing is held back per network, and still while Redis is down. */
const PAIRING_LIMITS: RateLimitOptions[] = [
  { max: 10, windowMs: FIFTEEN_MINUTES, per: 'ip', onStoreDown: 'local', bucket: 'child-pairing' },
  { max: 20, windowMs: FIFTEEN_MINUTES, per: 'ip', wideNetwork: true, onStoreDown: 'local', bucket: 'child-pairing' },
];
const PIN_LIMIT: RateLimitOptions = { max: 10, windowMs: FIFTEEN_MINUTES, per: 'user-or-ip', onStoreDown: 'local' };
const hourly = (max: number): RateLimitOptions => ({ max, windowMs: HOUR, per: 'user-or-ip' });

const codeBody = z.object({ code: z.string().min(1).max(32) });
const childParam = z.object({ childId: z.uuid() });
const memberParam = z.object({ userId: z.uuid() });
const teenParam = z.object({ teenId: z.uuid() });
const deviceParam = z.object({ childId: z.uuid(), id: z.uuid() });
const requestParam = z.object({ id: z.uuid() });
const noBody = z.object({}).nullish();
const pin = z.string().refine(isValidPin, { message: 'four to six digits' });

export const newChildBody = z.strictObject({
  name: z.string().min(1).max(CHILD_NAME_MAX * 2),
  birthYear: birthYearSchema,
  birthMonth: birthMonthSchema,
  avatar: z.string().min(1).max(40),
  /** the parent's explicit consent, given on the form that says what is kept */
  consent: z.literal(true),
});
const childPatchBody = z
  .strictObject({
    name: z.string().min(1).max(CHILD_NAME_MAX * 2).optional(),
    avatar: z.string().min(1).max(40).optional(),
    remindersAllowed: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to change' });
const convertBody = z.strictObject({
  email: emailAddress,
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
  username: z.string().min(1).max(60),
});
const pinBody = z.strictObject({ pin, currentPin: pin.optional(), password: z.string().min(1).max(PASSWORD_MAX).optional() });
const askBody = z.strictObject({ kind: z.enum(PURCHASE_REQUEST_KINDS), product: z.string().min(1).max(100) });
const linkBody = z.object({ token: z.string().min(20).max(300) });

/** The app's install id, which a child's session is bound to. */
function deviceIdOf(req: FastifyRequest): string | null {
  const raw = req.headers['x-device-id'];
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 200 ? raw : null;
}

/** Signed in, and not a guest: a family page for an adult or teen, and the few a child's session reaches. */
async function requireMember(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(req, reply);
  if (req.user?.guest === true) throw guestAccountError();
}

/** A child's sign-in, or a phone given back, as the apps take a sign-in: who, and the three token fields. */
function signedIn(result: SignedIn): { user: SignedIn['user']; tokens: { accessToken: string; refreshToken: string; accessExpiresInSeconds: number } } {
  const { accessToken, refreshToken, accessExpiresInSeconds } = result.tokens;
  return { user: result.user, tokens: { accessToken, refreshToken, accessExpiresInSeconds } };
}

export interface FamilyRouteDeps {
  families: FamilyService;
  children: ChildService;
  sessions: ChildSessions;
  gdpr: GdprService;
}

export function registerFamilyRoutes(app: FastifyInstance, config: AppConfig, deps: FamilyRouteDeps): void {
  const { families, children, sessions, gdpr } = deps;
  const me = (req: FastifyRequest): string => req.user!.id;

  app.get('/me/family', { preHandler: requireMember }, async (req) => families.overview(me(req)));
  app.post('/me/family', { schema: { body: noBody }, preHandler: requireAccount }, async (req) => families.create(me(req)));
  app.delete('/me/family', { preHandler: requireAccount }, async (req) => families.remove(me(req)));
  app.post('/me/family/invite', { schema: { body: noBody }, config: { rateLimit: hourly(6) }, preHandler: requireAccount }, async (req) => families.createInvite(me(req)));
  app.post('/me/family/join', { schema: { body: codeBody }, config: { rateLimit: CODE_LIMITS }, preHandler: requireAccount }, async (req) =>
    families.join(me(req), (req.body as z.infer<typeof codeBody>).code),
  );
  app.post('/me/family/leave', { schema: { body: noBody }, preHandler: requireAccount }, async (req) => families.leave(me(req)));
  app.delete('/me/family/members/:userId', { schema: { params: memberParam }, preHandler: requireAccount }, async (req) =>
    families.removeMember(me(req), (req.params as z.infer<typeof memberParam>).userId),
  );
  app.post('/me/family/teens/:teenId', { schema: { params: teenParam, body: noBody }, preHandler: requireAccount }, async (req) =>
    families.addTeen(me(req), (req.params as z.infer<typeof teenParam>).teenId),
  );

  app.post(
    '/me/family/children',
    { schema: { body: newChildBody }, config: { rateLimit: { max: 10, windowMs: 24 * HOUR, per: 'user-or-ip' as const } }, preHandler: requireAccount },
    async (req, reply) => {
      const body = req.body as z.infer<typeof newChildBody>;
      const child = await children.create(me(req), { name: body.name, birthYear: body.birthYear, birthMonth: body.birthMonth, avatar: body.avatar });
      return reply.code(201).send({ child });
    },
  );
  app.get('/me/family/children/:childId', { schema: { params: childParam }, preHandler: requireAccount }, async (req) =>
    children.page(me(req), (req.params as z.infer<typeof childParam>).childId),
  );
  app.patch('/me/family/children/:childId', { schema: { params: childParam, body: childPatchBody }, preHandler: requireAccount }, async (req) =>
    children.update(me(req), (req.params as z.infer<typeof childParam>).childId, req.body as z.infer<typeof childPatchBody>),
  );
  app.delete('/me/family/children/:childId', { schema: { params: childParam }, preHandler: requireAccount }, async (req) =>
    children.delete(me(req), (req.params as z.infer<typeof childParam>).childId),
  );

  // The child's data as GDPR's export makes it for anyone (gdpr/service.ts), asked for and downloaded by their parent.
  app.post('/me/family/children/:childId/export', { schema: { params: childParam, body: noBody }, config: { rateLimit: hourly(10) }, preHandler: requireAccount }, async (req, reply) => {
    const { childId } = req.params as z.infer<typeof childParam>;
    await children.assertParent(me(req), childId);
    const { id: exportId, reused } = await gdpr.requestExport(childId);
    if (app.jobs) await app.jobs.enqueue(makeExportJob(gdpr), { exportId }, { idempotencyKey: exportJobId(exportId) });
    return reply.code(202).send({ requested: true, reused });
  });
  app.get('/me/family/children/:childId/export', { schema: { params: childParam }, config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } }, preHandler: requireAccount }, async (req) => {
    const { childId } = req.params as z.infer<typeof childParam>;
    await children.assertParent(me(req), childId);
    return gdpr.exportStatus(childId);
  });

  app.post('/me/family/children/:childId/pairing', { schema: { params: childParam, body: noBody }, config: { rateLimit: hourly(10) }, preHandler: requireAccount }, async (req) =>
    sessions.createPairingCode(me(req), (req.params as z.infer<typeof childParam>).childId),
  );
  app.delete('/me/family/children/:childId/devices/:id', { schema: { params: deviceParam }, preHandler: requireAccount }, async (req) => {
    const { childId, id } = req.params as z.infer<typeof deviceParam>;
    return sessions.signOutDevice(me(req), childId, id);
  });
  app.post('/me/family/children/:childId/switch', { schema: { params: childParam, body: noBody }, config: { rateLimit: hourly(30) }, preHandler: requireAccount }, async (req) => {
    if (fromBrowser(req, config)) throw childPhoneOnly();
    const { childId } = req.params as z.infer<typeof childParam>;
    const result = await sessions.switchTo(me(req), req.user!.familyId, childId, deviceIdOf(req));
    await app.securityLog.record('signin.succeeded', { userId: childId, child: true, details: { method: 'family_switch' } });
    return signedIn(result);
  });
  app.post(
    '/me/family/children/:childId/convert',
    { schema: { params: childParam, body: convertBody }, config: { rateLimit: { max: 5, windowMs: FIFTEEN_MINUTES, per: 'user-or-ip' as const, onStoreDown: 'local' as const } }, preHandler: requireAccount },
    async (req) => {
      const body = req.body as z.infer<typeof convertBody>;
      return children.convert(me(req), (req.params as z.infer<typeof childParam>).childId, body);
    },
  );

  app.put('/me/family/pin', { schema: { body: pinBody }, config: { rateLimit: { ...hourly(10), onStoreDown: 'local' as const } }, preHandler: requireAccount }, async (req) => {
    const body = req.body as z.infer<typeof pinBody>;
    return sessions.setPin(me(req), body.pin, { currentPin: body.currentPin, password: body.password });
  });

  app.get('/me/family/purchase-requests', { preHandler: requireMember }, async (req) => ({
    requests: await families.requests(req.user!.child === true ? 'child' : 'parent', me(req)),
  }));
  app.post('/me/family/purchase-requests', { schema: { body: askBody }, config: { rateLimit: hourly(20) }, preHandler: requireAuth }, async (req, reply) => {
    if (req.user!.child !== true) throw new AppError('FAMILY_CHILD_ONLY', 403, 'a child asks their parent; anyone else buys for themselves');
    const body = req.body as z.infer<typeof askBody>;
    return reply.code(201).send({ request: await families.ask(me(req), body.kind as PurchaseRequestKind, body.product) });
  });
  for (const [verb, status] of [['approve', 'approved'], ['decline', 'declined']] as const) {
    app.post(`/me/family/purchase-requests/:id/${verb}`, { schema: { params: requestParam, body: noBody }, preHandler: requireAccount }, async (req) => ({
      request: await families.decide(me(req), (req.params as z.infer<typeof requestParam>).id, status),
    }));
  }

  app.post('/auth/child/pair', { schema: { body: codeBody }, config: { rateLimit: PAIRING_LIMITS } }, async (req) => {
    if (fromBrowser(req, config)) throw childPhoneOnly();
    const result = await sessions.pair((req.body as z.infer<typeof codeBody>).code, deviceIdOf(req));
    await app.securityLog.record('signin.succeeded', { userId: result.user.id, child: true, details: { method: 'child_pairing' } });
    return signedIn(result);
  });
  app.post('/auth/child/return', { schema: { body: z.strictObject({ pin }) }, config: { rateLimit: PIN_LIMIT }, preHandler: requireAuth }, async (req) => {
    if (req.user!.child !== true) throw new AppError('FAMILY_NOT_SWITCHED', 403, 'this phone is the child’s own: a parent signs in on theirs');
    const result = await sessions.returnToParent(me(req), req.user!.familyId, (req.body as { pin: string }).pin, deviceIdOf(req), sessionName(undefined, req.headers['user-agent']));
    await app.securityLog.record('signin.succeeded', { userId: result.user.id, details: { method: 'family_pin' } });
    return signedIn(result);
  });

  app.post('/family/child-link', { schema: { body: linkBody }, config: { rateLimit: { max: 20, windowMs: HOUR, per: 'ip' as const, onStoreDown: 'local' as const } } }, async (req) =>
    children.byLink((req.body as z.infer<typeof linkBody>).token),
  );
}
