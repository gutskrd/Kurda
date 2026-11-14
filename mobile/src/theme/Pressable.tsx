import { Platform, Pressable as NativePressable, type PressableProps, type View } from 'react-native';
import type { Ref } from 'react';

/**
 * The app's Pressable: React Native's own, with the moment a press shows
 * held back a little after the finger lands.
 *
 * A finger that lands on a button to scroll the list it sits in used to
 * light the button up at once, so every scroll flickered the rows and
 * buttons under it. The systems' own lists wait a beat before they show a
 * press (a scroll view on iOS delays its content's touches; Android has its
 * tap timeout), and in that beat a finger that is scrolling has moved and
 * the press is called off. This does the same: a touch shows as pressed only
 * once it has stayed put for `PRESS_DELAY_MS`, and a quick tap still shows,
 * for an instant, as it lands. A press that has to answer the moment the
 * finger is down, outside anything that scrolls (the tab bar, a card held to
 * be read), passes `pressDelay={0}`.
 */
export const PRESS_DELAY_MS = 110;

export function Pressable({ ref, pressDelay = PRESS_DELAY_MS, ...props }: PressableProps & { ref?: Ref<View>; pressDelay?: number }): React.JSX.Element {
  // the browser build's Pressable takes the same wait under its own name
  const web = Platform.OS === 'web' ? ({ delayPressIn: pressDelay } as Record<string, number>) : null;
  return <NativePressable unstable_pressDelay={pressDelay} {...web} {...props} ref={ref} />;
}
