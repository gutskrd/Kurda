import { useEffect, useState } from 'react';
import { recorderSupported } from '../learn/useRecorder';

/**
 * The microphone for speaking practice, asked for only when the learner starts it. Each answer that is not a yes is its
 * own case, since each needs different words: refused (allow it in the address bar), no microphone, a browser that
 * cannot record, or anything else.
 */
export type MicAnswer = 'granted' | 'denied' | 'noMic' | 'unsupported' | 'failed';

/** Asks for the microphone and lets it go at once: the speaking exercises ask again, already allowed, when they record. */
export async function askMicrophone(): Promise<MicAnswer> {
  if (!recorderSupported()) return 'unsupported';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    return name === 'NotFoundError' ? 'noMic' : 'failed';
  }
}

/**
 * Whether the browser already refuses the microphone to this site, without asking: true only where the browser says so
 * (the Permissions API), and kept current if it is allowed meanwhile in the address bar.
 */
export function useMicBlocked(): boolean {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let live = true;
    const read = (): void => setBlocked(status?.state === 'denied');
    void navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((s) => {
        if (!live) return;
        status = s;
        read();
        s.addEventListener('change', read);
      })
      // A browser that cannot be asked about the microphone answers when speaking starts.
      .catch(() => undefined);
    return () => {
      live = false;
      status?.removeEventListener('change', read);
    };
  }, []);
  return blocked;
}
