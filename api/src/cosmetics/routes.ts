import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { avatarRegistry } from './avatars.js';
import type { CosmeticsService } from './service.js';

const rateLimit = { max: 30, windowMs: 60_000, per: 'user-or-ip' as const };
const skuBody = z.object({ sku: z.string().min(1).max(80).nullable() });
const postBody = z.object({ postId: z.uuid() });

/**
 * Profile cosmetics + favorites (equip only — purchasing stays in /shop). Every
 * mutation is scoped to the authenticated user (req.user.id); the client never
 * says who owns what — the server resolves the SKU and checks entitlement /
 * premium access. Reuses shop_items / user_entitlements / library_posts.
 */
export function registerCosmeticsRoutes(app: FastifyInstance, cosmetics: CosmeticsService): void {
  /** The default-avatar catalog + which require premium (for the picker's locks).
   *  Static/global data — no per-user DB work. */
  app.get(
    '/cosmetics/avatars',
    { config: { skipValidation: true }, preHandler: requireAuth },
    async () => ({ avatars: avatarRegistry() }),
  );

  app.put(
    '/me/cosmetics/avatar',
    { schema: { body: z.object({ key: z.string().min(1).max(64).nullable() }) }, config: { rateLimit }, preHandler: requireAuth },
    async (req) => {
      const { key } = req.body as { key: string | null };
      await cosmetics.equipAvatar(req.user!.id, key);
      return { avatarKey: key };
    },
  );

  app.put(
    '/me/cosmetics/background',
    { schema: { body: skuBody }, config: { rateLimit }, preHandler: requireAuth },
    async (req) => {
      const { sku } = req.body as { sku: string | null };
      await cosmetics.equipBackground(req.user!.id, sku);
      return { backgroundSku: sku };
    },
  );

  app.put(
    '/me/cosmetics/icon',
    { schema: { body: skuBody }, config: { rateLimit }, preHandler: requireAuth },
    async (req) => {
      const { sku } = req.body as { sku: string | null };
      await cosmetics.equipIcon(req.user!.id, sku);
      return { iconSku: sku };
    },
  );

  app.put(
    '/me/favorites/poem',
    { schema: { body: postBody }, config: { rateLimit }, preHandler: requireAuth },
    async (req) => {
      await cosmetics.setFavorite(req.user!.id, 'poem', (req.body as { postId: string }).postId);
      return { favoritePoemId: (req.body as { postId: string }).postId };
    },
  );
  app.delete(
    '/me/favorites/poem',
    { config: { skipValidation: true, rateLimit }, preHandler: requireAuth },
    async (req) => {
      await cosmetics.setFavorite(req.user!.id, 'poem', null);
      return { favoritePoemId: null };
    },
  );

  app.put(
    '/me/favorites/story',
    { schema: { body: postBody }, config: { rateLimit }, preHandler: requireAuth },
    async (req) => {
      await cosmetics.setFavorite(req.user!.id, 'story', (req.body as { postId: string }).postId);
      return { favoriteStoryId: (req.body as { postId: string }).postId };
    },
  );
  app.delete(
    '/me/favorites/story',
    { config: { skipValidation: true, rateLimit }, preHandler: requireAuth },
    async (req) => {
      await cosmetics.setFavorite(req.user!.id, 'story', null);
      return { favoriteStoryId: null };
    },
  );
}
