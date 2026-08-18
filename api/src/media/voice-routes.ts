import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import type { AppConfig } from '../config/env.js';
import { audioLimits } from './mediaLimits.js';
import { MediaUsageService } from './mediaUsage.js';
import { storeAudioMedia } from './audioMedia.js';

const VOICE_KIND = 'voice-note';

/**
 * Through-server voice-note upload (KUR-282): POST raw audio bytes; the server
 * sniffs the real type, enforces the size / storage / op / rate limits, stores it
 * cost-safely, and returns a confirmed media id to attach to a library post
 * (narration) or comment (voice comment). Its own audio body parser + bodyLimit so
 * an oversized upload is rejected (413) before buffering.
 */
export function registerVoiceRoutes(app: FastifyInstance, config: AppConfig): void {
  const limits = audioLimits(config);
  const usage = new MediaUsageService(app.db, app.redis ?? null);

  app.addContentTypeParser(
    ['audio/mpeg', 'audio/mp4'],
    { parseAs: 'buffer', bodyLimit: limits.maxUploadBytes + 1024 },
    (_req, body, done) => done(null, body),
  );

  app.post(
    '/media/voice',
    {
      config: {
        rateLimit: { max: limits.uploadRateMax, windowMs: limits.uploadRateWindowMs, per: 'user-or-ip' as const },
        skipValidation: true,
      },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      if (!app.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
      if (!raw) return reply.code(415).send({ code: 'INVALID_AUDIO', message: 'send raw audio bytes with an audio/* content-type' });

      const res = await storeAudioMedia({ pool: app.db, storage: app.storage, usage, limits, log: app.log }, VOICE_KIND, raw);
      if (!res.ok) {
        req.log.warn({ userId: req.user!.id, reason: res.reason, bytes: raw.length }, 'voice note upload rejected');
        return reply.code(res.status).send({ code: res.code, message: res.message });
      }
      return reply.code(201).send({ audioMediaId: res.mediaId, url: res.url, contentType: res.contentType });
    },
  );
}
