import { Link } from 'react-router-dom';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { useLocale, useT } from '../i18n/I18nProvider';
import { restrictionOf, restrictionText, standingExplains, STANDING_PATH } from './restriction';

/**
 * Why something you sent did not go — the one place every send path shows it.
 *
 * Chat messages, gifts, game cards, posts, comments, pictures, voice and
 * profile changes can all be refused for the same few reasons that are about
 * the account rather than the content (reports/restriction.ts). Shown here,
 * they say what is limited and until when, with a way to Account standing
 * when that page has the reasons; anything else is described by the caller's
 * own wording (`describe`), or the app's usual one.
 *
 * `role="alert"` by default: it is the answer to the button just pressed, and
 * someone on a screen reader who pressed Send must hear that it did not go. A
 * form that already announces its outcome politely keeps `status`.
 */
export function SendError({
  error,
  describe,
  className,
  role = 'alert',
}: {
  /** what the API answered — or a sentence the caller already has (a local check that failed) */
  error: ApiError | string | null | undefined;
  /** the wording for errors that are not account limits (defaults to describeError) */
  describe?: (error: ApiError) => string;
  className?: string;
  role?: 'alert' | 'status';
}): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  if (!error) return null;
  if (typeof error === 'string') {
    return (
      <div className={`msg msg-error send-error${className ? ` ${className}` : ''}`} role={role}>
        {error}
      </div>
    );
  }
  const restriction = restrictionOf(error);
  const text = restriction
    ? restrictionText(restriction, t, locale)
    : describe
      ? describe(error)
      : describeError(error, t, locale);
  // a limit is not a failure: it is said calmly, in the app's neutral notice
  // rather than in the red of something broken
  const tone = restriction ? 'send-error is-limit' : 'msg-error send-error';
  return (
    <div className={`msg ${tone}${className ? ` ${className}` : ''}`} role={role}>
      <span>{text}</span>
      {restriction && standingExplains(restriction) && (
        <>
          {' '}
          <Link to={STANDING_PATH} className="send-error-link">
            {t('restriction.seeStanding')}
          </Link>
        </>
      )}
    </div>
  );
}
