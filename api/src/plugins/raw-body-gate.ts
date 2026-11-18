import type { FastifyInstance } from 'fastify';
import { AUDIO_CONTENT_TYPES } from '../media/audioMedia.js';
import { AppError } from './errors.js';

/** The body types read as raw bytes, by the image and audio parsers. */
const RAW_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream', ...AUDIO_CONTENT_TYPES]);

/**
 * Raw upload bodies are taken only by the routes that store uploads (`config: { rawBody: true }`). Body parsers are
 * app-wide, so without this any address, even one about to refuse the request, would first buffer an upload-sized
 * body. It runs before the body is read, and must be installed before the routes it guards.
 */
export function installRawBodyGate(app: FastifyInstance): void {
  app.addHook('onRequest', async (req) => {
    const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    if (!RAW_TYPES.has(type)) return;
    if ((req.routeOptions.config as { rawBody?: boolean } | undefined)?.rawBody === true) return;
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 415, 'this address does not take uploads');
  });
}
