import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyInstance, FastifyRequest } from 'fastify';

const current = new AsyncLocalStorage<FastifyRequest>();

/**
 * Which request the code running now is serving, so the security log can say
 * where an event came from (the address, the device, the request id) without
 * every service that records one being handed the request to pass along.
 *
 * Installed right after the client's address is resolved, ahead of every other
 * hook: whatever runs for the request from then on, the rate limiter, the
 * guards, the handler and the services it calls, runs inside it. Fastify keeps
 * the context across the body parser too (its content-type parser runs in an
 * AsyncResource of the request).
 */
export function installRequestContext(app: FastifyInstance): void {
  app.addHook('onRequest', (req, _reply, done) => {
    current.run(req, done);
  });
}

/** The request being served, or undefined outside one (a timer, a job, start-up). */
export function currentRequest(): FastifyRequest | undefined {
  return current.getStore();
}
