// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
// the lesson's end may offer reminders (push/ReminderOffer.tsx)
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('expo-audio', () => import('../recording/testing/fakeMic'));
vi.mock('expo-file-system/legacy', () => import('../recording/testing/fakeMic'));
// the phone's recorder, as Metro picks it on iOS and Android
vi.mock('./useRecorder', () => import('./useRecorder.native'));
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), addListener: () => () => undefined, isFocused: () => true }),
  useFocusEffect: (run: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react') as typeof import('react');
    useEffect(() => run(), [run]);
  },
}));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { mic } from '../recording/testing/fakeMic';
import type { ApiResult } from '../api/types';
import { LessonPlayerScreen, SessionPlayer } from './LessonPlayerScreen';
import type { SessionResults, SessionView } from './types';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const view: SessionView = {
  sessionId: 's1',
  lessonId: 'l1',
  expiresAt: '2999-01-01T00:00:00Z',
  completed: false,
  answered: {},
  exercises: [{ id: 'mc', type: 'multiple_choice', prompt: 'Water?', options: ['av', 'nan'], position: 1 }],
};
const paths = { answers: () => '/sessions/s1/answers', retry: () => '/sessions/s1/retry', complete: () => '/sessions/s1/complete' };
const results: SessionResults = {
  correct: 1,
  total: 1,
  accuracy: 1,
  mistakes: [],
  xpAwarded: 10,
  streak: { current: 3, longest: 3, freezes: 0, lastActiveOn: '2026-10-20' },
};
const serverDown: ApiResult<never> = { ok: false, error: { kind: 'server', message: 'unavailable', status: 503 } };
const standing = { 'GET /me': ok({ user: { skipSpeaking: false } }), 'GET /me/daily-goal': ok({ completed: false }) };

/** A route that answers from a list, one reply per call, the last one for ever after. */
function inTurn<T>(...replies: Array<ApiResult<T>>): () => ApiResult<T> {
  let i = 0;
  return () => replies[Math.min(i++, replies.length - 1)]!;
}

async function answerFirst(): Promise<void> {
  fireEvent.click(await screen.findByRole('radio', { name: 'av' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
}

describe('a lesson that cannot reach the server', () => {
  it('says a server hiccup is one — not that the phone is offline — and shows the verdict once a retry gets through', async () => {
    testAuth.client = fakeClient({
      ...standing,
      'POST /sessions/s1/answers': inTurn(serverDown, ok({ verdict: 'correct', accepted: true, duplicate: false })),
    });
    renderWithProviders(<SessionPlayer view={view} paths={paths} onExit={() => undefined} />);
    await answerFirst();
    const stalled = await screen.findByRole('button', { name: 'That didn’t go through — tap to try again' });
    expect(screen.queryByText('You’re offline — tap to retry')).toBeNull();

    fireEvent.click(stalled);
    // the verdict, and its way on — not the same stalled bar again
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByText('That didn’t go through — tap to try again')).toBeNull();
  });

  it('says so when the results do not come, and adds them up again on a retry', async () => {
    testAuth.client = fakeClient({
      ...standing,
      'POST /sessions/s1/answers': ok({ verdict: 'correct', accepted: true, duplicate: false }),
      'POST /sessions/s1/complete': inTurn(serverDown, ok(results)),
    });
    const onExit = vi.fn();
    renderWithProviders(<SessionPlayer view={view} paths={paths} onExit={onExit} />);
    await answerFirst();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    // a way on and a way out, rather than "Tallying results…" for ever
    expect(await screen.findByText('Your answers are saved, but the results didn’t come through.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Lesson complete!')).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('offers to load a lesson again when it did not load', async () => {
    testAuth.client = fakeClient({ ...standing, 'GET /lessons/l1/session': inTurn(serverDown, ok(view)) });
    renderWithProviders(<LessonPlayerScreen lessonId="l1" onExit={() => undefined} />);
    expect(await screen.findByText('Couldn’t load the lesson.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('radio', { name: 'av' })).toBeTruthy();
  });
});

describe('the way out of a lesson', () => {
  it('is a button a finger can find, named for what it does', async () => {
    testAuth.client = fakeClient(standing);
    const onExit = vi.fn();
    renderWithProviders(<SessionPlayer view={view} paths={paths} onExit={onExit} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Quit lesson' }));
    await waitFor(() => expect(onExit).toHaveBeenCalled());
  });
});

describe('one speaking exercise after another', () => {
  const twoToSay: SessionView = {
    ...view,
    exercises: [
      { id: 'sp1', type: 'speaking', prompt: 'Silav', position: 1 },
      { id: 'sp2', type: 'speaking', prompt: 'Spas', position: 2 },
    ],
  };

  it('starts the next afresh: a take still running when the first is skipped is stopped and deleted, not carried over', async () => {
    mic.reset();
    testAuth.client = fakeClient(standing);
    renderWithProviders(<SessionPlayer view={twoToSay} paths={paths} onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start recording' }));
    await screen.findByRole('button', { name: 'Stop recording' });
    act(() => mic.recorder!.run(2000));

    fireEvent.click(screen.getByRole('button', { name: 'Can’t do this now — skip' }));
    expect(await screen.findByText('Spas')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop recording' })).toBeNull();
    await waitFor(() => expect(mic.deleted).toEqual(['file:///cache/Audio/take-1.m4a']));
    expect(mic.modes.at(-1)).toEqual({ allowsRecording: false, playsInSilentMode: true });
  });
});
