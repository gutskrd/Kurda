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
      <h3>{heading}</h3>
      <p>{message}</p>
      {onRetry && (
        <div style={{ marginTop: 18 }}>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  /** optional way out of the empty state, e.g. a link to the setting that fills it */
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="state">
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}
