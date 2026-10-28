import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../auth/tokens.js';
import type { AppConfig } from '../config/env.js';

export type AuthFailure = 'invalid_token' | 'account_disabled';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authentication hook (KUR-016). Runs on every request:
 * - no Authorization header → anonymous (public routes still work)
 * - valid bearer token → req.user = { id, roles }
 * - bad/expired/version-bumped token → req.authFailure = 'invalid_token'
 * - valid token but banned/deleted account → 'account_disabled'
 *
 * Enforcement happens in requireAuth/requireRoles guards so route
 * publicness stays explicit at the route definition.
 */
export function setupAuth(app: FastifyInstance, config: AppConfig): void {
  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;

    const claims = await verifyAccessToken(config, header.slice('Bearer '.length));
    if (!claims) {
      req.authFailure = 'invalid_token';
      return;
    }

    // deliberately unfiltered by deleted_at: a deleted/banned account with
    // a valid token must yield 403 (distinct from 401)
    //
    // `session_live`: the session this token was issued in has not been ended.
    // Rotation always leaves one unrevoked refresh token in a family, so a
    // family with none was signed out, revoked from the session list, or
    // caught reusing a stolen refresh token — and its access tokens stop
    // there, rather than living out their fifteen minutes.
    //
    // `birth_month_known` rides along for `requireBirthMonth`, which every
    // route that reaches other people asks: the row is read here anyway, so
    // asking again was a second round trip on each of those requests.
    const family = claims.fam && UUID_RE.test(claims.fam) ? claims.fam : null;
    const result = await app.db.query<{
      id: string;
      roles: string[];
      token_version: number;
      deleted_at: Date | null;
      banned_at: Date | null;
      banned_until: Date | null;
      email_verified_at: Date | null;
      birth_month_known: boolean;
      session_live: boolean;
    }>(
      `SELECT id, roles, token_version, deleted_at, banned_at, banned_until, email_verified_at,
              birth_year IS NOT NULL AS birth_month_known,
              ($2::uuid IS NULL OR EXISTS (
                SELECT 1 FROM refresh_tokens rt
                 WHERE rt.family_id = $2::uuid AND rt.user_id = users.id AND rt.revoked_at IS NULL)) AS session_live
         FROM users WHERE id = $1`,
      [claims.sub, family],
    );
    const user = result.rows[0];
    if (!user || user.token_version !== claims.ver) {
      // bumped token_version = forced logout; old tokens are just invalid
      req.authFailure = 'invalid_token';
      return;
    }
    // a temp ban lapses on its own once banned_until passes (KUR-101)
    const banActive = user.banned_at && (user.banned_until === null || user.banned_until > new Date());
    if (user.deleted_at || banActive) {
      req.authFailure = 'account_disabled';
      return;
    }
    // after the ban check, so a banned account still hears 403 (a ban revokes
    // every session, and the client must learn why rather than see a 401)
    if (!user.session_live) {
      req.authFailure = 'invalid_token';
      return;
    }
    req.user = {
      id: user.id,
      roles: user.roles,
      familyId: claims.fam,
      emailVerified: user.email_verified_at !== null,
      birthMonthKnown: user.birth_month_known,
    };
  });
}

function reject(req: FastifyRequest, reply: FastifyReply): FastifyReply {
  if (req.authFailure === 'account_disabled') {
    return reply.code(403).send({
      code: 'ACCOUNT_DISABLED',
      message: 'this account is disabled',
      requestId: req.id,
    });
  }
  return reply.code(401).send({
    code: 'UNAUTHORIZED',
    message: 'authentication required',
    requestId: req.id,
  });
}

/** preHandler guard: route requires a logged-in, active user. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) {
    await reject(req, reply);
  }
}

/**
 * A guard that has been marked as gating staff-only surface.
 *
 * The admin 2FA gate needs to know which routes are staff surface. It worked
 * that out from the URL — "anything under /admin" — and six routes every bit as
 * privileged were sitting somewhere else: creating shop items, defining gem
 * packs, declaring the winner of a tournament. A password alone reached all of
 * them, because none of their URLs began with /admin.
 *
 * A prefix cannot know what a route is for. The guard can: a route that asks
 * for a role IS staff surface, wherever its URL happens to live. So the guard
 * says so and the gate reads it back off the route — which covers the next
 * staff route the day it is written rather than the day somebody notices.
 */
export const PRIVILEGED_GUARD = Symbol.for('kurda.privilegedGuard');

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

/** Stamp a guard as gating staff-only surface. */
export function markPrivileged<T extends Guard>(guard: T): T {
  Object.defineProperty(guard, PRIVILEGED_GUARD, { value: true });
  return guard;
}

/** True if any preHandler on this route was marked with `markPrivileged`. */
export function routeIsPrivileged(preHandler: unknown): boolean {
  const chain = Array.isArray(preHandler) ? preHandler : [preHandler];
  return chain.some(
    (h) => typeof h === 'function' && (h as Record<symbol, unknown>)[PRIVILEGED_GUARD] === true,
  );
}

/** preHandler guard factory: requireAuth + role membership. */
export function requireRoles(...roles: string[]) {
  return markPrivileged(async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.user) {
      await reject(req, reply);
      return;
    }
    if (!roles.some((r) => req.user?.roles.includes(r))) {
      await reply.code(403).send({
        code: 'FORBIDDEN',
        message: 'insufficient permissions',
        requestId: req.id,
      });
    }
  });
}
