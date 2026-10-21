import { isIP } from 'node:net';

/**
 * Network addresses as the server reasons about them.
 *
 * Addresses arrive as text from places that do not agree on a format: the
 * socket gives `::ffff:1.2.3.4` for an IPv4 client on a dual-stack listener,
 * proxies sometimes append a port (`1.2.3.4:5678`, `[2001:db8::1]:443`), a
 * link-local address can carry a zone (`fe80::1%eth0`), and a header a client
 * wrote can hold anything at all. Everything that compares or stores an address
 * goes through `parseIp` first, so the same machine is always the same text and
 * anything that is not an address is refused rather than guessed at.
 */
export interface ParsedIp {
  family: 4 | 6;
  /** 4 or 16 bytes, network order */
  bytes: Uint8Array;
  /** the canonical text: dotted quad, or RFC 5952 lower-case compressed IPv6 */
  text: string;
}

/** Longer than any address with a port and a zone; anything longer is not one. */
const MAX_ADDRESS_TEXT = 64;

/**
 * Read one address, or null when the text is not one.
 *
 * Accepted: an IPv4 or IPv6 address, either with a port (`1.2.3.4:80`,
 * `[::1]:443`), an IPv6 address in brackets, and a zone id, which is dropped.
 * An IPv4-mapped IPv6 address is read as the IPv4 address it carries, because
 * it is the same client.
 */
export function parseIp(raw: unknown): ParsedIp | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (s.length === 0 || s.length > MAX_ADDRESS_TEXT) return null;

  if (s.startsWith('[')) {
    // [v6] or [v6]:port
    const close = s.indexOf(']');
    if (close === -1) return null;
    const rest = s.slice(close + 1);
    if (rest !== '' && !/^:\d{1,5}$/.test(rest)) return null;
    s = s.slice(1, close);
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/.test(s)) {
    // v4:port — a bare IPv6 address cannot carry a port without brackets
    s = s.slice(0, s.lastIndexOf(':'));
  }

  const zone = s.indexOf('%');
  if (zone !== -1) {
    // a zone only names the local interface a link-local address was reached on
    if (!s.includes(':')) return null;
    s = s.slice(0, zone);
  }

  const family = isIP(s);
  if (family === 4) {
    const bytes = Uint8Array.from(s.split('.').map(Number));
    return { family: 4, bytes, text: bytes.join('.') };
  }
  if (family === 6) {
    const bytes = ipv6Bytes(s);
    if (!bytes) return null;
    if (isV4Mapped(bytes)) {
      const v4 = bytes.slice(12);
      return { family: 4, bytes: v4, text: v4.join('.') };
    }
    return { family: 6, bytes, text: formatIpv6(bytes) };
  }
  return null;
}

/** `::ffff:a.b.c.d` — an IPv4 client seen through an IPv6 socket. */
function isV4Mapped(b: Uint8Array): boolean {
  for (let i = 0; i < 10; i++) if (b[i] !== 0) return false;
  return b[10] === 0xff && b[11] === 0xff;
}

/** The 16 bytes of an IPv6 address `isIP` has already accepted. */
function ipv6Bytes(s: string): Uint8Array | null {
  let text = s.toLowerCase();
  const out = new Uint8Array(16);
  // an embedded IPv4 tail (`::ffff:1.2.3.4`, `64:ff9b::1.2.3.4`) is two groups
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  let v4: number[] | null = null;
  if (tail.includes('.')) {
    v4 = tail.split('.').map(Number);
    text = `${text.slice(0, lastColon + 1)}0:0`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups = halves.length === 2 ? [...head, ...new Array<string>(8 - head.length - rest.length).fill('0'), ...rest] : head;
  if (groups.length !== 8) return null;
  for (let i = 0; i < 8; i++) {
    const g = parseInt(groups[i]!, 16);
    if (!Number.isFinite(g) || g < 0 || g > 0xffff) return null;
    out[i * 2] = g >> 8;
    out[i * 2 + 1] = g & 0xff;
  }
  if (v4) out.set(v4, 12);
  return out;
}

/** RFC 5952: lower case, no leading zeros, the longest run of zero groups as `::`. */
function formatIpv6(b: Uint8Array): string {
  const groups: number[] = [];
  for (let i = 0; i < 16; i += 2) groups.push((b[i]! << 8) | b[i + 1]!);
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestLen < 2) return hex.join(':');
  return `${hex.slice(0, bestStart).join(':')}::${hex.slice(bestStart + bestLen).join(':')}`;
}

/** A range of addresses in CIDR notation, parsed once. */
export interface Cidr {
  family: 4 | 6;
  bytes: Uint8Array;
  prefix: number;
}

export function parseCidr(text: string): Cidr {
  const [addr, len] = text.split('/');
  const ip = parseIp(addr);
  const prefix = Number(len);
  if (!ip || !Number.isInteger(prefix) || prefix < 0 || prefix > (ip.family === 4 ? 32 : 128)) {
    throw new Error(`not a CIDR range: ${text}`);
  }
  return { family: ip.family, bytes: ip.bytes, prefix };
}

export function inCidr(ip: ParsedIp, range: Cidr): boolean {
  if (ip.family !== range.family) return false;
  const full = Math.floor(range.prefix / 8);
  for (let i = 0; i < full; i++) if (ip.bytes[i] !== range.bytes[i]) return false;
  const bits = range.prefix % 8;
  if (bits === 0) return true;
  const mask = (0xff << (8 - bits)) & 0xff;
  return (ip.bytes[full]! & mask) === (range.bytes[full]! & mask);
}
