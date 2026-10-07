import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loading } from '../components/states';
import { useT } from '../i18n/I18nProvider';
import { courseProgress } from '../learn/map';
import { useCourses } from '../learn/useCourses';

/**
 * "Your next lesson" (/app/learn/next): the first lesson up next in the first
 * course that has one — for somebody who has just signed up, the first lesson
 * of the first course. Where a new account lands after confirming its email:
 * the community wall can wait, and the reason most people came cannot.
 * Anything that stops it finding one goes to Learn instead, which shows every
 * course.
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

  return <Loading label={t('lesson.loading')} />;
}
