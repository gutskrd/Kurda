import { Link } from 'react-router-dom';
import { useApiGet } from '../lib/useApi';
import { LinkButton } from '../components/Button';
import { ErrorState, EmptyState } from '../components/states';
import { CourseGridSkeleton } from '../components/skeletons';
import { Skeleton } from '../components/Skeleton';
import { useT } from '../i18n/I18nProvider';
import { courseProgress, dialectName } from '../learn/map';
import type { PracticeDue } from '../learn/types';
import { useCourses, type CourseEntry } from '../learn/useCourses';

/** Three letters a beginner meets first: one familiar, one with a mark, one with a hat. */
const ALPHABET_TEASER = 'Aa Çç Êê';

/**
 * Review, before the courses: what is due now, and the way in. The number is
 * the one a session will find (GET /practice/due counts as a session chooses),
 * so "3 due" never opens a review of five. A review left part-way through is
 * offered first, at its own address, so coming back picks it up rather than
 * starting another beside it.
 */
function ReviewEntry(): React.JSX.Element {
  const t = useT();
  const { data, error, loading } = useApiGet<PracticeDue>('/practice/due');
  let body: React.ReactNode;
  let action: React.ReactNode = null;
  if (loading && !data) {
    body = <Skeleton line w="60%" />;
  } else if (error || !data) {
    body = t('review.dueFailed');
    action = <LinkButton to="/app/learn/review" variant="secondary" size="sm">{t('review.start')}</LinkButton>;
  } else if (data.open) {
    body = t('review.open');
    action = (
      <LinkButton to={`/app/learn/review/${encodeURIComponent(data.open)}`} size="sm">
        {t('review.continue')}
      </LinkButton>
    );
  } else if (data.available === 0) {
    body = t('review.none');
  } else if (data.due > 0) {
    body = t('review.due', { count: data.due });
    action = <LinkButton to="/app/learn/review" size="sm">{t('review.start')}</LinkButton>;
  } else {
    body = t('review.notDue');
    action = <LinkButton to="/app/learn/review" variant="secondary" size="sm">{t('review.practise')}</LinkButton>;
  }
  return (
    <section className="learn-review" aria-labelledby="learn-review-title">
      <div className="learn-review-text">
        <h2 className="learn-review-title" id="learn-review-title">
          {t('review.title')}
        </h2>
        <p className="learn-review-body">{body}</p>
      </div>
      {action}
    </section>
  );
}

function CourseCard({ entry }: { entry: CourseEntry }): React.JSX.Element {
  const t = useT();
  const { course, map } = entry;
  const mapPath = `/app/learn/course/${encodeURIComponent(course.id)}`;
  const progress = map ? courseProgress(map) : null;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <article className="course-card">
      <span className="lp-chip">{dialectName(course.dialect)}</span>
      <h2 className="course-card-title">
        <Link to={mapPath} className="course-card-link">
          {course.title}
        </Link>
      </h2>
      {progress ? (
        <>
          <div className="course-progress">
            <div
              className="course-progress-bar"
              role="progressbar"
              aria-label={t('learn.progressLabel', { course: course.title })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="course-progress-text">{t('learn.progress', { done: progress.done, total: progress.total })}</span>
          </div>
          {progress.next ? (
            <p className="course-next">
              {t('learn.next')} <strong>{progress.next.title}</strong>
            </p>
          ) : (
            progress.total > 0 && progress.done === progress.total && <p className="course-next">{t('learn.finished')}</p>
          )}
        </>
      ) : (
        <p className="course-next">{t('learn.mapFailed')}</p>
      )}
      <div className="course-card-actions">
        {progress?.next && (
          <LinkButton
            to={`/app/learn/lesson/${progress.next.lessonId}?course=${encodeURIComponent(course.id)}`}
            state={{ title: progress.next.title }}
          >
            {progress.done === 0 ? t('learn.start') : t('learn.continue')}
          </LinkButton>
        )}
        <LinkButton to={mapPath} variant="secondary">
          {t('learn.openMap')}
        </LinkButton>
      </div>
    </article>
  );
}

/**
 * Learn (/app/learn): review first, then the alphabet, then every course with
 * how far the learner is through it and the lesson up next. Each course opens
 * its map; Start or Continue goes straight into the next lesson.
 */
export function Learn(): React.JSX.Element {
  const t = useT();
  const { entries, error, reload } = useCourses();

  return (
    <div className="container">
      <div className="page-header">
        <span className="eyebrow">{t('learn.eyebrow')}</span>
        <h1 className="page-title">{t('learn.title')}</h1>
        <p className="page-sub">{t('learn.subtitle')}</p>
      </div>

      <ReviewEntry />

      {/* before any course, the letters it is written in */}
      <Link to="/app/alphabet" className="ab-start">
        <span className="ab-start-letters" lang="ku" aria-hidden="true">
          {ALPHABET_TEASER}
        </span>
        <span className="ab-start-text">
          <span className="ab-start-title">{t('alphabet.title')}</span>
          <span className="ab-start-body">{t('alphabet.link')}</span>
        </span>
      </Link>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !entries ? (
        <CourseGridSkeleton />
      ) : entries.length === 0 ? (
        <EmptyState title={t('learn.noCourses')} message={t('learn.noCoursesBody')} />
      ) : (
        <div className="learn-courses">
          {entries.map((entry) => (
            <CourseCard key={entry.course.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
