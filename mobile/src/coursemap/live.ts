import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useReducedMotion } from '../a11y/useReducedMotion';

/**
 * Whether something that moves for as long as it is on the screen — the bob
 * of "Start" over the current skill, a chest's wobble, a mascot's greeting —
 * should be moving right now.
 *
 * A loop costs a frame's work every frame it runs, so it runs only while
 * somebody could see it: while this screen is the one in front (not behind a
 * lesson pushed over it, and not another tab), while the app is in the
 * foreground, and never for anyone who asked their phone for less motion.
 * One answer for all three, so a loop cannot forget one of them.
 */
export function useLive(): boolean {
  const focused = useIsFocused();
  const reduce = useReducedMotion();
  const [awake, setAwake] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAwake(state !== 'background'));
    return () => sub.remove();
  }, []);
  return focused && awake && !reduce;
}
