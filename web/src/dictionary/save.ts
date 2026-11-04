/**
 * Saving a word to your vocabulary from anywhere a dictionary entry is
 * named — the dictionary itself, a glossary word in a story — through the
 * one route the server keeps for it (`PUT` / `DELETE /dictionary/entries/:id/save`,
 * both idempotent), and the one sentence for a refusal: the vocabulary's
 * limit when that is what it was, else the usual words for what went wrong.
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

/** Why a word could not be saved, in the reader's words: the full vocabulary names its limit, anything else is said as usual. */
export function saveWordError(error: ApiError, t: Translate): string {
  return limitErrorText(error, t) ?? describeError(error, t);
}
