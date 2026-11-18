// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { cleanup, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { CourseMap } from '../coursemap/types';
import { NextLessonScreen } from './NextLessonScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const map = (states: Array<'unlocked' | 'completed' | 'locked'>): CourseMap => ({
  course: { id: 'kmr', title: 'The Kurmanji Road' },
  units: [
    {
      unitId: 'u1',
      title: 'Hello',
      skills: states.map((state, i) => ({ skillId: `s${i}`, level: 1, title: `Skill ${i}`, state, strength: 0, hasGrammar: false, firstLessonId: state === 'locked' ? null : `l${i}` })),
    },
  ],
});

function open(routes: Parameters<typeof fakeClient>[0]) {
  testAuth.client = fakeClient(routes);
  const onLesson = vi.fn();
  const onLearn = vi.fn();
  renderWithProviders(<NextLessonScreen onLesson={onLesson} onLearn={onLearn} />);
  return { onLesson, onLearn };
}

const COURSES = { 'GET /courses': ok({ courses: [{ id: 'kmr', title: 'The Kurmanji Road', dialect: 'kmr' }] }) };

describe('your next lesson', () => {
  it('opens the lesson Learn’s card would start, with its course', async () => {
    const { onLesson, onLearn } = open({ ...COURSES, 'GET /courses/kmr/map': ok(map(['unlocked', 'locked'])) });
    await waitFor(() => expect(onLesson).toHaveBeenCalledWith('l0', 'kmr'));
    expect(onLearn).not.toHaveBeenCalled();
  });

  it('goes to Learn when the courses cannot be read', async () => {
    const { onLesson, onLearn } = open({ 'GET /courses': fail({ kind: 'network', status: 0 }) });
    await waitFor(() => expect(onLearn).toHaveBeenCalledTimes(1));
    expect(onLesson).not.toHaveBeenCalled();
  });

  it('goes to Learn when everything open is finished', async () => {
    const { onLesson, onLearn } = open({ ...COURSES, 'GET /courses/kmr/map': ok(map(['completed', 'completed'])) });
    await waitFor(() => expect(onLearn).toHaveBeenCalledTimes(1));
    expect(onLesson).not.toHaveBeenCalled();
  });
});
