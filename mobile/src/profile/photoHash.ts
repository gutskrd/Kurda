import { sha256 } from 'js-sha256';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decode a base64 string to raw bytes. Pure (no native imports) so the upload's
 * content hashing is unit-testable without a device — the network upload itself
 * needs live object storage (KUR-177/180).
 */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const padded = clean.length % 4 === 0 ? clean : clean + '='.repeat(4 - (clean.length % 4));
  const trailing = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const len = Math.max(0, (padded.length / 4) * 3 - trailing);
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < padded.length; i += 4) {
    const n =
      (B64.indexOf(padded[i]!) << 18) |
      (B64.indexOf(padded[i + 1]!) << 12) |
      ((padded[i + 2] === '=' ? 0 : B64.indexOf(padded[i + 2]!)) << 6) |
      (padded[i + 3] === '=' ? 0 : B64.indexOf(padded[i + 3]!));
    if (o < len) out[o++] = (n >> 16) & 0xff;
    if (o < len) out[o++] = (n >> 8) & 0xff;
    if (o < len) out[o++] = n & 0xff;
  }
  return out;
}

/** SHA-256 hex of raw bytes — the content-address the API keys the upload by. */
export function sha256Hex(bytes: Uint8Array): string {
  return sha256(bytes);
}
