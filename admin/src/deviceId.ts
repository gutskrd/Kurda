/**
 * This browser's device id, sent as `X-Device-Id` like the website's and the app's: the API groups sessions by it and
 * sign-in protection keys on it (api/src/auth/known-devices.ts). A random UUID kept in localStorage with a copy in a
 * cookie, so a browser that purges one store is not a new device; the server never reads the cookie. With both stores
 * blocked it lives for this tab only.
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

/** The id, made on first use. The same answer for the life of the tab. */
export function deviceId(): string {
  if (current) return current;
  current = stored() ?? cookieStored() ?? crypto.randomUUID();
  keep(current);
  return current;
}
