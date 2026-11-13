import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnseenBelow } from './useStickyScroll';

const m = (id: string, senderId: string) => ({ id, senderId });

describe('useUnseenBelow', () => {
  it('counts what other people have written since the reader was last at the foot of the thread', () => {
    const first = [m('1', 'u2'), m('2', 'me')];
    const { result, rerender } = renderHook(({ messages, atBottom }) => useUnseenBelow(messages, atBottom, 'me'), { initialProps: { messages: first, atBottom: true } });
    expect(result.current).toBe(0);
    // they scroll up; two arrive from somebody else and they send nothing
    rerender({ messages: first, atBottom: false });
    expect(result.current).toBe(0);
    rerender({ messages: [...first, m('3', 'u2'), m('4', 'u2')], atBottom: false });
    expect(result.current).toBe(2);
    // back at the foot: seen
    rerender({ messages: [...first, m('3', 'u2'), m('4', 'u2')], atBottom: true });
    expect(result.current).toBe(0);
  });

  it('never counts the reader’s own messages', () => {
    const first = [m('1', 'u2')];
    const { result, rerender } = renderHook(({ messages, atBottom }) => useUnseenBelow(messages, atBottom, 'me'), { initialProps: { messages: first, atBottom: true } });
    rerender({ messages: first, atBottom: false });
    rerender({ messages: [...first, m('2', 'me'), m('3', 'u2')], atBottom: false });
    expect(result.current).toBe(1);
  });

  it('counts nothing when the message they were at is gone', () => {
    const first = [m('1', 'u2')];
    const { result, rerender } = renderHook(({ messages, atBottom }) => useUnseenBelow(messages, atBottom, 'me'), { initialProps: { messages: first, atBottom: true } });
    rerender({ messages: first, atBottom: false });
    rerender({ messages: [m('9', 'u2')], atBottom: false });
    expect(result.current).toBe(0);
  });
});
