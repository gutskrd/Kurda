import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The microphone, for a speaking exercise: ask only when the learner taps
 * Record, keep the take in memory, give the microphone back the moment it
 * stops.
 *
 * Every way it can fail is a state the exercise can say something true about,
 * because each needs a different answer from the learner: a browser with no
 * recorder at all (nothing to do here — skip), a refused permission (it can be
 * allowed again in the address bar), no microphone, or anything else.
 */
export type RecorderPhase = 'idle' | 'asking' | 'recording' | 'denied' | 'noMic' | 'failed';

export interface Take {
  blob: Blob;
  durationMs: number;
}

/** A take is cut off here: a phrase, not a speech, and an upload kept small. */
const MAX_TAKE_MS = 15_000;

/**
 * What to ask the recorder for. The server stores WebM, MP4, MP3 and WAV and
 * checks the bytes; Firefox records Ogg unless asked, which it would refuse,
 * so WebM is asked for where the browser can make it (Chrome, Firefox, Edge)
 * and MP4 where it cannot (Safari). Undefined leaves the browser's own choice.
 */
function recordingType(): string | undefined {
  const can = (t: string): boolean => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t);
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(can);
}

export function recorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

export function useRecorder(): {
  phase: RecorderPhase;
  take: Take | null;
  start: () => Promise<void>;
  stop: () => void;
} {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [take, setTake] = useState<Take | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const live = useRef(true);

  const release = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  // leaving mid-take: stop recording and give the microphone back
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
      release();
    };
  }, [release]);

  const start = useCallback(async () => {
    if (!recorderSupported()) {
      setPhase('failed');
      return;
    }
    setPhase('asking');
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (!live.current) return;
      const name = err instanceof DOMException ? err.name : '';
      setPhase(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' ? 'noMic' : 'failed');
      return;
    }
    if (!live.current) {
      media.getTracks().forEach((t) => t.stop());
      return;
    }
    stream.current = media;
    const chunks: Blob[] = [];
    let rec: MediaRecorder;
    try {
      const mimeType = recordingType();
      rec = mimeType ? new MediaRecorder(media, { mimeType }) : new MediaRecorder(media);
    } catch {
      release();
      setPhase('failed');
      return;
    }
    recorder.current = rec;
    const started = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      release();
      recorder.current = null;
      if (!live.current) return;
      setTake({ blob: new Blob(chunks, { type: rec.mimeType || chunks[0]?.type || 'audio/webm' }), durationMs: Date.now() - started });
      setPhase('idle');
    };
    setTake(null);
    rec.start();
    setPhase('recording');
    timer.current = window.setTimeout(() => {
      if (rec.state !== 'inactive') rec.stop();
    }, MAX_TAKE_MS);
  }, [release]);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }, []);

  return { phase, take, start, stop };
}

/**
 * The content type to upload a take under: the server reads the body by its
 * declared audio type and then checks the bytes themselves, so the codec
 * parameters a recorder adds ("audio/webm;codecs=opus") are dropped and only
 * the container it really is goes up — as the phone's upload does.
 */
export function uploadType(mime: string): 'audio/webm' | 'audio/mp4' | 'audio/mpeg' | 'audio/wav' {
  const m = mime.toLowerCase();
  if (m.includes('webm')) return 'audio/webm';
  if (m.includes('mpeg')) return 'audio/mpeg';
  if (m.includes('wav')) return 'audio/wav';
  return 'audio/mp4';
}
