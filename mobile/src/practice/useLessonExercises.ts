import { useEffect, useState } from 'react';
import type { GameDialect, GamesAvailability } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { exercisesOf, type PhoneExercise } from './exercises';

/**
 * The exercises to offer a learner now, in their Kurdish; none until the
 * answer has arrived, or when it cannot be had. `dialect` is null while the
 * screen asking does not know the learner's Kurdish yet: nothing is asked
 * then, so what is listed never changes from one variety's answer to the
 * other's.
 */
export function useLessonExercises(dialect: GameDialect | null): PhoneExercise[] {
  const { client } = useAuth();
  const [exercises, setExercises] = useState<PhoneExercise[]>([]);
  useEffect(() => {
    if (dialect === null) return;
    let live = true;
    void client.get<GamesAvailability>(`/games/availability?dialect=${dialect}`).then((res) => {
      if (live) setExercises(res.ok ? exercisesOf(res.data) : []);
    });
    return () => {
      live = false;
    };
  }, [client, dialect]);
  return exercises;
}
