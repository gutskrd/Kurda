import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

/** The Android glass view's props: its corner in points, and whether the app is drawn dark. */
export type AndroidGlassProps = ViewProps & { radius: number; dark: boolean };

/** Only Android draws this glass (index.android.ts); elsewhere there is no view and nothing bends. */
export const ANDROID_LENS = false;
export const AndroidGlass: ComponentType<AndroidGlassProps> | null = null;
