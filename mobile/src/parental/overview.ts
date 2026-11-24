import { useCallback, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { describeError, isMaintenance } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { readParental, type ParentalOverview } from './api';
import { useSupervision } from './supervision';

/**
 * Which side of parental controls the account is on (GET /me/parental), shared by the Settings home's row and the
 * parental pages, and kept per account so the row shows its last answer at once rather than changing under the eye.
 * Read again whenever one of them comes into view; a teen's answer also refreshes the app's supervision.
 */
let kept: { userId: string; overview: ParentalOverview } | null = null;
const listeners = new Set<() => void>();

function keep(userId: string, overview: ParentalOverview): void {
  kept = { userId, overview };
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => kept;

/** Forget the kept answer (tests, and a change that makes it stale before the next read). */
export function forgetParentalOverview(): void {
  kept = null;
  for (const l of [...listeners]) l();
}

export interface ParentalOverviewState {
  overview: ParentalOverview | null;
  /** What went wrong reading it, until the next try. */
  failed: string | null;
  reload: () => void;
}

export function useParentalOverview(enabled = true): ParentalOverviewState {
  const { client, user } = useAuth();
  const { t } = useI18n();
  const { take } = useSupervision();
  const userId = user?.id ?? '';
  const store = useSyncExternalStore(subscribe, snapshot, snapshot);
  const overview = store && store.userId === userId ? store.overview : null;
  const [failed, setFailed] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !userId) return;
      let live = true;
      void readParental(client).then((res) => {
        if (!live) return;
        if (!res.ok) {
          if (!isMaintenance(res.error)) setFailed(describeError(res.error, t));
          return;
        }
        setFailed(null);
        keep(userId, res.data);
        if (res.data.role === 'teen') take(res.data.supervision ?? null);
      });
      return () => {
        live = false;
      };
      // `round` is Try again.
    }, [client, enabled, userId, t, take, round]),
  );

  const reload = useCallback(() => setRound((r) => r + 1), []);
  return { overview, failed, reload };
}

/** Put a fresh answer in place after a change made on this phone (connecting, disconnecting, stopping). */
export function keepParentalOverview(userId: string, overview: ParentalOverview): void {
  keep(userId, overview);
}
