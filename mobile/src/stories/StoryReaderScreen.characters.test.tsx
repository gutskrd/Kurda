// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { encodeLipsync, lessonAudioKey, type StoryDetail } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { characterLayers } from '../characters/layers';
import { fakeFrames, type Frames } from '../characters/testing/audio';
import { resetPrefsCache } from './prefs';
import { NANE_GERM } from './testing/views';
import { StoryReaderScreen } from './StoryReaderScreen';

// jsdom has no matchMedia, and react-native-web reads the colour scheme and
// Reduce Motion through it
vi.hoisted(() => {
  window.matchMedia ??= ((media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

/** the narrator's one player: where it is, and the end of a sentence, are the test's to say */
const player = vi.hoisted(() => ({
  currentTime: 0,
  duration: 1,
  playing: false,
  source: '' as string,
  status: null as null | ((s: { didJustFinish: boolean }) => void),
}));

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('expo-audio', () => ({
  createAudioPlayer: () => ({
    get currentTime() {
      return player.currentTime;
    },
    get duration() {
      return player.duration;
    },
    get playing() {
      return player.playing;
    },
    addListener: (_event: string, listener: (s: { didJustFinish: boolean }) => void) => {
      player.status = listener;
      return { remove: () => undefined };
    },
    replace: ({ uri }: { uri: string }) => {
      player.source = uri;
      player.currentTime = 0;
    },
    play: () => {
      player.playing = true;
    },
    pause: () => {
      player.playing = false;
    },
    setPlaybackRate: () => undefined,
    remove: () => undefined,
  }),
}));

const FIRST = 'Dayika min nan dipêje.';
const SECOND = 'Nan germ e.';
const OPEN = encodeLipsync({
  durationMs: 1000,
  cues: [
    { startMs: 0, viseme: 'rest' },
    { startMs: 100, viseme: 'a' },
    { startMs: 800, viseme: 'rest' },
  ],
});

function story(voiced: boolean): StoryDetail {
  return {
    ...NANE_GERM,
    audio: { [lessonAudioKey(FIRST)]: 'https://media.test/1.wav', [lessonAudioKey(SECOND)]: 'https://media.test/2.wav' },
    ...(voiced
      ? {
          voices: {
            [lessonAudioKey(FIRST)]: { speaker: 'hevalo' as const, lipsync: OPEN },
            [lessonAudioKey(SECOND)]: { speaker: 'xezo' as const, lipsync: OPEN },
          },
        }
      : {}),
  };
}

let frames: Frames;

beforeEach(() => {
  localStorage.clear();
  resetPrefsCache();
  Object.assign(player, { currentTime: 0, duration: 1, playing: false, source: '', status: null });
  frames = fakeFrames();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function read(s: StoryDetail): void {
  testAuth.client = fakeClient({
    'GET /stories/nane-germ': ok(s),
    'GET /story-games/options': ok({ canHostOpen: false }),
    'GET /story-games/active': ok({ games: [] }),
  });
  renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
}

describe('the story reader’s speaking characters', () => {
  it('shows who says the sentence being read, saying it, and the next speaker with the next line', async () => {
    read(story(true));
    const listen = await screen.findByRole('button', { name: 'Listen to paragraph 1' });
    expect(screen.queryByRole('img', { name: /^Said by/ })).toBeNull();

    fireEvent.click(listen);
    expect(await screen.findByRole('img', { name: 'Said by Hevalo' })).toBeTruthy();
    expect(player.source).toBe('https://media.test/1.wav');
    player.currentTime = 0.4;
    act(() => frames.step());
    const drawn = () => [...document.querySelectorAll('svg[data-markup]')].map((el) => el.getAttribute('data-markup'));
    expect(drawn()).toContain(characterLayers('hevalo', 'bust').mouths.a);

    // the first line ends: the second, said by somebody else
    act(() => player.status?.({ didJustFinish: true }));
    expect(await screen.findByRole('img', { name: 'Said by Xezo' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Said by Hevalo' })).toBeNull();
  });

  it('shows nobody when no line of the story has a speaker', async () => {
    read(story(false));
    fireEvent.click(await screen.findByRole('button', { name: 'Listen to paragraph 1' }));
    expect(await screen.findByRole('button', { name: 'Pause paragraph 1' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: /^Said by/ })).toBeNull();
  });
});
