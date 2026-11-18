import type { FastifyInstance } from 'fastify';

/**
 * Registers the raw-image body parser once for the app, since fastify content-type parsers are global and every
 * through-server image upload shares it. A body over `bodyLimit` is rejected with 413 before buffering.
 * `application/octet-stream` lets clients send bytes without naming a type the server re-sniffs anyway.
 */
export function registerImageUploadParser(app: FastifyInstance, maxUploadBytes: number): void {
  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'],
    { parseAs: 'buffer', bodyLimit: maxUploadBytes + 1024 },
    (_req, body, done) => done(null, body),
  );
}
