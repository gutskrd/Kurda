import { useCallback, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Android's back — the button, or the swipe in from the edge of the screen —
 * routed through a screen's own way out instead of leaving at once.
 *
 * A lesson, a practice session, a test to jump ahead and a game under way
 * each ask before they let go (the lesson's "Leave for now?" sheet, a game's
 * "Leave this game?"), and iOS is kept from swiping them away. Android's back
 * skipped all of that: the edge swipe that is so easily made by a thumb
 * reaching for an answer closed the lesson without a word.
 *
 * While `onBack` is given and the screen is the one in front, back calls it
 * and goes no further; null lets back do what it always does. A sheet or a
 * dialog open over the screen takes back for itself first (a Modal closes on
 * it), and a screen pushed over this one is in front instead, so neither
 * reaches here. Nothing happens on iOS or the web, which have no such button.
 */
export function useHardwareBack(onBack: (() => void) | null): void {
  const latest = useRef(onBack);
  latest.current = onBack;
  const on = onBack !== null;
  useFocusEffect(
    useCallback(() => {
      // BackHandler is Android's; the web build logs an error if you touch it
      if (!on || Platform.OS !== 'android') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        latest.current?.();
        return true;
      });
      return () => sub.remove();
    }, [on]),
  );
}
