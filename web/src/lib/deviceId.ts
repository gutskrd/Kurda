/**
 * This browser's device id, sent as `X-Device-Id`. Sign-in protection keys on it (api/src/auth/known-devices.ts): a
 * known device keeps its own budget of failed attempts, and a sign-in from a new one emails the owner.
 *
 * It is a random UUID kept in localStorage with a copy in a cookie, so a browser that purges one store does not become a
 * new device. The server never reads the cookie. Where both stores fail the id lasts for this tab. Send it only as a
 * header, never in a URL or a log.
 */
const KEY = 'hevalo_device_id';
/** The API's limit (api/src/auth/routes.ts `deviceIdOf`). */
const MAX = 200;

let current: string | null = null;

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID needs a secure context; getRandomValues does not. The id must not be guessable.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stored(): string | null {
  try {
    const value = localStorage.getItem(KEY);
    return value && value.length <= MAX ? value : null;
  } catch {
    return null;
  }
}

function cookieStored(): string | null {
  try {
    for (const part of document.cookie.split('; ')) {
      if (!part.startsWith(`${KEY}=`)) continue;
      const value = decodeURIComponent(part.slice(KEY.length + 1));
      return value && value.length <= MAX ? value : null;
    }
  } catch {
    // No cookies here; localStorage or a fresh id answers instead.
  }
  return null;
}

function keep(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Kept in memory for this tab.
  }
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${KEY}=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
  } catch {
    // Without the copy, a purged localStorage makes this a new device again.
  }
}

/** The id, made on first use and stable for the life of the tab. */
export function deviceId(): string {
  if (current) return current;
  current = stored() ?? cookieStored() ?? newId();
  keep(current);
  return current;
}
