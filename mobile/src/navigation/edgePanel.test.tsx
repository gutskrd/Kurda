// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
import { cleanup, renderHook } from '@testing-library/react';
import { useCloseOnBlur } from './edgePanel';

afterEach(cleanup);

/** A screen's navigation as far as its blur goes: `blur()` is another page pushed over it. */
function screenNavigation() {
  const listeners = new Set<() => void>();
  return {
    addListener: (_type: 'blur', listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    blur: () => listeners.forEach((l) => l()),
    listening: () => listeners.size,
  };
}

describe('a panel over a screen', () => {
  it('closes when a page is pushed over the screen', () => {
    const navigation = screenNavigation();
    const close = vi.fn();
    renderHook(() => useCloseOnBlur(navigation, close));
    navigation.blur();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the screen goes', () => {
    const navigation = screenNavigation();
    const view = renderHook(() => useCloseOnBlur(navigation, () => undefined));
    view.unmount();
    expect(navigation.listening()).toBe(0);
  });
});
