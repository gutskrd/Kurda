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
vi.mock('./useRecorder', () => import('./useRecorder.native'));
vi.mock('../navigation/hardwareBack', () => import('../navigation/testing/hardwareBack'));
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), addListener: () => () => undefined, isFocused: () => true }),
  useFocusEffect: (run: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react') as typeof import('react');
    useEffect(() => run(), [run]);
  },
}));
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { FakeAudio } from '../characters/testing/audio';
import { resetHardwareBack } from '../navigation/testing/hardwareBack';
import { SessionPlayer } from './LessonPlayerScreen';
import type { Exercise, SessionView } from './types';

// Items with an `ask`, played through the session player as a learner meets them.

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  FakeAudio.made = [];
  vi.stubGlobal('Audio', FakeAudio);
});
afterEach(() => {
  cleanup();
  resetHardwareBack();
  vi.unstubAllGlobals();
});

const paths = { answers: () => '/sessions/s1/answers', retry: () => '/sessions/s1/retry', complete: () => '/sessions/s1/complete' };
const standing = { 'GET /me': ok({ user: { skipSpeaking: false } }), 'GET /me/daily-goal': ok({ completed: false }) };
const CLIP = 'https://media.test/said.wav';

function session(exercises: Exercise[], more: Partial<SessionView> = {}): SessionView {
  return { sessionId: 's1', lessonId: 'l1', expiresAt: '2999-01-01T00:00:00Z', completed: false, answered: {}, exercises, dialect: 'kurmanji', ...more };
}

function play(exercises: Exercise[], more: { view?: Partial<SessionView>; title?: string; kind?: 'lesson' | 'practice'; routes?: Parameters<typeof fakeClient>[0] } = {}) {
  testAuth.client = fakeClient({ ...standing, ...more.routes });
  return renderWithProviders(<SessionPlayer view={session(exercises, more.view)} paths={paths} onExit={() => undefined} title={more.title} kind={more.kind} />);
}

const meaning: Exercise = {
  id: 'm1',
  type: 'multiple_choice',
  ask: 'meaning',
  prompt: 'Silav!',
  promptTokens: [{ text: 'Silav', meanings: ['hi'] }, { text: '!' }],
  newWords: [{ ku: 'silav', en: 'hello' }],
  options: ['Hello!', 'Goodbye!', 'Thank you!'],
  modelAudioUrl: CLIP,
  modelAudioVoice: { speaker: 'hamo' },
};

describe('the headline of a question that says what it asks', () => {
  const cases: Array<[string, Exercise, string, Partial<SessionView>?]> = [
    ['meaning', meaning, 'What does this mean?'],
    ['choose-kurdish', { id: 'c', type: 'multiple_choice', ask: 'choose-kurdish', prompt: 'I am well.', options: ['Ez baş im.', 'Tu baş î.'] }, 'Select the correct translation'],
    ['picture', { id: 'p', type: 'multiple_choice', ask: 'picture', prompt: 'sêv', options: ['tea', 'apple'] }, 'Which picture is it?'],
    ['reply', { id: 'r', type: 'multiple_choice', ask: 'reply', prompt: 'Silav!', options: ['Silav, Hamo!', 'Na!'] }, 'What do you answer?'],
    ['missing, chosen', { id: 'g', type: 'multiple_choice', ask: 'missing', prompt: 'Ez ___ im.', options: ['baş', 'tu'] }, 'Fill in the missing word'],
    ['missing, typed', { id: 'gw', type: 'writing', ask: 'missing', prompt: 'Ez ___ im.' }, 'Fill in the missing word'],
    ['to-english', { id: 'te', type: 'translate', ask: 'to-english', prompt: 'Ez baş im.', bank: ['I', 'am', 'well'] }, 'Translate this sentence'],
    ['to-kurdish', { id: 'tk', type: 'translate', ask: 'to-kurdish', prompt: 'I am well.', bank: ['Ez', 'baş', 'im'] }, 'Write this in Kurmancî'],
    ['to-kurdish, written', { id: 'tw', type: 'writing', ask: 'to-kurdish', prompt: 'I am well.' }, 'Write this in Kurmancî'],
    ['to-kurdish, in a Soranî course', { id: 'ts', type: 'writing', ask: 'to-kurdish', prompt: 'I am well.' }, 'Write this in Soranî', { dialect: 'sorani' }],
    ['hear', { id: 'h', type: 'listening', ask: 'hear', audioUrl: CLIP, bank: ['Silav', 'Hamo'] }, 'Tap what you hear'],
    ['repeat', { id: 'rp', type: 'speaking', ask: 'repeat', prompt: 'Silav!', modelAudioUrl: CLIP, modelAudioVoice: { speaker: 'hamo' } }, 'Repeat after Hamo'],
    ['repeat, with nobody to hear', { id: 'rn', type: 'speaking', ask: 'repeat', prompt: 'Silav!' }, 'Say it aloud'],
  ];

  it.each(cases)('heads a %s item with what it asks', async (_, exercise, headline, view) => {
    play([exercise], { view });
    expect(await screen.findByRole('heading', { name: headline })).toBeTruthy();
  });

  // An item from before asks existed is asked as its type always was.
  it.each<[string, Exercise, string]>([
    ['multiple choice', { id: 'o1', type: 'multiple_choice', prompt: 'Water?', options: ['av', 'nan'] }, 'Choose the right answer'],
    ['translation', { id: 'o2', type: 'translate', prompt: 'apple' }, 'Translate this'],
    ['writing', { id: 'o3', type: 'writing', prompt: 'Write “apple” in Kurmancî.' }, 'Write your answer'],
    ['speaking', { id: 'o4', type: 'speaking', prompt: 'Silav', modelAudioUrl: CLIP, modelAudioVoice: { speaker: 'hamo' } }, 'Say it aloud'],
  ])('keeps the old headline on a %s item without an ask', async (_, exercise, headline) => {
    play([exercise]);
    expect(await screen.findByRole('heading', { name: headline })).toBeTruthy();
    expect(screen.queryByTestId('ask-line')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play at slow speed' })).toBeNull();
  });
});

describe('the bubble', () => {
  it('holds the line alone, with its play and slow play when it has a recording', async () => {
    play([meaning]);
    const line = await screen.findByTestId('ask-line');
    expect(line.textContent).toBe('Silav!');
    const scene = screen.getByTestId('prompt-scene');
    expect(within(scene).queryByText('What does this mean?')).toBeNull();
    expect(within(scene).getByRole('button', { name: 'Hear a native speaker' })).toBeTruthy();

    // Slow is 0.75×, then full speed again after it.
    fireEvent.click(within(scene).getByRole('button', { name: 'Play at slow speed' }));
    expect(FakeAudio.of(CLIP)?.playbackRate).toBe(0.75);
    fireEvent.click(within(scene).getByRole('button', { name: 'Hear a native speaker' }));
    expect(FakeAudio.of(CLIP)?.playbackRate).toBe(1);
  });

  // The website plays the Kurdish line before a translation is answered, and so must the phone.
  it('plays a Kurdish line to translate into English, and offers nothing to play on an English one', async () => {
    const shown = play([{ id: 'te', type: 'translate', ask: 'to-english', prompt: 'Ez baş im.', modelAudioUrl: CLIP, modelAudioVoice: { speaker: 'hamo' } }]);
    expect(await screen.findByRole('button', { name: 'Hear a native speaker' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play at slow speed' })).toBeTruthy();
    shown.unmount();

    play([{ id: 'tk', type: 'translate', ask: 'to-kurdish', prompt: 'Yes, I am well.' }]);
    expect((await screen.findByTestId('ask-line')).textContent).toBe('Yes, I am well.');
    expect(screen.queryByRole('button', { name: 'Hear a native speaker' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play at slow speed' })).toBeNull();
  });

  it('opens a new word’s own meaning first, and dots it apart from the words already met', async () => {
    play([{ ...meaning, prompt: 'Silav Hamo!', promptTokens: [{ text: 'Silav', meanings: ['hi'] }, { text: ' ' }, { text: 'Hamo', meanings: ['Hamo'] }, { text: '!' }] }]);
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Silav' }));
    });
    const meanings = await screen.findByTestId('prompt-meanings');
    expect(meanings.textContent?.startsWith('hello')).toBe(true);
    expect(meanings.textContent).toContain('hi');
    // One word is new here, and only it has the new-word dots.
    expect(screen.getAllByTestId('fresh-word-dots')).toHaveLength(1);
  });

  it('shows the cue in a small pill under the bubble', async () => {
    play([{ id: 'r', type: 'multiple_choice', ask: 'reply', prompt: 'Silav!', cue: 'to two people', options: ['Silav li we!', 'Silav!'] }]);
    expect((await screen.findByTestId('ask-cue')).textContent).toBe('to two people');
  });
});

describe('the new word’s badge', () => {
  const second: Exercise = { id: 'm2', type: 'multiple_choice', ask: 'meaning', prompt: 'Erê.', options: ['Yes.', 'No.'] };

  it('stands in the lesson name’s place on a question that brings in a word, and goes once it is answered', async () => {
    play([meaning, second], { title: 'Silav!', routes: { 'POST /sessions/s1/answers': ok({ verdict: 'correct', accepted: true, duplicate: false }) } });
    const badge = await screen.findByTestId('lesson-new-word');
    expect(badge.textContent).toBe('New word');
    expect(badge.getAttribute('aria-label')).toBe('New word: silav');
    expect(screen.queryByTestId('lesson-title')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Hello!' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('radio', { name: 'Yes.' })).toBeTruthy();
    expect(screen.queryByTestId('lesson-new-word')).toBeNull();
    expect(screen.getByTestId('lesson-title').textContent).toBe('Silav!');
  });

  it('says “New words” for more than one', async () => {
    play([{ ...meaning, newWords: [{ ku: 'ez', en: 'I' }, { ku: 'me', en: 'am' }] }], { title: 'Silav!' });
    expect((await screen.findByTestId('lesson-new-word')).textContent).toBe('New words');
  });

  it('is not shown in practice, where nothing is new', async () => {
    play([meaning], { kind: 'practice' });
    expect(await screen.findByRole('heading', { name: 'What does this mean?' })).toBeTruthy();
    expect(screen.queryByTestId('lesson-new-word')).toBeNull();
  });
});

describe('the gap in a line', () => {
  const missing: Exercise = { id: 'g', type: 'multiple_choice', ask: 'missing', prompt: 'Ez ___ im.', options: ['baş', 'silav', 'Hamo'] };

  it('waits empty, takes the word chip chosen, and marks the right one when the choice was not', async () => {
    play([missing], { routes: { 'POST /sessions/s1/answers': ok({ verdict: 'wrong', accepted: false, correction: 'baş', duplicate: false }) } });
    const gap = await screen.findByTestId('ask-gap');
    expect(gap.getAttribute('aria-label')).toBe('Missing word');
    // The words either side of the gap stay in the bubble with it.
    expect(screen.getByTestId('ask-line').textContent).toContain('Ez');
    expect(screen.getByTestId('ask-line').textContent).toContain('im.');

    fireEvent.click(screen.getByRole('radio', { name: 'baş' }));
    expect(screen.getByTestId('ask-gap').textContent).toBe('baş');
    fireEvent.click(screen.getByRole('radio', { name: 'silav' }));
    expect(screen.getByTestId('ask-gap').textContent).toBe('silav');

    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('radio', { name: 'baş, Correct' })).toBeTruthy();
    expect(screen.getByTestId('ask-gap').textContent).toBe('silav');
  });

  it('holds the word as it is typed, for a gap to write in', async () => {
    play([{ id: 'gw', type: 'writing', ask: 'missing', prompt: 'Ez ___ im.' }]);
    fireEvent.change(await screen.findByLabelText('Your written answer'), { target: { value: 'baş' } });
    expect(screen.getByTestId('ask-gap').textContent).toBe('baş');
  });
});

describe('the pictures to choose among', () => {
  const picture: Exercise = { id: 'p', type: 'multiple_choice', ask: 'picture', prompt: 'sêv', options: ['tea', 'apple', 'house', 'dog'] };

  it('are cards named for what they show, each picture drawn and no word written on it', async () => {
    play([picture]);
    await screen.findByTestId('picture-choices');
    for (const name of ['tea', 'apple', 'house', 'dog']) expect(screen.getByRole('radio', { name })).toBeTruthy();
    const cards = screen.getAllByTestId('picture-card');
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      expect(card.querySelector('svg[data-xml="drawn"]')).toBeTruthy();
      expect(card.textContent).toMatch(/^\d$/);
    }
    // The word is the question, large in the bubble.
    expect(screen.getByTestId('ask-line').textContent).toBe('sêv');
  });

  it('marks the right picture where it stands after a miss, and does not name it in the verdict', async () => {
    play([picture], { routes: { 'POST /sessions/s1/answers': ok({ verdict: 'wrong', accepted: false, correction: 'apple', duplicate: false }) } });
    fireEvent.click(await screen.findByRole('radio', { name: 'house' }));
    expect(screen.getByRole('radio', { name: 'house' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('radio', { name: 'apple, Correct' })).toBeTruthy();
    expect(within(screen.getByTestId('lesson-verdict')).queryByText('apple')).toBeNull();
  });
});
