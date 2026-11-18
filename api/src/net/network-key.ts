import { networkKeyHash } from '../moderation/pseudonym.js';
import { parseIp } from './ip.js';

/**
 * The network an address belongs to, as every "same network?" check compares it: an IPv4 address is its own network
 * (telling a home from a carrier NAT is net/evidence.ts's job), an IPv4-mapped IPv6 address is its IPv4 address, and
 * IPv6 belongs to its /64, since a LAN is one /64 and devices rotate the lower bits for privacy. Null for a non-address.
 */
export function networkKey(ip: string | null | undefined): string | null {
  const parsed = parseIp(ip);
  if (!parsed) return null;
  if (parsed.family === 4) return parsed.text;
  const groups: string[] = [];
  for (let i = 0; i < 8; i += 2) groups.push(((parsed.bytes[i]! << 8) | parsed.bytes[i + 1]!).toString(16));
  // the prefix in the same compressed form as an address, so one /64 is one string
  return `${parseIp(`${groups.join(':')}::`)!.text}/64`;
}

/** The keyed hash of an address's network, which is what is stored; never the address or key. Null for a non-address. */
export function networkHashOf(ip: string | null | undefined): string | null {
  const key = networkKey(ip);
  return key ? networkKeyHash(key) : null;
}
