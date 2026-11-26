import { lazy, Suspense } from 'react';
import { Button } from './Button';
import { DeerLoader } from './DeerLoader';
import { useT } from '../i18n/I18nProvider';

/** Hevalo over an empty or failed state, as on the phone; loaded apart so the pages that never show one stay light. */
const EmptyPicture = lazy(() => import('../characters/EmptyPicture'));

/** The picture, or until it loads a space of its size, so the words under it never move; also for pages of their own (NotFound). */
export function StateArt({ puzzled = false }: { puzzled?: boolean }): React.JSX.Element {
  return (
    <Suspense fallback={<span className="state-art" aria-hidden="true" />}>
      <EmptyPicture puzzled={puzzled} />
    </Suspense>
  );
}

/** A page or section waiting on something: the deer curling into a ball, labelled for screen readers ("Loading…" or `label`). */
export function Loading({ label }: { label?: string }): React.JSX.Element {
  const t = useT();
  const text = label ?? t('common.loading');
  return (
    <div className="spinner-center" role="status" aria-live="polite">
      <DeerLoader size={48} />
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
  // Not a default argument, which is evaluated before any hook has run. A page that can be loaded again says that it
  // did not load, as the phone does, rather than that something went wrong.
  const heading = title ?? (onRetry ? t('net.loadFailed') : t('common.somethingWentWrong'));
  return (
    <div className="state" role="alert">
      <StateArt puzzled />
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

/* The heading is an h2 because it almost always sits right under a page's title. */
export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  /** A line under the heading, when the heading is not enough on its own. */
  message?: string;
  /** An optional way out, e.g. a link to the setting that fills it. */
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="state">
      <StateArt />
      <h2 className="state-title">{title}</h2>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}
