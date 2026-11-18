import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { ApiClient } from '../api/client';

/** Well inside the server's five-minute online window (social/presence.ts); the website beats at the same pace. */
const BEAT_MS = 120_000;

/**
 * Tell the server somebody is here. Friends see you as online from the last beat, and the server records one active day
 * per user from it, which the activity counts are built on.
 *
 * It beats only while the app is in front: a background timer would claim you were online with the phone in a pocket,
 * and iOS suspends it anyway. Returning to the app beats at once.
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
