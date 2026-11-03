/**
 * This browser's device id for the admin console, sent with every request as
 * `X-Device-Id`, as the website and the phone app send theirs.
 *
 * The API lists a signed-in device once however many times it signs in
 * (GET /me/sessions groups by it), and sign-in protection keys on it
 * (api/src/auth/known-devices.ts). Without one, every sign-in here was a new
 * unnamed device in the admin's own Settings.
 *
 * A random UUID, made once and kept in this origin's localStorage with a copy
 * in a cookie, so a browser that purges one store does not come back as a
 * "new device". The cookie is this module's own second copy — the server
 * never reads it; the id travels only as the header. It says nothing about
 * the browser or the person, only "the same browser as last time". Where both
 * stores are blocked it lives for this tab only.
 */
const KEY = 'kurda_admin_device_id';
/** What the API accepts (api/src/auth/routes.ts `deviceIdOf`). */
const MAX = 200;

let current: string | null = null;

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
  current = stored() ?? cookieStored() ?? crypto.randomUUID();
  keep(current);
  return current;
}
