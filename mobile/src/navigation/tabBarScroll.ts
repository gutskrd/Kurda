import { useCallback, useSyncExternalStore } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { tabBarScroll } from '@kurda/shared';

/**
 * Whether the tab bar is drawn small, by the shared rule (tab-bar-scroll.ts): it shrinks while the page under it
 * scrolls down and comes back on a short scroll up. Each tab's main list feeds its scroll in (`useTabBarScroll`) and
 * the bar listens (`useTabBarCompact`); nothing re-renders until the size changes.
 */
const rule = tabBarScroll();
const listeners = new Set<() => void>();

function told(was: boolean): void {
  if (rule.compact === was) return;
  for (const listener of listeners) listener();
}

/** A tab list's scroll offset, in points from its top. */
export function noteTabScroll(y: number): void {
  const was = rule.compact;
  rule.note(y);
  told(was);
}

/** Back to full size, as on moving to another tab, whose page starts where it was left. */
export function resetTabBar(): void {
  const was = rule.compact;
  rule.reset();
  told(was);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTabBarCompact(): boolean {
  return useSyncExternalStore(subscribe, () => rule.compact);
}

/** A tab list's scroll handler that also tells the bar, wrapping the list's own handler when it has one. */
export function useTabBarScroll(own?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void): (e: NativeSyntheticEvent<NativeScrollEvent>) => void {
  return useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      noteTabScroll(e.nativeEvent.contentOffset.y);
      own?.(e);
    },
    [own],
  );
}
