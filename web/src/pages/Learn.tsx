import { Link } from 'react-router-dom';
import { useApiGet } from '../lib/useApi';
import { ErrorState, EmptyState } from '../components/states';
import { CourseGridSkeleton } from '../components/skeletons';
import { LessonMock } from '../landing/mocks';
import { useT } from '../i18n/I18nProvider';

interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  dialect: string;
}

/** Three letters a beginner meets first: one familiar, one with a mark, one with a hat. */
const ALPHABET_TEASER = 'Aa Çç Êê';

const DIALECT_LABEL: Record<string, string> = {
  kmr: 'Kurmancî',
  ckb: 'Soranî',
};

export function Learn(): React.JSX.Element {
  const t = useT();
  const { data, error, loading, reload } = useApiGet<{ courses: CourseSummary[] }>('/courses');
  const courses = data?.courses ?? [];

  return (
    <div className="container">
      <div className="page-header">
        <span className="eyebrow">{t('learn.eyebrow')}</span>
        <h1 className="page-title">{t('learn.title')}</h1>
        <p className="page-sub">{t('learn.subtitle')}</p>
      </div>

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

      {loading ? (
        <CourseGridSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : courses.length === 0 ? (
        <EmptyState
          title={t('learn.noCourses')}
          message={t('learn.noCoursesBody')}
        />
      ) : (
        <div className="learn-grid">
          <div>
            {courses.map((c) => (
              <article className="course-card" key={c.id}>
                <span className="lp-chip">{DIALECT_LABEL[c.dialect] ?? c.dialect}</span>
                <h2 className="course-card-title">{c.title}</h2>
                <p>{t('learn.skillTree')}</p>
              </article>
            ))}
          </div>
          {/* what a lesson looks like — the front page's picture, and where to take it */}
          <aside className="learn-preview">
            <LessonMock />
            <p className="lp-status">{t('landing.status.app')}</p>
          </aside>
        </div>
      )}
    </div>
  );
}
