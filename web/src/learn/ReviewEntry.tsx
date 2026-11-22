import { LinkButton } from '../components/Button';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { useT } from '../i18n/I18nProvider';
import type { ApiState } from '../lib/useApi';
import type { PracticeDue } from './types';

/**
 * Review: what is due and the way in, on Learn among the practice tools and at the head of the practice page. The count
 * matches what a session will find (GET /practice/due), and a review left part-way is offered first at its own address.
 * Its button stays secondary, since on Learn the path's "Start" or "Continue" is the page's one primary action. On Learn
 * it also leads to the other kinds of practice (`toPractice`).
 */
export function ReviewEntry({
  due,
  toPractice = false,
  heading: Heading = 'h3',
}: {
  due: ApiState<PracticeDue>;
  toPractice?: boolean;
  heading?: 'h2' | 'h3';
}): React.JSX.Element {
  const t = useT();
  const { data, error, loading } = due;
  let body: React.ReactNode;
  let action: React.ReactNode = null;
  const pending = loading && !data;
  if (pending) {
    // What most answers hold: two lines and a small button.
    body = <SkeletonText lines={2} lastWidth="48%" />;
    action = <Skeleton className="skeleton-btn skeleton-btn-sm" w={96} />;
  } else if (error || !data) {
    body = t('review.dueFailed');
    action = <LinkButton to="/app/learn/review" variant="secondary" size="sm">{t('review.start')}</LinkButton>;
  } else if (data.open) {
    body = t('review.open');
    action = (
      <LinkButton to={`/app/learn/review/${encodeURIComponent(data.open)}`} variant="secondary" size="sm">
        {t('review.continue')}
      </LinkButton>
    );
  } else if (data.available === 0) {
    body = t('review.none');
  } else if (data.due > 0) {
    body = t('review.due', { count: data.due });
    action = <LinkButton to="/app/learn/review" variant="secondary" size="sm">{t('review.start')}</LinkButton>;
  } else {
    body = t('review.notDue');
    action = <LinkButton to="/app/learn/review" variant="secondary" size="sm">{t('review.practise')}</LinkButton>;
  }
  return (
    <section className={`learn-tool learn-review${pending ? ' is-pending' : ''}`} aria-labelledby="learn-review-title">
      <div className="learn-review-text">
        <Heading className="learn-tool-title" id="learn-review-title">
          {t('review.title')}
        </Heading>
        <p className="learn-review-body">{body}</p>
      </div>
      {(action || toPractice) && (
        <div className="learn-review-actions">
          {action}
          {toPractice && (
            <LinkButton to="/app/learn/practice" variant="ghost" size="sm">
              {t('practice.more')}
            </LinkButton>
          )}
        </div>
      )}
    </section>
  );
}
