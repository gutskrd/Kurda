import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import type { AppConfig } from '../config/env.js';
import { audioLimits } from './mediaLimits.js';
import { MediaUsageService } from './mediaUsage.js';
import { registerAudioParser, storeAudioMedia } from './audioMedia.js';

/** Speaking-practice recordings get their own key prefix, set here, not by the client. */
const PRACTICE_KIND = 'speaking';

/**
 * Upload a speaking-practice recording (KUR-036).
 *
 * This used to hand out a signed URL and let the client PUT straight to the
 * bucket. The server saw a declared content type, a declared length and a
 * declared SHA-256, and then never saw the bytes at all — so the one thing it
 * could not check was the only thing that mattered. Anyone signed in could ask
 * for a ticket saying "image/webp", PUT whatever they liked, and have it stored
 * on the project's own CDN domain:
 *
 *   - no magic-byte sniff, because there were no bytes to sniff;
 *   - no image or audio scanning, so the moderation pipeline never ran;
 *   - no storage quota and no upload rate limit beyond the global 100/min,
 *     which at 10 MB a ticket is a gigabyte a minute per account;
 *   - a `kind` straight from the request, so any prefix in the bucket could be
 *     written to, including the one GDPR exports use.
 *
 * The signature pinned the content type, so a browser would not have run the
 * result as script — but "the bytes are arbitrary and the label is a promise"
 * is not a property worth keeping, and nothing downstream ever verified the
 * hash it was given.
 *
 * It goes through the server now, which is what `/media/voice` already did with
 * the same machinery: size cap → op ceiling → sniff the real type → storage
 * ceiling → store → confirm. Same helper, different prefix. The key it returns
 * is confirmed, so a consumer that checks `confirmed_at` gets a real answer
 * instead of the nothing it got before — `confirmUpload` was called from a test
 * and nowhere else, so every ticket ever issued stayed unconfirmed until the
 * orphan job swept it.
 */
export function registerMediaRoutes(app: FastifyInstance, config: AppConfig): void {
  const limits = audioLimits(config);
  const usage = new MediaUsageService(app.db, app.redis ?? null);
  registerAudioParser(app, limits.maxUploadBytes);

  app.post(
    '/media/uploads',
    {
      config: {
        rateLimit: {
          max: limits.uploadRateMax,
          windowMs: limits.uploadRateWindowMs,
          per: 'user-or-ip' as const,
        },
        skipValidation: true, // the body is raw bytes, not JSON
      },
      preHandler: requireAuth,
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
