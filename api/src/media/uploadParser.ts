import type { FastifyInstance } from 'fastify';

/**
 * Register the raw-image body parser once for the whole app (KUR-177/290).
 * Fastify content-type parsers are global, so every through-server image upload
 * (profile photos, meme/image posts) shares this one. Fastify rejects a body over
 * `bodyLimit` with 413 before buffering it, so an oversized upload never reaches a
 * handler. `application/octet-stream` lets clients send bytes without committing to
 * a MIME the server would only re-sniff anyway.
 */
export function registerImageUploadParser(app: FastifyInstance, maxUploadBytes: number): void {
  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'],
    { parseAs: 'buffer', bodyLimit: maxUploadBytes + 1024 },
    (_req, body, done) => done(null, body),
  );
}
