// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
/*
 * Android's back, as the phone hands it over: listeners added with
 * `addEventListener`, the latest asked first, and one that answers true
 * keeps back from going any further.
 */
const android = vi.hoisted(() => {
  const listeners: Array<() => boolean> = [];
  return {
    platform: { OS: 'android' as string },
    listeners,
    press: (): boolean => {
      for (const l of [...listeners].reverse()) if (l()) return true;
      return false;
    },
  };
});
vi.mock('react-native', () => ({
  Platform: android.platform,
  BackHandler: {
    addEventListener: (_event: string, listener: () => boolean) => {
      android.listeners.push(listener);
      return { remove: () => android.listeners.splice(android.listeners.indexOf(listener), 1) };
    },
  },
}));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, renderHook } from '@testing-library/react';
import { useHardwareBack } from './hardwareBack';

afterEach(() => {
  cleanup();
  android.listeners.length = 0;
  android.platform.OS = 'android';
});

describe('useHardwareBack', () => {
  it('hands back to the screen while it asks, and lets it go when it stops asking', () => {
    const onBack = vi.fn();
    const view = renderHook(({ ask }: { ask: (() => void) | null }) => useHardwareBack(ask), { initialProps: { ask: onBack as (() => void) | null } });
    expect(android.press()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
    view.rerender({ ask: null });
    expect(android.press()).toBe(false);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('calls the latest way out without listening again', () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = renderHook(({ ask }: { ask: () => void }) => useHardwareBack(ask), { initialProps: { ask: first } });
    view.rerender({ ask: second });
    expect(android.listeners).toHaveLength(1);
    android.press();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the screen goes', () => {
    const view = renderHook(() => useHardwareBack(() => undefined));
    view.unmount();
    expect(android.listeners).toHaveLength(0);
  });

  it('does nothing where there is no back button', () => {
    android.platform.OS = 'ios';
    renderHook(() => useHardwareBack(() => undefined));
    expect(android.listeners).toHaveLength(0);
  });
});
