/**
 * Turning whatever an editor records or picks into a clip learners can be
 * played — a letter on the alphabet page or a sentence in a lesson: one voice,
 * no dead air, the same loudness as the clip next to it.
 *
 * Every recording goes through the same steps, so a phone memo, a studio WAV
 * and a laptop microphone come out alike:
 *
 *   decode   any format the browser can read (m4a, mp3, wav, ogg, webm, flac)
 *   mono     the channels averaged
 *   resample 22.05 kHz — speech has nothing above 11 kHz worth the bytes
 *   trim     the silence before and after cut away, with a breath left either side
 *   level    the same loudness every time, never clipping
 *   fade     10 ms in and out, so no click at either end
 *   encode   16-bit PCM WAV, which every browser plays
 *
 * A second of speech is about 44 KB. The server checks it is a WAV and how long
 * it lasts; everything else happens here, where the editor can hear the result
 * before saving it.
 */
export const RATE = 22050;
/** before the voice starts and after it stops */
const LEAD_S = 0.08;
const TAIL_S = 0.15;
const FADE_S = 0.01;
/** loudness to aim for (RMS of the voiced part) and the peak never to pass */
const TARGET_RMS = 0.12;
const MAX_PEAK = 0.89;

export class ClipError extends Error {}

/** Where the voice is: the first and last 10 ms window clearly above the floor. */
export function voicedRange(samples: Float32Array, rate = RATE): [number, number] | null {
  const win = Math.max(1, Math.round(rate * 0.01));
  const levels: number[] = [];
  let peak = 0;
  for (let at = 0; at < samples.length; at += win) {
    let sum = 0;
    const end = Math.min(samples.length, at + win);
    for (let i = at; i < end; i++) sum += samples[i]! * samples[i]!;
    const rms = Math.sqrt(sum / (end - at));
    levels.push(rms);
    peak = Math.max(peak, rms);
  }
  // relative to the loudest moment, so a quiet room and a loud voice both work
  const floor = Math.max(peak * 0.08, 0.004);
  if (peak < 0.01) return null;
  const first = levels.findIndex((l) => l > floor);
  let last = levels.length - 1;
  while (last > first && levels[last]! <= floor) last--;
  return [first * win, Math.min(samples.length, (last + 1) * win)];
}

/**
 * Trim, level and fade. Throws a ClipError the editor can act on; `what` is
 * how the error names the thing to say ("one letter or one word").
 */
export function shape(samples: Float32Array, rate = RATE, maxSeconds = 4, what = 'one letter or one word'): Float32Array {
  const range = voicedRange(samples, rate);
  if (!range) throw new ClipError('No voice in it — check the microphone is the right one, and speak a little closer.');
  const start = Math.max(0, range[0] - Math.round(LEAD_S * rate));
  const end = Math.min(samples.length, range[1] + Math.round(TAIL_S * rate));
  const out = samples.slice(start, end);
  const seconds = out.length / rate;
  if (seconds > maxSeconds) {
    throw new ClipError(`That is ${seconds.toFixed(1)} s of sound. Keep it to ${what} — under ${maxSeconds} s.`);
  }
  if (range[1] - range[0] < rate * 0.12) throw new ClipError('Too short to hear. Say it once more, clearly.');

  let sum = 0;
  let peak = 0;
  for (let i = range[0] - start; i < range[1] - start; i++) {
    sum += out[i]! * out[i]!;
    peak = Math.max(peak, Math.abs(out[i]!));
  }
  const rms = Math.sqrt(sum / (range[1] - range[0]));
  const gain = Math.min(TARGET_RMS / rms, MAX_PEAK / peak);
  const fade = Math.round(FADE_S * rate);
  for (let i = 0; i < out.length; i++) {
    const edge = Math.min(1, i / fade, (out.length - 1 - i) / fade);
    out[i] = out[i]! * gain * edge;
  }
  return out;
}

export function encodeWav(samples: Float32Array, rate = RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

/** Any audio the browser can decode, as mono samples at RATE. */
async function decode(data: ArrayBuffer, what: string): Promise<Float32Array> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(data);
  } catch {
    throw new ClipError('This browser cannot read that file. Try an m4a, mp3 or wav.');
  } finally {
    void ctx.close();
  }
  const frames = Math.ceil(decoded.duration * RATE);
  if (frames === 0) throw new ClipError('That file has no sound in it.');
  if (decoded.duration > 30) throw new ClipError(`That file is long. Cut it down to ${what} first.`);
  // an offline render does the mixing to mono and the resampling in one step
  const offline = new OfflineAudioContext(1, frames, RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

export interface Clip {
  wav: Uint8Array;
  url: string;
  seconds: number;
}

/** A recording or a file, ready to hear and to upload. */
export async function prepare(data: ArrayBuffer, maxSeconds: number, what = 'one letter or one word'): Promise<Clip> {
  const shaped = shape(await decode(data, what), RATE, maxSeconds, what);
  const wav = encodeWav(shaped);
  return { wav, url: URL.createObjectURL(new Blob([wav as BlobPart], { type: 'audio/wav' })), seconds: shaped.length / RATE };
}
