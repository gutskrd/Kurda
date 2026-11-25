import { useCallback, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { describeError, isMaintenance } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { readFamily, type FamilyOverview } from './api';

/**
 * The caller's family (GET /me/family), shared by the Settings home's row, the family pages and the account's delete
 * warning, kept per account so a page shows its last answer at once, and read again whenever one comes into view.
 */
let kept: { userId: string; overview: FamilyOverview } | null = null;
const listeners = new Set<() => void>();

function changed(): void {
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => kept;

/** Put a fresh answer in place after a change made on this phone. */
export function keepFamily(userId: string, overview: FamilyOverview): void {
  kept = { userId, overview };
  changed();
}

/** Forget the kept answer (tests, and a change that makes it stale before the next read). */
export function forgetFamily(): void {
  kept = null;
  changed();
}

/** The family last read for the signed-in account, without asking again: for places outside the pages, such as the delete warning. */
export function useKeptFamily(): FamilyOverview | null {
  const { user } = useAuth();
  const store = useSyncExternalStore(subscribe, snapshot, snapshot);
  return store && store.userId === user?.id ? store.overview : null;
}

export interface FamilyState {
  overview: FamilyOverview | null;
  failed: string | null;
  reload: () => void;
}

export function useFamily(enabled = true): FamilyState {
  const { client, user } = useAuth();
  const { t } = useI18n();
  const userId = user?.id ?? '';
  const store = useSyncExternalStore(subscribe, snapshot, snapshot);
  const overview = store && store.userId === userId ? store.overview : null;
  const [failed, setFailed] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !userId) return;
      let live = true;
      void readFamily(client).then((res) => {
        if (!live) return;
        if (!res.ok) {
          if (!isMaintenance(res.error)) setFailed(describeError(res.error, t));
          return;
        }
        setFailed(null);
        keepFamily(userId, res.data);
      });
      return () => {
        live = false;
      };
      // `round` is Try again.
    }, [client, enabled, userId, t, round]),
  );

  const reload = useCallback(() => setRound((r) => r + 1), []);
  return { overview, failed, reload };
}
