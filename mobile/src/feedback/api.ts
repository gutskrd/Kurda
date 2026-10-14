import type { AppFeedbackRequest, AppFeedbackState, AppPlatform } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/**
 * The rating box's and the store prompt's calls (contract §F; shapes in
 * `@kurda/shared` feedback.ts).
 */

/** Is the box due for this account, and may this phone ask for a store review now. */
export const getFeedbackState = (
  client: ApiClient,
  platform: AppPlatform,
  appVersion: string,
): Promise<ApiResult<AppFeedbackState>> =>
  client.get(`/me/app-feedback/state?platform=${platform}&appVersion=${encodeURIComponent(appVersion)}`);

/** An answer — from the box or from Settings → Send feedback. */
export const sendFeedback = (client: ApiClient, body: AppFeedbackRequest): Promise<ApiResult<{ id: string }>> =>
  client.post('/me/app-feedback', body);

/** "Not now": the box counts as shown, here and on every other device. */
export const dismissFeedback = (client: ApiClient): Promise<ApiResult<{ ok: true }>> =>
  client.post('/me/app-feedback/dismiss');

/** The native store prompt was just called for this version. */
export const storeReviewPrompted = (client: ApiClient, appVersion: string): Promise<ApiResult<{ ok: true }>> =>
  client.post('/me/store-review/prompted', { appVersion });
