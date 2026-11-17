import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

/**
 * The options every native stack in the app shares: no bar of its own, the
 * theme's background behind a transition so no white frame flashes, no slide
 * under Reduce Motion, and a screen that is covered or left letting go of its
 * own keyboard (iOS; Android does it by itself).
 */
export function stackOptions(reduceMotion: boolean, background: string): NativeStackNavigationOptions {
  return {
    headerShown: false,
    contentStyle: { backgroundColor: background },
    animation: reduceMotion ? 'none' : 'default',
    keyboardHandlingEnabled: true,
  };
}
