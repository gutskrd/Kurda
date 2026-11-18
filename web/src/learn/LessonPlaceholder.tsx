import { Link } from 'react-router-dom';
import { CloseIcon } from '../components/icons';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import { useT } from '../i18n/I18nProvider';

/**
 * A lesson before it arrives, drawn from the lesson's own parts and class names (styles/learn.css) so nothing moves when
 * it lands: a working ✕, the empty progress track, the title line over the shape of a question and answers, and the
 * action bar. Shown by the lesson shell while the code loads (layouts/FocusLayout.tsx) and by the pages while their
 * session loads (pages/Lesson.tsx, Review.tsx, NextLesson.tsx).
 */
export function LessonPlaceholder({ label, exitTo = '/app/learn' }: { label: string; exitTo?: string }): React.JSX.Element {
  const t = useT();
  return (
    <div className="lesson lesson-placeholder">
      <div className="lesson-body">
        <header className="lesson-top">
          <Link to={exitTo} className="lesson-leave" aria-label={t('lesson.leave')}>
            <CloseIcon size={20} />
          </Link>
          <div className="lesson-progress-wrap">
            <div className="lesson-progress" aria-hidden="true" />
          </div>
        </header>
        {/* Announced once as loading; the boxes are not read out. */}
        <SkeletonRegion label={label} className="lesson-stage">
          <p className="lesson-kicker">
            <Skeleton line w="24%" />
          </p>
          <p className="lesson-ask">
            <Skeleton line w="58%" />
          </p>
          <div className="lesson-placeholder-options">
            <Skeleton h={60} radius="var(--r-lg)" />
            <Skeleton h={60} radius="var(--r-lg)" />
            <Skeleton h={60} radius="var(--r-lg)" />
          </div>
        </SkeletonRegion>
      </div>
      <div className="lesson-bar" aria-hidden="true">
        <div className="lesson-bar-inner">
          <div className="lesson-bar-row">
            <Skeleton className="skeleton-btn skeleton-btn-lg skeleton-late lesson-placeholder-go" />
          </div>
        </div>
      </div>
    </div>
  );
}
