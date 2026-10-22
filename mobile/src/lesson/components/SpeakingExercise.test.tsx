// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../../play/testing/native'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('expo-audio', () => import('../../recording/testing/fakeMic'));
vi.mock('expo-file-system/legacy', () => import('../../recording/testing/fakeMic'));

/*
 * Which recorder the exercise gets. Metro hands a phone useRecorder.native.ts
 * and a browser useRecorder.ts; a test has no Metro, so it chooses here.
 */
const host = vi.hoisted(() => ({ phone: true }));
vi.mock('../useRecorder', async (importOriginal) => {
  const browser = await importOriginal<typeof import('../useRecorder')>();
  const phone = await import('../useRecorder.native');
  return { useRecorder: () => (host.phone ? phone.useRecorder() : browser.useRecorder()) };
});

import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Linking } from 'react-native';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { FakeAudio } from '../../characters/testing/audio';
import { DENIED, GRANTED, RecordingPresets, mic } from '../../recording/testing/fakeMic';
import { onHaptic, resetHaptics } from '../../feedback/haptics';
import type { HapticEvent } from '../../feedback/hapticPacing';
import type { Exercise, SelfRating } from '../types';
import { SpeakingExercise } from './SpeakingExercise';

const exercise: Exercise = { id: 's1', type: 'speaking', prompt: 'Silav', modelAudioUrl: 'https://media.test/silav.wav' };
const RECORDING = { allowsRecording: true, playsInSilentMode: true };
const PLAYBACK = { allowsRecording: false, playsInSilentMode: true };

let felt: HapticEvent[] = [];
let stopFeeling: () => void = () => undefined;
let openSettings = vi.fn(async () => undefined);

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  host.phone = true;
  mic.reset();
  FakeAudio.made = [];
  vi.stubGlobal('Audio', FakeAudio);
  openSettings = vi.fn(async () => undefined);
  Linking.openSettings = openSettings;
  resetHaptics();
  felt = [];
  stopFeeling = onHaptic((e) => felt.push(e));
});
afterEach(() => {
  stopFeeling();
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'visibilityState');
});

/** The exercise as the lesson player holds it: whether there is a take, and its rating. */
function speaking() {
  const said = { recorded: [] as boolean[], rated: [] as Array<SelfRating | null>, skipped: 0 };
  const view = renderWithProviders(
    <SpeakingExercise
      exercise={exercise}
      onSetRecorded={(r) => said.recorded.push(r)}
      selfRating={null}
      onRate={(r) => said.rated.push(r)}
      onSkip={() => (said.skipped += 1)}
      disabled={false}
    />,
  );
  return { said, view };
}

async function settle(): Promise<void> {
  await act(async () => undefined);
}

async function press(name: string | RegExp): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name }));
  await settle();
}

/** The app leaves the front (a call, the home screen), as the system tells it. */
async function leaveTheFront(): Promise<void> {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  await settle();
}

async function comeBack(): Promise<void> {
  Reflect.deleteProperty(document, 'visibilityState');
  document.dispatchEvent(new Event('visibilitychange'));
  await settle();
}

describe('speaking on a phone', () => {
  it('asks for the microphone only when record is first pressed', async () => {
    speaking();
    await settle();
    expect(mic.calls).toEqual([]);
    expect(screen.queryByText(/recording isn’t available/i)).toBeNull();

    await press('Start recording');
    expect(mic.calls).toEqual(['ask', 'prepare', 'record']);
  });

  it('says a refused microphone plainly, opens the settings, and lets the exercise be skipped', async () => {
    mic.answer = DENIED;
    const { said } = speaking();
    await press('Start recording');

    expect(screen.getByText(/The microphone is off for Hevalo/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start recording' })).toBeNull();
    // nothing was switched over to recording, so there is nothing to put back
    expect(mic.modes).toEqual([]);
    expect(mic.calls).toEqual(['ask']);
    expect(said.recorded).not.toContain(true);

    await press('Open Settings');
    expect(openSettings).toHaveBeenCalledTimes(1);

    const skip = screen.getByRole('button', { name: 'Can’t do this now — skip' });
    expect(skip.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(skip);
    expect(said.skipped).toBe(1);
  });

  it('offers record again once the microphone has been allowed in the settings', async () => {
    mic.answer = DENIED;
    speaking();
    await press('Start recording');
    expect(screen.queryByRole('button', { name: 'Start recording' })).toBeNull();

    mic.later = GRANTED;
    await leaveTheFront();
    await comeBack();
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeTruthy();
    expect(screen.queryByText(/The microphone is off for Hevalo/)).toBeNull();
  });

  it('records a take and hands it over to be heard and rated', async () => {
    const { said } = speaking();
    await press('Start recording');
    expect(screen.getByRole('button', { name: 'Stop recording' })).toBeTruthy();

    act(() => mic.recorder!.run(2400));
    expect(screen.getByText('2.4s')).toBeTruthy();

    await press('Stop recording');
    expect(await screen.findByRole('button', { name: 'Hear yourself' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Re-record' })).toBeTruthy();
    expect(screen.getByText('How did it sound to you?')).toBeTruthy();
    expect(said.recorded.at(-1)).toBe(true);
    // the take is felt as kept, once
    expect(felt).toEqual(['tap']);

    // heard back from its own file, beside the model
    await press('Hear yourself');
    expect(FakeAudio.of('file:///cache/Audio/take-1.m4a')?.paused).toBe(false);

    await press('Sounded right');
    expect(said.rated.at(-1)).toBe('good');
  });

  it('puts the audio session back on playback, heard with the ring switch on silent, before the take is heard', async () => {
    // the session as it stood when each player was made
    const sessionAt = new Map<string, Array<Record<string, unknown>>>();
    vi.stubGlobal(
      'Audio',
      class extends FakeAudio {
        constructor(src: string) {
          super(src);
          sessionAt.set(src, [...mic.modes]);
        }
      },
    );
    speaking();
    await press('Start recording');
    expect(mic.modes).toEqual([RECORDING]);

    act(() => mic.recorder!.run(2000));
    await press('Stop recording');
    await screen.findByRole('button', { name: 'Hear yourself' });
    expect(mic.calls).toEqual(['ask', 'prepare', 'record', 'stop']);
    expect(mic.modes).toEqual([RECORDING, PLAYBACK]);
    expect(sessionAt.get('file:///cache/Audio/take-1.m4a')).toEqual([RECORDING, PLAYBACK]);
    // the model still plays afterwards
    await press('Hear a native speaker');
    expect(FakeAudio.of(exercise.modelAudioUrl!)?.paused).toBe(false);
  });

  it('turns away a take too short to be an attempt, and deletes it', async () => {
    const { said } = speaking();
    await press('Start recording');
    act(() => mic.recorder!.run(400));
    await press('Stop recording');

    expect(await screen.findByText('Too short — hold to record a little longer.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hear yourself' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeTruthy();
    expect(said.recorded).not.toContain(true);
    expect(mic.deleted).toEqual(['file:///cache/Audio/take-1.m4a']);
    expect(mic.modes).toEqual([RECORDING, PLAYBACK]);
  });

  it('turns away a silent take', async () => {
    mic.nextSize = 10;
    speaking();
    await press('Start recording');
    act(() => mic.recorder!.run(3000));
    await press('Stop recording');
    expect(await screen.findByText('We couldn’t hear anything — try again.')).toBeTruthy();
  });

  it('replaces a take with the next one, and lets the old file go', async () => {
    const { said } = speaking();
    await press('Start recording');
    act(() => mic.recorder!.run(2000));
    await press('Stop recording');
    await screen.findByRole('button', { name: 'Hear yourself' });

    await press('Re-record');
    expect(mic.deleted).toEqual(['file:///cache/Audio/take-1.m4a']);
    // the rating was of the take that has gone
    expect(said.recorded.at(-1)).toBe(false);
    expect(said.rated.at(-1)).toBeNull();
    act(() => mic.recorder!.run(1500));
    await press('Stop recording');
    await screen.findByRole('button', { name: 'Hear yourself' });
    await press('Hear yourself');
    expect(FakeAudio.of('file:///cache/Audio/take-2.m4a')?.paused).toBe(false);
    expect(mic.modes).toEqual([RECORDING, PLAYBACK, RECORDING, PLAYBACK]);
    // each take readied with the preset named, which on iOS is what gives it a file of its own
    expect(mic.prepared).toEqual([RecordingPresets.HIGH_QUALITY, RecordingPresets.HIGH_QUALITY]);
  });

  it('stops by itself at fifteen seconds, keeping the take, without a buzz nobody asked for', async () => {
    speaking();
    await press('Start recording');
    act(() => mic.recorder!.run(15_000));
    await settle();
    expect(await screen.findByRole('button', { name: 'Hear yourself' })).toBeTruthy();
    expect(mic.calls.at(-1)).toBe('stop');
    expect(mic.modes).toEqual([RECORDING, PLAYBACK]);
    expect(felt).toEqual([]);
  });

  it('stops cleanly when the app leaves the front mid-take, and keeps what was said', async () => {
    speaking();
    await press('Start recording');
    act(() => mic.recorder!.run(3000));
    await leaveTheFront();

    expect(mic.calls.at(-1)).toBe('stop');
    expect(mic.modes).toEqual([RECORDING, PLAYBACK]);
    await comeBack();
    expect(await screen.findByRole('button', { name: 'Hear yourself' })).toBeTruthy();
  });

  it('says so when the microphone cannot start, and puts the session back', async () => {
    mic.failToPrepare = true;
    speaking();
    await press('Start recording');
    expect(screen.getByText('Could not start recording. Please try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeTruthy();
    expect(mic.modes).toEqual([RECORDING, PLAYBACK]);
    expect(felt).toEqual(['error']);
  });

  it('closing mid-take stops the recorder, puts the session back and deletes the file', async () => {
    const { view } = speaking();
    await press('Start recording');
    act(() => mic.recorder!.run(2000));
    view.unmount();
    await settle();
    expect(mic.calls.at(-1)).toBe('stop');
    expect(mic.modes).toEqual([RECORDING, PLAYBACK]);
    expect(mic.deleted).toEqual(['file:///cache/Audio/take-1.m4a']);
  });

  it('deletes the kept take when the exercise closes', async () => {
    const { view } = speaking();
    await press('Start recording');
    act(() => mic.recorder!.run(2000));
    await press('Stop recording');
    await screen.findByRole('button', { name: 'Hear yourself' });
    expect(mic.deleted).toEqual([]);
    view.unmount();
    expect(mic.deleted).toEqual(['file:///cache/Audio/take-1.m4a']);
  });
});

/** MediaRecorder as a browser has it, enough for one take. */
class FakeMediaRecorder {
  static made: FakeMediaRecorder[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(readonly stream: { getTracks: () => Array<{ stop: () => void }> }) {
    FakeMediaRecorder.made.push(this);
  }
  start(): void {
    this.state = 'recording';
  }
  stop(): void {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array(4000)], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

describe('speaking in a browser', () => {
  let now = 0;
  const urls = { made: [] as string[], revoked: [] as string[] };

  beforeEach(() => {
    host.phone = false;
    FakeMediaRecorder.made = [];
    urls.made = [];
    urls.revoked = [];
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) },
    });
    Object.assign(URL, {
      createObjectURL: () => {
        const url = `blob:take-${urls.made.length + 1}`;
        urls.made.push(url);
        return url;
      },
      revokeObjectURL: (url: string) => urls.revoked.push(url),
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('still records with the browser’s own recorder, and lets the take’s URL go with it', async () => {
    const { said, view } = speaking();
    await press('Start recording');
    expect(FakeMediaRecorder.made).toHaveLength(1);
    now += 2500;
    await press('Stop recording');

    expect(await screen.findByRole('button', { name: 'Hear yourself' })).toBeTruthy();
    expect(said.recorded.at(-1)).toBe(true);
    await press('Hear yourself');
    expect(FakeAudio.of('blob:take-1')?.paused).toBe(false);
    // the phone's audio session is not the browser's business
    expect(mic.modes).toEqual([]);

    view.unmount();
    expect(urls.revoked).toEqual(['blob:take-1']);
  });

  it('says a refused microphone, with no settings to open from a page', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => Promise.reject(new Error('NotAllowedError')) },
    });
    speaking();
    await press('Start recording');
    expect(screen.getByText(/The microphone is off for Hevalo/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open Settings' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Can’t do this now — skip' })).toBeTruthy();
  });
});
