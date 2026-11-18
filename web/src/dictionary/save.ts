/**
 * Saving a dictionary entry to the reader's vocabulary from anywhere it appears (`PUT` / `DELETE
 * /dictionary/entries/:id/save`, both idempotent), and the message for a refusal.
 */
import type { ApiClient } from '../lib/api';
import { describeError } from '../lib/api';
import { limitErrorText } from '../lib/limits';
import type { ApiError, ApiResult } from '../lib/types';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function saveWord(client: ApiClient, entryId: string): Promise<ApiResult<unknown>> {
  return client.put(`/dictionary/entries/${encodeURIComponent(entryId)}/save`);
}

export function unsaveWord(client: ApiClient, entryId: string): Promise<ApiResult<unknown>> {
  return client.delete(`/dictionary/entries/${encodeURIComponent(entryId)}/save`);
}

/** Why a word could not be saved: a full vocabulary names its limit, anything else is described as usual. */
export function saveWordError(error: ApiError, t: Translate): string {
  return limitErrorText(error, t) ?? describeError(error, t);
}
