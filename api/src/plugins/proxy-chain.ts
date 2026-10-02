import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';

/**
 * Say, once, what the proxy chain in front of this server actually looks like.
 *
 * `TRUST_PROXY` names the proxies allowed to say who is asking, and which ones
 * those are is a property of the deployment rather than something the code can
 * work out. Naming too much is the dangerous direction: include an address the
 * public can reach and the header it writes is believed.
 *
 * So rather than guess, the server prints the chain from a real request the
 * first time it serves one. `socket` is the address to cover — on a managed
 * platform it is a private one, which the default `loopback,linklocal,
 * uniquelocal` already covers — and `resolvedIp` is what every rate limit and
 * risk score will key on. If `resolvedIp` equals `socket` while `forwardedFor`
 * has addresses in it, the list is not covering the proxy and every caller on
 * earth is being counted as one.
 *
 * Once per process, at info level, on the first request only — this is a thing
 * you read after a deploy, not a per-request cost. The addresses are already in
 * every request log line, so it discloses nothing new.
 */
export function logProxyChainOnce(app: FastifyInstance, config: AppConfig): void {
  let logged = false;
  app.addHook('onRequest', async (req) => {
    if (logged) return;
    logged = true;
    req.log.info(
      {
        trustProxy: config.TRUST_PROXY,
        socket: req.socket.remoteAddress,
        forwardedFor: req.headers['x-forwarded-for'] ?? null,
        cfConnectingIp: req.headers['cf-connecting-ip'] ?? null,
        resolvedIp: req.ip,
      },
      'proxy chain as seen on the first request — TRUST_PROXY must cover the socket address, or resolvedIp is the proxy and every caller shares one rate-limit bucket',
    );
  });
}
