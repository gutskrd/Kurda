import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { ApiClient } from '../api/client';

/** The window the server treats as "recently seen"; the browser beats at this too. */
const BEAT_MS = 60_000;

/**
 * Tell the server somebody is here (KUR-091).
 *
 * Two things hang off this one call, and the phone made neither of them:
 *
 * Friends see you as online. The server derives that from the last beat inside
 * a short window, so an app that never beats is an app whose users are always
 * offline — the browser could say "Currently Online" about somebody and the
 * phone could not say it about anybody.
 *
 * And it writes one row per user per day into `user_activity_days`, which is
 * the only thing that writes it and is what the analytics dashboard counts for
 * DAU, WAU, MAU and the retention cohorts. Every phone user has been invisible
 * to those numbers.
 *
 * It beats only while the app is in front of you. A timer that kept running in
 * the background would claim you were online while the phone was in a pocket,
 * which is worse than saying nothing — and iOS suspends the timer anyway, so
 * the honest version is the one that also works. Coming back to the app beats
 * immediately rather than waiting out the interval.
 */
export function useHeartbeat(client: ApiClient, signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn) return;

    const beat = (): void => {
      void client.post('/me/heartbeat');
    };

    beat();
    let interval = setInterval(beat, BEAT_MS);

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      clearInterval(interval);
      if (state === 'active') {
        beat();
        interval = setInterval(beat, BEAT_MS);
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [client, signedIn]);
}
