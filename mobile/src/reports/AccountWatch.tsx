import { useCallback, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { ACCOUNT_CHANGED } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { pushSupported } from '../push/device';
import { useUserEvents } from '../realtime/useUserEvents';

/** Notices of a limit on the account given or lifted. */
const DECISIONS: ReadonlySet<unknown> = new Set(['sanction', 'sanction_lifted']);

/**
 * Reads the account again when a limit on it is given or lifted, so a lifted hold clears its notice at once: on the
 * realtime ping, and on a push of such a decision arriving while the app is open, for when the connection missed it.
 * The browser does the same (web/src/reports/AccountWatch.tsx).
 */
export function AccountWatch(): null {
  const { status, refreshUser } = useAuth();
  // The provider makes a new function each render; the latest is called, so nothing resubscribes.
  const reread = useRef(refreshUser);
  reread.current = refreshUser;
  const signedIn = status === 'signedIn';
  const again = useCallback(() => {
    if (signedIn) void reread.current();
  }, [signedIn]);

  useUserEvents(useCallback((event) => event.type === ACCOUNT_CHANGED && again(), [again]));

  useEffect(() => {
    if (!pushSupported()) return;
    const sub = Notifications.addNotificationReceivedListener((n) => {
      if (DECISIONS.has((n.request.content.data as { kind?: unknown } | null)?.kind)) again();
    });
    return () => sub.remove();
  }, [again]);
  return null;
}
