import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { MAX_TAKE_MS, type MicPermission, type RecorderState, type Take } from './recording';

/**
 * Mic recording for speaking exercises (KUR-036) in a browser (Expo web):
 * MediaRecorder + getUserMedia. Where they are absent, `supported` is false
 * and the exercise offers only the skip. A phone records through expo-audio
 * instead (useRecorder.native.ts, which Metro picks there); the exercise sees
 * the same `RecorderState` from both.
 *
 * The take stays in memory, played back from a blob URL that is let go when
 * the take is.
 */

// DOM types exist in the tsconfig lib; these globals are simply absent where
// there is no browser, which the `supported` guard handles.
function webApis() {
  const g = globalThis as typeof globalThis & {
    MediaRecorder?: typeof MediaRecorder;
    navigator?: Navigator;
  };
  const getUserMedia = g.navigator?.mediaDevices?.getUserMedia?.bind(g.navigator.mediaDevices);
  return { MediaRecorder: g.MediaRecorder, getUserMedia };
}

type BlobUrls = { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (url: string) => void };
const blobUrls = (): BlobUrls | undefined => (globalThis as { URL?: BlobUrls }).URL;

/** A take as something to play back: a blob URL where the platform has them, nothing to play where it has not. */
function blobUrl(blob: Blob): string {
  const urls = blobUrls();
  return typeof urls?.createObjectURL === 'function' ? urls.createObjectURL(blob) : '';
}

export function useRecorder(): RecorderState {
  const { MediaRecorder: Recorder, getUserMedia } = webApis();
  const supported = !!Recorder && !!getUserMedia && typeof Blob !== 'undefined';

  const [permission, setPermission] = useState<MicPermission>('unknown');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [result, setResult] = useState<Take | null>(null);
  const [failed, setFailed] = useState<RecorderState['failed']>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the blob URL of the take on screen, let go when the take is
  const shownRef = useRef<string | null>(null);
  const live = useRef(true);

  const show = useCallback((take: Take | null) => {
    const before = shownRef.current;
    shownRef.current = take?.uri || null;
    if (before && before !== shownRef.current) blobUrls()?.revokeObjectURL?.(before);
    setResult(take);
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (capRef.current) clearTimeout(capRef.current);
    capRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
  }, []);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      cleanup();
      if (shownRef.current) blobUrls()?.revokeObjectURL?.(shownRef.current);
      shownRef.current = null;
    };
  }, [cleanup]);

  // leaving the tab ends the take, as leaving the app does on a phone
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') stop();
    });
    return () => sub?.remove();
  }, [stop]);

  const start = useCallback(async () => {
    if (!Recorder || !getUserMedia || recRef.current) return;
    setFailed(null);
    // a new take replaces the last one, whatever becomes of it
    show(null);
    setBusy(true);
    let stream: MediaStream;
    try {
      stream = await getUserMedia({ audio: true });
      setPermission('granted');
    } catch {
      setPermission('denied');
      return;
    } finally {
      setBusy(false);
    }
    streamRef.current = stream;
    chunksRef.current = [];
    try {
      const rec = new Recorder(stream);
      rec.ondataavailable = (e: BlobEvent) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        const took = Date.now() - startedAtRef.current;
        cleanup();
        setRecording(false);
        if (!live.current) return;
        const mimeType = chunksRef.current[0]?.type || 'audio/mp4';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        show({ uri: blobUrl(blob), durationMs: took, byteSize: blob.size });
      };
      recRef.current = rec;
      startedAtRef.current = Date.now();
      rec.start();
    } catch {
      cleanup();
      setFailed('start');
      return;
    }
    setDurationMs(0);
    setRecording(true);
    timerRef.current = setInterval(() => setDurationMs(Date.now() - startedAtRef.current), 100);
    capRef.current = setTimeout(stop, MAX_TAKE_MS);
  }, [Recorder, getUserMedia, cleanup, show, stop]);

  const reset = useCallback(() => {
    show(null);
    setDurationMs(0);
  }, [show]);

  return {
    supported,
    permission,
    busy,
    recording,
    durationMs,
    result,
    failed,
    start,
    stop,
    reset,
    openSettings: null,
  };
}
