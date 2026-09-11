import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';

/**
 * Say, once, what the proxy chain in front of this server actually looks like.
 *
 * `TRUST_PROXY` is a hop count, and the right number is a property of the
 * deployment rather than something the code can work out: it depends on how
 * many proxies sit between a reader and this process and whether each of them
 * appends to X-Forwarded-For or replaces it. Guessing high is the dangerous
 * direction — one hop too many and the address being trusted is the one the
 * client typed.
 *
 * So rather than guess, the server prints the chain from a real request the
 * first time it serves one. The count to set is the number of addresses in
 * `forwardedFor` that were written by a proxy, which is all of them except a
 * leading one that no proxy would have produced.
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
      'proxy chain as seen on the first request — set TRUST_PROXY to the number of addresses a proxy wrote',
    );
  });
}
