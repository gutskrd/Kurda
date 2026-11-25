import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CollectionService } from './collection.js';
import type { SocialService } from './service.js';

/** A profile's collection: the icons they own and the gifts they were given (social/collection.ts). */
export function registerCollectionRoutes(app: FastifyInstance, social: Pick<SocialService, 'access'>): void {
  const collection = new CollectionService(app.db, social);
  const publicUrl = (key: string): string | null => (app.storage ? app.storage.publicUrl(key) : null);

  /**
   * What the profile's collection sheet shows besides badges. Readable signed out, as the profile is, and gated the
   * same way; who sent a gift is in it only for the person it was sent to.
   */
  app.get('/users/:id/collection', { schema: { params: z.object({ id: z.uuid() }) } }, async (req) =>
    collection.collection(req.user?.id ?? null, (req.params as { id: string }).id, publicUrl),
  );
}
