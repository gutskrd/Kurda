/**
 * `useHardwareBack` for component tests: the screen's way out for Android's
 * back is kept here, and `pressBack()` presses back as the phone would —
 * true when the screen took it, false when back would have left the screen.
 * Wired with `vi.mock('…/navigation/hardwareBack', () => import('…/navigation/testing/hardwareBack'))`.
 */
let current: (() => void) | null = null;
let swipeOff = false;

export function useHardwareBack(onBack: (() => void) | null): void {
  current = onBack;
}

/** As `useHardwareBack`, and the iOS swipe is off while the screen asks. */
export function useGameBack(onBack: (() => void) | null): void {
  current = onBack;
  swipeOff = onBack !== null;
}

/** Whether the screen has the iOS swipe from the edge turned off. */
export function swipeHeld(): boolean {
  return swipeOff;
}

export function pressBack(): boolean {
  if (!current) return false;
  current();
  return true;
}

/** Forget the screen of the test before. */
export function resetHardwareBack(): void {
  current = null;
  swipeOff = false;
}
