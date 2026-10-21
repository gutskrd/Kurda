import { networkKeyHash } from '../moderation/pseudonym.js';
import { parseIp } from './ip.js';

/**
 * The network an address belongs to, as everything that asks "the same
 * network?" compares it.
 *
 * - An IPv4 address is its own network. Behind one IPv4 address is a home, an
 *   office, or a carrier's NAT; telling those apart is the evidence rules' job
 *   (net/evidence.ts), not this one's.
 * - An IPv4-mapped IPv6 address is the IPv4 address it carries.
 * - An IPv6 address belongs to its /64. A home or office LAN is one /64, and
 *   devices rotate the lower 64 bits for privacy, so an exact match would both
 *   miss two accounts in the same flat and let one person look like many — and
 *   get a fresh rate-limit budget with every new address.
 *
 * Null when the text is not an address.
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

/**
 * The keyed hash of an address's network: what is stored, never the address
 * or the key itself. Null when the text is not an address.
 */
export function networkHashOf(ip: string | null | undefined): string | null {
  const key = networkKey(ip);
  return key ? networkKeyHash(key) : null;
}
