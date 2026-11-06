import { useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
// the core package, not the native one: the native entry pulls in platform modules a component test cannot load, and tests substitute
// it wholesale, while the context itself lives in core and is the one instance every navigator in the app provides
import { NavigationContext } from '@react-navigation/core';
import { useReducedMotion } from './useReducedMotion';

/**
 * Whether anything decorative on this part of the screen has anybody to move
 * for.
 *
 * The tabs keep every tab's screen mounted, so a character breathing on Home,
 * a fire burning on the profile and a sweep crossing a skeleton kept on
 * running behind whichever tab was in front: five screens' worth of loops
 * for one that was looked at, on the native thread but on the battery all
 * the same. `useScreenAwake` says whether the enclosing screen is in front
 * (focused in its navigator, and every navigator above it) and the app is
 * not in the background; `useMotionAlive` adds the Reduce Motion setting, for
 * loops that are purely decorative. Outside any navigator (a test, the launch
 * screen before the stack exists) a screen counts as in front.
 *
 * Usage, in place of a loop's own AppState listener:
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
    // `isFocused` asks every navigator up the tree, and the focus and blur events reach a nested screen when a tab above it changes
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
