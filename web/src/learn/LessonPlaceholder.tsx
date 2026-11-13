import { Link } from 'react-router-dom';
import { CloseIcon } from '../components/icons';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import { useT } from '../i18n/I18nProvider';

/**
 * A lesson, before it is here: the frame the lesson will stand in, drawn at
 * once, with only the exercise still to come.
 *
 * Opening a lesson used to show three different waits one after another — a
 * page heading's two grey bars while the lesson's code arrived, then a spinner
 * alone on an empty screen while its session was asked for, then the lesson.
 * Each was a different picture of the same wait, and none of them looked like
 * what was coming. This is one picture for all of it, made of the lesson's own
 * parts and their own class names (styles/learn.css), so nothing moves when
 * the real thing takes its place: the ✕ where the ✕ is — and it works, the way
 * out is never something to wait for — the progress track empty beside it, the
 * shape of a question and its answers, and the bar at the foot with the place
 * of its one button.
 *
 * It is what the lesson's shell shows while a lesson's or a review's code is
 * on its way (layouts/FocusLayout.tsx), and what the pages themselves show
 * while their session is (pages/Lesson.tsx, Review.tsx, NextLesson.tsx).
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
        {/* said once, as loading; the boxes inside are not read out */}
        <SkeletonRegion label={label} className="lesson-stage">
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
