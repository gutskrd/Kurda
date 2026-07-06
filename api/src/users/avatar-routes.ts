import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  DEFAULT_AVATAR,
  kurdishAvatarSvg,
  validateAvatarConfig,
  type AvatarConfig,
} from '@kurda/shared';
import { AchievementsService } from '../avatar/achievements.js';
import { CosmeticsInventory } from '../avatar/inventory.js';
import { AppError } from '../plugins/errors.js';
import { requireAuth } from '../plugins/auth.js';

export const avatarConfigSchema = z.object({
  skinTone: z.string().max(40),
  hairStyle: z.string().max(40),
  hairColor: z.string().max(40),
  outfit: z.string().max(40),
  headwear: z.string().max(40),
  background: z.string().max(40),
});


export async function loadAvatarConfig(
  app: FastifyInstance,
  userId: string,
): Promise<AvatarConfig | null> {
  const result = await app.db.query<{ avatar_config: AvatarConfig | null; id: string }>(
    `SELECT id, avatar_config FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return row.avatar_config ?? { ...DEFAULT_AVATAR };
}

export function registerAvatarRoutes(app: FastifyInstance): void {
  const inventory = new CosmeticsInventory(app.db);

  app.get('/me/avatar', { preHandler: requireAuth }, async (req) => {
    const config = (await loadAvatarConfig(app, req.user!.id)) as AvatarConfig;
    return { config, svg: kurdishAvatarSvg(config) };
  });

  /** Full catalog with ownership flags — what the editor (#76) renders. */
  app.get('/me/cosmetics', { preHandler: requireAuth }, async (req) => {
    return { items: await inventory.listForUser(req.user!.id) };
  });

  const achievements = new AchievementsService(app.db);

  /** All achievements with earned state (profile display). */
  app.get('/me/achievements', { preHandler: requireAuth }, async (req) => {
    return { achievements: await achievements.listEarned(req.user!.id) };
  });

  /** Earned-but-unseen unlocks — the client shows a toast then acks. */
  app.get('/me/achievements/unseen', { preHandler: requireAuth }, async (req) => {
    return { unseen: await achievements.unseen(req.user!.id) };
  });

  app.post(
    '/me/achievements/seen',
    { config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => {
      await achievements.markSeen(req.user!.id);
      return { seen: true };
    },
  );

  app.put(
    '/me/avatar',
    { schema: { body: avatarConfigSchema }, preHandler: requireAuth },
    async (req) => {
      const config = req.body as AvatarConfig;
      const owned = await inventory.ownedIds(req.user!.id);
      const errors = validateAvatarConfig(config, owned);
      if (errors.length > 0) {
        const notOwned = errors.filter((e) => e.kind === 'not_owned');
        if (notOwned.length === errors.length) {
          throw new AppError('ITEM_NOT_OWNED', 403, 'one or more items are not unlocked yet', {
            items: notOwned.map((e) => e.id),
          });
        }
        throw new AppError('INVALID_AVATAR', 400, 'avatar configuration is invalid', {
          errors,
        });
      }
      await app.db.query(`UPDATE users SET avatar_config = $2 WHERE id = $1`, [
        req.user!.id,
        JSON.stringify(config),
      ]);
      // drop the cached composite so the next public fetch re-renders
      await app.cache.del('avatar-svg', req.user!.id);
      return { config, svg: kurdishAvatarSvg(config) };
    },
  );

  /**
   * Public SVG for leaderboards/games/chat (KUR-079). The rendered
   * composite is Redis-cached per user and revalidated by a strong ETag
   * derived from the config, so list screens cost neither a DB hit nor
   * a re-render. Saves invalidate; until then the previous composite
   * keeps serving — never a broken image.
   */
  app.get(
    '/users/:id/avatar.svg',
    { schema: { params: z.object({ id: z.uuid() }) } },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      let cached = await app.cache.get<{ etag: string; svg: string }>('avatar-svg', id);
      if (!cached) {
        const config = await loadAvatarConfig(app, id);
        if (!config) {
          throw new AppError('NOT_FOUND', 404, 'user not found');
        }
        cached = { etag: `"${avatarEtag(config)}"`, svg: kurdishAvatarSvg(config) };
        await app.cache.set('avatar-svg', id, cached, 3_600);
      }

      reply
        .header('etag', cached.etag)
        .header('cache-control', 'public, max-age=300, stale-while-revalidate=3600');
      if (req.headers['if-none-match'] === cached.etag) {
        return reply.code(304).send();
      }
      return reply.type('image/svg+xml').send(cached.svg);
    },
  );
}

export function avatarEtag(config: AvatarConfig): string {
  return createHash('sha1')
    .update(JSON.stringify(config))
    .digest('hex')
    .slice(0, 16);
}
