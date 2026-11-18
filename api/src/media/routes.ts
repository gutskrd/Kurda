import type { FastifyInstance } from 'fastify';
import { requireAccount } from '../plugins/auth.js';
import { requireUnrestricted } from '../moderation/restrictions.js';
import { AppError } from '../plugins/errors.js';
import type { AppConfig } from '../config/env.js';
import { audioLimits } from './mediaLimits.js';
import { MediaUsageService } from './mediaUsage.js';
import { registerAudioParser, storeAudioMedia } from './audioMedia.js';

/** Speaking-practice recordings get their own key prefix, set here, not by the client. */
const PRACTICE_KIND = 'speaking';

/**
 * Upload of a speaking-practice recording, through the server like `/media/voice`: size cap, op ceiling, real-type
 * sniff, storage ceiling, store, confirm. The bytes are always seen and checked here; a client never writes to the
 * bucket directly, and the prefix is fixed by the server.
 */
export function registerMediaRoutes(app: FastifyInstance, config: AppConfig): void {
  const limits = audioLimits(config);
  const usage = new MediaUsageService(app.db, app.redis ?? null);
  registerAudioParser(app, limits.maxUploadBytes);

  app.post(
    '/media/uploads',
    {
      config: {
        rawBody: true,
        rateLimit: {
          max: limits.uploadRateMax,
          windowMs: limits.uploadRateWindowMs,
          per: 'user-or-ip' as const,
        },
        skipValidation: true, // the body is raw bytes, not JSON
      },
      // A media restriction covers this too, and it needs an account, not a guest, since a file must belong to someone
      // who can be asked about it.
      preHandler: [requireAccount, requireUnrestricted('media')],
    },
    async (req, reply) => {
      if (!app.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
      if (!raw) {
        return reply
          .code(415)
          .send({ code: 'INVALID_AUDIO', message: 'send raw audio bytes with an audio/* content-type' });
      }

      const res = await storeAudioMedia(
        { pool: app.db, storage: app.storage, usage, limits, log: app.log },
        PRACTICE_KIND,
        raw,
        req.user!.id,
      );
      if (!res.ok) {
        req.log.warn(
          { userId: req.user!.id, reason: res.reason, bytes: raw.length },
          'practice recording upload rejected',
        );
        return reply.code(res.status).send({ code: res.code, message: res.message });
      }
      return reply.code(201).send({ key: res.mediaId, url: res.url, contentType: res.contentType });
    },
  );
}
