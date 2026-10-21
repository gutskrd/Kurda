import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Encrypting a secret the server has to keep and read back later, such as a
 * token another service gave it to act for someone: a copy of the database on
 * its own (a backup, a replica, a leaked dump) then holds nothing usable.
 *
 * AES-256-GCM with a fresh 96-bit nonce for every value, and the purpose bound
 * in as associated data, so a value sealed for one use cannot be passed off as
 * another. The key is derived (HKDF-SHA256) from a server secret, the app's JWT
 * secret, as the moderation pseudonyms and the lesson shuffle are keyed from
 * it, with a label of its own per purpose. Rotating that secret makes every
 * value sealed before it unreadable; `unseal` then answers null, and each
 * caller treats that as nothing kept.
 *
 * Stored as `v1.<nonce>.<tag>.<ciphertext>`, each part base64url.
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

/**
 * What `seal` encrypted, or null when `sealed` was not sealed for this purpose
 * under this secret: another key, another purpose, altered, or not a sealed
 * value at all.
 */
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
