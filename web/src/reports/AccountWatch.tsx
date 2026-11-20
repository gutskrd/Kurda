import { useCallback, useEffect, useRef } from 'react';
import { ACCOUNT_CHANGED } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import { useRail } from '../social/RailProvider';

/** Notices of a limit on the account given or lifted. */
const DECISIONS: ReadonlySet<unknown> = new Set(['sanction', 'sanction_lifted']);

/**
 * Reads the account again when a limit on it is given or lifted, so a lifted hold clears its notice at once: on the
 * realtime ping, and on a new notice of such a decision, for when the connection missed the ping.
 */
export function AccountWatch(): null {
  const { status, refreshUser } = useAuth();
  const { data } = useRail();
  // The provider makes a new function each render; the latest is called, so nothing resubscribes.
  const reread = useRef(refreshUser);
  reread.current = refreshUser;
  const signedIn = status === 'signedIn';
  const again = useCallback(() => {
    if (signedIn) void reread.current();
  }, [signedIn]);
  useRealtimeEvent(ACCOUNT_CHANGED, again);

  const seen = useRef(new Set<string>());
  useEffect(() => {
    const fresh = data.notifications.filter((n) => n.readAt === null && DECISIONS.has(n.data?.kind) && !seen.current.has(n.id));
    for (const n of fresh) seen.current.add(n.id);
    if (fresh.length > 0) again();
  }, [data, again]);
  return null;
}
