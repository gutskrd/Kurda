import { useApiGet } from '../lib/useApi';
import { Loading, ErrorState, EmptyState } from '../components/states';
import { BookIcon } from '../components/icons';

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
  const { data, error, loading, reload } = useApiGet<{ courses: CourseSummary[] }>('/courses');
  const courses = data?.courses ?? [];

  return (
    <div className="container">
      <div className="page-header">
        <span className="eyebrow">Fêrbûn · Your path</span>
        <h1 className="page-title">Learn Kurdish</h1>
        <p className="page-sub">
          Work through a structured course — each one is a map of skills you unlock step by step. Pick
          a course to begin; your progress syncs with the MyKurda app.
        </p>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : courses.length === 0 ? (
        <EmptyState
          title="No courses available yet"
          message="New courses are being prepared. Check back soon — they’ll appear here as soon as they’re published."
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
              <p>A guided skill tree — vocabulary, grammar and listening, unlocked as you go.</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
