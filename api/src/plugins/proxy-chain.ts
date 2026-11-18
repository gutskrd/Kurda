import type { FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';
import type { ResolvedClientIp } from '../net/client-ip.js';

/** Enough of the header to see its shape; a padded one is not worth a long line. */
const MAX_LOGGED_HEADER = 300;

/**
 * Logs once per process, at info, what the proxy chain looks like and how the client's address was read, from the
 * first request carrying X-Forwarded-For (the platform's health check comes from 127.0.0.1 without one). Which
 * proxies to trust is a property of the deployment, and trusting a publicly reachable address is the dangerous
 * mistake, so this shows the real chain:
 * - `socket`: the address `TRUST_PROXY` must cover (a private one behind the platform's balancer);
 * - `edge`: the first hop no trusted proxy vouches for, a Cloudflare address behind Cloudflare;
 * - `rule`: `cf-connecting-ip` or `xff-left-of-edge` when the edge is Cloudflare's, `edge` otherwise;
 * - `resolvedIp`: what every rate limit, lockout and risk score keys on.
 * `rule` of `edge` with a Cloudflare `edge` means everyone through that edge is one caller; `resolvedIp` equal to
 * `socket` with a non-empty `forwardedFor` means the list misses the proxy and every caller is one caller.
 */
export function proxyChainLogger(config: AppConfig): (req: FastifyRequest, resolved: ResolvedClientIp) => void {
  let logged = false;
  return (req, resolved) => {
    if (logged) return;
    const forwardedFor = req.headers['x-forwarded-for'];
    if (!forwardedFor || forwardedFor.length === 0) return;
    logged = true;
    const chain = Array.isArray(forwardedFor) ? forwardedFor.join(', ') : forwardedFor;
    req.log.info(
      {
        trustProxy: config.TRUST_PROXY,
        cloudflare: config.CLOUDFLARE_CLIENT_IP,
        socket: req.socket.remoteAddress,
        // the right-hand end is what the proxies wrote
        forwardedFor: chain.length > MAX_LOGGED_HEADER ? `…${chain.slice(-MAX_LOGGED_HEADER)}` : chain,
        cfConnectingIp: req.headers['cf-connecting-ip'] !== undefined,
        edge: resolved.edge,
        rule: resolved.rule,
        resolvedIp: resolved.ip,
      },
      'client address on the first proxied request — rule says where it was read from; edge on a Cloudflare address means every caller through that edge is one caller',
    );
  };
}
