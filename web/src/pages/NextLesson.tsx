import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';
import { LessonPlaceholder } from '../learn/LessonPlaceholder';
import { courseProgress } from '../learn/map';
import { useCourses } from '../learn/useCourses';

/**
 * "Your next lesson" (/app/learn/next): the first lesson up next in the first course with one, where a new account lands
 * after confirming its email. Anything that prevents finding one goes to Learn. It shows the lesson's frame in the
 * lesson's shell (App.tsx) while looking, so the lesson opens into a picture already there.
 */
export function NextLesson(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { entries, error } = useCourses();

  useEffect(() => {
    if (error) {
      navigate('/app/learn', { replace: true });
      return;
    }
    if (!entries) return;
    for (const { course, map } of entries) {
      const next = map ? courseProgress(map).next : null;
      if (next) {
        navigate(`/app/learn/lesson/${next.lessonId}?course=${encodeURIComponent(course.id)}`, {
          replace: true,
          state: { title: next.title },
        });
        return;
      }
    }
    navigate('/app/learn', { replace: true });
  }, [entries, error, navigate]);

  // The lesson's frame from the first moment, since this page only ever leads to a lesson.
  return <LessonPlaceholder label={t('lesson.loading')} />;
}
