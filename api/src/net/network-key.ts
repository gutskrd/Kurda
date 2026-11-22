import { networkKeyHash } from '../moderation/pseudonym.js';
import { parseIp } from './ip.js';

/**
 * The network an address belongs to, as every "same network?" check compares it: an IPv4 address is its own network
 * (telling a home from a carrier NAT is net/evidence.ts's job), an IPv4-mapped IPv6 address is its IPv4 address, and
 * IPv6 belongs to its /64, since a LAN is one /64 and devices rotate the lower bits for privacy. Null for a non-address.
 */
export function networkKey(ip: string | null | undefined): string | null {
  return prefixKey(ip, 64);
}

/**
 * The wider network a sign-up or a sent email is counted by: the same as `networkKey` for IPv4, and the /56 for IPv6,
 * the block a provider commonly gives one customer, so walking through its 256 /64s gives no fresh budget.
 */
export function siteKey(ip: string | null | undefined): string | null {
  return prefixKey(ip, 56);
}

/** An address's IPv4 text, or its IPv6 prefix of `bits` (a multiple of 8, at most 64) in compressed form. */
function prefixKey(ip: string | null | undefined, bits: 56 | 64): string | null {
  const parsed = parseIp(ip);
  if (!parsed) return null;
  if (parsed.family === 4) return parsed.text;
  const bytes = new Uint8Array(16);
  bytes.set(parsed.bytes.subarray(0, bits / 8));
  const groups: string[] = [];
  for (let i = 0; i < 8; i += 2) groups.push(((bytes[i]! << 8) | bytes[i + 1]!).toString(16));
  // the prefix in the same compressed form as an address, so one prefix is one string
  return `${parseIp(`${groups.join(':')}::`)!.text}/${bits}`;
}

/** The keyed hash of an address's network, which is what is stored; never the address or key. Null for a non-address. */
export function networkHashOf(ip: string | null | undefined): string | null {
  const key = networkKey(ip);
  return key ? networkKeyHash(key) : null;
}
