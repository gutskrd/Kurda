import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { typingLabel, useTypingSignal, useTypingWatch } from './useTyping';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useTypingSignal', () => {
  it('pings immediately on the first keystroke', () => {
    // debouncing would only tell the other side once you STOPPED, which is
    // backwards for an indicator that means "someone is writing right now"
    const send = vi.fn();
    const { result } = renderHook(() => useTypingSignal(send));
    act(() => result.current());
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('throttles a fast typist to one ping per interval', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useTypingSignal(send));
    act(() => {
      for (let i = 0; i < 40; i++) result.current();
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('pings again once the interval has passed', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useTypingSignal(send));
    act(() => result.current());
    act(() => {
      vi.advanceTimersByTime(3100);
      result.current();
    });
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('useTypingWatch', () => {
  it('lists whoever pinged', () => {
    const { result } = renderHook(() => useTypingWatch());
    act(() => result.current.note('zana'));
    expect(result.current.typing).toEqual(['zana']);
  });

  it('drops a name once its ping goes stale', () => {
    // there is no "stopped typing" event — a sender can close the tab or lose
    // the connection — so the indicator has to expire on its own
    const { result } = renderHook(() => useTypingWatch());
    act(() => result.current.note('zana'));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(result.current.typing).toEqual([]);
  });

  it('keeps someone listed while they keep typing', () => {
    const { result } = renderHook(() => useTypingWatch());
    act(() => result.current.note('zana'));
    act(() => {
      vi.advanceTimersByTime(3000);
      result.current.note('zana');
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.typing).toEqual(['zana']);
  });

  it('tracks several people at once and expires them independently', () => {
    const { result } = renderHook(() => useTypingWatch());
    act(() => result.current.note('zana'));
    act(() => {
      vi.advanceTimersByTime(3000);
      result.current.note('rojîn');
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.typing).toEqual(['rojîn']);
  });
});

describe('typingLabel', () => {
  it('reads naturally for one, two, or a crowd', () => {
    expect(typingLabel([])).toBe('');
    expect(typingLabel(['zana'])).toBe('zana is typing…');
    expect(typingLabel(['zana', 'rojîn'])).toBe('zana and rojîn are typing…');
    expect(typingLabel(['zana', 'rojîn', 'şevîn'])).toBe('3 people are typing…');
  });
});
