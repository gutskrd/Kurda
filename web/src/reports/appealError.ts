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
 * Why "Ask for a review" did not go, in the reader's language.
 *
 * The API's own sentence for these is English; a child who asks twice, or
 * too late, should read the answer in the language they use the app in.
 * `ownToken` is the suspension screen, which asks with the short-lived
 * appeal token rather than a session: when that has run out, the way on is
 * to sign in again, not "authentication required".
 */
export function appealError(error: ApiError, t: Translate, opts: { ownToken?: boolean } = {}): string {
  const key = error.code ? APPEAL_COPY[error.code] : undefined;
  if (key) return t(key);
  if (opts.ownToken && (error.kind === 'unauthorized' || error.status === 401)) return t('standing.appeal.error.signIn');
  return describeError(error, t);
}
