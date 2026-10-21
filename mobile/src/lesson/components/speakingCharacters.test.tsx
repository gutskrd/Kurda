// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { encodeLipsync, type RecordingVoice } from '@kurda/shared';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { characterLayers } from '../../characters/layers';
import { FakeAudio, fakeFrames, type Frames } from '../../characters/testing/audio';
import type { Exercise } from '../types';
import { ListeningExercise } from './ListeningExercise';
import { SpeakingExercise } from './SpeakingExercise';
import { FeedbackFooter } from './FeedbackFooter';

const CLIP = 'https://media.test/silav.wav';
const SAID: RecordingVoice = {
  speaker: 'xezo',
  lipsync: encodeLipsync({
    durationMs: 800,
    cues: [
      { startMs: 0, viseme: 'rest' },
      { startMs: 100, viseme: 'a' },
      { startMs: 500, viseme: 'rest' },
    ],
  }),
};

let frames: Frames;

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  FakeAudio.made = [];
  vi.stubGlobal('Audio', FakeAudio);
  frames = fakeFrames();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function settle(): Promise<void> {
  await act(async () => undefined);
}

/** the shape of the mouth Xezo shows now */
function mouth(): string | undefined {
  const drawn = [...document.querySelectorAll('svg[data-markup]')].map((el) => el.getAttribute('data-markup'));
  return Object.entries(characterLayers('xezo', 'bust').mouths).find(([, xml]) => drawn.includes(xml))?.[0];
}

function listening(extra: Partial<Exercise> = {}): Exercise {
  return { id: 'l1', type: 'listening', audioUrl: CLIP, ...extra };
}

const noop = () => undefined;

describe('the lesson’s speaking characters', () => {
  it('shows who says a listening clip beside its play button, and says it with the sound', async () => {
    renderWithProviders(
      <ListeningExercise exercise={listening({ audioVoice: SAID })} text="" onChangeText={noop} onSkip={noop} disabled={false} />,
    );
    await settle();
    expect(screen.getByRole('img', { name: 'Said by Xezo' })).toBeTruthy();
    expect(mouth()).toBe('rest');

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await settle();
    const clip = FakeAudio.of(CLIP)!;
    expect(clip.paused).toBe(false);
    clip.currentTime = 0.2;
    act(() => frames.step());
    expect(mouth()).toBe('a');

    act(() => clip.finish());
    await settle();
    expect(mouth()).toBe('rest');
    expect(frames.pending).toBe(0);
  });

  it('keeps the listening exercise as it was when nobody has been chosen to say the clip', async () => {
    renderWithProviders(<ListeningExercise exercise={listening()} text="" onChangeText={noop} onSkip={noop} disabled={false} />);
    await settle();
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: /^Said by/ })).toBeNull();
  });

  it('shows nobody for a speaker this version of the app cannot draw', async () => {
    const stranger = { speaker: 'somebody' } as unknown as RecordingVoice;
    renderWithProviders(
      <ListeningExercise exercise={listening({ audioVoice: stranger })} text="" onChangeText={noop} onSkip={noop} disabled={false} />,
    );
    await settle();
    expect(screen.queryByRole('img', { name: /^Said by/ })).toBeNull();
  });

  it('shows who says the native model in a speaking exercise, and nobody without one', async () => {
    const speaking = (voice?: RecordingVoice): Exercise => ({
      id: 's1',
      type: 'speaking',
      prompt: 'Silav',
      modelAudioUrl: CLIP,
      ...(voice ? { modelAudioVoice: voice } : {}),
    });
    const props = { onSetRecorded: noop, selfRating: null, onRate: noop, onSkip: noop, disabled: false };
    const view = renderWithProviders(<SpeakingExercise exercise={speaking({ speaker: 'hamo' })} {...props} />);
    await settle();
    expect(screen.getByRole('img', { name: 'Said by Hamo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hear a native speaker' })).toBeTruthy();
    view.unmount();

    renderWithProviders(<SpeakingExercise exercise={speaking()} {...props} />);
    await settle();
    expect(screen.getByRole('button', { name: 'Hear a native speaker' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: /^Said by/ })).toBeNull();
  });

  it('shows who says the model once an answer is graded, and nobody without one', async () => {
    const feedback = (voice?: RecordingVoice) => ({
      verdict: 'wrong' as const,
      accepted: false,
      correction: 'silav',
      modelAudioUrl: CLIP,
      ...(voice ? { modelAudioVoice: voice } : {}),
    });
    const props = { canCheck: true, submitting: false, onCheck: noop, onContinue: noop };
    const view = renderWithProviders(<FeedbackFooter feedback={feedback({ speaker: 'hevalo' })} {...props} />);
    await settle();
    expect(screen.getByRole('img', { name: 'Said by Hevalo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hear it' })).toBeTruthy();
    view.unmount();

    renderWithProviders(<FeedbackFooter feedback={feedback()} {...props} />);
    await settle();
    expect(screen.getByRole('button', { name: 'Hear it' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: /^Said by/ })).toBeNull();
  });
});
