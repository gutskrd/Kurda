/**
 * A link opened before there was anywhere to take it: tapped while signed
 * out, or while the app was still asking for an email code or a birth month.
 *
 * The screens a link names (a profile, a post, a lesson) only exist once
 * somebody is signed in, so a link that arrived before then used to land on
 * the welcome screen and be forgotten — sign in, and you were on Home rather
 * than at the friend's profile you had been sent. It is kept here instead,
 * and opened once the app is reachable. Only the latest is kept, and it is
 * opened once.
 */
let held: string | null = null;

/** Keep `url` to open later, when it is one of the app's own addresses. */
export function holdLink(url: string | null | undefined, prefixes: readonly string[]): void {
  const path = url ? pathOf(url, prefixes) : null;
  if (path) held = path;
}

/** The kept link's path, once: a second call answers null. */
export function takeHeldLink(): string | null {
  const path = held;
  held = null;
  return path;
}

/**
 * The part of `url` after whichever of the app's prefixes it starts with, as
 * a path ("/app/users/u1"); null when it is not one of the app's addresses,
 * or is only the bare prefix (which names no screen).
 */
export function pathOf(url: string, prefixes: readonly string[]): string | null {
  const prefix = [...prefixes].sort((a, b) => b.length - a.length).find((p) => url.startsWith(p));
  if (prefix === undefined) return null;
  const rest = url.slice(prefix.length).replace(/^\/+/, '');
  return rest ? `/${rest}` : null;
}
