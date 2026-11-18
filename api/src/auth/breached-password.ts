import { createHash } from 'node:crypto';

/** The range API of the public breached-password corpus. */
export const BREACH_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
/** A sign-up never waits longer than this for the answer. */
export const BREACH_CHECK_TIMEOUT_MS = 1_500;

type FetchLike = typeof fetch;

/**
 * Whether a password appears in the public breached-password corpus, the first list attackers try.
 *
 * k-anonymity: only the first five hex characters of the SHA-1 leave the server; the corpus returns every suffix under
 * that prefix (padded with decoys via `Add-Padding`) and the match is made here.
 *
 * Fails open: a late, refused or unreadable answer counts as "not breached", so an outage never blocks sign-up.
 */
export async function isBreachedPassword(
  password: string,
  opts: { fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<boolean> {
  const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  try {
    const res = await (opts.fetch ?? fetch)(`${BREACH_RANGE_URL}${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? BREACH_CHECK_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [hashSuffix, count] = line.trim().split(':');
      // padding entries carry a count of 0: they are decoys, not breaches
      if (hashSuffix === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Whether the check runs: as configured, and by default everywhere but under test. */
export function breachCheckEnabled(config: { PASSWORD_BREACH_CHECK?: 'true' | 'false'; NODE_ENV: string }): boolean {
  if (config.PASSWORD_BREACH_CHECK !== undefined) return config.PASSWORD_BREACH_CHECK === 'true';
  return config.NODE_ENV !== 'test';
}
