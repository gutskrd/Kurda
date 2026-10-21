import { isCloudflareAddress } from './cloudflare.js';
import { parseIp } from './ip.js';

/** Which rule chose the client's address — printed by the proxy-chain log. */
export type ClientIpRule = 'cf-connecting-ip' | 'xff-left-of-edge' | 'edge';

export interface ClientIpInput {
  /** the connection's own peer address */
  socket: string | undefined;
  /** the raw X-Forwarded-For header, as Node hands it over */
  forwardedFor: unknown;
  /** the raw CF-Connecting-IP header */
  cfConnectingIp: unknown;
  /**
   * Whether the proxy at this hop may say who connected to it. Hop 0 is the
   * socket, hop 1 the right-most X-Forwarded-For entry, and so on leftwards.
   */
  trusted: (address: string, hop: number) => boolean;
  /** Read Cloudflare's headers when the edge is a Cloudflare address (on unless switched off). */
  cloudflare?: boolean;
}

export interface ResolvedClientIp {
  /** the client's address, canonical */
  ip: string;
  /** which rule chose it */
  rule: ClientIpRule;
  /** the first hop no trusted proxy vouches for, as written */
  edge: string;
  /** the hops from the socket to the client, nearest first — what `req.ips` lists */
  chain: string[];
}

/**
 * The most X-Forwarded-For entries looked at, counted from the right. A real
 * chain is two or three hops; this only keeps a padded header from costing
 * more than a short one.
 */
export const MAX_FORWARDED_HOPS = 32;

/** X-Forwarded-For's entries, left to right, as Fastify splits them. */
export function forwardedEntries(header: unknown): string[] {
  if (typeof header !== 'string' || header.length === 0) return [];
  const entries = header
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  return entries.slice(-MAX_FORWARDED_HOPS);
}

/**
 * Who is asking, worked out once from the connection and the proxy headers.
 *
 * In production the chain is: the client, then Cloudflare's edge (Render puts
 * Cloudflare in front of every service), then Render's own balancer, which
 * connects to the container from a private address. Each proxy appends the
 * peer it saw to X-Forwarded-For, so the header reads, left to right,
 * `[whatever the client wrote], <client, written by Cloudflare>, <edge, written
 * by Render>`, and the socket is Render's balancer.
 *
 * Walking from the socket and skipping the proxies `TRUST_PROXY` names stops at
 * the first address nothing trusted vouches for: the edge. That is where the
 * old behaviour stopped too, and why every caller looked like one of a few
 * dozen Cloudflare addresses. Cloudflare says who connected to it in two
 * places: `CF-Connecting-IP`, which it always overwrites, and the
 * X-Forwarded-For entry it appended immediately left of the edge. Either is
 * believed only when the edge hop is itself a Cloudflare address, and nothing
 * further left ever is, so a client cannot name itself:
 *
 * - text a client puts in X-Forwarded-For sits left of Cloudflare's own entry
 *   and is never read;
 * - a `CF-Connecting-IP` that did not come through Cloudflare arrives from an
 *   edge that is not Cloudflare's, and is ignored;
 * - a caller that is itself on Cloudflare's network (a Worker's subrequest
 *   arrives with an address in 2a06:98c0::/29) is just that one address, not
 *   another proxy to walk past.
 */
export function resolveClientIp(input: ClientIpInput): ResolvedClientIp {
  const socket = input.socket ?? '';
  // nearest first: the socket, then the header read from the right
  const hops = [socket, ...forwardedEntries(input.forwardedFor).reverse()];
  let at = 0;
  while (at < hops.length - 1 && input.trusted(hops[at]!, at)) at++;
  const edgeText = hops[at]!;
  const edge = parseIp(edgeText);

  if (!edge) {
    // A trusted proxy passed on something that is not an address. The nearest
    // hop that is one is the most anyone can say about this caller.
    for (let i = at - 1; i >= 0; i--) {
      const hop = parseIp(hops[i]);
      if (hop) return { ip: hop.text, rule: 'edge', edge: edgeText, chain: [...hops.slice(0, i), hop.text] };
    }
    return { ip: socket, rule: 'edge', edge: edgeText, chain: [socket] };
  }

  const walked = [...hops.slice(0, at), edge.text];
  if (input.cloudflare !== false && isCloudflareAddress(edge)) {
    const connecting = parseIp(input.cfConnectingIp);
    if (connecting) {
      return { ip: connecting.text, rule: 'cf-connecting-ip', edge: edgeText, chain: [...walked, connecting.text] };
    }
    const left = parseIp(hops[at + 1]);
    if (left) {
      return { ip: left.text, rule: 'xff-left-of-edge', edge: edgeText, chain: [...walked, left.text] };
    }
  }
  return { ip: edge.text, rule: 'edge', edge: edgeText, chain: walked };
}
