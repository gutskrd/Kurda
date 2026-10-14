/**
 * Where somebody was going when they were asked to make an account — a
 * friend's game invite, a story's quiz — so that, once the account exists and
 * its email is confirmed, they land there rather than on the first lesson.
 *
 * Remembered on the device rather than carried in the navigation state: the
 * confirmation link in the email opens a new tab, which has no state, and the
 * code typed in this tab arrives after two redirects that do not pass it on.
 * Kept for a day at most, and read once.
 */
const KEY = 'hevalo.afterSignup';
const KEEP_MS = 24 * 60 * 60 * 1000;

/**
 * An in-app address only: a path in this app, never another origin. Navigation
 * state can be written by any page that links here, so it is checked rather
 * than trusted.
 */
export function safeFrom(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/app') || value.startsWith('//')) return null;
  if (/[\s\\]/.test(value)) return null;
  return value;
}

export function rememberAfterSignup(from: unknown): void {
  const path = safeFrom(from);
  try {
    if (path) localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
    else localStorage.removeItem(KEY);
  } catch {
    // nowhere to keep it: the account still works, it just starts at the first lesson
  }
}

/** The remembered address, once: it is forgotten as it is read. */
export function takeAfterSignup(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return null;
    const { path, at } = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof at !== 'number' || Date.now() - at > KEEP_MS) return null;
    return safeFrom(path);
  } catch {
    return null;
  }
}
