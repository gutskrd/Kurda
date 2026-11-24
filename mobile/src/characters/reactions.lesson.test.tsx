// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('expo-audio', () => import('../recording/testing/fakeMic'));
vi.mock('expo-file-system/legacy', () => import('../recording/testing/fakeMic'));
vi.mock('../lesson/useRecorder', () => import('../lesson/useRecorder.native'));
vi.mock('../navigation/hardwareBack', () => import('../navigation/testing/hardwareBack'));
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), addListener: () => () => undefined, isFocused: () => true }),
  useFocusEffect: (run: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react') as typeof import('react');
    useEffect(() => run(), [run]);
  },
}));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactionTake } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { SessionPlayer } from '../lesson/LessonPlayerScreen';
import type { SessionView } from '../lesson/types';
import { FakeAudio } from './testing/audio';
import { ReactionCaption } from './ReactionCaption';
import { resetReactions } from './reactions';

/* A lesson’s verdicts on the phone: the character who stands there says the line, and nobody else does. */

patchReactNativeWeb({ reduceMotion: true });

const MISS = 'https://cdn.test/hevalo-miss-1.wav';
const HERS = 'https://cdn.test/xezo-miss-1.wav';
const TAKES: ReactionTake[] = [
  { character: 'hevalo', id: 'miss-1', src: MISS, voice: { speaker: 'hevalo' } },
  { character: 'xezo', id: 'miss-1', src: HERS, voice: { speaker: 'xezo' } },
];
const paths = { answers: () => '/sessions/s1/answers', retry: () => '/sessions/s1/retry', complete: () => '/sessions/s1/complete' };
const standing = { 'GET /me': ok({ user: { skipSpeaking: false } }), 'GET /me/daily-goal': ok({ completed: false }) };
const miss = ok({ verdict: 'incorrect', accepted: false, duplicate: false, correction: 'av' });

function lesson(over: Partial<SessionView['exercises'][number]> = {}, dialect = 'kurmanji', graded: ReturnType<typeof ok> = miss): void {
  const view: SessionView = {
    sessionId: 's1',
    lessonId: 'l1',
    expiresAt: '2999-01-01T00:00:00Z',
    completed: false,
    answered: {},
    dialect,
    exercises: [{ id: 'mc', type: 'multiple_choice', prompt: 'Water?', options: ['av', 'nan'], position: 1, ...over }],
  } as SessionView;
  testAuth.client = fakeClient({ ...standing, 'POST /sessions/s1/answers': graded });
  renderWithProviders(
    <>
      <SessionPlayer view={view} paths={paths} onExit={() => undefined} />
      <ReactionCaption />
    </>,
  );
}

async function answerWrong(): Promise<void> {
  fireEvent.click(await screen.findByRole('radio', { name: 'nan' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  await screen.findByRole('button', { name: 'Continue' });
}

beforeEach(() => {
  FakeAudio.made = [];
  vi.stubGlobal('Audio', FakeAudio);
  resetReactions(TAKES);
});

afterEach(() => {
  cleanup();
  resetReactions();
  vi.unstubAllGlobals();
});

describe('a verdict’s reaction line', () => {
  it('is Hevalo’s when he is the one at the window, and says what it means on a tap', async () => {
    lesson();
    await answerWrong();
    const caption = await screen.findByRole('button', { name: 'Hevalo says “Xeman nexwe!”' });
    expect(FakeAudio.of(MISS)?.paused).toBe(false);
    // He is drawn there, so the caption has no face of its own.
    expect(screen.queryByTestId('reaction-caption-face')).toBeNull();
    fireEvent.click(caption);
    expect(await screen.findByText('No worries!')).toBeTruthy();
  });

  it('waits for the answer’s own recording, then comes from Xezo, who says it', async () => {
    const MODEL = 'https://cdn.test/xezo-model.wav';
    lesson({ modelAudioUrl: MODEL, modelAudioVoice: { speaker: 'xezo' } }, 'kurmanji', ok({ verdict: 'incorrect', accepted: false, duplicate: false, correction: 'av', modelAudioUrl: MODEL, modelAudioVoice: { speaker: 'xezo' } }));
    await answerWrong();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900));
    });
    // Her recording of the answer is playing: nothing is said over it.
    expect(FakeAudio.of(MODEL)?.paused).toBe(false);
    expect(FakeAudio.of(HERS)).toBeUndefined();
    act(() => FakeAudio.of(MODEL)!.finish());
    expect(await screen.findByRole('button', { name: 'Xezo says “Şaşî jî hînbûn e.”' })).toBeTruthy();
    expect(FakeAudio.of(HERS)?.paused).toBe(false);
    expect(FakeAudio.of(MISS)).toBeUndefined();
  });

  it('is nobody’s while Hamo is the one on the stage', async () => {
    lesson({ modelAudioUrl: 'https://cdn.test/hamo.wav', modelAudioVoice: { speaker: 'hamo' } });
    await answerWrong();
    await new Promise((r) => setTimeout(r, 600));
    expect(FakeAudio.of(MISS)).toBeUndefined();
    expect(screen.queryByRole('button', { name: /says/ })).toBeNull();
  });

  it('is nobody’s through a Soranî lesson', async () => {
    lesson({ prompt: 'ئاو؟', options: ['av', 'nan'] }, 'sorani');
    await answerWrong();
    await new Promise((r) => setTimeout(r, 600));
    expect(FakeAudio.of(MISS)).toBeUndefined();
  });
});
