import type { WidgetConfig } from './contract';

/** The web build has no home screen to put a widget on, so there is nowhere to store anything (storage.ts is the phone's). */

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
