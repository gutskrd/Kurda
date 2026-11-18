import { Link } from 'react-router-dom';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { useLocale, useT } from '../i18n/I18nProvider';
import { restrictionOf, restrictionText, standingExplains, STANDING_PATH } from './restriction';

/**
 * Why something sent did not go, for every send path. Account limits (reports/restriction.ts) say what is limited and
 * until when, with a link to Account standing where it has the reasons; anything else uses `describe` or the usual
 * wording. `role="alert"` by default, since it answers the button just pressed; a form that announces politely keeps
 * `status`.
 */
export function SendError({
  error,
  describe,
  className,
  role = 'alert',
}: {
  /** What the API answered, or a sentence the caller already has from a local check. */
  error: ApiError | string | null | undefined;
  /** The wording for errors that are not account limits; defaults to describeError. */
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
  // A limit is not a failure, so it uses the neutral notice style rather than error red.
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
