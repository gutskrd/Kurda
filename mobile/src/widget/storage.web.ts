import type { WidgetConfig } from './contract';

/**
 * The website build of the phone app has no home screen to put a widget on,
 * so there is nowhere to leave it anything (storage.ts is the phone's).
 */

export async function readWidgetConfig(): Promise<WidgetConfig | null> {
  return null;
}

export async function writeWidgetConfig(_config: WidgetConfig): Promise<void> {}

export async function writeWidgetLocale(_locale: string): Promise<void> {}

export async function clearWidgetConfig(): Promise<void> {}

export async function widgetTokenRejected(): Promise<boolean> {
  return false;
}

export async function markWidgetTokenRejected(): Promise<void> {}
