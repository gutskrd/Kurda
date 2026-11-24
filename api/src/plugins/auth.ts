import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../auth/tokens.js';
import type { AppConfig } from '../config/env.js';
import { AppError } from './errors.js';

export type AuthFailure = 'invalid_token' | 'account_disabled';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authentication hook, run on every request: no Authorization header is anonymous; a valid bearer token sets
 * req.user = { id, roles }; a bad, expired or version-bumped token sets req.authFailure = 'invalid_token'; a valid
 * token for a banned or deleted account sets 'account_disabled'. Enforcement is in the requireAuth and requireRoles
 * guards, so each route states whether it is public.
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

    // Not filtered by deleted_at: a deleted or banned account with a valid token must get 403, not 401.
    //
    // `session_live`: the token's session has not ended. Rotation always leaves one unrevoked refresh token in a family,
    // so a family with none was signed out, revoked, or caught reusing a stolen token, and its access tokens stop now.
    //
    // `birth_month_known`, `guest` and `held` ride along for `requireBirthMonth`, `requireAccount` and the hold
    // (moderation/restrictions.ts), saving each a second read; `supervised` lets the parental guards skip their read for
    // everyone without a live parent link (parental/supervision.ts).
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
      guest: boolean;
      held: boolean;
      supervised: boolean;
      session_live: boolean;
    }>(
      `SELECT id, roles, token_version, deleted_at, banned_at, banned_until, email_verified_at, guest,
              birth_year IS NOT NULL AS birth_month_known, held_at IS NOT NULL AS held,
              EXISTS (SELECT 1 FROM parental_links pl WHERE pl.teen_id = users.id AND pl.ended_at IS NULL) AS supervised,
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
    // A temporary ban lapses by itself once banned_until passes.
    const banActive = user.banned_at && (user.banned_until === null || user.banned_until > new Date());
    if (user.deleted_at || banActive) {
      req.authFailure = 'account_disabled';
      return;
    }
    // After the ban check, so a banned account still hears 403: a ban revokes every session, and the client must learn why.
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
      guest: user.guest,
      held: user.held,
      supervised: user.supervised,
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

/** The one refusal a guest hears from anything social or paid: the app offers to create the account. */
export function guestAccountError(): AppError {
  return new AppError('GUEST_ACCOUNT', 403, 'create your account to do this');
}

/**
 * preHandler guard: signed in, and not a guest. A guest (auth/guest.ts) can learn, practise, keep a streak and earn
 * badges like anyone, and nothing more. Everything social, public-facing or purchasable asks this first, so a guest is
 * told to create the account rather than, say, to answer the birth month question (`requireBirthMonth`, which comes
 * after it). A guard rather than a gate, because guests' learning writes must pass and which routes are social is
 * decided route by route.
 */
export async function requireAccount(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) {
    await reject(req, reply);
    return;
  }
  if (req.user.guest === true) throw guestAccountError();
}

/**
 * Marks a guard as gating staff-only surface. The admin 2FA gate reads it off the route, because a route that asks
 * for a role is staff surface wherever its URL lives; a URL prefix missed privileged routes outside /admin.
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
