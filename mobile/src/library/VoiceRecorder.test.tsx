// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('expo-audio', () => import('../recording/testing/fakeMic'));
vi.mock('expo-file-system/legacy', () => import('../recording/testing/fakeMic'));
vi.mock('../theme/Pressable', () => import('../testing/reach'));
// A kept note is played by the shared player, which is not what these tests are about.
vi.mock('./AudioPlayer', () => ({ AudioPlayer: () => null }));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Alert } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { DENIED, GRANTED, mic } from '../recording/testing/fakeMic';
import { forgetReach, reachOf } from '../testing/reach';
import { VoiceRecorder } from './VoiceRecorder';

const RECORDING = { allowsRecording: true, playsInSilentMode: true };
const PLAYBACK = { allowsRecording: false, playsInSilentMode: true };

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  mic.reset();
});
afterEach(() => {
  cleanup();
  forgetReach();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => undefined);
}

/** A voice note recorder, what it handed over, and the audio session at that moment. */
function noting(maxSeconds?: number) {
  const handed: Array<{ uri: string | null; session: Array<Record<string, unknown>> }> = [];
  renderWithProviders(<VoiceRecorder value={null} onChange={(uri) => handed.push({ uri, session: [...mic.modes] })} maxSeconds={maxSeconds} />);
  return handed;
}

describe('a voice note', () => {
  it('is recorded, and handed over only once the session is back on playback', async () => {
    const handed = noting();
    fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' }));
    await settle();
    act(() => mic.recorder!.run(3000));
    expect(screen.getByText('Recording 0:03 · tap to stop')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    await settle();
    expect(handed).toEqual([{ uri: 'file:///cache/Audio/take-1.m4a', session: [RECORDING, PLAYBACK] }]);
    // The note is the parent's to upload, not deleted from under it.
    expect(mic.deleted).toEqual([]);
  });

  it('stops by itself at its cap', async () => {
    const handed = noting(5);
    fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' }));
    await settle();
    act(() => mic.recorder!.run(5000));
    await settle();
    expect(handed.map((h) => h.uri)).toEqual(['file:///cache/Audio/take-1.m4a']);
  });

  it('says a refused microphone, and switches nothing over to recording', async () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mic.answer = DENIED;
    const handed = noting();
    fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' }));
    await settle();
    // The current state, where to change it and the alternative; nobody is told to allow anything.
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      'Microphone needed',
      'The microphone is off for Hevalo. You can turn it on in your phone’s settings, or write a comment instead.',
    );
    expect(mic.modes).toEqual([]);
    expect(handed).toEqual([]);
  });

  it('is not left busy by a refusal: record is there to press again, and answers again', async () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mic.answer = DENIED;
    noting();
    fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' }));
    await settle();
    const record = screen.getByRole('button', { name: 'Record a voice note' });
    expect(record.getAttribute('aria-disabled')).not.toBe('true');
    expect(screen.queryByRole('button', { name: 'Stop recording' })).toBeNull();
    fireEvent.click(record);
    await settle();
    expect(mic.calls).toEqual(['ask', 'ask']);
    expect(alert).toHaveBeenCalledTimes(2);

    // Turned on in the phone's settings meanwhile: the same button records.
    mic.answer = GRANTED;
    fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' }));
    await settle();
    expect(screen.getByRole('button', { name: 'Stop recording' })).toBeTruthy();
  });

  it('says so when the microphone cannot be asked for at all, and is not left busy by that either', async () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mic.failToAsk = true;
    const handed = noting();
    fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' }));
    await settle();
    expect(alert).toHaveBeenCalledWith('Recording failed', 'Could not start recording. Please try again.');
    expect(screen.getByRole('button', { name: 'Record a voice note' }).getAttribute('aria-disabled')).not.toBe('true');
    expect(mic.modes).toEqual([]);
    expect(handed).toEqual([]);
  });
});

describe('the voice note’s controls', () => {
  it('answer a finger 48 tall, the pill reaching only half the gap toward the row above it', async () => {
    noting();
    expect(reachOf('Record a voice note')).toEqual({ top: 4, bottom: 6, left: 0, right: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' }));
    await settle();
    expect(reachOf('Stop recording')).toEqual({ top: 4, bottom: 6, left: 0, right: 0 });
  });

  it('take a kept note away from a line of words that answers over 48, and a little past its ends', () => {
    renderWithProviders(<VoiceRecorder value="file:///cache/Audio/take-1.m4a" onChange={() => undefined} />);
    expect(reachOf('Remove recording')).toEqual({ top: 15, bottom: 15, left: 8, right: 8 });
  });
});
