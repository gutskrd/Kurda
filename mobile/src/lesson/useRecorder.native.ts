import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { discardRecording, useMicRecorder, type MicTake } from '../recording/useMicRecorder';
import { MAX_TAKE_MS, type RecorderState, type Take } from './recording';

/**
 * Mic recording for speaking exercises (KUR-036) on a phone, through the same
 * microphone a voice note uses (useMicRecorder). Metro picks this file on iOS
 * and Android; the browser records with MediaRecorder (useRecorder.ts), and
 * the exercise sees the same `RecorderState` from both.
 *
 * A take is a file in the app's cache, only ever played back here beside the
 * model, so it is deleted as soon as it leaves the screen: replaced by the
 * next take, turned away as too short, or left behind when the exercise
 * closes.
 */

/** How big a take's file is, which tells a silent capture from a real one; nought when it cannot be read. */
async function sizeOf(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? info.size : 0;
  } catch {
    return 0;
  }
}

function openSettings(): void {
  void Linking.openSettings().catch(() => undefined);
}

export function useRecorder(): RecorderState {
  const [result, setResult] = useState<Take | null>(null);
  const [failed, setFailed] = useState<RecorderState['failed']>(null);
  const [keeping, setKeeping] = useState(false);
  const live = useRef(true);
  // the file of the take on screen, so it goes when the take does
  const shown = useRef<string | null>(null);

  const show = useCallback((take: Take | null) => {
    const before = shown.current;
    shown.current = take?.uri ?? null;
    if (before && before !== shown.current) void discardRecording(before);
    setResult(take);
  }, []);

  const keep = useCallback(
    (take: MicTake | null) => {
      if (!take) {
        setFailed('save');
        return;
      }
      setKeeping(true);
      void sizeOf(take.uri).then((byteSize) => {
        if (!live.current) {
          void discardRecording(take.uri);
          return;
        }
        setKeeping(false);
        show({ ...take, byteSize });
      });
    },
    [show],
  );

  const mic = useMicRecorder({ maxMs: MAX_TAKE_MS, onStop: keep });
  const { start: begin, stop: end } = mic;

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      void discardRecording(shown.current);
      shown.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    setFailed(null);
    // a new take replaces the last one, whatever becomes of it
    show(null);
    if ((await begin()) === 'failed') setFailed('start');
  }, [begin, show]);

  const stop = useCallback(() => void end(), [end]);
  const reset = useCallback(() => show(null), [show]);

  return {
    supported: true,
    permission: mic.permission,
    busy: mic.busy || keeping,
    recording: mic.recording,
    durationMs: mic.durationMs,
    result,
    failed,
    start,
    stop,
    reset,
    openSettings,
  };
}
