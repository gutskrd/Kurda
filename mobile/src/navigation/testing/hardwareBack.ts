/**
 * `useHardwareBack` for component tests: the screen's way out for Android's
 * back is kept here, and `pressBack()` presses back as the phone would —
 * true when the screen took it, false when back would have left the screen.
 * Wired with `vi.mock('…/navigation/hardwareBack', () => import('…/navigation/testing/hardwareBack'))`.
 */
let current: (() => void) | null = null;

export function useHardwareBack(onBack: (() => void) | null): void {
  current = onBack;
}

export function pressBack(): boolean {
  if (!current) return false;
  current();
  return true;
}

/** Forget the screen of the test before. */
export function resetHardwareBack(): void {
  current = null;
}
