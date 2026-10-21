import { lookup as dnsLookup } from 'node:dns/promises';
import { inCidr, parseCidr, parseIp } from './ip.js';

/**
 * Fetching a file from another site on someone's behalf, without letting the
 * address reach anything it should not.
 *
 * The address must be https on one of the hosts the caller names (a stored
 * `http:` address on one of them is fetched at its `https:` one), and every
 * address the host's name resolves to must be public: not loopback, not a
 * private, shared or link-local range, nothing reserved. Redirects are
 * followed here, not by fetch, at most `maxRedirects` of them, and each is
 * held to the same rules, so an allowed host cannot pass the request on to
 * one that is not.
 *
 * The name is resolved here and again when fetch connects, so a name that
 * changes its answer in between gets past the address check. The host list is
 * what keeps that safe (only names the operator trusts are ever looked up);
 * the address check is a second guard behind it.
 */

export type Lookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export const systemLookup: Lookup = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

/** Redirects followed before giving up. */
export const MAX_REDIRECTS = 2;

/**
 * Addresses no fetch on a visitor's behalf may reach: this network, the
 * private and shared ranges, loopback, link-local, documentation and
 * benchmarking ranges, multicast and everything reserved, and the IPv6 forms
 * that carry an IPv4 address inside them (NAT64, 6to4, IPv4-compatible).
 */
const NOT_PUBLIC = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
  '::/96',
  '64:ff9b::/96',
  '64:ff9b:1::/48',
  '100::/64',
  '2001::/32',
  '2001:db8::/32',
  '2002::/16',
  'fc00::/7',
  'fe80::/10',
  'fec0::/10',
  'ff00::/8',
].map(parseCidr);

/** Whether `address` is one a fetch may connect to: a public unicast address. */
export function isPublicAddress(address: string): boolean {
  const ip = parseIp(address);
  return ip !== null && !NOT_PUBLIC.some((range) => inCidr(ip, range));
}

/**
 * Why a fetch did not happen or did not succeed. `refused`: the address, or
 * one a redirect led to, is not one this may fetch. Otherwise the other site
 * failed: it could not be found or reached, it did not answer in time, it
 * answered with an error, or it redirected too often.
 */
export class OutboundError extends Error {
  constructor(
    readonly refused: boolean,
    readonly reason: 'host' | 'address' | 'dns' | 'network' | 'timeout' | 'status' | 'redirects',
    message: string,
  ) {
    super(message);
  }
}

export interface AllowedFetchOptions {
  /** the hosts (`host` or `host:port`, lower case) the address and every redirect must be on */
  hosts: ReadonlySet<string>;
  /** stops the fetch and the body's read, for a deadline */
  signal: AbortSignal;
  headers?: Record<string, string>;
  maxRedirects?: number;
  fetch?: typeof fetch;
  lookup?: Lookup;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** `text` as an https URL on one of `hosts`, read against `from` when it is a redirect's. */
function allowedUrl(text: string, from: URL | null, hosts: ReadonlySet<string>): URL {
  let url: URL;
  try {
    url = from ? new URL(text, from) : new URL(text.startsWith('//') ? `https:${text}` : text);
  } catch {
    throw new OutboundError(true, 'host', 'that is not a web address');
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') throw new OutboundError(true, 'host', `only https addresses are fetched, not ${url.protocol}`);
  if (url.username || url.password) throw new OutboundError(true, 'host', 'an address with a password in it is not fetched');
  if (!hosts.has(url.host.toLowerCase())) {
    throw new OutboundError(true, 'host', `${url.hostname} is not a host recordings are fetched from`);
  }
  return url;
}

async function checkAddresses(hostname: string, lookup: Lookup): Promise<void> {
  let found: Array<{ address: string }>;
  try {
    found = await lookup(hostname);
  } catch {
    throw new OutboundError(false, 'dns', `${hostname} could not be found`);
  }
  if (found.length === 0) throw new OutboundError(false, 'dns', `${hostname} could not be found`);
  if (!found.every((a) => isPublicAddress(a.address))) {
    throw new OutboundError(true, 'address', `${hostname} leads to an address that is not on the public internet`);
  }
}

async function discard(res: Response): Promise<void> {
  await res.body?.cancel().catch(() => undefined);
}

/**
 * GET `address` under the rules above. Resolves with a successful response,
 * its body unread; throws OutboundError for anything else.
 */
export async function fetchFromAllowedHost(address: string, options: AllowedFetchOptions): Promise<Response> {
  const fetchFn = options.fetch ?? fetch;
  const lookup = options.lookup ?? systemLookup;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  let url = allowedUrl(address, null, options.hosts);
  for (let redirects = 0; ; redirects++) {
    await checkAddresses(url.hostname, lookup);
    let res: Response;
    try {
      res = await fetchFn(url, { redirect: 'manual', signal: options.signal, headers: options.headers });
    } catch {
      if (options.signal.aborted) throw new OutboundError(false, 'timeout', `${url.hostname} did not answer in time`);
      throw new OutboundError(false, 'network', `${url.hostname} could not be reached`);
    }
    if (REDIRECTS.has(res.status)) {
      await discard(res);
      const location = res.headers.get('location');
      if (!location) throw new OutboundError(false, 'status', `${url.hostname} redirected to nowhere`);
      if (redirects >= maxRedirects) {
        throw new OutboundError(false, 'redirects', `${url.hostname} redirected more than ${maxRedirects} times`);
      }
      url = allowedUrl(location, url, options.hosts);
      continue;
    }
    if (!res.ok) {
      await discard(res);
      throw new OutboundError(false, 'status', `${url.hostname} answered ${res.status}`);
    }
    return res;
  }
}
