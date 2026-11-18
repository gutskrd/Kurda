import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyInstance, FastifyRequest } from 'fastify';

const current = new AsyncLocalStorage<FastifyRequest>();

/**
 * Which request the current code serves, so the security log can record its address, device and request id without
 * every service being handed the request. Installed right after the client address is resolved, ahead of every other
 * hook, so the rate limiter, guards, handler and services all run inside it; fastify keeps it across the body parser.
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
