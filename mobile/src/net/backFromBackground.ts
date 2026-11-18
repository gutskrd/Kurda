import type { AppStateStatus } from 'react-native';

/**
 * Says when the app is in front again after being in the background, the only
 * time something could have been missed: iOS also reports `active` after every
 * Control Centre swipe or Face ID prompt, while the app runs on with its
 * realtime connection open, and asking the server again then is waste.
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
