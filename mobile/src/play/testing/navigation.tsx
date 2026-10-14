/**
 * @react-navigation/native for component tests: `useNavigation` hands back a
 * recorder, and `useFocusEffect` runs its effect once on mount, as a screen
 * coming into focus would. Wired with
 * `vi.mock('@react-navigation/native', () => import('…/play/testing/navigation'))`.
 */
import { useEffect } from 'react';
import { vi } from 'vitest';

export const navigation = {
  navigate: vi.fn(),
  replace: vi.fn(),
  goBack: vi.fn(),
};

export function useNavigation() {
  return navigation;
}

export function useFocusEffect(effect: () => void | (() => void)): void {
  useEffect(() => effect(), [effect]);
}
