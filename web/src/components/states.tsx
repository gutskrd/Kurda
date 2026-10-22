import { Button } from './Button';
import { useT } from '../i18n/I18nProvider';

export function Loading({ label }: { label?: string }): React.JSX.Element {
  const t = useT();
  const text = label ?? t('common.loading');
  return (
    <div className="spinner-center" role="status" aria-live="polite">
      <div className="spinner" />
      <span className="sr-only">{text}</span>
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}): React.JSX.Element {
  const t = useT();
  // the default has to be resolved here rather than in the parameter list: a
  // default argument is evaluated before any hook has run
  const heading = title ?? t('common.somethingWentWrong');
  return (
    <div className="state" role="alert">
      <h2 className="state-title">{heading}</h2>
      <p>{message}</p>
      {onRetry && (
        <div className="state-action">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </div>
      )}
    </div>
  );
}

/*
 * The heading is an h2 wherever the state stands: it is almost always the
 * first thing under a page's title, and an h3 there skipped a level for
 * anybody moving through the page by its headings.
 */
export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  /** a line under the heading, when the heading does not say enough on its own */
  message?: string;
  /** optional way out of the empty state, e.g. a link to the setting that fills it */
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="state">
      <h2 className="state-title">{title}</h2>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}
