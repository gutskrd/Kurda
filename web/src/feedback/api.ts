import type { AppFeedbackRequest, AppFeedbackState } from '@kurda/shared';
import type { ApiClient } from '../lib/api';
import type { ApiResult } from '../lib/types';

/**
 * The rating box's three calls (contract §F; shapes in @kurda/shared
 * `feedback`). The web never asks for a store review, so it only ever reads
 * `shouldPrompt` from the state.
 */

/**
 * What the web build calls its version in an answer: "web", or "web-<build>"
 * when the build says which (VITE_APP_VERSION). The API takes letters,
 * digits, dots, dashes and the like, up to 40.
 */
export const WEB_APP_VERSION = webVersion(import.meta.env.VITE_APP_VERSION);

export function webVersion(build: string | undefined): string {
  const b = (build ?? '').trim().replace(/[^\w.+-]/g, '').slice(0, 30);
  return b ? `web-${b}` : 'web';
}

export function feedbackState(client: ApiClient): Promise<ApiResult<AppFeedbackState>> {
  return client.get<AppFeedbackState>('/me/app-feedback/state?platform=web');
}

export function sendFeedback(
  client: ApiClient,
  body: Omit<AppFeedbackRequest, 'platform' | 'appVersion'>,
): Promise<ApiResult<{ id: string }>> {
  return client.post<{ id: string }>('/me/app-feedback', { ...body, platform: 'web', appVersion: WEB_APP_VERSION });
}

/** "Not now": the box counts as shown, on every device. */
export function dismissFeedback(client: ApiClient): Promise<ApiResult<{ ok: true }>> {
  return client.post<{ ok: true }>('/me/app-feedback/dismiss');
}
