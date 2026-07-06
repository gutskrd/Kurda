import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../auth/tokens.js';
import type { AppConfig } from '../config/env.js';

export type AuthFailure = 'invalid_token' | 'account_disabled';

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
    const result = await app.db.query<{
      id: string;
      roles: string[];
      token_version: number;
      deleted_at: Date | null;
      banned_at: Date | null;
    }>(
      `SELECT id, roles, token_version, deleted_at, banned_at FROM users WHERE id = $1`,
      [claims.sub],
    );
    const user = result.rows[0];
    if (!user || user.token_version !== claims.ver) {
      // bumped token_version = forced logout; old tokens are just invalid
      req.authFailure = 'invalid_token';
      return;
    }
    if (user.deleted_at || user.banned_at) {
      req.authFailure = 'account_disabled';
      return;
    }
    req.user = { id: user.id, roles: user.roles, familyId: claims.fam };
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

/** preHandler guard factory: requireAuth + role membership. */
export function requireRoles(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
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
  };
}
