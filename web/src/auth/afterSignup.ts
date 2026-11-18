/**
 * Where somebody was going when asked to make an account, such as a game invite, so they land there once their email
 * is confirmed. Kept in storage rather than navigation state, since the email link opens a new tab; kept for a day at
 * most and read once.
 */
import { joinLinkPath, parseJoinLink } from '@kurda/shared';

const KEY = 'hevalo.afterSignup';
const KEEP_MS = 24 * 60 * 60 * 1000;

/**
 * An in-app path only, never another origin, since any page linking here can write navigation state. A game invite
 * link (/join/<game>/<CODE>) also counts, rebuilt from what it says rather than passed through.
 */
export function safeFrom(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.startsWith('//') || /[\s\\]/.test(value)) return null;
  if (value.startsWith('/app')) return value;
  const q = value.indexOf('?');
  const invite = parseJoinLink(q < 0 ? value : value.slice(0, q), q < 0 ? '' : value.slice(q));
  return invite ? joinLinkPath(invite.game, invite.code, invite.from) : null;
}

export function rememberAfterSignup(from: unknown): void {
  const path = safeFrom(from);
  try {
    if (path) localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
    else localStorage.removeItem(KEY);
  } catch {
    // Nowhere to keep it: the account still works and starts at the first lesson.
  }
}

/** The remembered address, forgotten as it is read. */
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
