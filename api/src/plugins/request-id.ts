import type { IncomingHttpHeaders } from 'node:http';

/**
 * What an id a gateway in front gave a request may look like: a short run of
 * letters, digits and `-_.:`, which every balancer's ids are.
 */
const UPSTREAM_ID = /^[A-Za-z0-9._:-]{1,64}$/;

/**
 * Each request's id: the one a gateway in front gave it (`x-request-id`), when
 * it looks like one, or a fresh one.
 *
 * Fastify takes that header as it comes when told to read it, and the id goes
 * everywhere after: every log line, the response, the security log and the
 * admin audit trail. Nothing in front of the API sets it, so it was whatever
 * the caller wrote — kilobytes of it, copied into every one of those, or text
 * made to read as something else in a log line. An id that does not look like
 * one is not taken, and the request gets its own, as Fastify would make it.
 */
export function requestIdGenerator(): (req: { headers: IncomingHttpHeaders }) => string {
  let next = 0;
  return (req) => {
    const upstream = req.headers['x-request-id'];
    if (typeof upstream === 'string' && UPSTREAM_ID.test(upstream)) return upstream;
    // Fastify's own form, and its bound: past 2^31 - 1 the counter starts again
    next = (next + 1) & 0x7fffffff;
    return `req-${next.toString(36)}`;
  };
}
