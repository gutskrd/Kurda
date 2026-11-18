import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { letterWidgetTask } from './android/task';

/**
 * Hands Android's widget updates to the letter widget code (android/task.tsx). Called once from index.ts beside
 * the app's own registration, since Android may start the app's code with no screen just to update the widget.
 * The iPhone widget is its own extension and needs nothing here.
 */
export function registerLetterWidget(): void {
  if (Platform.OS === 'android') registerWidgetTaskHandler(letterWidgetTask);
}
