import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238) for mandatory admin 2FA (KUR-099) — no external dependency.
 * Standard HMAC-SHA1, 6 digits, 30-second step, compatible with Google
 * Authenticator / 1Password / Authy. Verification checks a ±1 step window to
 * tolerate clock skew and compares in constant time.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh random base32 secret (default 20 bytes = 160 bits, per RFC 4226). */
export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

function hotp(secret: Buffer, counter: number, digits: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 10 ** digits).padStart(digits, '0');
}

/** The current TOTP code for a base32 secret. */
export function totpCode(secretBase32: string, time: number = Date.now(), digits = TOTP_DIGITS): string {
  const counter = Math.floor(time / 1000 / TOTP_STEP_SECONDS);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/** Verify a code against a ±`window`-step range, constant-time per candidate. */
export function verifyTotp(
  secretBase32: string,
  code: string,
  time: number = Date.now(),
  window = 1,
): boolean {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return false;
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(time / 1000 / TOTP_STEP_SECONDS);
  const provided = Buffer.from(trimmed, 'utf8');
  for (let w = -window; w <= window; w++) {
    const candidate = Buffer.from(hotp(secret, counter + w, TOTP_DIGITS), 'utf8');
    if (candidate.length === provided.length && timingSafeEqual(candidate, provided)) return true;
  }
  return false;
}

/** otpauth:// URI for provisioning in an authenticator app (QR code). */
export function otpauthUri(secretBase32: string, label: string, issuer = 'MyKurda Admin'): string {
  const enc = encodeURIComponent;
  return (
    `otpauth://totp/${enc(issuer)}:${enc(label)}` +
    `?secret=${secretBase32}&issuer=${enc(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`
  );
}
