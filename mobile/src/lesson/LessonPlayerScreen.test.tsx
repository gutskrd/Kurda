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
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { mic } from '../recording/testing/fakeMic';
import type { ApiResult } from '../api/types';
import { LessonPlayerScreen, SessionPlayer } from './LessonPlayerScreen';
import { onSound, resetSounds } from '../feedback/sounds';
import { resetAutoplayPref, setAutoplay } from '../feedback/autoplayPref';
import { FakeAudio } from '../characters/testing/audio';
import { useInvitesQuieted } from '../play/quietInvites';
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
    // every first answer right and nothing put off
    expect(await screen.findByText('Perfect lesson!')).toBeTruthy();
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

describe('a run of right answers', () => {
  // the chime climbs with each one, and from the third the banner says how many
  it('is heard climbing and, from the third, named in the banner', async () => {
    resetSounds();
    const heard: string[] = [];
    const stop = onSound((f) => heard.push(f));
    try {
      const three: SessionView = {
        ...view,
        exercises: [1, 2, 3].map((n) => ({ id: `mc${n}`, type: 'multiple_choice' as const, prompt: `Water ${n}?`, options: ['av', 'nan'], position: n })),
      };
      testAuth.client = fakeClient({ ...standing, 'POST /sessions/s1/answers': ok({ verdict: 'correct', accepted: true, duplicate: false }) });
      renderWithProviders(<SessionPlayer view={three} paths={paths} onExit={() => undefined} />);
      for (let n = 1; n <= 3; n++) {
        // seconds apart for a person; here, faster than the sounds' pacing allows
        resetSounds();
        fireEvent.click(await screen.findByRole('radio', { name: 'av' }));
        fireEvent.click(screen.getByRole('button', { name: 'Check' }));
        await screen.findByRole('button', { name: 'Continue' });
        if (n < 3) {
          expect(screen.queryByTestId('lesson-in-a-row')).toBeNull();
          fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        }
      }
      expect(screen.getByText('3 in a row')).toBeTruthy();
      expect(heard).toEqual(['correct-1', 'correct-2', 'correct-3']);
    } finally {
      stop();
    }
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

  /*
   * Once something is answered, the ✕ asks first — saying how far the lesson
   * has come and that the answers are kept — and staying is the first choice.
   */
  it('asks once something is answered, and keeping going keeps the lesson', async () => {
    testAuth.client = fakeClient(standing);
    const onExit = vi.fn();
    const resumed: SessionView = {
      ...view,
      answered: { mc: { verdict: 'correct', accepted: true } },
      exercises: [...view.exercises, { id: 'mc2', type: 'multiple_choice', prompt: 'Bread?', options: ['av', 'nan'], position: 2 }],
    };
    renderWithProviders(<SessionPlayer view={resumed} paths={paths} onExit={onExit} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Quit lesson' }));
    expect(await screen.findByText('You’ve done 1 of 2. Your answers are kept, so next time you pick up right here.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep going' }));
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'av' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Quit lesson' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe('a conversation', () => {
  const talk: SessionView = {
    ...view,
    exercises: [
      {
        id: 'cv',
        type: 'conversation',
        position: 1,
        speakers: [
          { name: 'Xezo', character: 'xezo' },
          { name: 'Hamo', character: 'hamo' },
        ],
        lines: [
          { speaker: 0, text: 'Tu dixwazî çi vexwî?' },
          { speaker: 1, text: 'Çayekê, spas.' },
        ],
        prompt: 'Hamo çi dixwaze?',
        options: ['Qehwe', 'Çay'],
      },
    ],
  };

  it('is answered by the option tapped, sent as its place in the options shown, and graded as multiple choice is', async () => {
    const client = fakeClient({
      ...standing,
      'POST /sessions/s1/answers': ok({ verdict: 'wrong', accepted: false, correction: 'Çay', duplicate: false }),
    });
    testAuth.client = client;
    renderWithProviders(<SessionPlayer view={talk} paths={paths} onExit={() => undefined} />);
    expect(await screen.findByText('Çayekê, spas.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check' }).getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'Qehwe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/sessions/s1/answers')?.body).toEqual({ exerciseId: 'cv', answer: { choice: 0 } });
    // the right one is marked where it was asked, and named in the banner
    expect(screen.getByRole('radio', { name: 'Çay, Correct' })).toBeTruthy();
    expect(screen.getByText('Not quite')).toBeTruthy();
  });
});

describe('one speaking exercise after another', () => {
  const twoToSay: SessionView = {
    ...view,
    exercises: [
      { id: 'sp1', type: 'speaking', prompt: 'Silav', position: 1 },
      { id: 'mc', type: 'multiple_choice', prompt: 'Water?', options: ['av', 'nan'], position: 2 },
      { id: 'sp2', type: 'speaking', prompt: 'Spas', position: 3 },
    ],
  };

  it('starts the next afresh: a take still running when the first is skipped is stopped and deleted, not carried over', async () => {
    mic.reset();
    testAuth.client = fakeClient({ ...standing, 'POST /sessions/s1/answers': ok({ verdict: 'correct', accepted: true, duplicate: false }) });
    renderWithProviders(<SessionPlayer view={twoToSay} paths={paths} onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start recording' }));
    await screen.findByRole('button', { name: 'Stop recording' });
    act(() => mic.recorder!.run(2000));

    // put off for the rest of the lesson, then brought back
    fireEvent.click(screen.getByRole('button', { name: 'Can’t do this now — skip' }));
    expect(await screen.findByText('No more speaking in this lesson')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await answerFirst();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Spas')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop recording' })).toBeNull();
    await waitFor(() => expect(mic.deleted).toEqual(['file:///cache/Audio/take-1.m4a']));
    expect(mic.modes.at(-1)).toEqual({ allowsRecording: false, playsInSilentMode: true });
  });
});

describe('a typed miss', () => {
  const typed: SessionView = {
    ...view,
    grammarMd: '## Fruit\n\n**Sêv** is apple.',
    dialect: 'kurmanji',
    exercises: [{ id: 'tr', type: 'translate', prompt: 'apple', position: 1 }],
  };

  // the answer beside the right one, the letters that differ marked, what kind of slip it was, and the tips one tap away
  it('is set beside the right answer, says only the marks differ, and offers the tips', async () => {
    testAuth.client = fakeClient({ ...standing, 'POST /sessions/s1/answers': ok({ verdict: 'wrong', accepted: false, correction: 'sêv', duplicate: false }) });
    renderWithProviders(<SessionPlayer view={typed} paths={paths} onExit={() => undefined} />);
    fireEvent.change(await screen.findByLabelText('Your translation'), { target: { value: 'sev' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('You wrote')).toBeTruthy();
    expect(screen.getByText('Right answer')).toBeTruthy();
    expect(screen.getByText('Only the marks differ: e → ê')).toBeTruthy();
    // the differing letter is marked in each, never by colour alone
    const marked = within(screen.getByTestId('lesson-verdict')).getByText('ê');
    const look = getComputedStyle(marked);
    expect(look.textDecorationLine || look.textDecoration).toMatch(/underline/);
    // Hevalo, who said it in his bubble, thinks it over with the learner there: the sheet brings in nobody else
    expect(screen.getByTestId('prompt-scene')).toBeTruthy();
    expect(screen.queryByTestId('lesson-stand-in')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Why? Read the tips' }));
    expect(await screen.findByText('Fruit')).toBeTruthy();
  });
});

describe('the verdict', () => {
  const five: SessionView = {
    ...view,
    exercises: [1, 2, 3, 4, 5].map((n) => ({ id: `mc${n}`, type: 'multiple_choice' as const, prompt: `Water ${n}?`, options: ['av', 'nan'], position: n })),
  };

  // praised in Kurdish, by Hevalo beside the question; a run named over the bar, and held a moment at five
  it('praises a right answer in Kurdish, names the run over the bar, and holds a run of five a moment before going on', async () => {
    const client = fakeClient({
      ...standing,
      'POST /sessions/s1/answers': ok({ verdict: 'correct', accepted: true, duplicate: false }),
      'POST /sessions/s1/complete': ok(results),
    });
    testAuth.client = client;
    renderWithProviders(<SessionPlayer view={five} paths={paths} onExit={() => undefined} />);
    for (let n = 1; n <= 5; n++) {
      fireEvent.click(await screen.findByRole('radio', { name: 'av' }));
      fireEvent.click(screen.getByRole('button', { name: 'Check' }));
      await screen.findByRole('button', { name: 'Continue' });
      if (n === 1) {
        expect(screen.getByText('Well done')).toBeTruthy();
        // he asked the question, so he reacts beside it: the sheet brings in nobody else
        expect(screen.getByTestId('prompt-scene')).toBeTruthy();
        expect(screen.queryByTestId('lesson-stand-in')).toBeNull();
      }
      if (n < 5) fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    }
    // the count is over the bar, and only there
    expect(screen.getByTestId('lesson-in-a-row').textContent).toBe('5 in a row');
    expect(screen.getAllByText(/in a row/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // the milestone holds the screen between this exercise and the next, and a tap moves on
    fireEvent.click(await screen.findByRole('button', { name: '5 in a row!' }));
    expect(screen.queryByRole('button', { name: '5 in a row!' })).toBeNull();
    await waitFor(() => expect(client.calls.some((c) => c.path === '/sessions/s1/complete')).toBe(true));
  });

  // where nobody else is on screen to react, Hevalo comes into the sheet: on the first answer and at a miss, not every time
  it('brings Hevalo into the sheet on the first answer and at a miss where nobody else is on screen', async () => {
    const written: SessionView = {
      ...view,
      exercises: [1, 2, 3].map((n) => ({ id: `wr${n}`, type: 'writing' as const, prompt: `What do you drink ${n}?`, position: n })),
    };
    testAuth.client = fakeClient({
      ...standing,
      'POST /sessions/s1/answers': (body) =>
        (body as { exerciseId: string }).exerciseId === 'wr3'
          ? ok({ verdict: 'wrong', accepted: false, correction: 'çay', duplicate: false })
          : ok({ verdict: 'correct', accepted: true, duplicate: false }),
    });
    renderWithProviders(<SessionPlayer view={written} paths={paths} onExit={() => undefined} />);
    const there: boolean[] = [];
    for (let n = 1; n <= 3; n++) {
      fireEvent.change(await screen.findByLabelText('Your written answer'), { target: { value: 'çay' } });
      fireEvent.click(screen.getByRole('button', { name: 'Check' }));
      await screen.findByRole('button', { name: 'Continue' });
      // leaning out of his window
      there.push(screen.queryByTestId('lesson-stand-in')?.querySelector('[data-testid="hevalo-window"]') != null);
      if (n < 3) fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    }
    expect(there).toEqual([true, false, true]);
  });
});

describe('pairs answered as they are made', () => {
  const pairs: SessionView = {
    ...view,
    exercises: [
      { id: 'mp', type: 'match_pairs', lefts: ['sêv', 'nan'], rights: ['bread', 'apple'], pairOf: [1, 0], position: 1 },
      { id: 'mc', type: 'multiple_choice', prompt: 'Water?', options: ['av', 'nan'], position: 2 },
    ],
  };

  it('has no Check, and sends the pairs by itself as the last one is made', async () => {
    const client = fakeClient({ ...standing, 'POST /sessions/s1/answers': ok({ verdict: 'correct', accepted: true, duplicate: false }) });
    testAuth.client = client;
    renderWithProviders(<SessionPlayer view={pairs} paths={paths} onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'sêv' }));
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'apple' }));
    // a wrong one first: nothing is sent for it
    fireEvent.click(screen.getByRole('button', { name: 'nan' }));
    fireEvent.click(screen.getByRole('button', { name: 'apple' }));
    expect(client.calls.filter((c) => c.path === '/sessions/s1/answers')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'bread' }));
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy();
    const sent = client.calls.filter((c) => c.path === '/sessions/s1/answers');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toEqual({
      exerciseId: 'mp',
      answer: {
        matches: [
          { left: 'sêv', right: 'apple' },
          { left: 'nan', right: 'bread' },
        ],
      },
    });
  });

  it('keeps Check, and sends the pairs as made, from a server that does not say which is which', async () => {
    const client = fakeClient({ ...standing, 'POST /sessions/s1/answers': ok({ verdict: 'wrong', accepted: false, duplicate: false }) });
    testAuth.client = client;
    const free: SessionView = { ...pairs, exercises: [{ ...pairs.exercises[0]!, pairOf: undefined }, pairs.exercises[1]!] };
    renderWithProviders(<SessionPlayer view={free} paths={paths} onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'sêv' }));
    fireEvent.click(screen.getByRole('button', { name: 'bread' }));
    fireEvent.click(screen.getByRole('button', { name: 'nan' }));
    fireEvent.click(screen.getByRole('button', { name: 'apple' }));
    expect(client.calls.filter((c) => c.path === '/sessions/s1/answers')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/sessions/s1/answers')?.body).toEqual({
      exerciseId: 'mp',
      answer: {
        matches: [
          { left: 'sêv', right: 'bread' },
          { left: 'nan', right: 'apple' },
        ],
      },
    });
  });
});

describe('a translation built from word tiles', () => {
  const tiled: SessionView = {
    ...view,
    dialect: 'kurmanji',
    exercises: [{ id: 'tr', type: 'translate', prompt: 'Bibore', bank: ['me', 'Excuse', 'water'], position: 1 }],
  };

  it('can be checked once a tile is on the line, and is sent as the line reads', async () => {
    const client = fakeClient({ ...standing, 'POST /sessions/s1/answers': ok({ verdict: 'correct', accepted: true, duplicate: false }) });
    testAuth.client = client;
    renderWithProviders(<SessionPlayer view={tiled} paths={paths} onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Translate this' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Excuse' }));
    expect(screen.getByRole('button', { name: 'Check' }).getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/sessions/s1/answers')?.body).toEqual({ exerciseId: 'tr', answer: { text: 'Excuse me' } });
  });
});

describe('the native recording after an answer', () => {
  const heard: SessionView = { ...view, exercises: [{ id: 'mc', type: 'multiple_choice', prompt: '“Sêv” çi ye?', options: ['apple', 'bread'], position: 1 }] };
  const right = ok({ verdict: 'correct', accepted: true, duplicate: false, modelAudioUrl: 'https://media.test/sev.mp3' });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAutoplayPref();
  });

  it('says itself a moment after the verdict', async () => {
    FakeAudio.made = [];
    vi.stubGlobal('Audio', FakeAudio);
    testAuth.client = fakeClient({ ...standing, 'POST /sessions/s1/answers': right });
    renderWithProviders(<SessionPlayer view={heard} paths={paths} onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'apple' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await screen.findByRole('button', { name: 'Hear it' });
    await waitFor(() => expect(FakeAudio.of('https://media.test/sev.mp3')?.paused).toBe(false));
  });

  it('waits for a tap when the learner has turned that off', async () => {
    FakeAudio.made = [];
    vi.stubGlobal('Audio', FakeAudio);
    await setAutoplay(false);
    testAuth.client = fakeClient({ ...standing, 'POST /sessions/s1/answers': right });
    renderWithProviders(<SessionPlayer view={heard} paths={paths} onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'apple' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await screen.findByRole('button', { name: 'Hear it' });
    await act(() => new Promise((done) => setTimeout(done, 500)));
    expect(FakeAudio.of('https://media.test/sev.mp3')?.paused).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Hear it' }));
    expect(FakeAudio.of('https://media.test/sev.mp3')?.paused).toBe(false);
  });
});

describe('listening', () => {
  const twoToHear: SessionView = {
    ...view,
    exercises: [
      { id: 'ls1', type: 'listening', audioUrl: 'https://media.test/silav.mp3', position: 1 },
      { id: 'mc', type: 'multiple_choice', prompt: 'Water?', options: ['av', 'nan'], position: 2 },
      { id: 'ls2', type: 'listening', audioUrl: 'https://media.test/spas.mp3', position: 3 },
    ],
  };

  afterEach(() => vi.unstubAllGlobals());

  // the clip is the question: it plays by itself, and "Can't listen now" puts listening off for the rest of the lesson
  it('plays itself, and can be put off for the rest of the lesson and brought back', async () => {
    FakeAudio.made = [];
    vi.stubGlobal('Audio', FakeAudio);
    testAuth.client = fakeClient({ ...standing, 'POST /sessions/s1/answers': ok({ verdict: 'correct', accepted: true, duplicate: false }) });
    renderWithProviders(<SessionPlayer view={twoToHear} paths={paths} onExit={() => undefined} />);
    await waitFor(() => expect(FakeAudio.of('https://media.test/silav.mp3')?.paused).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: 'Can’t listen now — skip' }));
    expect(await screen.findByText('No more listening in this lesson')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'av' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByText('No more listening in this lesson')).toBeNull();

    await answerFirst();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(FakeAudio.of('https://media.test/spas.mp3')?.paused).toBe(false));
  });
});

describe('the results', () => {
  const missed: SessionView = {
    ...view,
    lessonId: 'l1',
    exercises: [
      { id: 'mc', type: 'multiple_choice', prompt: 'Water?', options: ['av', 'nan'], position: 1 },
      { id: 'mc2', type: 'multiple_choice', prompt: 'Bread?', options: ['av', 'nan'], position: 2 },
    ],
  };
  /** a skill of one lesson, as the course map lists it */
  const skillOf = (skillId: string, title: string, state: string, lesson: { lessonId: string; title: string; completed: boolean }) => ({
    skillId,
    level: 1,
    title,
    state,
    strength: 0,
    hasGrammar: false,
    firstLessonId: lesson.lessonId,
    lessons: [{ ...lesson, position: 1 }],
  });
  const map = {
    course: { id: 'c1', title: 'Kurmancî' },
    units: [
      {
        unitId: 'u1',
        title: 'Basics',
        skills: [
          skillOf('s1', 'Silav', 'completed', { lessonId: 'l1', title: 'Silav', completed: true }),
          skillOf('s2', 'Malbat', 'unlocked', { lessonId: 'l2', title: 'Dê û bav', completed: false }),
        ],
      },
    ],
  };
  const finished: SessionResults = {
    ...results,
    correct: 1,
    total: 2,
    accuracy: 0.5,
    mistakes: [{ exerciseId: 'mc2', verdict: 'wrong', prompt: 'Bread?', correction: 'nan' }],
    streak: { current: 4, longest: 4, freezes: 0, lastActiveOn: '2026-10-28', daysLearned: 12, freezeProgress: 2, sessionsPerFreeze: 5 },
  };

  /** answer every turn there is, a miss's second try included */
  async function finish(turns: number): Promise<void> {
    for (let n = 0; n < turns; n++) {
      fireEvent.click(await screen.findByRole('radio', { name: 'av' }));
      fireEvent.click(screen.getByRole('button', { name: 'Check' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    }
  }

  // the mistakes can be practised at once; the course's next lesson leads while today's goal is still to meet
  it('offers the next lesson and practising the mistakes, and passes the kept streak on the way', async () => {
    testAuth.client = fakeClient({
      'GET /me': inTurn(
        ok({ user: { skipSpeaking: false, streak: { current: 3, lastActiveOn: '2026-10-27' } } }),
        ok({ user: { skipSpeaking: false, streak: { current: 4, lastActiveOn: '2026-10-28' } } }),
      ),
      'GET /me/daily-goal': inTurn(ok({ completed: false, earnedXp: 4, goal: 20 }), ok({ completed: false, earnedXp: 19, goal: 20 })),
      'POST /sessions/s1/answers': (body) =>
        ok(
          (body as { exerciseId: string }).exerciseId === 'mc'
            ? { verdict: 'correct', accepted: true, duplicate: false }
            : { verdict: 'wrong', accepted: false, correction: 'nan', duplicate: false },
        ),
      'POST /sessions/s1/retry': ok({ verdict: 'wrong', accepted: false, correction: 'nan' }),
      'POST /sessions/s1/complete': ok(finished),
      'GET /courses/c1/map': ok(map),
    });
    const onNext = vi.fn();
    const onPractise = vi.fn();
    renderWithProviders(
      <SessionPlayer view={missed} paths={paths} onExit={() => undefined} courseId="c1" onNext={onNext} onPractise={onPractise} onPath={() => undefined} />,
    );
    await finish(3);
    expect(await screen.findByText('Lesson complete!')).toBeTruthy();
    expect(screen.getByLabelText('Right first time: 50%, Good practice, 1 of 2')).toBeTruthy();
    // this sitting, timed from the first exercise shown: three answers in seconds is quick
    expect(screen.getByLabelText(/^Quick: 0 min \d+ s$/)).toBeTruthy();
    expect(await screen.findByText('19 of 20 XP today')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Next lesson' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Practise these now' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to the path' })).toBeTruthy();

    // today kept the streak: its moment comes first, then the way on that was chosen
    fireEvent.click(screen.getByRole('button', { name: 'Practise these now' }));
    fireEvent.click(await screen.findByTestId('lesson-streak-flame'));
    expect(await screen.findByRole('heading', { name: '4 day streak' })).toBeTruthy();
    expect(screen.getByLabelText('2 of 5 sessions to your next freeze')).toBeTruthy();
    expect(onPractise).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onPractise).toHaveBeenCalledWith(['mc2']);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('leads with Done once today’s goal is met, the next lesson still there for whoever wants it', async () => {
    testAuth.client = fakeClient({
      'GET /me': ok({ user: { skipSpeaking: false, streak: { current: 4, lastActiveOn: '2026-10-28' } } }),
      'GET /me/daily-goal': inTurn(ok({ completed: false, earnedXp: 12, goal: 20 }), ok({ completed: true, earnedXp: 27, goal: 20 })),
      'POST /sessions/s1/answers': ok({ verdict: 'correct', accepted: true, duplicate: false }),
      'POST /sessions/s1/complete': ok({ ...finished, correct: 2, accuracy: 1, mistakes: [] }),
      'GET /courses/c1/map': ok(map),
    });
    const onNext = vi.fn();
    const onExit = vi.fn();
    renderWithProviders(<SessionPlayer view={missed} paths={paths} onExit={onExit} courseId="c1" onNext={onNext} onPractise={() => undefined} onPath={() => undefined} />);
    await finish(2);
    expect(await screen.findByText('Perfect lesson!')).toBeTruthy();
    expect(await screen.findByText('Today’s goal is done. A good place to stop, or keep going.')).toBeTruthy();
    expect(screen.getByText('Daily goal reached. Nice work!')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Practise these now' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Next lesson' }));
    expect(onNext).toHaveBeenCalledWith('l2');
    expect(onExit).not.toHaveBeenCalled();
  });
});

describe('a lesson opened again', () => {
  const resumed: SessionView = {
    ...view,
    sessionId: 'resume1',
    answered: { mc: { verdict: 'wrong', accepted: false } },
    exercises: [
      { id: 'mc', type: 'multiple_choice', prompt: 'Water?', options: ['av', 'nan'], position: 1 },
      { id: 'mc2', type: 'multiple_choice', prompt: 'Bread?', options: ['av', 'nan'], position: 2 },
    ],
  };

  // the phone remembers the second tries it asked, so closing the app does not ask one twice
  it('does not ask a second try again that was asked before the app was closed', async () => {
    localStorage.setItem('hevalo:reasked:resume1', JSON.stringify(['mc']));
    testAuth.client = fakeClient({
      ...standing,
      'GET /lessons/l1/session': ok(resumed),
      'POST /sessions/resume1/answers': ok({ verdict: 'correct', accepted: true, duplicate: false }),
      'POST /sessions/resume1/complete': ok(results),
    });
    renderWithProviders(<LessonPlayerScreen lessonId="l1" onExit={() => undefined} />);
    expect(await screen.findByText('Bread?')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'nan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    // finished: "Water?" is not asked a second time
    expect(await screen.findByRole('button', { name: 'Done' })).toBeTruthy();
    expect(screen.queryByText('Water?')).toBeNull();
    await waitFor(() => expect(localStorage.getItem('hevalo:reasked:resume1')).toBeNull());
  });
});

describe('an invite to play', () => {
  function Banner(): React.JSX.Element {
    return <>{useInvitesQuieted() ? 'invite waits' : 'invite shows'}</>;
  }

  // the lesson is the one thing on the screen; an invite waits, and shows the moment the lesson is left
  it('waits while a lesson is open, and shows once it is closed', async () => {
    testAuth.client = fakeClient(standing);
    const { rerender } = renderWithProviders(
      <>
        <SessionPlayer view={view} paths={paths} onExit={() => undefined} />
        <Banner />
      </>,
    );
    expect(await screen.findByText('invite waits')).toBeTruthy();
    rerender(<Banner />);
    expect(await screen.findByText('invite shows')).toBeTruthy();
  });
});
