// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('expo-audio', () => import('../recording/testing/fakeMic'));
vi.mock('expo-file-system/legacy', () => import('../recording/testing/fakeMic'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Alert } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { DENIED, mic } from '../recording/testing/fakeMic';
import { VoiceRecorder } from './VoiceRecorder';

const RECORDING = { allowsRecording: true, playsInSilentMode: true };
const PLAYBACK = { allowsRecording: false, playsInSilentMode: true };

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  mic.reset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => undefined);
}

/** A voice note's recorder, and what it handed over, with the audio session as it stood at that moment. */
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
    // the note is the parent's to upload, not deleted from under it
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
    expect(alert).toHaveBeenCalledWith('Microphone needed', 'Allow microphone access in Settings to record a voice note.');
    expect(mic.modes).toEqual([]);
    expect(handed).toEqual([]);
  });
});
