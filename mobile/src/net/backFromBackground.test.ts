import { describe, expect, it, vi } from 'vitest';
import type { AppStateStatus } from 'react-native';
import { onBackFromBackground } from './backFromBackground';

/** An app state the test moves by hand, starting where the app starts. */
function appState(start: string = 'active') {
  const listeners = new Set<(state: AppStateStatus) => void>();
  const state = {
    currentState: start,
    addEventListener: (_type: 'change', cb: (s: AppStateStatus) => void) => {
      listeners.add(cb);
      return { remove: () => listeners.delete(cb) };
    },
    go(next: string) {
      state.currentState = next;
      for (const cb of [...listeners]) cb(next as AppStateStatus);
    },
    get listening() {
      return listeners.size;
    },
  };
  return state;
}

describe('onBackFromBackground', () => {
  it('says nothing after a Control Centre swipe, which only passes through inactive', () => {
    const app = appState();
    const back = vi.fn();
    onBackFromBackground(app, back);
    app.go('inactive');
    app.go('active');
    app.go('inactive');
    app.go('active');
    expect(back).not.toHaveBeenCalled();
  });

  it('says so once each time the app comes back from the background', () => {
    const app = appState();
    const back = vi.fn();
    onBackFromBackground(app, back);
    // iOS on the way out and back in.
    app.go('inactive');
    app.go('background');
    app.go('inactive');
    app.go('active');
    expect(back).toHaveBeenCalledTimes(1);
    // Android goes straight to the background and back.
    app.go('background');
    app.go('active');
    expect(back).toHaveBeenCalledTimes(2);
    app.go('active');
    expect(back).toHaveBeenCalledTimes(2);
  });

  it('counts a start in the background, as when a notification woke the app, as being away', () => {
    const app = appState('background');
    const back = vi.fn();
    onBackFromBackground(app, back);
    app.go('active');
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('stops listening when asked, and copes with a platform that hands back nothing', () => {
    const app = appState();
    const back = vi.fn();
    const stop = onBackFromBackground(app, back);
    expect(app.listening).toBe(1);
    stop();
    expect(app.listening).toBe(0);
    app.go('background');
    app.go('active');
    expect(back).not.toHaveBeenCalled();

    const silent = { currentState: 'active', addEventListener: () => undefined };
    expect(() => onBackFromBackground(silent, back)()).not.toThrow();
  });
});
