// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, renderHook } from '@testing-library/react';
import { backFromPage, refocus } from '../play/testing/navigation';
import { TAB_REUSE_MS, useTabFocusLoad } from './tabFocusLoad';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(86_400_000);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const settle = () => act(async () => undefined);

describe('a tab’s load on focus', () => {
  it('is kept over a tab switch for half a minute, and asked again back from a page', async () => {
    const load = vi.fn(async () => true);
    renderHook(() => useTabFocusLoad(load));
    await settle();
    expect(load).toHaveBeenCalledTimes(1);

    act(() => refocus());
    await settle();
    expect(load).toHaveBeenCalledTimes(1);

    act(() => backFromPage());
    await settle();
    expect(load).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + TAB_REUSE_MS - 1);
    act(() => refocus());
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 1);
    act(() => refocus());
    await settle();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('asks again at the next tab switch after a failed load', async () => {
    const load = vi.fn(async () => false);
    renderHook(() => useTabFocusLoad(load));
    await settle();
    act(() => refocus());
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('asks again when the tab was left before its answers came', async () => {
    let answer: (keep: boolean) => void = () => undefined;
    const load = vi.fn((_live: () => boolean) => new Promise<boolean>((resolve) => (answer = resolve)));
    renderHook(() => useTabFocusLoad(load));
    const firstLive = load.mock.calls[0]![0];
    act(() => refocus());
    expect(firstLive()).toBe(false);
    await act(async () => answer(true));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('runs a new load at once, as a pull to refresh asks', async () => {
    const first = vi.fn(async () => true);
    const second = vi.fn(async () => true);
    const { rerender } = renderHook(({ load }) => useTabFocusLoad(load), { initialProps: { load: first } });
    await settle();
    rerender({ load: second });
    await settle();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
