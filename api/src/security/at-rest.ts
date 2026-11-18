import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Encrypts a secret the server must keep and read back, such as another service's token, so a copy of the database
 * alone (a backup, a replica, a leaked dump) holds nothing usable. AES-256-GCM with a fresh 96-bit nonce per value and
 * the purpose as associated data, so a value sealed for one use cannot pass for another. The key is derived with
 * HKDF-SHA256 from the JWT secret with a label per purpose; rotating that secret makes earlier values unreadable, and
 * `unseal` then returns null, which callers treat as nothing kept. Stored as `v1.<nonce>.<tag>.<ciphertext>` in
 * base64url.
 */

const VERSION = 'v1';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function keyFor(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, '', `hevalo-at-rest-v1:${purpose}`, 32));
}

/** `plaintext` encrypted for `purpose` under the server secret. */
export function seal(secret: string, purpose: string, plaintext: string): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret, purpose), nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(purpose, 'utf8'));
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** What `seal` encrypted, or null when `sealed` was not sealed for this purpose under this secret, was altered, or is not sealed at all. */
export function unseal(secret: string, purpose: string, sealed: string): string | null {
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  const [nonce, tag, body] = parts.slice(1).map((part) => Buffer.from(part, 'base64url')) as [Buffer, Buffer, Buffer];
  if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFor(secret, purpose), nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(purpose, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
