// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('react-native-web'));

import { act, cleanup, render, screen } from '@testing-library/react';
import { AppState, Text, type AppStateStatus } from 'react-native';
import { NavigationContext } from '@react-navigation/core';
import { useScreenAwake } from './useMotionAlive';

function Probe(): React.JSX.Element {
  return <Text>{useScreenAwake() ? 'awake' : 'still'}</Text>;
}

/** A screen's navigation object as the hook sees it: focused or not, and telling listeners when that changes. */
function screenNavigation(focused: boolean) {
  const listeners: { focus: Array<() => void>; blur: Array<() => void> } = { focus: [], blur: [] };
  const navigation = {
    isFocused: () => focused,
    addListener: (event: 'focus' | 'blur', listener: () => void) => {
      listeners[event].push(listener);
      return () => {
        listeners[event] = listeners[event].filter((l) => l !== listener);
      };
    },
  };
  return {
    navigation: navigation as unknown as React.ContextType<typeof NavigationContext>,
    blur: () => {
      focused = false;
      listeners.blur.forEach((l) => l());
    },
    focus: () => {
      focused = true;
      listeners.focus.forEach((l) => l());
    },
    listening: () => listeners.focus.length + listeners.blur.length,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useScreenAwake', () => {
  it('counts a part of the app outside any navigator as in front', () => {
    render(<Probe />);
    expect(screen.getByText('awake')).toBeTruthy();
  });

  it('goes still when its screen loses focus and wakes when it gets it back, and lets go of the screen on unmount', () => {
    const nav = screenNavigation(true);
    const { unmount } = render(
      <NavigationContext.Provider value={nav.navigation}>
        <Probe />
      </NavigationContext.Provider>,
    );
    expect(screen.getByText('awake')).toBeTruthy();
    act(() => nav.blur());
    expect(screen.getByText('still')).toBeTruthy();
    act(() => nav.focus());
    expect(screen.getByText('awake')).toBeTruthy();
    expect(nav.listening()).toBe(2);
    unmount();
    expect(nav.listening()).toBe(0);
  });

  it('starts still on a screen that is not the one in view', () => {
    const nav = screenNavigation(false);
    render(
      <NavigationContext.Provider value={nav.navigation}>
        <Probe />
      </NavigationContext.Provider>,
    );
    expect(screen.getByText('still')).toBeTruthy();
  });

  it('goes still while the app is in the background and wakes when it is back', () => {
    const listeners: Array<(state: AppStateStatus) => void> = [];
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });
    render(<Probe />);
    expect(screen.getByText('awake')).toBeTruthy();
    act(() => listeners.forEach((l) => l('background')));
    expect(screen.getByText('still')).toBeTruthy();
    act(() => listeners.forEach((l) => l('active')));
    expect(screen.getByText('awake')).toBeTruthy();
  });
});
