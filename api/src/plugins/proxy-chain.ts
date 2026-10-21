import type { FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';
import type { ResolvedClientIp } from '../net/client-ip.js';

/** Enough of the header to see its shape; a padded one is not worth a long line. */
const MAX_LOGGED_HEADER = 300;

/**
 * Say, once, what the proxy chain in front of this server actually looks like
 * and how the client's address was read from it.
 *
 * `TRUST_PROXY` names the proxies allowed to say who is asking, and which ones
 * those are is a property of the deployment rather than something the code can
 * work out. Naming too much is the dangerous direction: include an address the
 * public can reach and the header it writes is believed.
 *
 * So rather than guess, the server prints the chain from a real request. Not
 * the first request: on Render that is always the platform's health check,
 * straight from 127.0.0.1 with no X-Forwarded-For, which shows nothing. It is
 * the first request that carries X-Forwarded-For, once per process, at info
 * level — a thing you read after a deploy, not a per-request cost.
 *
 * - `socket` is the address `TRUST_PROXY` has to cover (on Render a private
 *   one, which the default `loopback,linklocal,uniquelocal` does);
 * - `edge` is the first hop no trusted proxy vouches for — behind Cloudflare,
 *   a Cloudflare address;
 * - `rule` says how the client was read: `cf-connecting-ip` or
 *   `xff-left-of-edge` when the edge is Cloudflare's, `edge` otherwise;
 * - `resolvedIp` is what every rate limit, lockout and risk score keys on.
 *
 * If `rule` is `edge` while `edge` is a Cloudflare address, the client could
 * not be read past Cloudflare and every caller through that edge is one caller.
 * If `resolvedIp` equals `socket` while `forwardedFor` is not empty, the list
 * is not covering the proxy and every caller on earth is one caller.
 *
 * `forwardedFor` holds the caller's address, as the request log always did;
 * once per process it discloses nothing new.
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
