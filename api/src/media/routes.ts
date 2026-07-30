import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { MediaService } from './service.js';
import { ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES } from './storage.js';

const uploadBody = z.object({
  kind: z.string().regex(/^[a-z-]{2,32}$/),
  contentType: z.string().refine((t) => t in ALLOWED_CONTENT_TYPES, 'unsupported content type'),
  contentLength: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  /** sha256 of the bytes → content-addressed, immutable key */
  sha256Hex: z.string().regex(/^[a-f0-9]{64}$/),
});

/**
 * Signed-upload request (KUR-013). The client hashes its bytes, asks for a
 * ticket here, PUTs directly to the signed URL, then submits the returned
 * key to the consuming feature (e.g. a speaking answer, KUR-036).
 */
export function registerMediaRoutes(app: FastifyInstance): void {
  app.post(
    '/media/uploads',
    { schema: { body: uploadBody }, preHandler: requireAuth },
    async (req) => {
      if (!app.storage) {
        throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      }
      const body = req.body as z.infer<typeof uploadBody>;
      const media = new MediaService(app.db, app.storage);
      const ticket = await media.requestUpload(body);
      return ticket;
    },
  );
}
