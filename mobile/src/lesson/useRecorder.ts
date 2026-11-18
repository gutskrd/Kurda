import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { MAX_TAKE_MS, type MicPermission, type RecorderState, type Take } from './recording';

/**
 * Speaking-exercise recording in a browser (Expo web) via MediaRecorder and getUserMedia; without them `supported`
 * is false and the exercise offers only the skip. Phones use useRecorder.native.ts, with the same `RecorderState`.
 * The take stays in memory, played from a blob URL released with it.
 */

// The DOM types are in the tsconfig lib, but the globals are absent outside a browser, which `supported` handles.
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

/** A take's playback URL: a blob URL where the platform supports them, else nothing to play. */
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
  // The blob URL of the take on screen, released with the take.
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

  // Leaving the tab ends the take, as leaving the app does on a phone.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') stop();
    });
    return () => sub?.remove();
  }, [stop]);

  const start = useCallback(async () => {
    if (!Recorder || !getUserMedia || recRef.current) return;
    setFailed(null);
    // A new take replaces the last one, whatever becomes of it.
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
