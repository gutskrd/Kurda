import type { AppStateStatus } from 'react-native';

/**
 * Reports when the app returns to the foreground from the background, the only time something could have been
 * missed. iOS also reports `active` after every Control Centre swipe or Face ID prompt while the app keeps
 * running with its realtime connection open, and refetching then is waste.
 */

interface AppStateLike {
  readonly currentState: AppStateStatus | string | null;
  addEventListener(type: 'change', listener: (state: AppStateStatus) => void): { remove(): void } | undefined;
}

/** Call `listener` each time the app returns from the background; returns a function that stops listening. */
export function onBackFromBackground(appState: AppStateLike, listener: () => void): () => void {
  // Started in the background (woken by a notification), so coming to the foreground counts as coming back.
  let away = appState.currentState === 'background';
  const sub = appState.addEventListener('change', (state) => {
    if (state === 'background') away = true;
    else if (state === 'active' && away) {
      away = false;
      listener();
    }
  });
  // react-native-web returns no subscription where the page cannot report its visibility.
  return () => sub?.remove();
}
