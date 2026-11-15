import { Platform } from 'react-native';
import { extensionStorage } from './appGroup';
import { WIDGET_KIND } from './contract';
import { reloadAndroidWidget } from './android/task';

/**
 * Asking the home-screen letter widget to show what is true now.
 *
 * Call it whenever what the widget shows may have changed: a letter came, the
 * widget's settings changed, somebody signed in or out. On iPhone it asks
 * WidgetKit for a new timeline — free while the app is open, which is when
 * this is called — and the extension asks the server itself. On Android the
 * widget is this app's own code, so the reload is the fetch and the drawing,
 * done here; two asked for at once become one, and one asked for while
 * another is under way runs once after it.
 *
 * It never throws and never waits: nothing the app does depends on the widget
 * having caught up.
 */

let lastAsked = 0;
let running: Promise<void> | null = null;
let again = false;

function runAndroid(): void {
  if (running) {
    again = true;
    return;
  }
  running = reloadAndroidWidget()
    .catch(() => undefined)
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        runAndroid();
      }
    });
}

/**
 * `unlessWithinMs`: skip it when the widget was asked that recently — for the
 * app coming back to the front, which can happen many times a minute and
 * brings nothing new most of them.
 */
export function reloadLetterWidget(opts: { unlessWithinMs?: number } = {}): void {
  const now = Date.now();
  if (opts.unlessWithinMs !== undefined && now - lastAsked < opts.unlessWithinMs) return;
  lastAsked = now;
  try {
    if (Platform.OS === 'ios') extensionStorage()?.reloadWidget(WIDGET_KIND);
    else if (Platform.OS === 'android') runAndroid();
  } catch {
    // a build without the widget: nothing to reload
  }
}

/** For tests: forget when the widget was last asked. */
export function resetReloadClock(): void {
  lastAsked = 0;
}
