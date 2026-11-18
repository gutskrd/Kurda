import type { IncomingHttpHeaders } from 'node:http';

/** What an upstream gateway's request id may look like: a short run of letters, digits and `-_.:`. */
const UPSTREAM_ID = /^[A-Za-z0-9._:-]{1,64}$/;

/**
 * Each request's id: the upstream `x-request-id` when it looks like one, else a fresh one. The id reaches every log
 * line, the response, the security log and the audit trail, and nothing in front of the API sets it, so an unchecked
 * caller value could be kilobytes long or forged to mislead a log reader.
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
