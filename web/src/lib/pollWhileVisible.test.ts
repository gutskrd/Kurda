import { afterEach, describe, expect, it, vi } from 'vitest';
import { pollWhileVisible } from './pollWhileVisible';

/** Whether the tab is hidden, as the page sees it. */
function hidden(on: boolean): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (on ? 'hidden' : 'visible') });
}

function show(): void {
  hidden(false);
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  vi.useRealTimers();
  hidden(false);
});

describe('pollWhileVisible', () => {
  it('ticks on its interval while the tab is in view', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 1_000);
    vi.advanceTimersByTime(999);
    expect(tick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_001);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
  });

  it('asks nothing while the tab is hidden, and once on coming back', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 1_000);
    hidden(true);
    vi.advanceTimersByTime(60_000);
    expect(tick).not.toHaveBeenCalled();

    show();
    expect(tick).toHaveBeenCalledTimes(1);
    // the catch-up is spent: another flip without a missed tick asks nothing
    show();
    expect(tick).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not ask on coming back when no tick was missed', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 60_000);
    hidden(true);
    vi.advanceTimersByTime(5_000);
    show();
    expect(tick).not.toHaveBeenCalled();
    stop();
  });

  it('stops ticking and listening once stopped', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 1_000);
    hidden(true);
    vi.advanceTimersByTime(2_000);
    stop();
    show();
    vi.advanceTimersByTime(10_000);
    expect(tick).not.toHaveBeenCalled();
  });
});
