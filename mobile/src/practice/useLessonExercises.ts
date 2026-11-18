import { useEffect, useState } from 'react';
import type { GameDialect, GamesAvailability } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { exercisesOf, type PhoneExercise } from './exercises';

/**
 * The exercises to offer the learner now in their Kurdish; none until the answer arrives or if it fails.
 * `dialect` is null while the learner's Kurdish is unknown, and nothing is fetched then, so the list never
 * switches between varieties.
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
