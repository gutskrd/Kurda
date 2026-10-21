import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { resolveClientIp } from '../net/client-ip.js';
import { proxyChainLogger } from './proxy-chain.js';

/**
 * Resolve the client's address once, at the door, and make `req.ip` say it.
 *
 * Everything that asks who is calling reads `req.ip` — the rate limiter, the
 * login lockout, the captcha's remote-IP check, sign-up and sign-in risk, the
 * copyright form's limit, the network sightings — so fixing it here fixes all
 * of them without touching any. Must be the first `onRequest` hook, ahead of
 * the rate limiter.
 *
 * Which proxies are trusted is still exactly what `TRUST_PROXY` says: the walk
 * is Fastify's own (`req.ips`, compiled from that setting), so the hops it
 * trusted are the hops trusted here. What is added is reading past a Cloudflare
 * edge (net/client-ip.ts), unless `CLOUDFLARE_CLIENT_IP=off`. Without a
 * Cloudflare edge in the chain nothing changes.
 *
 * `req.ip` and `req.ips` are set on the request itself, so the two agree: `ips`
 * lists the hops from the socket to the client and ends with `ip`. The headers
 * are left as they arrived. The "incoming request" log line is written before
 * any hook runs, so its `remoteAddress` is still the edge.
 */
export function setupClientIp(app: FastifyInstance, config: AppConfig): void {
  const cloudflare = config.CLOUDFLARE_CLIENT_IP !== 'off';
  const logChain = proxyChainLogger(config);
  app.addHook('onRequest', async (req) => {
    const socket = req.socket.remoteAddress;
    if (!socket) return; // the connection is already gone
    // Fastify's walk under TRUST_PROXY: the socket, the hops it trusted, then
    // the first one it did not (just the socket when nothing is trusted)
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
    logChain(req, resolved);
  });
}
