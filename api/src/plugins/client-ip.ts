import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { resolveClientIp } from '../net/client-ip.js';
import { proxyChainLogger } from './proxy-chain.js';

/** Requests whose address was read past a Cloudflare edge, so other headers that edge sets can be believed. */
const viaCloudflare = new WeakSet<object>();

/** Whether the request came through a trusted Cloudflare edge; only then is a header it sets (the visitor's country) its own. */
export function cameThroughCloudflare(req: object): boolean {
  return viaCloudflare.has(req);
}

/**
 * Resolves the client's address once and makes `req.ip` say it, so the rate limiter, login lockout, captcha check,
 * risk scoring, copyright form limit and network sightings all agree. Must be the first `onRequest` hook, ahead of the
 * rate limiter. The trusted hops are exactly fastify's `TRUST_PROXY` walk (`req.ips`); this only adds reading past a
 * Cloudflare edge (net/client-ip.ts) unless `CLOUDFLARE_CLIENT_IP=off`. `req.ip` and `req.ips` are set together;
 * headers stay as received, and the "incoming request" log line, written before any hook, still shows the edge.
 */
export function setupClientIp(app: FastifyInstance, config: AppConfig): void {
  const cloudflare = config.CLOUDFLARE_CLIENT_IP !== 'off';
  const logChain = proxyChainLogger(config);
  app.addHook('onRequest', async (req) => {
    const socket = req.socket.remoteAddress;
    if (!socket) return; // the connection is already gone
    // Fastify's walk under TRUST_PROXY: the socket, the trusted hops, then the first untrusted one.
    const walked = req.ips ?? [socket];
    const trustedHops = walked.length - 1;
    const resolved = resolveClientIp({
      socket,
      forwardedFor: req.headers['x-forwarded-for'],
      cfConnectingIp: req.headers['cf-connecting-ip'],
      trusted: (address, hop) => hop < trustedHops && walked[hop]?.trim() === address,
      cloudflare,
    });
    Object.defineProperties(req, {
      ip: { value: resolved.ip, enumerable: true, configurable: true },
      ips: { value: resolved.chain, enumerable: true, configurable: true },
    });
    if (resolved.rule !== 'edge') viaCloudflare.add(req);
    logChain(req, resolved);
  });
}
