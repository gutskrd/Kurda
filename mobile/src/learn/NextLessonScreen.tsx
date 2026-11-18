import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { CourseMap, CourseSummary } from '../coursemap/types';
import { GradientBackground } from '../theme/glass';
import { Loading } from '../theme/Loading';
import { nextStep } from './next';

/**
 * "Your next lesson", the website's /app/learn/next: finds the lesson Learn's card would start (learn/next.ts) and
 * opens it in this screen's place. A course list or map that cannot be read, or nothing left to start, leaves for
 * Learn instead.
 */
export function NextLessonScreen({
  onLesson,
  onLearn,
}: {
  onLesson: (lessonId: string, courseId: string) => void;
  onLearn: () => void;
}): React.JSX.Element {
  const { client } = useAuth();

  useEffect(() => {
    let live = true;
    void (async () => {
      const list = await client.get<{ courses: CourseSummary[] }>('/courses');
      if (!live) return;
      if (!list.ok) {
        onLearn();
        return;
      }
      const maps = await Promise.all(list.data.courses.map((c) => client.get<CourseMap>(`/courses/${c.id}/map`)));
      if (!live) return;
      const step = nextStep(
        list.data.courses.map((c, i) => {
          const map = maps[i]!;
          return { course: { id: c.id, title: c.title, dialect: c.dialect }, map: map.ok ? map.data : null };
        }),
      );
      if (step && step.kind !== 'review') onLesson(step.lessonId, step.courseId);
      else onLearn();
    })();
    return () => {
      live = false;
    };
    // Once, as the screen opens.
  }, [client]);

  return (
    <GradientBackground>
      <View style={styles.centre}>
        <Loading size="large" />
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
