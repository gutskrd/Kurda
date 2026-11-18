/**
 * A link opened before the signed-in screens exist (while signed out, or while an email code or birth month is still
 * asked for). It is kept here and opened once the app can reach it; only the latest is kept, and it opens once.
 */
let held: string | null = null;

/**
 * Which links are held: `launch` while signed out, including the one that started the app; `later` while an email code
 * or birth month is asked for, when the launch link is already in the navigation's start; `none` once signed in.
 */
export type LinkHolding = 'launch' | 'later' | 'none';

export function linkHolding(
  status: 'restoring' | 'signedOut' | 'signedIn',
  user: { emailVerified: boolean; birthDateRequired?: boolean } | null,
): LinkHolding {
  if (status === 'signedOut') return 'launch';
  if (status === 'signedIn' && user && (!user.emailVerified || user.birthDateRequired === true)) return 'later';
  return 'none';
}

/**
 * Whether the link that started the app is kept: only by the first screens after the session is read, and only when
 * signed out, so a later sign-out does not reopen it at the next sign-in.
 */
export function launchLinkKeeper(): (holding: LinkHolding) => boolean {
  let first = true;
  return (holding) => {
    const keep = first && holding === 'launch';
    first = false;
    return keep;
  };
}

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
 * The part of `url` after the longest matching app prefix, as a path ("/app/users/u1"); null when it is not an app
 * address or is only the bare prefix.
 */
export function pathOf(url: string, prefixes: readonly string[]): string | null {
  const prefix = [...prefixes].sort((a, b) => b.length - a.length).find((p) => url.startsWith(p));
  if (prefix === undefined) return null;
  const rest = url.slice(prefix.length).replace(/^\/+/, '');
  return rest ? `/${rest}` : null;
}
