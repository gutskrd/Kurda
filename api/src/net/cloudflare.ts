import { inCidr, parseCidr, type ParsedIp } from './ip.js';

/**
 * The address ranges Cloudflare's edge connects to origins from.
 *
 * Cloudflare publishes these at https://www.cloudflare.com/ips-v4 and
 * https://www.cloudflare.com/ips-v6 (also as JSON from
 * https://api.cloudflare.com/client/v4/ips). They change rarely; refresh both
 * lists from there when they do. A range missing here only means requests
 * through it keep the old behaviour (the edge is the caller), never that
 * anything is believed that should not be.
 */
export const CLOUDFLARE_IPV4 = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
] as const;

export const CLOUDFLARE_IPV6 = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
] as const;

const RANGES = [...CLOUDFLARE_IPV4, ...CLOUDFLARE_IPV6].map(parseCidr);

/** Whether this address is one Cloudflare's edge connects from. */
export function isCloudflareAddress(ip: ParsedIp): boolean {
  return RANGES.some((r) => inCidr(ip, r));
}
