import { AppState, Platform } from 'react-native';
import { createPacer, type HapticEvent } from './hapticPacing';
import { loadVibrationPref, vibrationOn } from './vibrationPref';

export type { HapticEvent } from './hapticPacing';

/**
 * The phone's haptics, by meaning. Screens say what happened (`haptic('correct')`, `haptic('celebrate')`), and
 * the feel is decided here by what each system generator means:
 *
 *   select     selection tick: a choice changing (segmented control, chip, radio, picker, stepper, switch, tab)
 *   tap        light impact: something landing or sent (a sheet settling, a hold that took, a refresh pulled on
 *              Android, a bird landing on the letters sill when its flight was shown, a message, post, like, reaction,
 *              friend request, game started, purchase, the day's Zêr claimed)
 *   correct    system "success": a right answer, an outcome
 *   wrong      system "warning": a wrong answer; never the harsh error pattern, since learners, often children, miss
 *              as part of learning
 *   celebrate  system "success", once: a lesson finished, a goal met, a streak kept, a new level, rank, league or
 *              badge, a gift opened
 *   error      system "error": something the person asked for failed and is in their way (a purchase, an unsent
 *              message or post); not for a field still being typed in
 *
 * Each accompanies a visible change. Nothing else buzzes: scrolling, typing, opening something, arrivals, timers,
 * or anything that happens by itself. A buzz is also dropped when too soon after another or too many at once
 * (`hapticPacing.ts`), while backgrounded, or when Settings → Vibration is off. Without the native module (web,
 * tests, an older binary) every call is a no-op.
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
    // Required rather than imported: the web bundle and tests must never evaluate a native module, and an old
    // binary has none.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module = require('expo-haptics') as ExpoHaptics;
  } catch {
    module = null;
  }
  return module;
}

/** A native promise that may reject (no module in this binary, or a type this Android lacks). */
function quietly(run: () => Promise<void> | undefined, fallback?: () => Promise<void> | undefined): void {
  try {
    const p = run();
    p?.catch(() => {
      try {
        fallback?.()?.catch(() => undefined);
      } catch {
        // Nothing to feel, and nothing worth saying about it.
      }
    });
  } catch {
    // as above
  }
}

/**
 * On Android the light ones use the view's haptic feedback rather than the vibration motor: it is crisper,
 * matches the system controls and follows the "touch feedback" setting. Notification patterns are the same on
 * both platforms.
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
      // "confirm" is Android 11 and later; before that, the plain key click.
      return android
        ? quietly(() => h.performAndroidHapticsAsync('confirm'), () => h.performAndroidHapticsAsync('virtual-key'))
        : quietly(() => h.notificationAsync('success'));
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
  // Unknown (very early, or a platform that does not say) counts as in front.
  const state = AppState.currentState as string | null | undefined;
  return state == null || state === 'active' || state === 'unknown';
}

// Read the stored switch at startup (any screen that can buzz imports this), so the first buzz already knows.
start();

/** Feel `event`, if it may be felt now. */
export function haptic(event: HapticEvent): void {
  start();
  if (!vibrationOn() || !inForeground()) return;
  if (!pacer.allow(event, Date.now())) return;
  for (const l of listeners) l(event);
  driver(event);
}

/** Notified of every buzz that was felt, after the rules above; for tests only. */
export function onHaptic(listener: (event: HapticEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replace what a buzz does and reset the pacing; returns a function that restores it. For tests. */
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
 * A pull-to-refresh `onRefresh` with a haptic when the list is pulled past its release point. Not on iOS, whose
 * refresh control already ticks there; Android's is silent, so the tick is ours.
 */
export function refreshFelt(refresh: () => void): () => void {
  return () => {
    if (Platform.OS !== 'ios') haptic('tap');
    refresh();
  };
}
