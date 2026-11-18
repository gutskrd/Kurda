/**
 * @react-navigation/native for component tests. `useNavigation` returns a recorder; `useFocusEffect` runs on mount
 * and again on `refocus()` (a tab switch) or `backFromPage()` (a page pushed over the tabs and closed), inside
 * `act`; `useScrollToTop` does nothing. A screen using `usePreventRemove` is held as the navigator holds it:
 * `backOut()` hands it the action while it prevents removal, else goes back. Wire it with
 * `vi.mock('@react-navigation/native', () => import('…/play/testing/navigation'))`.
 */
import { useEffect, useLayoutEffect, useState } from 'react';
import { vi } from 'vitest';

/** Told when a page is pushed over the tabs, as the tabs' own screen blurs then. */
const tabsBlurred = new Set<() => void>();
const tabs = {
  addListener(type: string, listener: () => void): () => void {
    if (type !== 'blur') return () => undefined;
    tabsBlurred.add(listener);
    return () => {
      tabsBlurred.delete(listener);
    };
  },
};

export const navigation = {
  navigate: vi.fn(),
  replace: vi.fn(),
  popTo: vi.fn(),
  goBack: vi.fn(),
  setParams: vi.fn(),
  setOptions: vi.fn(),
  dispatch: vi.fn(),
  getParent: () => tabs,
};

export function useNavigation() {
  return navigation;
}

/** Every screen under test with a focus effect, each told when a test returns to it. */
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
  // Left and returned to: the cleanup runs, then the effect again, as blur and focus do.
  useEffect(() => effect(), [effect, round]);
}

/** Simulates leaving the screen and coming back, so its focus effects run again. Call inside `act`. */
export function refocus(): void {
  focused.forEach((again) => again());
}

/** Simulates a page pushed over the tabs and closed again: the tabs blur, then the screen comes back. Call inside `act`. */
export function backFromPage(): void {
  tabsBlurred.forEach((blur) => blur());
  refocus();
}

/** The screen under test is always in front. */
export function useIsFocused(): boolean {
  return true;
}

export function useScrollToTop(): void {}

type Ask = (e: { data: { action: { type: string } } }) => void;
const held: { prevent: boolean; ask: Ask | null } = { prevent: false, ask: null };

export function usePreventRemove(prevent: boolean, ask: Ask): void {
  // Held from the first layout, so a press right after the screen appears finds it held.
  useLayoutEffect(() => {
    held.prevent = prevent;
    held.ask = ask;
    return () => {
      held.prevent = false;
      held.ask = null;
    };
  });
}

/** Back, as the navigator takes it: to the screen while it prevents removal, else away (`navigation.goBack`). */
export function backOut(): void {
  if (held.prevent && held.ask) held.ask({ data: { action: { type: 'GO_BACK' } } });
  else navigation.goBack();
}
