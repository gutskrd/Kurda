/**
 * @react-navigation/native for component tests: `useNavigation` hands back a
 * recorder, `useFocusEffect` runs its effect once on mount, as a screen
 * coming into focus would, and `useScrollToTop` (a tab's list listening for
 * its tab to be tapped again) does nothing. Wired with
 * `vi.mock('@react-navigation/native', () => import('…/play/testing/navigation'))`.
 */
import { useEffect } from 'react';
import { vi } from 'vitest';

export const navigation = {
  navigate: vi.fn(),
  replace: vi.fn(),
  goBack: vi.fn(),
  setParams: vi.fn(),
};

export function useNavigation() {
  return navigation;
}

export function useFocusEffect(effect: () => void | (() => void)): void {
  useEffect(() => effect(), [effect]);
}

export function useScrollToTop(): void {}
