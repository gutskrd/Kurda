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
 * A lesson (/app/learn/lesson/:lessonId): the learner's session for it, resumed where it stopped since every answer is
 * saved. `?course=` is where back goes and whose next lesson the results offer; the map's name for it comes in the
 * navigation state.
 */
export function Lesson(): React.JSX.Element {
  const { lessonId = '' } = useParams();
  // One lesson per page: moving to another lesson's address starts it afresh rather than showing the first meanwhile.
  return <LessonPage key={lessonId} lessonId={lessonId} />;
}

function LessonPage({ lessonId }: { lessonId: string }): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { state } = useLocation();
  const course = params.get('course');
  const title = (state as { title?: unknown } | null)?.title;
  // Opened from Learn's own path: back there, on the same course, not to the course's page.
  const from = (state as { from?: unknown } | null)?.from;
  const learnHome = typeof from === 'string' && /^\/app\/learn(\?|$)/.test(from) ? from : null;
  // A lesson in progress is never drawn from memory; the server says where it stands each time.
  const { data, error, loading, reload } = useApiGet<LessonSessionView>(`/lessons/${encodeURIComponent(lessonId)}/session`, { fresh: true });
  // The current course is the variety Stories opens on (stories/prefs.ts).
  useEffect(() => rememberCourseDialect(data?.dialect), [data?.dialect]);

  const exitTo = learnHome ?? (course ? `/app/learn/course/${encodeURIComponent(course)}` : '/app/learn');

  // The lesson's frame while its session loads, with the lesson's way out.
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
      // A session the server closed is replaced by a new one, started afresh.
      key={data.sessionId}
      session={data}
      kind="lesson"
      paths={LESSON_PATHS}
      title={typeof title === 'string' ? title : undefined}
      dialect={data.dialect}
      grammarMd={data.grammarMd}
      // The results offer the course's next lesson, read from its map once this one is done.
      courseId={course}
      lessonId={lessonId}
      exitTo={exitTo}
      exitLabel={course && !learnHome ? t('lesson.backToCourse') : t('lesson.backToLearn')}
      onPractise={(exerciseIds) => navigate('/app/learn/review', { state: { exerciseIds } })}
      onRestart={reload}
    />
  );
}
