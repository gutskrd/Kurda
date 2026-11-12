/**
 * @react-navigation/native for component tests: `useNavigation` hands back a
 * recorder, `useFocusEffect` runs its effect once on mount, as a screen
 * coming into focus would — and again each time a test says the screen was
 * come back to (`refocus()`, inside `act`) — and `useScrollToTop` (a tab's
 * list listening for its tab to be tapped again) does nothing. A screen that keeps itself
 * (`usePreventRemove`) is held as the navigator holds it: `backOut()` goes
 * back the way the header's back would, handing the screen the action while
 * it keeps itself and leaving (`navigation.goBack`) when it does not; the
 * screen lets the action through with `navigation.dispatch`. Wired with
 * `vi.mock('@react-navigation/native', () => import('…/play/testing/navigation'))`.
 */
import { useEffect, useLayoutEffect, useState } from 'react';
import { vi } from 'vitest';

export const navigation = {
  navigate: vi.fn(),
  replace: vi.fn(),
  popTo: vi.fn(),
  goBack: vi.fn(),
  setParams: vi.fn(),
  dispatch: vi.fn(),
};

export function useNavigation() {
  return navigation;
}

/** Every screen under test that listens for its focus: each is told when a test comes back to it. */
const focused = new Set<() => void>();

export function useFocusEffect(effect: () => void | (() => void)): void {
  const [round, setRound] = useState(0);
  useEffect(() => {
    const again = (): void => setRound((n) => n + 1);
    focused.add(again);
    return () => {
      focused.delete(again);
    };
  }, []);
  // left and come back to: the effect's cleanup runs, then the effect again, as blur and focus do
  useEffect(() => effect(), [effect, round]);
}

/** The screen was left and come back to — from a post, another tab: its focus effects run again. Call inside `act`. */
export function refocus(): void {
  focused.forEach((again) => again());
}

/** A screen under test is the one in front, so whatever moves while it is in view moves. */
export function useIsFocused(): boolean {
  return true;
}

export function useScrollToTop(): void {}

type Ask = (e: { data: { action: { type: string } } }) => void;
const held: { prevent: boolean; ask: Ask | null } = { prevent: false, ask: null };

export function usePreventRemove(prevent: boolean, ask: Ask): void {
  // held as the screen is drawn, so a press that follows a screen appearing finds it held
  useLayoutEffect(() => {
    held.prevent = prevent;
    held.ask = ask;
    return () => {
      held.prevent = false;
      held.ask = null;
    };
  });
}

/** Back, as the navigator takes it: to the screen while it keeps itself, else away (`navigation.goBack`). */
export function backOut(): void {
  if (held.prevent && held.ask) held.ask({ data: { action: { type: 'GO_BACK' } } });
  else navigation.goBack();
}
