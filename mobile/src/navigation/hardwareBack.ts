import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

/**
 * Android's back (the button or the edge swipe) routed through a screen's own way out, so a lesson or a game under way
 * asks before it lets go, as it does on iOS.
 *
 * While `onBack` is given and the screen is in front, back calls it and goes no further; null restores the default. A
 * Modal open over the screen, or a screen pushed over it, takes back first. Does nothing on iOS or the web.
 */
export function useHardwareBack(onBack: (() => void) | null): void {
  const latest = useRef(onBack);
  latest.current = onBack;
  const on = onBack !== null;
  useFocusEffect(
    useCallback(() => {
      // BackHandler is Android-only; the web build logs an error if it is touched.
      if (!on || Platform.OS !== 'android') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        latest.current?.();
        return true;
      });
      return () => sub.remove();
    }, [on]),
  );
}

/**
 * A game under way: Android's back asks through `onBack`, and the iOS edge swipe is off meanwhile. Null restores both.
 */
export function useGameBack(onBack: (() => void) | null): void {
  useHardwareBack(onBack);
  const navigation = useNavigation();
  const held = onBack !== null;
  useEffect(() => {
    if (!held) return undefined;
    navigation.setOptions({ gestureEnabled: false });
    return () => navigation.setOptions({ gestureEnabled: true });
  }, [navigation, held]);
}
