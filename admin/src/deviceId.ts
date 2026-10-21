/**
 * This browser's device id for the admin console, sent with every request as
 * `X-Device-Id`, as the website and the phone app send theirs.
 *
 * The API lists a signed-in device once however many times it signs in
 * (GET /me/sessions groups by it), and sign-in protection keys on it
 * (api/src/auth/known-devices.ts). Without one, every sign-in here was a new
 * unnamed device in the admin's own Settings.
 *
 * A random UUID, made once and kept in this origin's localStorage: it says
 * nothing about the browser or the person, only "the same browser as last
 * time". Where storage is blocked it lives for this tab only.
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

/** The id, made on first use. The same answer for the life of the tab. */
export function deviceId(): string {
  if (current) return current;
  current = stored() ?? crypto.randomUUID();
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // kept in memory for this tab
  }
  return current;
}
