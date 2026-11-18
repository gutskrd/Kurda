import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** The refusals only an appeal can meet, by the API's code. */
const APPEAL_COPY: Readonly<Record<string, MessageKey>> = {
  ALREADY_APPEALED: 'standing.appeal.error.already',
  APPEAL_WINDOW_CLOSED: 'standing.appeal.error.window',
  NOTHING_TO_APPEAL: 'standing.appeal.error.nothing',
  APPEAL_TEXT_REQUIRED: 'standing.appeal.error.textRequired',
};

/**
 * Why "Ask for a review" failed, in the reader's language rather than the API's English. `ownToken` marks the
 * suspension screen, which uses the short-lived appeal token; when that expires the answer is to sign in again.
 */
export function appealError(error: ApiError, t: Translate, opts: { ownToken?: boolean } = {}): string {
  const key = error.code ? APPEAL_COPY[error.code] : undefined;
  if (key) return t(key);
  if (opts.ownToken && (error.kind === 'unauthorized' || error.status === 401)) return t('standing.appeal.error.signIn');
  return describeError(error, t);
}
