import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApiGet } from '../lib/useApi';
import { ErrorState, Loading } from '../components/states';
import { useT } from '../i18n/I18nProvider';
import { LESSON_PATHS, SessionPlayer } from '../learn/SessionPlayer';
import type { LessonSessionView } from '../learn/types';

/**
 * A lesson, in the browser (/app/learn/lesson/:lessonId).
 *
 * Opening it asks the server for the learner's session for the lesson, which
 * is the one they left if it is still open: every answer was saved as it was
 * given, so the lesson picks up where it stopped. `?course=` is where "back"
 * goes; the name the map showed comes along in the navigation state.
 */
export function Lesson(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { lessonId = '' } = useParams();
  const [params] = useSearchParams();
  const { state } = useLocation();
  const course = params.get('course');
  const title = (state as { title?: unknown } | null)?.title;
  const { data, error, loading, reload } = useApiGet<LessonSessionView>(`/lessons/${encodeURIComponent(lessonId)}/session`);

  if (loading && !data) return <Loading label={t('lesson.loading')} />;
  if (error || !data) {
    return (
      <div className="container">
        <ErrorState title={t('lesson.loadFailed')} message={error ?? t('common.somethingWentWrong')} onRetry={reload} />
      </div>
    );
  }
  return (
    <SessionPlayer
      // a session the server closed is replaced by a new one: start that one afresh
      key={data.sessionId}
      session={data}
      kind="lesson"
      paths={LESSON_PATHS}
      title={typeof title === 'string' ? title : undefined}
      dialect={data.dialect}
      grammarMd={data.grammarMd}
      exitTo={course ? `/app/learn/course/${encodeURIComponent(course)}` : '/app/learn'}
      exitLabel={course ? t('lesson.backToCourse') : t('lesson.backToLearn')}
      onPractise={(exerciseIds) => navigate('/app/learn/review', { state: { exerciseIds } })}
      onRestart={reload}
    />
  );
}
