import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { letterWidgetTask } from './android/task';

/**
 * Hands Android's widget updates to the letter widget's code (android/task.tsx).
 * Called once from index.ts, beside the app's own registration: Android may
 * start the app's code with no screen at all just to update the widget, and
 * the handler has to be there when it does. iPhone's widget is an extension
 * of its own and needs nothing here.
 */
export function registerLetterWidget(): void {
  if (Platform.OS === 'android') registerWidgetTaskHandler(letterWidgetTask);
}
