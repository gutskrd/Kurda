import { useEffect } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApiGet } from '../lib/useApi';
import { ErrorState } from '../components/states';
import { useT } from '../i18n/I18nProvider';
import { LessonPlaceholder } from '../learn/LessonPlaceholder';
import { LESSON_PATHS, SessionPlayer } from '../learn/SessionPlayer';
import type { LessonSessionView } from '../learn/types';
import { rememberCourseDialect } from '../stories/prefs';

/**
 * A lesson, in the browser (/app/learn/lesson/:lessonId).
 *
 * Opening it asks the server for the learner's session for the lesson, which
 * is the one they left if it is still open: every answer was saved as it was
 * given, so the lesson picks up where it stopped. `?course=` is where "back"
 * goes, and the course whose next lesson the results offer; the name the map
 * showed comes along in the navigation state.
 */
export function Lesson(): React.JSX.Element {
  const { lessonId = '' } = useParams();
  // one lesson per page: going from one lesson's address to another's starts
  // the other afresh rather than showing the first while it loads
  return <LessonPage key={lessonId} lessonId={lessonId} />;
}

function LessonPage({ lessonId }: { lessonId: string }): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { state } = useLocation();
  const course = params.get('course');
  const title = (state as { title?: unknown } | null)?.title;
  // opened from Learn's own path: back there, on the same course, rather than to the course's page
  const from = (state as { from?: unknown } | null)?.from;
  const learnHome = typeof from === 'string' && /^\/app\/learn(\?|$)/.test(from) ? from : null;
  // a lesson in progress is never drawn from memory: where it stands is the server's to say, every time it is opened
  const { data, error, loading, reload } = useApiGet<LessonSessionView>(`/lessons/${encodeURIComponent(lessonId)}/session`, { fresh: true });
  // the course you are on is the variety Stories opens on (stories/prefs.ts)
  useEffect(() => rememberCourseDialect(data?.dialect), [data?.dialect]);

  const exitTo = learnHome ?? (course ? `/app/learn/course/${encodeURIComponent(course)}` : '/app/learn');

  // the lesson's own frame while its session is asked for, with the way out the lesson will have
  if (loading && !data) return <LessonPlaceholder label={t('lesson.loading')} exitTo={exitTo} />;
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
      // the results offer the course's next lesson, read from its map once this one is done
      courseId={course}
      lessonId={lessonId}
      exitTo={exitTo}
      exitLabel={course && !learnHome ? t('lesson.backToCourse') : t('lesson.backToLearn')}
      onPractise={(exerciseIds) => navigate('/app/learn/review', { state: { exerciseIds } })}
      onRestart={reload}
    />
  );
}
