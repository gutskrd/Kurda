/**
 * Getting a take from the microphone on every browser an editor is likely to
 * hold: Chrome and Edge on a laptop, Chrome on Android, Safari on an iPhone or
 * an iPad.
 *
 * They disagree in small ways that each broke a recording somewhere:
 * - the format MediaRecorder writes (webm/opus on Chrome, mp4/aac on Safari) —
 *   so the type is asked for, not assumed, and anything the browser can decode
 *   goes through the same pipeline (audioClip.ts);
 * - Safari before 14.3 has no MediaRecorder at all — there the samples are
 *   collected straight from Web Audio and written as a WAV;
 * - iOS starts an AudioContext made outside a tap suspended, so the level
 *   meter sat still: the context is made the moment Record is pressed, before
 *   the permission prompt, and resumed;
 * - a page served over plain http on a phone (a LAN address) gets no
 *   microphone at all, and the old message blamed the permission.
 */
import { audioContextClass, encodeWav } from './audioClip';

/** The formats to ask MediaRecorder for, best first; the browser's default when none is said to work. */
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus'];

export function pickMimeType(isSupported: ((type: string) => boolean) | undefined): string | undefined {
  if (!isSupported) return undefined;
  return MIME_TYPES.find((t) => {
    try {
      return isSupported(t);
    } catch {
      return false;
    }
  });
}

export type MicPlatform = 'ios' | 'android' | 'other';

export function micPlatform(userAgent: string, maxTouchPoints = 0): MicPlatform {
  // an iPad asking for the desktop site says "Macintosh", but has a touch screen
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'other';
}

/** Where the microphone switch is, for the device in hand. */
export function allowMicHowTo(platform: MicPlatform): string {
  if (platform === 'ios') return 'On an iPhone or iPad: tap “aA” in the address bar, then Website Settings › Microphone › Allow — or Settings › Safari › Microphone.';
  if (platform === 'android') return 'On Android: tap the icon left of the address, then Permissions › Microphone › Allow.';
  return 'Click the icon left of the address, allow the microphone for this site, and press Record again.';
}

/** What went wrong with the microphone, said so it can be fixed — and the upload is always the way round it. */
export function micProblem(err: unknown, platform: MicPlatform, secure: boolean): string {
  const name = err instanceof Error || (typeof err === 'object' && err !== null && 'name' in err) ? String((err as { name: unknown }).name) : '';
  if (!secure || name === 'NoMicApi') {
    return 'This page cannot use the microphone: it has to be opened over https. Upload a recording from your phone instead.';
  }
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return `The microphone is not allowed for this site. ${allowMicHowTo(platform)} Or upload a recording instead.`;
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone was found. Plug one in, or upload a recording instead.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'The microphone is busy — another app or tab is using it. Close that, then press Record again.';
  }
  return 'The microphone did not start. Press Record again, or upload a recording instead.';
}

export interface Capture {
  /** the loudest sample since the last call, 0–1, for the level meter */
  level: () => number;
  /** stop and hand over the take, in whatever format the browser wrote it */
  stop: () => Promise<ArrayBuffer>;
  /** stop and throw the take away (the editor left mid-take) */
  cancel: () => void;
}

/**
 * Start recording. Call it straight from the tap or the key press: the audio
 * context is made before the permission prompt, while the browser still
 * counts this as the person's own action.
 */
export async function startCapture(): Promise<Capture> {
  const Ctx = audioContextClass();
  const ctx = Ctx ? new Ctx() : null;
  const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!media?.getUserMedia) {
    void ctx?.close();
    throw Object.assign(new Error('no microphone API'), { name: 'NoMicApi' });
  }
  let stream: MediaStream;
  try {
    // the browser's own gain control would undo the levelling, so it is off
    stream = await media.getUserMedia({ audio: { channelCount: 1, autoGainControl: false, noiseSuppression: true, echoCancellation: true } });
  } catch (err) {
    void ctx?.close();
    throw err;
  }
  void ctx?.resume?.();

  const release = (): void => {
    stream.getTracks().forEach((t) => t.stop());
    void ctx?.close();
  };

  // the live level, so a muted or wrong microphone shows before the take is wasted
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  const buf = new Float32Array(512);
  if (ctx) {
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
  }
  const level = (): number => {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    return peak;
  };

  if (typeof MediaRecorder !== 'undefined') {
    const mimeType = pickMimeType(MediaRecorder.isTypeSupported?.bind(MediaRecorder));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.start();
    return {
      level,
      stop: () =>
        new Promise<ArrayBuffer>((resolve, reject) => {
          rec.onstop = () => {
            release();
            void new Blob(chunks, { type: rec.mimeType || mimeType || '' }).arrayBuffer().then(resolve, reject);
          };
          if (rec.state === 'inactive') rec.onstop(new Event('stop'));
          else rec.stop();
        }),
      cancel: () => {
        if (rec.state !== 'inactive') rec.stop();
        release();
      },
    };
  }

  // No MediaRecorder (older Safari): collect the samples as they arrive and write a WAV.
  if (!ctx || !source) {
    release();
    throw Object.assign(new Error('no way to record'), { name: 'NoMicApi' });
  }
  const parts: Float32Array[] = [];
  const node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (e) => parts.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(node);
  node.connect(ctx.destination);
  const rate = ctx.sampleRate;
  return {
    level,
    stop: async () => {
      node.disconnect();
      release();
      const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
      let at = 0;
      for (const p of parts) {
        all.set(p, at);
        at += p.length;
      }
      const wav = encodeWav(all, rate);
      return wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer;
    },
    cancel: () => {
      node.disconnect();
      release();
    },
  };
}

/** Whether the microphone was already refused for this site, so the page can say how to allow it before a press fails. */
export async function micPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    const status = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
    return status?.state ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
