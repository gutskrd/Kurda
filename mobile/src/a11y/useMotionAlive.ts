import { useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
// The core package, not the native one: the native entry pulls in modules component tests cannot load, and the
// context lives in core either way.
import { NavigationContext } from '@react-navigation/core';
import { useReducedMotion } from './useReducedMotion';

/**
 * Whether decorative motion on this part of the screen has anyone to move for. Tabs keep every screen mounted, so
 * without this, loops on hidden tabs keep running and drain the battery. `useScreenAwake` is true when the
 * enclosing screen is focused (in its navigator and every one above) and the app is in the foreground;
 * `useMotionAlive` also respects Reduce Motion, for purely decorative loops. Outside any navigator (tests, the
 * launch screen) a screen counts as focused.
 *
 *   const alive = useMotionAlive();
 *   useEffect(() => {
 *     if (!alive) return;
 *     const loop = Animated.loop(…);
 *     loop.start();
 *     return () => loop.stop();
 *   }, [alive]);
 */
export function useScreenAwake(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => (navigation ? navigation.isFocused() : true));
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');

  useEffect(() => {
    if (!navigation) {
      setFocused(true);
      return;
    }
    // `isFocused` checks every navigator up the tree, and focus and blur reach a nested screen when a tab above it changes.
    setFocused(navigation.isFocused());
    const onFocus = navigation.addListener('focus', () => setFocused(true));
    const onBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      onFocus();
      onBlur();
    };
  }, [navigation]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setForeground(state !== 'background'));
    return () => sub.remove();
  }, []);

  return focused && foreground;
}

/** `useScreenAwake`, and the person has not asked for less motion. */
export function useMotionAlive(): boolean {
  const awake = useScreenAwake();
  const reduce = useReducedMotion();
  return awake && !reduce;
}
