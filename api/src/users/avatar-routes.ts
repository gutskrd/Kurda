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
      return { config, svg: kurdishAvatarSvg(config) };
    },
  );

  /**
   * Public SVG for leaderboards/games/chat. Response is cacheable; the
   * Redis-cached composite + ETag pipeline lands with KUR-079 (#79).
   */
  app.get(
    '/users/:id/avatar.svg',
    { schema: { params: z.object({ id: z.uuid() }) } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const config = await loadAvatarConfig(app, id);
      if (!config) {
        throw new AppError('NOT_FOUND', 404, 'user not found');
      }
      return reply
        .type('image/svg+xml')
        .header('cache-control', 'public, max-age=300')
        .send(kurdishAvatarSvg(config));
    },
  );
}
