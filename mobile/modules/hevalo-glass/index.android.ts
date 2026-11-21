import type { ComponentType } from 'react';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { AndroidGlassProps } from './index';

export type { AndroidGlassProps } from './index';

/**
 * Hevalo's glass on Android (android/…/GlassView.kt): it bends what lies behind it on Android 13 and later. A build
 * without the module, or an older Android, gets null and the app draws its own glass.
 */
const glass = requireOptionalNativeModule<{ bends?: boolean }>('HevaloGlass');

export const ANDROID_LENS = glass?.bends === true;
export const AndroidGlass: ComponentType<AndroidGlassProps> | null = ANDROID_LENS ? requireNativeView<AndroidGlassProps>('HevaloGlass') : null;
