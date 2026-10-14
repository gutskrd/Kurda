import { isReportCategory, type MutedErrorDetails, type SuspendedErrorDetails } from '@kurda/shared';

/**
 * The details of a 403 ACCOUNT_SUSPENDED, when they are really there.
 *
 * Sign-in, refresh and social sign-in answer a suspended or banned account with
 * the statement of reasons and an appeal token (shared `SuspendedErrorDetails`).
 * Read defensively: an older server, or a proxy's own 403, sends something
 * else, and a suspension screen with no token to ask for a review with would be
 * a dead end — then the plain message is the better answer.
 */
export function suspendedDetails(details: unknown): SuspendedErrorDetails | null {
  if (typeof details !== 'object' || details === null) return null;
  const d = details as Partial<SuspendedErrorDetails>;
  if (typeof d.appealToken !== 'string' || d.appealToken.length === 0) return null;
  if (typeof d.statement !== 'string') return null;
  return {
    until: typeof d.until === 'string' ? d.until : null,
    // a rule this build has no words for is left out, rather than shown as a key
    policy: isReportCategory(d.policy) ? d.policy : null,
    statement: d.statement,
    appealable: d.appealable === true,
    appealToken: d.appealToken,
  };
}

/** The details of a 403 MUTED, or null when the refusal carried none (a group's own mute). */
export function mutedDetails(details: unknown): MutedErrorDetails | null {
  if (typeof details !== 'object' || details === null) return null;
  const d = details as Partial<MutedErrorDetails>;
  if (d.scope !== 'chat' && d.scope !== 'post' && d.scope !== 'media') return null;
  return { scope: d.scope, until: typeof d.until === 'string' ? d.until : null };
}
