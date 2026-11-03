/**
 * This browser's device id, sent with every request as `X-Device-Id`.
 *
 * Sign-in protection keys on it (api/src/auth/known-devices.ts): a device that
 * has signed in to an account before keeps its own budget of failed attempts,
 * so somebody typing the owner's address with wrong passwords elsewhere cannot
 * lock the owner out, and a sign-in from a device the account has never used
 * gets an email to its owner.
 *
 * It is a random UUID, made once and kept in localStorage with a copy in a
 * cookie, so a browser that purges one store (Safari drops script-written
 * storage it thinks idle; "clear browsing data" can take one and not the
 * other) does not come back as a "new device", with the owner emailed each
 * time. The cookie is this module's own second copy — the server never reads
 * it; the id travels only as the header. It says nothing about the browser or
 * the person: it is only "the same browser as last time". Where both stores
 * are blocked or throw (a private window, a locked-down browser) the id lives
 * for this tab only, which costs that browser nothing more than being a new
 * device next time. It belongs in a header, never in a URL or a log.
 */
const KEY = 'hevalo_device_id';
/** What the API accepts (api/src/auth/routes.ts `deviceIdOf`). */
const MAX = 200;

let current: string | null = null;

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID is missing outside a secure context; getRandomValues is not.
  // The id stands for a device the account trusts, so it must not be guessable.
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
    // no cookies here; localStorage or a fresh id answers instead
  }
  return null;
}

function keep(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // kept in memory for this tab
  }
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${KEY}=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
  } catch {
    // without the copy, a purged localStorage makes this a new device again
  }
}

/** The id, made on first use. The same answer for the life of the tab. */
export function deviceId(): string {
  if (current) return current;
  current = stored() ?? cookieStored() ?? newId();
  keep(current);
  return current;
}
