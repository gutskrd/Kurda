import type { AppStateStatus } from 'react-native';

/**
 * Knowing when the app has really been away.
 *
 * Several things read the server again "when the app comes back to the
 * front": the badges' counts, the gift count, the event theme. They listened
 * for `active`, and iOS says `active` after every Control Centre swipe, every
 * notification pulled down and read in place, every Face ID prompt and every
 * glance at the app switcher — each of which only passes through `inactive`
 * while the app goes on running, with its realtime connection open and
 * hearing everything. Each of those asked the server for everything again,
 * half a dozen requests for a swipe.
 *
 * This says "back" only after the app has been in the background, which is
 * where the connection is closed (realtime/RealtimeProvider.tsx) and where
 * something could have been missed. Android has no `inactive`: leaving the
 * app is `background` there, so nothing changes for it.
 *
 * React Native's AppState is handed in rather than imported, so this stays
 * plain code a test can drive.
 */

interface AppStateLike {
  readonly currentState: AppStateStatus | string | null;
  addEventListener(type: 'change', listener: (state: AppStateStatus) => void): { remove(): void } | undefined;
}

/** Call `listener` each time the app is in front again after being in the background; answers the function that stops listening. */
export function onBackFromBackground(appState: AppStateLike, listener: () => void): () => void {
  // started in the background (woken by a notification): coming to the front is coming back
  let away = appState.currentState === 'background';
  const sub = appState.addEventListener('change', (state) => {
    if (state === 'background') away = true;
    else if (state === 'active' && away) {
      away = false;
      listener();
    }
  });
  // react-native-web hands back nothing where the page cannot say whether it is visible
  return () => sub?.remove();
}
