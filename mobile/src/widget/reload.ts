import { Platform } from 'react-native';
import { extensionStorage } from './appGroup';
import { WIDGET_KIND } from './contract';
import { reloadAndroidWidget } from './android/task';

/**
 * Ask the home-screen letter widget to show what is true now, whenever that may have changed: a letter arrived,
 * the widget settings changed, someone signed in or out. On iPhone this asks WidgetKit for a new timeline (free
 * while the app is open) and the extension fetches by itself. On Android the widget is this app's code, so the
 * reload is the fetch and the drawing, done here; concurrent requests coalesce, and one made during another runs
 * once after it. It never throws or waits: nothing in the app depends on the widget having caught up.
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

/** `unlessWithinMs`: skip if the widget was asked this recently, for foregrounding, which can happen many times a minute. */
export function reloadLetterWidget(opts: { unlessWithinMs?: number } = {}): void {
  const now = Date.now();
  if (opts.unlessWithinMs !== undefined && now - lastAsked < opts.unlessWithinMs) return;
  lastAsked = now;
  try {
    if (Platform.OS === 'ios') extensionStorage()?.reloadWidget(WIDGET_KIND);
    else if (Platform.OS === 'android') runAndroid();
  } catch {
    // A build without the widget: nothing to reload.
  }
}

/** For tests: forget when the widget was last asked. */
export function resetReloadClock(): void {
  lastAsked = 0;
}
