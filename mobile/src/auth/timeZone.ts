/**
 * The learner's own time zone, told to the server.
 *
 * Every day Hevalo counts is the learner's own day: the streak, the daily
 * quests, the word of the day, a reminder's hour and the quiet hours are all
 * worked out by the server in the time zone it has for the account, which is
 * UTC until it is told otherwise. Without this a lesson done at one in the
 * morning in Hewlêr counted for the day before, and quiet hours set for the
 * night fell three hours late.
 *
 * So the device's zone goes with a sign-up and with "Try Hevalo first", and
 * an account whose zone differs from the device's is brought up to it when
 * the app opens or comes back to the front (someone who has travelled). The
 * server allows one change a week, so a streak cannot be farmed by hopping
 * zones; that refusal is kept until the app next starts, and never shown.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { ApiClient } from '../api/client';

/** The longest zone name the server takes. */
const MAX_LENGTH = 50;

/** The device's IANA time zone (`Europe/Berlin`), or null where the phone cannot say. */
export function deviceTimeZone(): string | null {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone.length > 0 && zone.length <= MAX_LENGTH ? zone : null;
  } catch {
    return null;
  }
}

/**
 * The zone to send, or null when there is nothing to send: the device cannot
 * say, or the server's is already the device's. A server that does not say
 * which zone it has (an older one) is left alone rather than written to on
 * every start.
 */
export function zoneToSend(server: string | null | undefined, device: string | null): string | null {
  if (!device || typeof server !== 'string') return null;
  return server === device ? null : device;
}

/**
 * Keeps the account's zone the device's while signed in: once on the way in
 * and each time the app comes back to the front. `onChanged` is told the zone
 * the server took, so the session holds it too.
 */
export function useTimeZoneSync(client: ApiClient, serverZone: string | null | undefined, active: boolean, onChanged: (zone: string) => void): void {
  useEffect(() => {
    if (!active) return;
    // asking, or told no for this week: not asked again until the app starts afresh
    let held = false;
    const sync = (): void => {
      const zone = zoneToSend(serverZone, deviceTimeZone());
      if (!zone || held) return;
      held = true;
      void client.patch<{ user: { timezone?: string } }>('/me', { timezone: zone }).then((res) => {
        if (res.ok) {
          if (res.data.user?.timezone === zone) onChanged(zone);
          return;
        }
        // changed once this week already: the server's limit, kept quietly; anything else (offline) is asked again
        if (res.error.code !== 'TIMEZONE_CHANGE_COOLDOWN') held = false;
      });
    };
    sync();
    const front = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => front.remove();
  }, [client, serverZone, active, onChanged]);
}
