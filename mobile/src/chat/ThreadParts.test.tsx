// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { cleanup, fireEvent, renderHook, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { JumpToLatest, useUnseenBelow } from './ThreadParts';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const m = (id: string, senderId: string) => ({ id, senderId });

describe('how many messages came in below', () => {
  it('counts other people’s messages since the reader went up, and never their own', () => {
    const first = [m('a', 'u2'), m('b', 'me')];
    const { result, rerender } = renderHook(({ messages, away }) => useUnseenBelow(messages, away, 'me'), { initialProps: { messages: first, away: false } });
    expect(result.current).toBe(0);
    // up the thread, and two arrive: one theirs, one the reader’s own from another phone
    rerender({ messages: first, away: true });
    rerender({ messages: [...first, m('c', 'u2'), m('d', 'me'), m('e', 'u2')], away: true });
    expect(result.current).toBe(2);
    // back at the foot: seen
    rerender({ messages: [...first, m('c', 'u2'), m('d', 'me'), m('e', 'u2')], away: false });
    expect(result.current).toBe(0);
  });

  it('counts nothing when the message they were at is gone', () => {
    const { result, rerender } = renderHook(({ messages, away }) => useUnseenBelow(messages, away, 'me'), { initialProps: { messages: [m('a', 'u2')], away: false } });
    rerender({ messages: [m('a', 'u2')], away: true });
    // the chat was cleared and started again
    rerender({ messages: [m('x', 'u2'), m('y', 'u2')], away: true });
    expect(result.current).toBe(0);
  });
});

describe('the way back down', () => {
  it('says how many are waiting, to the eye and to a screen reader, and goes when pressed', () => {
    const onPress = vi.fn();
    renderWithProviders(<JumpToLatest unseen={3} onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'New messages below: 3' });
    expect(button.textContent).toBe('3');
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is only the way down when nothing new is waiting', () => {
    renderWithProviders(<JumpToLatest unseen={0} onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Jump to latest' }).textContent).toBe('');
  });
});
