/**
 * Sound for the admin's tests: a few syllables of something like speech, and
 * a Web Audio that decodes every file into it (or refuses to), since jsdom
 * has none.
 */
import { vi } from 'vitest';

/** Voiced syllables, four a second, with a breath of silence either side. */
export function speechPcm(seconds: number, rate = 22050): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    const voiced = t > 0.1 && t < seconds - 0.15 ? 1 : 0;
    out[i] = voiced * Math.max(0, Math.sin(Math.PI * t * 4)) * 0.3 * Math.sin(2 * Math.PI * 180 * t);
  }
  return out;
}

/**
 * Install an AudioContext whose decodeAudioData answers with `seconds` of
 * speechPcm in `channels` channels, or fails when `fail` is set. Returns what
 * it was asked to decode.
 */
export function fakeDecoder({ seconds = 1.2, rate = 22050, channels = 1, fail = false }: { seconds?: number; rate?: number; channels?: number; fail?: boolean } = {}): {
  decoded: ArrayBuffer[];
} {
  const decoded: ArrayBuffer[] = [];
  class FakeAudioContext {
    decodeAudioData(data: ArrayBuffer, ok?: (b: AudioBuffer) => void, bad?: (e: unknown) => void): Promise<AudioBuffer> {
      decoded.push(data);
      if (fail) {
        const err = new DOMException('Unable to decode audio data', 'EncodingError');
        bad?.(err);
        return Promise.reject(err);
      }
      const pcm = speechPcm(seconds, rate);
      const buffer = {
        numberOfChannels: channels,
        sampleRate: rate,
        length: pcm.length,
        duration: seconds,
        getChannelData: () => pcm,
      } as unknown as AudioBuffer;
      ok?.(buffer);
      return Promise.resolve(buffer);
    }
    close(): Promise<void> {
      return Promise.resolve();
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return { decoded };
}
