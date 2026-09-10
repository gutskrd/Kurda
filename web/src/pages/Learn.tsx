import { useApiGet } from '../lib/useApi';
import { ErrorState, EmptyState } from '../components/states';
import { CourseGridSkeleton } from '../components/skeletons';
import { BookIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';

interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  dialect: string;
}

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
        <div className="grid grid-2">
          {courses.map((c) => (
            <article className="feature" key={c.id}>
              <div className="feature-icon">
                <BookIcon />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <h3 style={{ margin: 0 }}>{c.title}</h3>
                <span className="badge">{DIALECT_LABEL[c.dialect] ?? c.dialect}</span>
              </div>
              <p>{t('learn.skillTree')}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
