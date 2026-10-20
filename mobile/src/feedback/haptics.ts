import { AppState, Platform } from 'react-native';
import { createPacer, type HapticEvent } from './hapticPacing';
import { loadVibrationPref, vibrationOn } from './vibrationPref';

export type { HapticEvent } from './hapticPacing';

/**
 * The phone's buzzes, by what they mean.
 *
 * Screens say what happened — `haptic('correct')`, `haptic('celebrate')` — and
 * never how it should feel; the feel of each is decided here, once:
 *
 *   select     the lightest tick there is: a segmented control, a filter
 *              chip, a picker or a switch changing its value
 *   tap        a light knock: something sent or given — a message, a like,
 *              a reaction, a friend request, a game started, a refresh
 *   correct    light and crisp: a right answer
 *   wrong      a gentle double (the system's "warning"): a wrong answer. Never
 *              the harsh error pattern — the person getting it wrong is often
 *              a child learning, and a miss is part of learning
 *   celebrate  the system's "success", once: a lesson finished, a goal met, a
 *              streak kept, a new level, rank, league or badge, a gift opened
 *   error      the system's "error": something the person asked for failed
 *              and is in their way (a purchase, a message that did not send).
 *              Not for a field that is still being typed in
 *
 * Nothing else buzzes: not scrolling, typing, every button, the tab bar,
 * opening a screen, a message or notification arriving, a timer, or anything
 * that happens by itself. A buzz that nobody caused is a buzz pulling at them.
 *
 * And a buzz is dropped when it would come too soon after another, or too
 * many together (`hapticPacing.ts`), while the app is in the background, or
 * when Settings → Vibration is off.
 *
 * Where the native module is not there — the web build, a test, a binary built
 * before it was added — every call is a quiet no-op.
 */

type Driver = (event: HapticEvent) => void;

interface ExpoHaptics {
  selectionAsync(): Promise<void>;
  impactAsync(style: string): Promise<void>;
  notificationAsync(type: string): Promise<void>;
  performAndroidHapticsAsync(type: string): Promise<void>;
}

let module: ExpoHaptics | null | undefined;
function expoHaptics(): ExpoHaptics | null {
  if (module !== undefined) return module;
  module = null;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return module;
  try {
    // required here rather than imported: the web bundle and the tests must
    // never evaluate a native module, and an old binary simply has none
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module = require('expo-haptics') as ExpoHaptics;
  } catch {
    module = null;
  }
  return module;
}

/** A promise from the native side that may reject (no module in this binary, a type this Android lacks). */
function quietly(run: () => Promise<void> | undefined, fallback?: () => Promise<void> | undefined): void {
  try {
    const p = run();
    p?.catch(() => {
      try {
        fallback?.()?.catch(() => undefined);
      } catch {
        // nothing to feel, and nothing worth saying about it
      }
    });
  } catch {
    // as above
  }
}

/**
 * On Android the light ones go through the view's own haptic feedback rather
 * than the vibration motor: it is crisper, it is what the system's own
 * controls use, and it follows the phone's "touch feedback" setting. The
 * notification patterns are the same on both platforms.
 */
const nativeDriver: Driver = (event) => {
  const h = expoHaptics();
  if (!h) return;
  const android = Platform.OS === 'android';
  switch (event) {
    case 'select':
      return android ? quietly(() => h.performAndroidHapticsAsync('clock-tick')) : quietly(() => h.selectionAsync());
    case 'tap':
      return android ? quietly(() => h.performAndroidHapticsAsync('virtual-key')) : quietly(() => h.impactAsync('light'));
    case 'correct':
      // "confirm" is Android 11 and later; before that, the plain key click
      return android
        ? quietly(() => h.performAndroidHapticsAsync('confirm'), () => h.performAndroidHapticsAsync('virtual-key'))
        : quietly(() => h.impactAsync('rigid'));
    case 'wrong':
      return quietly(() => h.notificationAsync('warning'));
    case 'celebrate':
      return quietly(() => h.notificationAsync('success'));
    case 'error':
      return quietly(() => h.notificationAsync('error'));
  }
};

let driver: Driver = nativeDriver;
const pacer = createPacer();
const listeners = new Set<(event: HapticEvent) => void>();
let started = false;

function start(): void {
  if (started) return;
  started = true;
  void loadVibrationPref().catch(() => undefined);
}

function inForeground(): boolean {
  // unknown (very early, or a platform that does not say) counts as in front
  const state = AppState.currentState as string | null | undefined;
  return state == null || state === 'active' || state === 'unknown';
}

// read the stored switch as the app starts (any screen that can buzz imports this),
// so the first buzz of the day already knows whether it is wanted
start();

/** Feel `event`, if it may be felt now. */
export function haptic(event: HapticEvent): void {
  start();
  if (!vibrationOn() || !inForeground()) return;
  if (!pacer.allow(event, Date.now())) return;
  for (const l of listeners) l(event);
  driver(event);
}

/** Told of every buzz that was felt (after the rules above) — for tests, and nothing else. */
export function onHaptic(listener: (event: HapticEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Swap what a buzz does, and forget the pacing so far; returns a function that puts it back. For tests. */
export function setHapticDriver(next: Driver | null): () => void {
  const before = driver;
  driver = next ?? nativeDriver;
  pacer.reset();
  return () => {
    driver = before;
    pacer.reset();
  };
}

/** Forget the pacing so far — between tests, which each start with a quiet phone. */
export function resetHaptics(): void {
  pacer.reset();
}

/**
 * A pull-to-refresh's `onRefresh`, felt: the list was pulled past the point
 * where it lets go and reloads — the person's own gesture, answered once.
 */
export function refreshFelt(refresh: () => void): () => void {
  return () => {
    haptic('tap');
    refresh();
  };
}
